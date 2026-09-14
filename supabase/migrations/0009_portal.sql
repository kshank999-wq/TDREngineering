-- ===========================================================================
-- TDR Engineering — client portal access
--
-- The first time somebody outside the office gets a login. One mistake here
-- means client A downloads client B's survey, so the design is deliberately
-- narrow.
--
-- CLIENTS GET NO ACCESS TO ANY BASE TABLE
--
-- The obvious approach — add a client SELECT policy to `jobs` — is wrong. RLS
-- filters rows, not columns, so a client who could read their own job row
-- could also read `jobs.notes`, which is where TDR's internal working notes
-- live. Same for `invoices.notes` and every other internal column.
--
-- So there are no client policies on jobs, files, invoices or payments at all.
-- A client reading those tables directly gets nothing, because nothing grants
-- it. What they can read is three purpose-built views that select only the
-- columns a client should ever see.
--
-- Those views are SECURITY DEFINER — they run as the owner and bypass RLS —
-- which means THE VIEW'S OWN WHERE CLAUSE IS THE SECURITY BOUNDARY. Every one
-- of them filters through `client_can_see_job()`. Nothing else does.
--
-- WHAT A CLIENT CAN SEE
--
--   * Jobs where they are the named contact.
--   * Jobs belonging to their company, but ONLY if `company_access` is set on
--     their grant — off by default. An architect at a firm often should see
--     everything the firm has commissioned, but that is a decision somebody
--     makes per person, not an assumption.
--   * Files on those jobs where `client_visible` is true. That column has
--     existed and defaulted to false since 0007, so no file becomes visible
--     today that was not already deliberately shared.
--   * Invoices on those jobs that are not drafts, and payments against them.
--
-- Revoking is immediate: `is_active` is checked on every query, so switching
-- it off cuts a client's access on their next click.
-- ===========================================================================

-- ------------------------------------------------------------- access -----
create table if not exists client_portal_access (
  user_id        uuid primary key references app_users (id) on delete cascade,
  contact_id     uuid not null references contacts (id) on delete cascade,

  -- Off by default. See above: seeing the whole firm's work is a decision.
  company_access boolean not null default false,

  is_active      boolean not null default true,
  invited_by     uuid references app_users (id) on delete set null,
  invited_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  notes          text
);

create index if not exists client_portal_access_contact_idx
  on client_portal_access (contact_id);

alter table client_portal_access enable row level security;

-- Staff manage grants. A client may read their own row and nothing else —
-- that is what lets the portal greet them by name.
drop policy if exists client_portal_access_staff_all on client_portal_access;
create policy client_portal_access_staff_all on client_portal_access
  for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists client_portal_access_self_read on client_portal_access;
create policy client_portal_access_self_read on client_portal_access
  for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------ the gate ----
-- Every portal view funnels through this one predicate. If it is wrong,
-- everything is wrong — which is exactly why there is only one of it.
create or replace function client_can_see_job(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from client_portal_access a
      join jobs j on j.id = p_job
      left join contacts c on c.id = a.contact_id
     where a.user_id = auth.uid()
       and a.is_active
       and j.archived_at is null
       and (
         -- Named contact on the job.
         j.contact_id = a.contact_id
         -- Or the firm's work, when that was granted explicitly.
         or (a.company_access
             and j.company_id is not null
             and j.company_id = c.company_id)
       )
  );
$$;

-- The signed-in client's own contact row, for greeting them and for the
-- portal to know whether this session is a client at all.
create or replace function current_client_contact()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select contact_id from client_portal_access
   where user_id = auth.uid() and is_active;
$$;

-- SECURITY DEFINER functions do not belong on the public REST API (0005).
revoke all on function client_can_see_job(uuid)  from public, anon;
revoke all on function current_client_contact()  from public, anon;
grant execute on function client_can_see_job(uuid) to authenticated;
grant execute on function current_client_contact() to authenticated;

-- ======================================================= portal views ======
-- SECURITY DEFINER (no `security_invoker`), so these bypass RLS and their own
-- WHERE clause is the boundary. Columns are chosen, not inherited: nothing
-- internal is selected, so nothing internal can leak.

-- What the client sees of a job. Note what is absent: notes, contract_amount,
-- assigned_to, purchase_order, created_by.
create or replace view v_portal_jobs as
select
  j.id,
  j.job_number,
  j.name,
  j.status,
  j.scheduled_start,
  j.field_complete,
  j.delivered_at,
  j.created_at,
  co.name          as company_name,
  p.address_line1  as property_address,
  p.city           as property_city,
  p.state          as property_state
from jobs j
left join companies  co on co.id = j.company_id
left join properties p  on p.id  = j.property_id
where j.archived_at is null
  and client_can_see_job(j.id);

-- Only files deliberately shared, on jobs the client can see. Storage paths
-- are included because the portal needs them to mint a download link, and a
-- path is useless without a signed URL.
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
  f.storage_path
from files f
where f.archived_at is null
  and f.client_visible
  and f.job_id is not null
  and client_can_see_job(f.job_id);

-- Non-draft invoices only: a draft is not a document anyone should be shown.
-- `notes` is TDR's internal note and is not selected.
create or replace view v_portal_invoices as
select
  i.id,
  i.invoice_number,
  i.job_id,
  i.issue_date,
  i.due_date,
  i.terms,
  i.po_number,
  i.subtotal,
  i.tax_amount,
  i.total,
  i.currency,
  i.status,
  coalesce(p.amount_paid, 0)            as amount_paid,
  i.total - coalesce(p.amount_paid, 0)  as balance,
  case
    when i.status = 'void'                                      then 'void'
    when coalesce(p.amount_paid, 0) >= i.total and i.total > 0  then 'paid'
    when coalesce(p.amount_paid, 0) > 0                         then 'partial'
    when i.due_date is not null and i.due_date < current_date   then 'overdue'
    else 'sent'
  end                                    as state
from invoices i
left join (
  select invoice_id, sum(amount) as amount_paid
    from payments where archived_at is null group by invoice_id
) p on p.invoice_id = i.id
where i.archived_at is null
  and i.status <> 'draft'
  and i.job_id is not null
  and client_can_see_job(i.job_id);

-- Payments against invoices the client can see. Internal notes excluded.
create or replace view v_portal_payments as
select
  pay.id,
  pay.invoice_id,
  pay.amount,
  pay.received_on,
  pay.method,
  pay.reference
from payments pay
join invoices i on i.id = pay.invoice_id
where pay.archived_at is null
  and i.archived_at is null
  and i.status <> 'draft'
  and i.job_id is not null
  and client_can_see_job(i.job_id);

-- No anon. A portal view bypasses RLS, so an anonymous grant would be a
-- public read of every job in the database.
revoke all on v_portal_jobs, v_portal_files, v_portal_invoices, v_portal_payments
  from public, anon;
grant select on v_portal_jobs, v_portal_files, v_portal_invoices, v_portal_payments
  to authenticated;

-- ------------------------------------------------- staff-facing listing ----
-- Who has portal access, for the staff screen that grants and revokes it.
create or replace view v_client_portal_users as
select
  a.user_id,
  a.contact_id,
  a.company_access,
  a.is_active,
  a.invited_at,
  a.last_seen_at,
  u.email,
  u.full_name,
  btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as contact_name,
  co.name as company_name
from client_portal_access a
join app_users u on u.id = a.user_id
join contacts  c on c.id = a.contact_id
left join companies co on co.id = c.company_id;

alter view v_client_portal_users set (security_invoker = on);
grant select on v_client_portal_users to authenticated;
