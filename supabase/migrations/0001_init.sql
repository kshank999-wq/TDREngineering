-- ===========================================================================
-- TDR Engineering — Phase 1 initial schema (spec §11, §15, §16, §18)
--
-- Design rules carried forward from the spec:
--   * Client, Property, Referral Source and Opportunity are SEPARATE objects.
--     Smith Architecture referring homeowner Jane Doe for 123 Main Street
--     produces distinct architect / homeowner / property / opportunity rows.
--   * Stable UUID ids, created_at/updated_at everywhere, soft delete via
--     archived_at rather than physical deletion.
--   * Row Level Security on every table, deny by default. The public website
--     never writes with the anon key — intake goes through a server route that
--     uses the service role key.
--   * Search must eventually cover client name, company, email, phone, project
--     address, APN, referring professional, referral company, proposal number
--     and project number (see v_opportunity_search at the bottom).
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- enums ----
do $$ begin
  create type company_type as enum (
    'architecture',
    'structural-engineering',
    'civil-engineering',
    'contractor',
    'developer',
    'corporate',
    'government',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Spec §10 suggested statuses.
  create type opportunity_status as enum (
    'new',
    'reviewing',
    'need_information',
    'proposal_in_preparation',
    'proposal_sent',
    'follow_up',
    'won',
    'lost',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Spec §16 future-ready roles. Phase 1 only exercises owner / manager /
  -- proposal_staff, but the type is defined now so authorization does not have
  -- to be rebuilt later.
  create type app_role as enum (
    'owner',
    'manager',
    'proposal_staff',
    'project_manager',
    'field_staff',
    'accounting',
    'marketing',
    'client'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_method as enum ('email', 'phone', 'text');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- shared triggers ---
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================== app_users =====
-- Internal and (future) client users. Mirrors auth.users so roles and
-- least-privilege access can be enforced without touching the auth schema.
create table if not exists app_users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         citext not null,
  full_name     text,
  role          app_role not null default 'proposal_staff',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create unique index if not exists app_users_email_key
  on app_users (email) where archived_at is null;

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at before update on app_users
  for each row execute function set_updated_at();

-- Helper predicates used by every policy below. SECURITY DEFINER so the
-- policies can read app_users without recursing through its own RLS.
create or replace function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from app_users
   where id = auth.uid() and is_active and archived_at is null;
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role <> 'client' from app_users
      where id = auth.uid() and is_active and archived_at is null),
    false);
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'manager') from app_users
      where id = auth.uid() and is_active and archived_at is null),
    false);
$$;

-- =========================================================== companies =====
create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  company_type  company_type not null default 'other',
  website       text,
  phone         text,
  email         citext,
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  postal_code   text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

-- De-duplication key: the intake route looks a company up by normalized name
-- before creating a new one.
create unique index if not exists companies_name_key
  on companies (lower(btrim(name))) where archived_at is null;
create index if not exists companies_name_trgm
  on companies using gin (name gin_trgm_ops);

drop trigger if exists companies_set_updated_at on companies;
create trigger companies_set_updated_at before update on companies
  for each row execute function set_updated_at();

-- ============================================================ contacts =====
create table if not exists contacts (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text not null,
  last_name          text not null,
  email              citext,
  phone              text,
  company_id         uuid references companies (id) on delete set null,
  title              text,
  preferred_contact  contact_method,
  -- true when the contact is an industry professional (architect, engineer,
  -- contractor, developer) rather than an end client. Drives future marketing
  -- to referral sources (spec §1).
  is_professional    boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

create unique index if not exists contacts_email_key
  on contacts (email) where email is not null and archived_at is null;
create index if not exists contacts_company_idx on contacts (company_id);
create index if not exists contacts_name_trgm
  on contacts using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index if not exists contacts_phone_idx on contacts (phone);

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at before update on contacts
  for each row execute function set_updated_at();

-- ========================================================== properties =====
create table if not exists properties (
  id             uuid primary key default gen_random_uuid(),
  address_line1  text not null,
  address_line2  text,
  city           text,
  state          text,
  postal_code    text,
  county         text,
  apn            text,
  property_type  text,
  latitude       numeric(9,6),
  longitude      numeric(9,6),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);

create index if not exists properties_apn_idx on properties (lower(btrim(apn)));
create index if not exists properties_address_trgm
  on properties using gin (address_line1 gin_trgm_ops);
create index if not exists properties_city_idx on properties (lower(city));

drop trigger if exists properties_set_updated_at on properties;
create trigger properties_set_updated_at before update on properties
  for each row execute function set_updated_at();

-- ============================================================ services =====
create table if not exists services (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  category       text not null,
  is_requestable boolean not null default false,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists services_set_updated_at on services;
create trigger services_set_updated_at before update on services
  for each row execute function set_updated_at();

-- ===================================================== referral_sources ====
create table if not exists referral_sources (
  code            text primary key,
  label           text not null,
  is_professional boolean not null default false,
  sort_order      integer not null default 0,
  is_active       boolean not null default true
);

-- ======================================================= opportunities =====
-- A potential project / proposal request. This row is the source of truth for
-- an inbound request — a missed notification email must never lose it
-- (spec §9).
create sequence if not exists opportunity_number_seq start 1000;

create or replace function next_opportunity_number()
returns text
language sql
volatile
as $$
  select 'TDR-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('opportunity_number_seq')::text, 5, '0');
$$;

create table if not exists opportunities (
  id                    uuid primary key default gen_random_uuid(),
  opportunity_number    text not null unique default next_opportunity_number(),
  -- Populated when the opportunity is won and becomes a real project. Left
  -- null in Phase 1; the column exists so search can cover it later (spec §11).
  project_number        text,
  contact_id            uuid references contacts (id) on delete set null,
  company_id            uuid references companies (id) on delete set null,
  property_id           uuid references properties (id) on delete set null,
  status                opportunity_status not null default 'new',
  project_description   text,
  requested_timeframe   text,
  approximate_size      text,
  -- Answers to the conditional per-service questions (spec §7), keyed by the
  -- question `name` declared in src/content/services.ts.
  service_details       jsonb not null default '{}'::jsonb,
  -- Where the request came from: 'website' in Phase 1; 'phone', 'email' and
  -- imported sources later.
  source                text not null default 'website',
  source_page           text,
  -- Retained for abuse investigation only. Never displayed publicly.
  submitted_ip_hash     text,
  submitted_user_agent  text,
  submitted_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz
);

create index if not exists opportunities_status_idx on opportunities (status)
  where archived_at is null;
create index if not exists opportunities_contact_idx on opportunities (contact_id);
create index if not exists opportunities_company_idx on opportunities (company_id);
create index if not exists opportunities_property_idx on opportunities (property_id);
create index if not exists opportunities_submitted_idx on opportunities (submitted_at desc);
create index if not exists opportunities_number_trgm
  on opportunities using gin (opportunity_number gin_trgm_ops);
create index if not exists opportunities_project_number_trgm
  on opportunities using gin (project_number gin_trgm_ops)
  where project_number is not null;

drop trigger if exists opportunities_set_updated_at on opportunities;
create trigger opportunities_set_updated_at before update on opportunities
  for each row execute function set_updated_at();

-- ================================================ opportunity_services =====
create table if not exists opportunity_services (
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  service_id     uuid not null references services (id) on delete restrict,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  primary key (opportunity_id, service_id)
);

create index if not exists opportunity_services_service_idx
  on opportunity_services (service_id);

-- =========================================================== referrals =====
-- The relationship between a referral source and an opportunity. Kept as its
-- own table because one referring professional generates many opportunities
-- over time and TDR needs to measure and market to that relationship
-- (spec §1, §8).
create table if not exists referrals (
  id                     uuid primary key default gen_random_uuid(),
  opportunity_id         uuid not null references opportunities (id) on delete cascade,
  source_code            text not null references referral_sources (code),
  -- Resolved links when the referring professional could be matched to, or
  -- created as, a contact/company record.
  referring_contact_id   uuid references contacts (id) on delete set null,
  referring_company_id   uuid references companies (id) on delete set null,
  -- Exactly what the prospect typed, preserved even after the record is
  -- matched so a bad match can always be audited and corrected.
  raw_name               text,
  raw_company            text,
  raw_email              citext,
  raw_phone              text,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists referrals_opportunity_key
  on referrals (opportunity_id);
create index if not exists referrals_contact_idx on referrals (referring_contact_id);
create index if not exists referrals_company_idx on referrals (referring_company_id);
create index if not exists referrals_source_idx on referrals (source_code);

drop trigger if exists referrals_set_updated_at on referrals;
create trigger referrals_set_updated_at before update on referrals
  for each row execute function set_updated_at();

-- =============================================================== files =====
-- Metadata only. The bytes live in Supabase Storage in Phase 1 and may move to
-- a TDR-controlled NAS or object store later (spec §19) — which is why the
-- bucket/path are stored as plain columns rather than assumed.
create table if not exists files (
  id                uuid primary key default gen_random_uuid(),
  opportunity_id    uuid references opportunities (id) on delete cascade,
  inquiry_id        uuid,
  storage_provider  text not null default 'supabase',
  storage_bucket    text not null,
  storage_path      text not null,
  original_filename text not null,
  content_type      text,
  byte_size         bigint,
  checksum_sha256   text,
  uploaded_by       uuid references app_users (id) on delete set null,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create index if not exists files_opportunity_idx on files (opportunity_id);
create unique index if not exists files_storage_key
  on files (storage_bucket, storage_path);

-- ================================================== website_inquiries =====
-- General contact-page inquiries that are not proposal requests.
create table if not exists website_inquiries (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text,
  email        citext,
  phone        text,
  company      text,
  subject      text,
  message      text not null,
  source_page  text,
  contact_id   uuid references contacts (id) on delete set null,
  status       text not null default 'new',
  submitted_ip_hash    text,
  submitted_user_agent text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index if not exists website_inquiries_created_idx
  on website_inquiries (created_at desc);

drop trigger if exists website_inquiries_set_updated_at on website_inquiries;
create trigger website_inquiries_set_updated_at before update on website_inquiries
  for each row execute function set_updated_at();

-- =================================== internal notes and status history =====
create table if not exists opportunity_notes (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  author_id      uuid references app_users (id) on delete set null,
  body           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists opportunity_notes_opportunity_idx
  on opportunity_notes (opportunity_id, created_at desc);

create table if not exists opportunity_status_history (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  from_status    opportunity_status,
  to_status      opportunity_status not null,
  changed_by     uuid references app_users (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index if not exists opportunity_status_history_idx
  on opportunity_status_history (opportunity_id, changed_at desc);

create or replace function log_opportunity_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into opportunity_status_history (opportunity_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_log_status on opportunities;
create trigger opportunities_log_status after update on opportunities
  for each row execute function log_opportunity_status_change();

-- ================================================ row level security ======
-- Deny by default. `anon` gets nothing but the two public reference tables;
-- the service role used by the intake route bypasses RLS entirely.
alter table app_users                 enable row level security;
alter table companies                 enable row level security;
alter table contacts                  enable row level security;
alter table properties                enable row level security;
alter table services                  enable row level security;
alter table referral_sources          enable row level security;
alter table opportunities             enable row level security;
alter table opportunity_services      enable row level security;
alter table referrals                 enable row level security;
alter table files                     enable row level security;
alter table website_inquiries         enable row level security;
alter table opportunity_notes         enable row level security;
alter table opportunity_status_history enable row level security;

-- Public reference data: readable by anyone so the proposal form can render
-- from the database if it ever needs to. Nothing here is confidential.
drop policy if exists services_public_read on services;
create policy services_public_read on services
  for select using (is_active);

drop policy if exists referral_sources_public_read on referral_sources;
create policy referral_sources_public_read on referral_sources
  for select using (is_active);

-- Staff read access across business data.
do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'properties', 'opportunities',
    'opportunity_services', 'referrals', 'files', 'website_inquiries',
    'opportunity_notes', 'opportunity_status_history'
  ] loop
    execute format('drop policy if exists %I_staff_read on %I', t, t);
    execute format(
      'create policy %I_staff_read on %I for select to authenticated using (is_staff())',
      t, t);
  end loop;
end $$;

-- Staff write access. Phase 1 only needs status changes and internal notes
-- from the browser; everything else is written server-side with the service
-- role. Update rights are scoped accordingly.
drop policy if exists opportunities_staff_update on opportunities;
create policy opportunities_staff_update on opportunities
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists opportunity_notes_staff_insert on opportunity_notes;
create policy opportunity_notes_staff_insert on opportunity_notes
  for insert to authenticated with check (is_staff() and author_id = auth.uid());

drop policy if exists contacts_staff_update on contacts;
create policy contacts_staff_update on contacts
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists companies_staff_update on companies;
create policy companies_staff_update on companies
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists properties_staff_update on properties;
create policy properties_staff_update on properties
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists referrals_staff_update on referrals;
create policy referrals_staff_update on referrals
  for update to authenticated using (is_staff()) with check (is_staff());

-- app_users: a user may read their own row; owners and managers manage all.
drop policy if exists app_users_self_read on app_users;
create policy app_users_self_read on app_users
  for select to authenticated using (id = auth.uid() or is_admin());

drop policy if exists app_users_admin_write on app_users;
create policy app_users_admin_write on app_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- ================================================== search foundation =====
-- One row per opportunity with every field the future internal system needs to
-- search on (spec §11). Kept as a view so it can never drift from the tables.
create or replace view v_opportunity_search as
select
  o.id,
  o.opportunity_number,
  o.project_number,
  o.status,
  o.submitted_at,
  o.project_description,
  c.first_name  as contact_first_name,
  c.last_name   as contact_last_name,
  c.email       as contact_email,
  c.phone       as contact_phone,
  co.name       as company_name,
  p.address_line1 as property_address,
  p.city        as property_city,
  p.postal_code as property_postal_code,
  p.apn         as property_apn,
  rc.first_name as referral_first_name,
  rc.last_name  as referral_last_name,
  rco.name      as referral_company_name,
  r.source_code as referral_source,
  r.raw_name    as referral_raw_name,
  r.raw_company as referral_raw_company,
  concat_ws(' ',
    o.opportunity_number, o.project_number,
    c.first_name, c.last_name, c.email, c.phone,
    co.name,
    p.address_line1, p.city, p.postal_code, p.apn,
    rc.first_name, rc.last_name, rco.name, r.raw_name, r.raw_company
  ) as search_text
from opportunities o
left join contacts   c   on c.id  = o.contact_id
left join companies  co  on co.id = o.company_id
left join properties p   on p.id  = o.property_id
left join referrals  r   on r.opportunity_id = o.id
left join contacts   rc  on rc.id = r.referring_contact_id
left join companies  rco on rco.id = r.referring_company_id
where o.archived_at is null;

-- Views inherit the RLS of their base tables when created with
-- security_invoker, which is what we want here.
alter view v_opportunity_search set (security_invoker = on);

-- ========================================================= seed data ======
insert into referral_sources (code, label, is_professional, sort_order) values
  ('architect',           'Architect',            true,  10),
  ('structural-engineer', 'Structural Engineer',  true,  20),
  ('civil-engineer',      'Civil Engineer',       true,  30),
  ('contractor',          'Contractor',           true,  40),
  ('developer',           'Developer',            true,  50),
  ('previous-client',     'Previous Client',      false, 60),
  ('search',              'Google / Search',      false, 70),
  ('social-media',        'Social Media',         false, 80),
  ('advertisement',       'Advertisement',        false, 90),
  ('other',               'Other',                false, 100)
on conflict (code) do update
  set label = excluded.label,
      is_professional = excluded.is_professional,
      sort_order = excluded.sort_order;

-- Service catalog. Mirrors src/content/services.ts — keep the two in sync.
insert into services (code, name, category, is_requestable, sort_order) values
  ('architectural-topographic-survey', 'Architectural / Topographic Survey', 'land-surveying',   true,  10),
  ('boundary-survey',                  'Boundary Survey',                    'land-surveying',   true,  20),
  ('alta-survey',                      'ALTA / NSPS Land Title Survey',      'land-surveying',   true,  30),
  ('construction-staking',             'Construction Staking',               'land-surveying',   true,  40),
  ('as-built-survey',                  'As-Built Survey',                    'land-surveying',   false, 50),
  ('subdivision-mapping',              'Subdivision & Mapping',              'land-surveying',   false, 60),
  ('specialized-surveys',              'Specialized Surveys',                'land-surveying',   false, 70),
  ('grading',                          'Grading Design',                     'civil-engineering', false, 110),
  ('drainage',                         'Drainage Design',                    'civil-engineering', false, 120),
  ('hydrology',                        'Hydrology & Hydraulics',             'civil-engineering', false, 130),
  ('site-development',                 'Site Development',                   'civil-engineering', false, 140),
  ('hillside-development',             'Hillside Development',               'civil-engineering', false, 150),
  ('infrastructure',                   'Infrastructure',                     'civil-engineering', false, 160),
  ('construction-support',             'Construction Support',               'civil-engineering', false, 170),
  ('civil-engineering',                'Civil Engineering',                  'civil-engineering', true,  100),
  ('architectural-scanning',           'Architectural Scanning',             '3d-scanning',      false, 210),
  ('lidar',                            'LiDAR',                              '3d-scanning',      false, 220),
  ('scan-to-cad',                      'Scan-to-CAD',                        '3d-scanning',      true,  230),
  ('scan-to-bim',                      'Scan-to-BIM / Revit',                '3d-scanning',      true,  240),
  ('revit-bim',                        'Revit / BIM Services',               '3d-scanning',      false, 250),
  ('industrial-scanning',              'Industrial Scanning',                '3d-scanning',      false, 260),
  ('structural-documentation',         'Structural Documentation',           '3d-scanning',      false, 270),
  ('floor-flatness',                   'Floor Flatness & Surface Analysis',  '3d-scanning',      false, 280),
  ('large-facility-capture',           'Large Facility Capture',             '3d-scanning',      false, 290),
  ('existing-conditions',              'Existing Conditions Documentation',  '3d-scanning',      false, 300),
  ('3d-scanning',                      '3D Scanning',                        '3d-scanning',      true,  200),
  ('other',                            'Other / Not sure',                   'land-surveying',   true,  900)
on conflict (code) do update
  set name = excluded.name,
      category = excluded.category,
      is_requestable = excluded.is_requestable,
      sort_order = excluded.sort_order;
