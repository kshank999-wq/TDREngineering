-- ===========================================================================
-- TDR Engineering — connected storage accounts (Google Drive)
--
-- Somewhere to keep the credential that lets this application write into TDR's
-- own Google Drive, plus which folder to write into.
--
-- THE REFRESH TOKEN IS THE MOST DANGEROUS VALUE IN THIS DATABASE
--
-- It does not expire, and it grants continuing access to the Drive of whoever
-- authorised it. Every other secret here lives in Vercel's environment; this
-- one cannot, because it is obtained at runtime when somebody clicks Connect.
--
-- So it is stored ENCRYPTED, with a key that lives in the environment. A copy
-- of this database — a backup on a laptop, an export, a compromised read
-- replica — contains ciphertext and nothing else. Getting the plaintext needs
-- both the database and the deployment's key.
--
-- ONE ROW, ENFORCED
--
-- A partial unique index allows exactly one active connection per provider.
-- Two live connections would mean uploads landing in whichever Drive the query
-- happened to return first, and that is the kind of bug nobody finds until
-- files are scattered across two accounts.
--
-- OWNERS ONLY
--
-- Connecting storage is not an ordinary staff action: it binds the firm's job
-- files to one Google account. `is_admin()` rather than `is_staff()`, and the
-- token column is never selected by anything except the server code that
-- refreshes it.
-- ===========================================================================

create table if not exists storage_connections (
  id                uuid primary key default gen_random_uuid(),

  -- 'google_drive' today. The column exists so Dropbox or OneDrive would be a
  -- row rather than a schema change.
  provider          text not null,

  -- Which account authorised this, for the screen to say whose Drive it is.
  account_email     citext,

  -- AES-256-GCM, base64. Never plaintext, never in a view, never logged.
  refresh_token_enc text,

  -- Where job files go. `folder_id` is a Drive folder; `drive_id` is set when
  -- that folder lives in a Shared Drive rather than somebody's My Drive.
  folder_id         text,
  folder_name       text,
  drive_id          text,

  scopes            text,

  is_active         boolean not null default true,
  connected_by      uuid references app_users (id) on delete set null,
  connected_at      timestamptz not null default now(),
  last_used_at      timestamptz,

  -- The most recent failure, so a broken connection is visible on the screen
  -- rather than discovered when somebody cannot upload.
  last_error        text,
  last_error_at     timestamptz,

  constraint storage_connections_provider_known
    check (provider in ('google_drive'))
);

-- Exactly one live connection per provider.
create unique index if not exists storage_connections_one_active
  on storage_connections (provider) where is_active;

comment on column storage_connections.refresh_token_enc is
  'AES-256-GCM ciphertext of the OAuth refresh token. Decryptable only with the key in the deployment environment; a database copy alone is useless.';

-- ============================================================== RLS =======
alter table storage_connections enable row level security;

-- Owners and managers only, and the policy is the outer gate rather than the
-- only one: the server code that reads the token checks separately.
drop policy if exists storage_connections_admin_read on storage_connections;
create policy storage_connections_admin_read on storage_connections
  for select to authenticated using (is_admin());

drop policy if exists storage_connections_admin_insert on storage_connections;
create policy storage_connections_admin_insert on storage_connections
  for insert to authenticated with check (is_admin());

drop policy if exists storage_connections_admin_update on storage_connections;
create policy storage_connections_admin_update on storage_connections
  for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists storage_connections_admin_delete on storage_connections;
create policy storage_connections_admin_delete on storage_connections
  for delete to authenticated using (is_admin());

-- ============================================================= view =======
-- What the settings screen shows. The token column is ABSENT — not filtered,
-- absent — so no query written later can accidentally select it, and nothing
-- that renders this view can leak it into HTML.
create or replace view v_storage_connections as
select
  c.id,
  c.provider,
  c.account_email,
  c.folder_id,
  c.folder_name,
  c.drive_id,
  c.scopes,
  c.is_active,
  c.connected_at,
  c.last_used_at,
  c.last_error,
  c.last_error_at,
  c.refresh_token_enc is not null as has_token,
  u.full_name                    as connected_by_name
from storage_connections c
left join app_users u on u.id = c.connected_by;

alter view v_storage_connections set (security_invoker = on);
grant select on v_storage_connections to authenticated;

-- ============================================== files land in Drive too ====
-- `files.storage_provider` already carries 'supabase' and 's3'. Google Drive
-- is the third value: `storage_path` holds the Drive FILE ID rather than a
-- path, and `storage_bucket` holds the folder id it was created in.
--
-- No constraint is added on the column. It has been free text since 0001 for
-- exactly this reason, and an enum here would make adding the next provider a
-- migration rather than a deployment.
comment on column files.storage_provider is
  'Where the bytes live: supabase | s3 | google_drive. Read per file on every download, so providers can change without moving anything.';
comment on column files.storage_path is
  'Object key for supabase and s3. For google_drive, the Drive file id.';
