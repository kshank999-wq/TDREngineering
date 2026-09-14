-- ===========================================================================
-- TDR Engineering — least privilege on the policy helper functions
--
-- Supabase's security advisor flagged two things after 0004:
--
--   1. is_staff(), is_admin(), current_app_role() and
--      log_opportunity_status_change() are SECURITY DEFINER — they bypass RLS
--      by design — and `anon` can call every one of them over the public REST
--      API at /rest/v1/rpc/<name>.
--
--   2. Four functions do not pin `search_path`.
--
-- Neither leaks today: is_staff() returns false for an anonymous caller and
-- current_app_role() returns null, because both resolve through auth.uid().
-- But they are SECURITY DEFINER functions on a public endpoint, which is
-- exactly the surface that should not be reachable without a session — and
-- they were missed in 0001 for the same reason client_impact was missed in
-- 0004: Supabase grants EXECUTE on new public functions to anon by default.
--
-- WHY THE RE-GRANT MATTERS MORE THAN THE REVOKE
--
-- Every staff RLS policy calls is_staff() while the query runs, so the
-- `authenticated` role must keep EXECUTE or the whole admin goes dark. And
-- `revoke ... from public` removes the privilege from every role at once,
-- since all of them inherit PUBLIC — revoking from `anon` alone would do
-- nothing. Hence: revoke from PUBLIC, then hand it back to exactly the role
-- that needs it.
--
-- service_role is deliberately left ALONE — neither revoked nor re-granted.
--
-- It does not need the privilege: verified against PostgreSQL 16 that with
-- EXECUTE revoked from service_role, the proposal intake still writes and the
-- status-history trigger still fires, because BYPASSRLS means policies are
-- never evaluated for it. But revoking buys almost nothing — service_role
-- already bypasses RLS on every table — while costing the intake path if this
-- environment's service_role differs from the real one in any way. Spec §9
-- says a proposal request must never be lost; that is not a bet worth taking
-- for a privilege that grants no additional reach.
-- ===========================================================================

-- ------------------------------------------------------- search_path -------
-- Pinned so a caller cannot change what these names resolve to.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function next_opportunity_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'TDR-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('opportunity_number_seq')::text, 5, '0');
$$;

create or replace function client_norm(value text)
returns text language sql immutable set search_path = public as $$
  select nullif(lower(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g'))), '');
$$;

create or replace function client_digits(value text)
returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(coalesce(value, ''), '\D', '', 'g'), '');
$$;

-- --------------------------------------------- policy helpers: privileges --
-- Revoke from PUBLIC first. Every role inherits PUBLIC, so revoking from anon
-- alone leaves the privilege in place through it.
revoke all on function is_staff()                     from public, anon;
revoke all on function is_admin()                     from public, anon;
revoke all on function current_app_role()             from public, anon;
revoke all on function log_opportunity_status_change() from public, anon;

-- Signed-in users need these: the staff RLS policies call is_staff() during
-- query evaluation, and the privilege is checked against the calling role.
grant execute on function is_staff()         to authenticated;
grant execute on function is_admin()         to authenticated;
grant execute on function current_app_role() to authenticated;

-- log_opportunity_status_change() is a trigger function and is never called
-- directly. PostgreSQL checks EXECUTE when the trigger is created, not when it
-- fires, so it needs no grant at all — the status-history audit trail keeps
-- working with the privilege revoked from everyone.
