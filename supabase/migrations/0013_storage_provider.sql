-- ===========================================================================
-- TDR Engineering — expose the storage provider to the portal
--
-- `files.storage_provider` has existed since 0001, written that way so the
-- bytes could move to a TDR-controlled store later without a rewrite. Moving
-- them is now real: job files go to S3-compatible cloud storage (Cloudflare
-- R2 by default) when it is configured, and stay in Supabase Storage when it
-- is not.
--
-- THE MIGRATION IS PER FILE, NOT A CUTOVER
--
-- Every download reads the provider from the file's own row, so a deliverable
-- uploaded to Supabase last month and one uploaded to R2 today both work, at
-- the same time, with no flag day and nothing to move first. That is the whole
-- reason the column exists.
--
-- Which means the portal has to be able to see it. `v_portal_files` selects
-- columns explicitly — deliberately, so nothing internal can leak — and
-- `storage_provider` was not among them. Without this the portal would ask
-- Supabase Storage for a file that lives in R2 and hand the client a broken
-- link.
--
-- Nothing else about the view changes: same filter, same
-- `client_can_see_job()` gate, same client-visible-only rule.
-- ===========================================================================

create or replace view v_portal_files as
select
  f.id,
  f.job_id,
  coalesce(f.label, f.original_filename) as name,
  f.original_filename,
  f.content_type,
  f.byte_size,
  f.category,
  f.uploaded_at,
  f.storage_bucket,
  f.storage_path,
  -- Appended, not inserted: `create or replace view` can add columns only at
  -- the end. Putting it beside the other storage columns, where it belongs
  -- logically, fails with "cannot change name of view column".
  f.storage_provider
from files f
where f.archived_at is null
  and f.client_visible
  and f.job_id is not null
  and client_can_see_job(f.job_id);

-- SECURITY DEFINER, as in 0009: the view bypasses RLS and its own WHERE clause
-- is the boundary. Stated explicitly rather than trusting `create or replace`
-- to preserve it — if this silently became `security_invoker`, RLS on `files`
-- would deny every client and the whole portal file list would empty out.
alter view v_portal_files set (security_invoker = off);

-- Grants restated so this migration stands on its own and is safe to re-run.
revoke all on v_portal_files from public, anon;
grant select on v_portal_files to authenticated;

-- The staff-facing job file view, for the same reason. This is 0007's
-- definition with `storage_provider` added and nothing else touched — the
-- same columns, the same join to `jobs`, the same `security_invoker`.
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
  j.job_number,
  -- Appended for the same reason as above.
  f.storage_provider
from files f
join jobs j on j.id = f.job_id
left join app_users u on u.id = f.uploaded_by
where f.archived_at is null;

alter view v_job_files set (security_invoker = on);
grant select on v_job_files to authenticated;
