-- ===========================================================================
-- TDR Engineering — job files
--
-- Extends the `files` table from 0001 rather than replacing it. That table was
-- written with `storage_provider`, `storage_bucket` and `storage_path` as
-- plain columns precisely so the bytes could move later (spec §19) — so a
-- migration to Cloudflare R2 or a TDR object store is per-file and gradual,
-- not a rewrite.
--
-- THE UPLOAD PATH DOES NOT GO THROUGH THE APPLICATION
--
-- Vercel caps a serverless request body at 4.5 MB. A point cloud is three
-- orders of magnitude past that, so anything that streams file bytes through a
-- server action is broken for the files TDR actually needs to move. The
-- browser asks for a short-lived signed upload URL and PUTs directly to
-- storage; the application only ever sees metadata.
--
-- CLIENT VISIBILITY IS THE PORTAL GATE
--
-- `client_visible` defaults to FALSE. A file is internal until somebody
-- deliberately shares it. When the client portal is built it reads this column
-- and nothing else — so the decision to expose a file is made once, here, by a
-- person, rather than inferred later from a folder name or a file type.
-- ===========================================================================

-- ------------------------------------------------------- categories -------
do $$ begin
  create type file_category as enum (
    'deliverable',  -- the signed drawing, the report — what the client is owed
    'working',      -- field data, calcs, drafts. Internal by nature
    'reference',    -- what the client or a third party gave TDR
    'correspondence'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ files -------
alter table files
  add column if not exists job_id         uuid references jobs (id) on delete cascade,
  add column if not exists category       file_category not null default 'working',
  add column if not exists client_visible boolean not null default false,
  add column if not exists label          text,
  add column if not exists uploaded_at    timestamptz not null default now();

comment on column files.client_visible is
  'Whether a client may see this file in the portal. Defaults false: a file is internal until somebody deliberately shares it.';
comment on column files.job_id is
  'The job this file belongs to. Null for proposal attachments, which predate jobs.';

create index if not exists files_job_idx on files (job_id) where archived_at is null;
create index if not exists files_job_visible_idx
  on files (job_id, client_visible) where archived_at is null;
create index if not exists files_category_idx on files (category);

-- ----------------------------------------------------------- bucket -------
-- Private, and deliberately unrestricted on MIME type: survey deliverables run
-- to .dwg, .dxf, .las, .laz, .e57, .rcp and a dozen more that no allow-list
-- would keep up with. Only staff can write here, and `client_visible` — not
-- the bucket — decides what a client ever sees.
insert into storage.buckets (id, name, public, file_size_limit)
values ('job-files', 'job-files', false, 5368709120)  -- 5 GB per file
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "job files staff read" on storage.objects;
create policy "job files staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-files' and is_staff());

drop policy if exists "job files staff insert" on storage.objects;
create policy "job files staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files' and is_staff());

drop policy if exists "job files staff update" on storage.objects;
create policy "job files staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'job-files' and is_staff());

drop policy if exists "job files staff delete" on storage.objects;
create policy "job files staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-files' and is_staff());

-- -------------------------------------------------------------- RLS -------
-- 0001 gave `files` a staff read policy only, because the intake wrote them
-- with the service role. Staff now upload from the browser, so they need to
-- write metadata too.
drop policy if exists files_staff_insert on files;
create policy files_staff_insert on files
  for insert to authenticated with check (is_staff());

drop policy if exists files_staff_update on files;
create policy files_staff_update on files
  for update to authenticated using (is_staff()) with check (is_staff());

-- --------------------------------------------------------- job files ------
create or replace view v_job_files as
select
  f.id,
  f.job_id,
  f.label,
  f.original_filename,
  f.content_type,
  f.byte_size,
  f.category,
  f.client_visible,
  f.storage_bucket,
  f.storage_path,
  f.uploaded_at,
  u.full_name as uploaded_by_name,
  j.job_number
from files f
join jobs j on j.id = f.job_id
left join app_users u on u.id = f.uploaded_by
where f.archived_at is null;

alter view v_job_files set (security_invoker = on);

-- Storage totals per job, so the file panel can say what a job is holding
-- without pulling every row.
create or replace view v_job_file_totals as
select
  job_id,
  count(*)                                          as file_count,
  coalesce(sum(byte_size), 0)                       as total_bytes,
  count(*) filter (where client_visible)            as client_visible_count,
  count(*) filter (where category = 'deliverable')  as deliverable_count
from files
where job_id is not null and archived_at is null
group by job_id;

alter view v_job_file_totals set (security_invoker = on);

-- Granted explicitly rather than leaning on Supabase's default privileges for
-- newly created objects. Both views are `security_invoker`, so RLS on `files`
-- still decides what any given caller actually sees — the grant only makes the
-- views reachable, it does not widen access.
grant select on v_job_files       to authenticated;
grant select on v_job_file_totals to authenticated;
