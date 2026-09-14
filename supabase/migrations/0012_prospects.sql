-- ===========================================================================
-- TDR Engineering — prospect lists and email suppression
--
-- A PROSPECT IS A CONTACT
--
-- There is no second contact table. A prospect is a row in `contacts` — the
-- same row that becomes a client when they accept a proposal, and the same
-- row the job, the invoice and the portal all point at. A parallel "marketing
-- contacts" table would mean two records for the same person, drifting apart
-- the first time somebody fixes a phone number in one of them.
--
-- A list is therefore MEMBERSHIP, not storage.
--
-- SUPPRESSION IS GLOBAL, AND IT OUTRANKS EVERY LIST
--
-- This is the one rule the whole thing rests on. When somebody says stop
-- emailing me, they mean stop — not "stop for this list". So suppression is
-- keyed on the EMAIL ADDRESS, in its own table, and every list membership is
-- read through it. Adding a suppressed address to a new list does not make it
-- mailable again, because nothing ever asks the list; it asks the view, and
-- the view checks suppression.
--
-- A per-list opt-out is how people get re-mailed after unsubscribing, and it
-- is the single most common way a small firm ends up with a CAN-SPAM problem.
--
-- AN UNSUBSCRIBE CANNOT BE UNDONE BY STAFF
--
-- Bounces and manually-entered suppressions can be lifted — a bounce may have
-- been a full mailbox, and a manual entry may have been a mistake. An
-- `unsubscribed` or `complained` record cannot be, by anybody, at any access
-- level. "The client asked to be removed and somebody put them back" is
-- exactly the sequence that creates liability, so the database refuses it
-- rather than trusting a screen not to offer the button.
--
-- Re-subscribing is still possible: the person opts in again through a form,
-- which is a new consent record, not an administrator overriding an old one.
--
-- NOT LEGAL ADVICE. This records the facts CAN-SPAM is generally understood to
-- require around opt-out. Whether TDR's actual sending practice complies is a
-- question for TDR's attorney.
-- ===========================================================================

-- --------------------------------------------------------- suppression ----
do $$ begin
  create type suppression_reason as enum (
    'unsubscribed',  -- they asked. Permanent.
    'complained',    -- marked it as spam. Permanent, and worse than an opt-out.
    'bounced',       -- the address does not accept mail. Liftable.
    'manual'         -- staff took them off by hand. Liftable.
  );
exception when duplicate_object then null; end $$;

create table if not exists email_suppressions (
  email          citext primary key,
  reason         suppression_reason not null,

  -- Where it came from: 'unsubscribe_link', 'import', 'staff', a provider name.
  source         text,
  notes          text,

  -- The date that matters if anybody ever asks when TDR stopped mailing them.
  suppressed_at  timestamptz not null default now(),
  suppressed_by  uuid references app_users (id) on delete set null
);

create index if not exists email_suppressions_reason_idx on email_suppressions (reason);

comment on table email_suppressions is
  'Global do-not-email list, keyed on address. Outranks every list membership. Rows with reason unsubscribed or complained cannot be deleted by anyone.';

-- The refusal, in the database rather than in a screen.
create or replace function protect_opt_outs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.reason in ('unsubscribed', 'complained') then
    raise exception
      'A person who unsubscribed or reported spam cannot be removed from the do-not-email list. They must opt in again themselves.'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;

drop trigger if exists email_suppressions_protect_delete on email_suppressions;
create trigger email_suppressions_protect_delete before delete on email_suppressions
  for each row execute function protect_opt_outs();

-- Changing an opt-out into something liftable would route around the delete
-- guard, so the same rule covers updates to `reason`.
create or replace function protect_opt_out_reason()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.reason in ('unsubscribed', 'complained')
     and new.reason not in ('unsubscribed', 'complained') then
    raise exception
      'An unsubscribe cannot be downgraded to a liftable suppression.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists email_suppressions_protect_update on email_suppressions;
create trigger email_suppressions_protect_update before update on email_suppressions
  for each row execute function protect_opt_out_reason();

-- Trigger functions need no grant — PostgreSQL checks EXECUTE when a trigger
-- is created, not when it fires (0005) — so they are revoked to keep them off
-- the REST API. Found by test: without this they are anon-executable, which is
-- harmless in itself but is exactly what the security advisor flags.
revoke all on function protect_opt_outs() from public, anon, authenticated;
revoke all on function protect_opt_out_reason() from public, anon, authenticated;

-- --------------------------------------------------------------- lists ----
create table if not exists marketing_lists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,

  -- What it is for, so nobody has to guess whether a list is a one-off trade
  -- show follow-up or a standing audience.
  purpose      text,

  created_by   uuid references app_users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,

  constraint marketing_lists_name_present check (btrim(name) <> '')
);

create unique index if not exists marketing_lists_name_key
  on marketing_lists (lower(btrim(name))) where archived_at is null;

drop trigger if exists marketing_lists_set_updated_at on marketing_lists;
create trigger marketing_lists_set_updated_at before update on marketing_lists
  for each row execute function set_updated_at();

-- ------------------------------------------------------------ members ----
-- Membership, not storage. The person lives in `contacts`.
create table if not exists marketing_list_members (
  list_id     uuid not null references marketing_lists (id) on delete cascade,
  contact_id  uuid not null references contacts (id) on delete cascade,

  -- How they got here: 'import', 'manual', 'proposal_request', 'inquiry'.
  source      text,
  notes       text,
  added_by    uuid references app_users (id) on delete set null,
  added_at    timestamptz not null default now(),

  primary key (list_id, contact_id)
);

create index if not exists marketing_list_members_contact_idx
  on marketing_list_members (contact_id);

-- ------------------------------------------------------------ imports ----
-- One row per spreadsheet loaded, so "where did this person come from" has an
-- answer a year later. Purchased and scraped lists are the usual cause of a
-- complaint, and knowing which batch they arrived in is how that gets traced.
create table if not exists marketing_imports (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid references marketing_lists (id) on delete set null,
  filename      text,

  rows_total    integer not null default 0,
  rows_added    integer not null default 0,  -- new contacts created
  rows_matched  integer not null default 0,  -- existing contacts reused
  rows_skipped  integer not null default 0,  -- no usable email, or duplicate
  rows_suppressed integer not null default 0, -- already on the do-not-email list

  notes         text,
  imported_by   uuid references app_users (id) on delete set null,
  imported_at   timestamptz not null default now()
);

create index if not exists marketing_imports_list_idx
  on marketing_imports (list_id, imported_at desc);

-- ============================================================== RLS =======
alter table email_suppressions     enable row level security;
alter table marketing_lists        enable row level security;
alter table marketing_list_members enable row level security;
alter table marketing_imports      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['marketing_lists', 'marketing_list_members', 'marketing_imports'] loop
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

-- Suppressions: staff may read, add and lift. The DELETE policy exists, but
-- the trigger above refuses opt-outs regardless of who is asking — a policy
-- says who may try, the trigger says what is permitted.
drop policy if exists email_suppressions_staff_read on email_suppressions;
create policy email_suppressions_staff_read on email_suppressions
  for select to authenticated using (is_staff());

drop policy if exists email_suppressions_staff_insert on email_suppressions;
create policy email_suppressions_staff_insert on email_suppressions
  for insert to authenticated with check (is_staff());

drop policy if exists email_suppressions_staff_update on email_suppressions;
create policy email_suppressions_staff_update on email_suppressions
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists email_suppressions_staff_delete on email_suppressions;
create policy email_suppressions_staff_delete on email_suppressions
  for delete to authenticated using (is_staff());

-- ===================================================== suppressing ========
-- Idempotent, and it KEEPS THE FIRST RECORD. The date TDR was first told to
-- stop is the one that matters; overwriting it with today's date every time
-- the address turns up again would destroy exactly the fact worth having.
--
-- The one exception is escalation: a bounce or a manual entry becomes a real
-- opt-out if the person later unsubscribes or complains, because that is
-- stronger and permanent.
--
-- TWO WRAPPERS, ONE BODY. The logic lives in an internal function that nobody
-- can call directly; the two entry points differ only in who may use them and
-- what they are allowed to say:
--
--   suppress_email()     staff, any reason          -> `authenticated`
--   record_unsubscribe() the public opt-out link    -> `service_role`
--
-- Found by Supabase's security advisor: a single function granted to
-- `authenticated` with a caller-supplied reason let ANY signed-in user — a
-- client portal login included — permanently suppress arbitrary addresses.
-- Because an opt-out cannot be deleted, that is an unrecoverable denial of
-- service on TDR's own marketing list. The staff wrapper now checks
-- `is_staff()` inside, and the public one cannot choose a reason at all.
create or replace function suppress_email_internal(
  p_email  text,
  p_reason suppression_reason,
  p_source text,
  p_notes  text,
  p_by     uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_existing suppression_reason;
begin
  if v_email is null or position('@' in v_email) = 0 then
    return false;
  end if;

  select reason into v_existing from email_suppressions where email = v_email;

  if v_existing is null then
    insert into email_suppressions (email, reason, source, notes, suppressed_by)
    values (v_email, p_reason, p_source, p_notes, p_by);
    return true;
  end if;

  -- Already suppressed. Escalate a liftable reason to a permanent one; leave
  -- the original date alone either way.
  if v_existing not in ('unsubscribed', 'complained')
     and p_reason in ('unsubscribed', 'complained') then
    update email_suppressions
       set reason = p_reason,
           source = coalesce(p_source, source),
           notes  = coalesce(p_notes, notes)
     where email = v_email;
  end if;

  return true;
end;
$$;

-- Nobody calls this directly. Both wrappers below are SECURITY DEFINER owned
-- by the same role, so they reach it without any grant existing at all.
revoke all on function suppress_email_internal(text, suppression_reason, text, text, uuid)
  from public, anon, authenticated, service_role;

-- Staff, from the admin. Gated inside as well as by the grant, so neither
-- alone is load-bearing (0005).
create or replace function suppress_email(
  p_email  text,
  p_reason suppression_reason default 'unsubscribed',
  p_source text default null,
  p_notes  text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;
  return suppress_email_internal(p_email, p_reason, p_source, p_notes, auth.uid());
end;
$$;

revoke all on function suppress_email(text, suppression_reason, text, text)
  from public, anon, service_role;
grant execute on function suppress_email(text, suppression_reason, text, text)
  to authenticated;

-- The public opt-out link. Takes an address and nothing else: it cannot be
-- used to record a bounce, a complaint, or a note, so the worst a caller can
-- do with it is the thing it is for.
--
-- No staff check, because the person clicking is not signed in as anybody.
-- The route that calls it has already verified the link's HMAC, and the grant
-- limits it to `service_role` — meaning TDR's own server code and nothing else.
create or replace function record_unsubscribe(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return suppress_email_internal(p_email, 'unsubscribed', 'unsubscribe_link', null, null);
end;
$$;

revoke all on function record_unsubscribe(text) from public, anon, authenticated;
grant execute on function record_unsubscribe(text) to service_role;

-- Reading suppression state. `service_role` only: the unsubscribe page uses it
-- to tell somebody they are already off the list, and staff read the table
-- directly through RLS. Exposing it to every signed-in user would let a client
-- probe whether any given address is on TDR's list.
create or replace function is_email_suppressed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from email_suppressions
     where email = nullif(btrim(lower(coalesce(p_email, ''))), '')::citext
  );
$$;

revoke all on function is_email_suppressed(text) from public, anon, authenticated;
grant execute on function is_email_suppressed(text) to service_role;

-- ============================================================ views =======
-- Every member of every list, with the one column that matters: whether this
-- person may actually be emailed. Nothing outside this view decides that.
create or replace view v_marketing_list_members as
select
  m.list_id,
  m.contact_id,
  m.source,
  m.added_at,
  c.first_name,
  c.last_name,
  btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as full_name,
  c.email,
  c.phone,
  c.title,
  c.is_professional,
  co.name                                as company_name,
  s.reason                               as suppression_reason,
  s.suppressed_at,
  c.archived_at is not null              as contact_archived,
  -- The whole point. A person is mailable only if they have an address, are
  -- not archived, and are not suppressed — and suppression is checked here so
  -- no caller can forget to.
  (c.email is not null
     and c.archived_at is null
     and s.email is null)                as sendable
from marketing_list_members m
join contacts c on c.id = m.contact_id
left join companies co on co.id = c.company_id
left join email_suppressions s on s.email = c.email;

alter view v_marketing_list_members set (security_invoker = on);
grant select on v_marketing_list_members to authenticated;

-- One row per list, with the counts somebody actually needs before sending.
create or replace view v_marketing_lists as
select
  l.id,
  l.name,
  l.description,
  l.purpose,
  l.created_at,
  l.updated_at,
  l.archived_at,
  coalesce(stats.total, 0)       as member_count,
  coalesce(stats.sendable, 0)    as sendable_count,
  coalesce(stats.suppressed, 0)  as suppressed_count,
  coalesce(stats.no_email, 0)    as no_email_count,
  (select max(imported_at) from marketing_imports i where i.list_id = l.id) as last_import_at
from marketing_lists l
left join (
  select
    list_id,
    count(*)                                             as total,
    count(*) filter (where sendable)                     as sendable,
    count(*) filter (where suppression_reason is not null) as suppressed,
    count(*) filter (where email is null)                as no_email
  from v_marketing_list_members
  group by list_id
) stats on stats.list_id = l.id;

alter view v_marketing_lists set (security_invoker = on);
grant select on v_marketing_lists to authenticated;

-- Everyone TDR has ever been told not to email, for the admin screen and for
-- reconciling against whatever actually sends the mail.
create or replace view v_email_suppressions as
select
  s.email,
  s.reason,
  s.source,
  s.notes,
  s.suppressed_at,
  btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as contact_name,
  co.name as company_name,
  s.reason in ('unsubscribed', 'complained') as permanent
from email_suppressions s
left join contacts c on c.email = s.email and c.archived_at is null
left join companies co on co.id = c.company_id;

alter view v_email_suppressions set (security_invoker = on);
grant select on v_email_suppressions to authenticated;
