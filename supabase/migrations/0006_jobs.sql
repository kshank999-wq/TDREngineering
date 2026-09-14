-- ===========================================================================
-- TDR Engineering — jobs
--
-- The spine of everything after a proposal is accepted. Deliverable files,
-- invoices, payments and the client portal all attach here, so this table has
-- to be right before any of them can be built.
--
-- WHY A JOB IS NOT A FLAG ON THE PROPOSAL
--
-- An opportunity records what TDR *quoted*: the services asked for, the
-- description the client typed, the price discussed. That is a historical
-- record and it must stay true. A job records what TDR is *doing*: when the
-- crew goes out, who is drafting, what was actually contracted, when it was
-- delivered. Those move independently, and a proposal that rewrote itself as
-- the work progressed would destroy the record of what was agreed.
--
-- The link is optional in both directions. Work arrives by phone and by
-- referral without ever passing through the website form, and those jobs are
-- just as real — `opportunity_id` is nullable so they are not second-class.
-- ===========================================================================

-- ------------------------------------------------------------ status -------
do $$ begin
  create type job_status as enum (
    'scheduled',    -- accepted and on the board, no field work yet
    'field_work',   -- crew is out
    'processing',   -- calcs and drafting
    'review',       -- licensed review before anything leaves the office
    'delivered',    -- deliverables sent to the client
    'on_hold',      -- stalled on something outside TDR's control
    'complete',     -- closed out
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- job numbers -------
create sequence if not exists job_number_seq start 1;

-- Auto-assigned, but the column is plain text with a unique index so a job can
-- be renumbered by hand to match an existing scheme without fighting this.
create or replace function next_job_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'J-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('job_number_seq')::text, 4, '0');
$$;

-- ------------------------------------------------------------- jobs --------
create table if not exists jobs (
  id                uuid primary key default gen_random_uuid(),
  job_number        text not null unique default next_job_number(),

  -- Where it came from. Null when the work arrived by phone or by referral
  -- rather than through the website.
  opportunity_id    uuid references opportunities (id) on delete set null,

  -- Denormalised onto the job deliberately: the client of record for a job is
  -- a fact about the job, and must not change because a contact was later
  -- merged, re-parented to a different company, or archived.
  contact_id        uuid references contacts (id) on delete set null,
  company_id        uuid references companies (id) on delete set null,
  property_id       uuid references properties (id) on delete set null,

  name              text not null,
  description       text,
  status            job_status not null default 'scheduled',

  -- What was actually contracted, which is not always what was quoted.
  contract_amount   numeric(12,2),
  currency          text not null default 'USD',
  purchase_order    text,

  scheduled_start   date,
  field_complete    date,
  delivered_at      timestamptz,
  closed_at         timestamptz,

  assigned_to       uuid references app_users (id) on delete set null,
  notes             text,

  created_by        uuid references app_users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create index if not exists jobs_status_idx      on jobs (status) where archived_at is null;
create index if not exists jobs_contact_idx     on jobs (contact_id);
create index if not exists jobs_company_idx     on jobs (company_id);
create index if not exists jobs_property_idx    on jobs (property_id);
create index if not exists jobs_opportunity_idx on jobs (opportunity_id);
create index if not exists jobs_assigned_idx    on jobs (assigned_to);
create index if not exists jobs_created_idx     on jobs (created_at desc);
create index if not exists jobs_number_trgm     on jobs using gin (job_number gin_trgm_ops);

-- One job per opportunity. A proposal that has already been converted must not
-- silently produce a second job because someone clicked twice.
create unique index if not exists jobs_opportunity_key
  on jobs (opportunity_id) where opportunity_id is not null and archived_at is null;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();

-- ------------------------------------------------- notes and history -------
create table if not exists job_notes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs (id) on delete cascade,
  author_id   uuid references app_users (id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists job_notes_job_idx on job_notes (job_id, created_at desc);

create table if not exists job_status_history (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs (id) on delete cascade,
  from_status job_status,
  to_status   job_status not null,
  changed_by  uuid references app_users (id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists job_status_history_idx
  on job_status_history (job_id, changed_at desc);

create or replace function log_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into job_status_history (job_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());

    -- Stamp the milestones rather than asking anyone to remember to.
    if new.status = 'delivered' and new.delivered_at is null then
      new.delivered_at = now();
    end if;
    if new.status in ('complete', 'cancelled') and new.closed_at is null then
      new.closed_at = now();
    end if;
  end if;
  return new;
end;
$$;

-- BEFORE, not AFTER: the milestone stamps above have to land on the row being
-- written, and an AFTER trigger cannot change it.
drop trigger if exists jobs_log_status on jobs;
create trigger jobs_log_status before update on jobs
  for each row execute function log_job_status_change();

-- A trigger function is never called directly, and PostgreSQL checks EXECUTE
-- when the trigger is created rather than when it fires — so it needs no
-- grant. Revoked for the same reason as 0005: SECURITY DEFINER functions do
-- not belong on the public REST API.
revoke all on function log_job_status_change() from public, anon;

-- -------------------------------------------------------------- RLS --------
alter table jobs               enable row level security;
alter table job_notes          enable row level security;
alter table job_status_history enable row level security;

drop policy if exists jobs_staff_read on jobs;
create policy jobs_staff_read on jobs
  for select to authenticated using (is_staff());

drop policy if exists jobs_staff_insert on jobs;
create policy jobs_staff_insert on jobs
  for insert to authenticated with check (is_staff());

drop policy if exists jobs_staff_update on jobs;
create policy jobs_staff_update on jobs
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists job_notes_staff_read on job_notes;
create policy job_notes_staff_read on job_notes
  for select to authenticated using (is_staff());

drop policy if exists job_notes_staff_insert on job_notes;
create policy job_notes_staff_insert on job_notes
  for insert to authenticated with check (is_staff() and author_id = auth.uid());

drop policy if exists job_status_history_staff_read on job_status_history;
create policy job_status_history_staff_read on job_status_history
  for select to authenticated using (is_staff());

-- ------------------------------------------------------- the job board -----
-- One row per live job with everything the board needs, so the list page does
-- not fan out into a query per row.
create or replace view v_job_board as
select
  j.id,
  j.job_number,
  j.name,
  j.status,
  j.contract_amount,
  j.scheduled_start,
  j.field_complete,
  j.delivered_at,
  j.created_at,
  j.opportunity_id,
  o.opportunity_number,
  j.contact_id,
  btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as contact_name,
  j.company_id,
  co.name                                                              as company_name,
  p.address_line1                                                      as property_address,
  p.city                                                               as property_city,
  u.full_name                                                          as assigned_to_name,
  concat_ws(' ', j.job_number, j.name, o.opportunity_number,
                 c.first_name, c.last_name, co.name,
                 p.address_line1, p.city, p.apn)                       as search_text
from jobs j
left join opportunities o on o.id  = j.opportunity_id
left join contacts      c on c.id  = j.contact_id
left join companies    co on co.id = j.company_id
left join properties    p on p.id  = j.property_id
left join app_users     u on u.id  = j.assigned_to
where j.archived_at is null;

alter view v_job_board set (security_invoker = on);
