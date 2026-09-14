-- ===========================================================================
-- TDR Engineering — marketing asset library
--
-- Flyers, brochures, capability statements, rate sheets, spec sheets, project
-- photography. The material TDR hands to prospects, in one place, so nobody
-- has to ask which folder the current one is in.
--
-- THE FAILURE THIS IS BUILT AROUND: SENDING LAST YEAR'S RATE SHEET
--
-- A marketing library that is just a folder of files has one predictable
-- failure, and it is not losing a file — it is somebody confidently sending
-- the superseded version. So an asset is not a file here. An asset is a
-- THING ("Boundary survey flyer") that HAS versions, and exactly one of them
-- is current.
--
-- That makes the share link durable. You hand out one link, and when the
-- flyer is redesigned the same link serves the new one. The alternative —
-- a link per file — guarantees that every link ever sent goes stale the day
-- it is replaced, which is the original problem wearing a hat.
--
-- SLUGS ARE NEVER REUSED
--
-- The slug is globally unique across live AND archived assets. Freeing a slug
-- when an asset is archived would mean an old link, already sitting in
-- somebody's inbox, quietly starts serving a different document. A dead link
-- is a small problem; a link that silently changes what it points at is not.
--
-- PUBLIC IS BY LINK, NOT BY BUCKET
--
-- "Public" here means "anyone holding the link may download it" — it does NOT
-- mean a public storage bucket. The bucket stays private and the public route
-- mints a short-lived signed URL after checking the asset is still shared.
--
-- That distinction is the whole reason sharing is revocable. A public bucket
-- URL cannot be taken back: it gets cached, scraped and forwarded, and
-- un-publishing is a fiction. A route-gated one stops working the moment
-- somebody switches it off.
--
-- Nor does public mean advertised. Assets are `noindex` by default, because
-- staff will mark something public simply to send it to one person.
--
-- `anon` gets NO grant on these tables, exactly as in 0009 and 0010.
-- ===========================================================================

-- --------------------------------------------------------- categories -----
do $$ begin
  create type marketing_category as enum (
    'flyer',
    'brochure',
    'capability_statement',
    'rate_sheet',
    'spec_sheet',
    'case_study',
    'presentation',
    'photo',
    'logo',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ assets ------
create table if not exists marketing_assets (
  id               uuid primary key default gen_random_uuid(),

  title            text not null,
  description      text,
  category         marketing_category not null default 'flyer',

  -- Free-form, for the searches a fixed category list will never anticipate
  -- ("ALTA", "residential", "trade show", "2026").
  tags             text[] not null default '{}',

  -- The shareable path: /m/<slug>. Unique across archived assets too — see
  -- the header. Never reused, so a link can die but cannot change meaning.
  slug             text not null unique,

  -- Whether the link works at all. Off by default: an asset is internal until
  -- somebody deliberately shares it, the same rule as `files.client_visible`.
  is_public        boolean not null default false,

  -- Which version the link serves. Set by trigger when a version is added, so
  -- an asset can never point at nothing.
  current_version_id uuid,

  download_count   integer not null default 0,
  last_downloaded_at timestamptz,

  created_by       uuid references app_users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,

  constraint marketing_assets_title_present check (btrim(title) <> ''),
  -- Lowercase, digits and hyphens. Anything else either breaks in a URL or
  -- creates two slugs that look identical to a person.
  constraint marketing_assets_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists marketing_assets_category_idx
  on marketing_assets (category) where archived_at is null;
create index if not exists marketing_assets_public_idx
  on marketing_assets (is_public) where archived_at is null;
create index if not exists marketing_assets_tags_idx
  on marketing_assets using gin (tags);
create index if not exists marketing_assets_title_trgm
  on marketing_assets using gin (title gin_trgm_ops);

drop trigger if exists marketing_assets_set_updated_at on marketing_assets;
create trigger marketing_assets_set_updated_at before update on marketing_assets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------- versions ------
-- Every upload is kept. Superseding a flyer is not deleting it: "what did we
-- send them in March" is a real question, and the answer has to survive the
-- redesign.
create table if not exists marketing_asset_versions (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references marketing_assets (id) on delete cascade,

  version      integer not null,

  -- The bytes live in Storage; this is the metadata row from 0001, which
  -- already carries content type, size, checksum and the storage location.
  -- Deliberately NOT a `marketing_asset_id` column on `files`: the link lives
  -- in exactly one place, so it cannot drift out of step with itself.
  file_id      uuid not null references files (id) on delete cascade,

  -- What changed. "Updated 2026 pricing", "new photography".
  notes        text,

  uploaded_by  uuid references app_users (id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (asset_id, version)
);

create index if not exists marketing_asset_versions_asset_idx
  on marketing_asset_versions (asset_id, version desc);

alter table marketing_assets
  drop constraint if exists marketing_assets_current_version_fk;
alter table marketing_assets
  add constraint marketing_assets_current_version_fk
  foreign key (current_version_id)
  references marketing_asset_versions (id) on delete set null;

-- Numbering and promotion in one place. A new version is always the next
-- number and always becomes current — that is what uploading a new version
-- MEANS, and making it two steps is how an asset ends up quietly serving the
-- old file after somebody uploaded the new one and got distracted.
--
-- Rolling back is a deliberate, separate act (`set_current_marketing_version`).
create or replace function assign_marketing_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.version is null or new.version = 0 then
    select coalesce(max(version), 0) + 1 into new.version
      from marketing_asset_versions where asset_id = new.asset_id;
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_versions_assign on marketing_asset_versions;
create trigger marketing_versions_assign before insert on marketing_asset_versions
  for each row execute function assign_marketing_version();

create or replace function promote_marketing_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update marketing_assets
     set current_version_id = new.id
   where id = new.asset_id;
  return null;
end;
$$;

revoke all on function promote_marketing_version() from public, anon, authenticated;

drop trigger if exists marketing_versions_promote on marketing_asset_versions;
create trigger marketing_versions_promote after insert on marketing_asset_versions
  for each row execute function promote_marketing_version();

-- ============================================================== RLS ========
alter table marketing_assets         enable row level security;
alter table marketing_asset_versions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['marketing_assets', 'marketing_asset_versions'] loop
    execute format('drop policy if exists %I_staff_read on %I', t, t);
    execute format(
      'create policy %I_staff_read on %I for select to authenticated using (is_staff())', t, t);
    execute format('drop policy if exists %I_staff_insert on %I', t, t);
    execute format(
      'create policy %I_staff_insert on %I for insert to authenticated with check (is_staff())', t, t);
    execute format('drop policy if exists %I_staff_update on %I', t, t);
    execute format(
      'create policy %I_staff_update on %I for update to authenticated using (is_staff()) with check (is_staff())', t, t);
    execute format('drop policy if exists %I_staff_delete on %I', t, t);
    execute format(
      'create policy %I_staff_delete on %I for delete to authenticated using (is_staff())', t, t);
  end loop;
end $$;

-- ================================================ the public share path ====
-- Reached by an anonymous visitor holding a link. Same shape as the proposal
-- signing path in 0010: the visitor has no database access, they reach a
-- server route holding the service role, and these functions decide what is
-- released. Columns are chosen, not inherited.

-- What the share page shows. Returns nothing unless the asset is still shared,
-- still live, and actually has a current version — so a half-created asset is
-- never reachable.
create or replace function marketing_asset_for_public(p_slug text)
returns table (
  asset_id      uuid,
  title         text,
  description   text,
  category      marketing_category,
  version       integer,
  filename      text,
  content_type  text,
  byte_size     bigint,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.title, a.description, a.category,
    v.version, f.original_filename, f.content_type, f.byte_size, a.updated_at
  from marketing_assets a
  join marketing_asset_versions v on v.id = a.current_version_id
  join files f on f.id = v.file_id
  where a.slug = p_slug
    and a.is_public
    and a.archived_at is null
    and f.archived_at is null;
$$;

-- Where the bytes are, plus the download tally. Returns the storage location
-- only after the same checks have passed, so the route never reaches storage
-- with a path the database has not already released.
create or replace function marketing_asset_download(p_slug text)
returns table (storage_bucket text, storage_path text, original_filename text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset uuid;
begin
  select a.id into v_asset
    from marketing_assets a
    join marketing_asset_versions v on v.id = a.current_version_id
    join files f on f.id = v.file_id
   where a.slug = p_slug
     and a.is_public
     and a.archived_at is null
     and f.archived_at is null;

  if v_asset is null then
    return;  -- no rows: the route cannot tell why, and neither can a visitor
  end if;

  update marketing_assets
     set download_count = download_count + 1,
         last_downloaded_at = now()
   where id = v_asset;

  return query
    select f.storage_bucket, f.storage_path, f.original_filename
      from marketing_assets a
      join marketing_asset_versions v on v.id = a.current_version_id
      join files f on f.id = v.file_id
     where a.id = v_asset;
end;
$$;

-- Not on the public REST API. Granted to service_role alone — the re-grant
-- after revoking from `public` is mandatory, since every role inherits from
-- PUBLIC and BYPASSRLS does not cover EXECUTE (learned the hard way in 0010).
revoke all on function marketing_asset_for_public(text) from public, anon, authenticated;
revoke all on function marketing_asset_download(text)   from public, anon, authenticated;
grant execute on function marketing_asset_for_public(text) to service_role;
grant execute on function marketing_asset_download(text)   to service_role;

-- ============================================================= bucket ======
-- Private, like every other bucket here. 200 MB: a print-resolution brochure
-- or a short capability video is bigger than a PDF but nothing like a point
-- cloud.
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-assets', 'marketing-assets', false, 209715200)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "marketing assets staff read" on storage.objects;
create policy "marketing assets staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'marketing-assets' and is_staff());

drop policy if exists "marketing assets staff insert" on storage.objects;
create policy "marketing assets staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marketing-assets' and is_staff());

drop policy if exists "marketing assets staff update" on storage.objects;
create policy "marketing assets staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'marketing-assets' and is_staff());

drop policy if exists "marketing assets staff delete" on storage.objects;
create policy "marketing assets staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'marketing-assets' and is_staff());

-- ========================================================= staff view ======
create or replace view v_marketing_library as
select
  a.id,
  a.title,
  a.description,
  a.category,
  a.tags,
  a.slug,
  a.is_public,
  a.download_count,
  a.last_downloaded_at,
  a.created_at,
  a.updated_at,
  a.archived_at,
  v.id                       as current_version_id,
  v.version                  as current_version,
  v.created_at               as current_version_at,
  v.notes                    as current_version_notes,
  f.original_filename,
  f.content_type,
  f.byte_size,
  (select count(*) from marketing_asset_versions mv where mv.asset_id = a.id) as version_count,
  -- An asset with no current version is not shareable and not usable. Shown
  -- rather than hidden: it means an upload was started and never finished, and
  -- silently omitting it is how it stays broken.
  (a.current_version_id is null) as needs_upload,
  concat_ws(' ', a.title, a.description, a.slug,
            array_to_string(a.tags, ' '), f.original_filename) as search_text
from marketing_assets a
left join marketing_asset_versions v on v.id = a.current_version_id
left join files f on f.id = v.file_id;

alter view v_marketing_library set (security_invoker = on);
grant select on v_marketing_library to authenticated;

-- ------------------------------------------------------- rollback ---------
-- Deliberately its own function rather than a plain update: pointing an asset
-- at an older version is a decision, and it must not be possible to point it
-- at a version belonging to a DIFFERENT asset, which a bare
-- `update ... set current_version_id = $1` would happily allow.
create or replace function set_current_marketing_version(p_asset uuid, p_version uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from marketing_asset_versions
     where id = p_version and asset_id = p_asset
  ) then
    return false;
  end if;

  update marketing_assets set current_version_id = p_version where id = p_asset;
  return true;
end;
$$;

revoke all on function set_current_marketing_version(uuid, uuid) from public, anon;
grant execute on function set_current_marketing_version(uuid, uuid) to authenticated;
