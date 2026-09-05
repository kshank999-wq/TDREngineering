-- ===========================================================================
-- TDR Engineering — merging duplicate clients
--
-- The proposal form creates a contact and a company from whatever a stranger
-- types. It de-duplicates on an exact email match, which catches nothing when
-- the same architect fills the form twice without one. So the same person
-- arrives as "Dan Dan / DANS ARCH" and "Dan Dan / booboo", and the referral
-- history TDR wants to measure (spec §1) is split across two rows.
--
-- This adds:
--   * merge_contacts() / merge_companies() — one atomic operation that moves
--     every reference onto the surviving record and archives the other.
--   * merged_into_id — where an archived record went, so a merge can be
--     traced afterwards instead of looking like a deletion.
--   * v_duplicate_clients — candidate pairs, with the reason they matched.
--     Candidates only. A person decides; nothing merges automatically.
-- ===========================================================================

-- --------------------------------------------------------- provenance ------
alter table contacts
  add column if not exists merged_into_id uuid references contacts (id) on delete set null;
alter table companies
  add column if not exists merged_into_id uuid references companies (id) on delete set null;

comment on column contacts.merged_into_id is
  'Set when this record was merged into another. Archived, not deleted, so the merge stays auditable.';
comment on column companies.merged_into_id is
  'Set when this record was merged into another. Archived, not deleted, so the merge stays auditable.';

create index if not exists contacts_merged_into_idx  on contacts (merged_into_id);
create index if not exists companies_merged_into_idx on companies (merged_into_id);

-- ------------------------------------------------------- normalization -----
-- Shared by the duplicate view so "Dan  Dan" and "dan dan" compare equal.
create or replace function client_norm(value text)
returns text language sql immutable as $$
  select nullif(lower(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g'))), '');
$$;

-- Phone numbers are typed a dozen ways. Compare only the digits.
create or replace function client_digits(value text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(value, ''), '\D', '', 'g'), '');
$$;

-- ---------------------------------------------------------- impact ---------
-- What is attached to a record. Shown before a merge so the person confirming
-- knows what is about to move, and on a record before it is archived.
--
-- SECURITY DEFINER means this bypasses RLS, so it checks is_staff() itself.
-- The grants below are the other half of that; both are needed, because
-- Supabase grants execute on new public functions to anon by default and a
-- later migration can hand the privilege back without anyone noticing.
create or replace function client_impact(p_kind text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not is_staff() then null::jsonb
  when p_kind = 'contact' then
    jsonb_build_object(
      'opportunities', (select count(*) from opportunities where contact_id = p_id),
      'referrals',     (select count(*) from referrals where referring_contact_id = p_id),
      'shipments',     (select count(*) from shipments where contact_id = p_id),
      'inquiries',     (select count(*) from website_inquiries where contact_id = p_id),
      'people',        0)
  else
    jsonb_build_object(
      'opportunities', (select count(*) from opportunities where company_id = p_id),
      'referrals',     (select count(*) from referrals where referring_company_id = p_id),
      'shipments',     (select count(*) from shipments where company_id = p_id),
      'inquiries',     0,
      'people',        (select count(*) from contacts where company_id = p_id and archived_at is null))
  end;
$$;

-- ------------------------------------------------------ merge contacts -----
-- Atomic by construction: a function body is one transaction, so either every
-- reference moves and the loser is archived, or nothing changes at all. A
-- half-merged pair — references moved but both records still live — would be
-- worse than the duplicate it was meant to fix.
create or replace function merge_contacts(p_winner uuid, p_loser uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_winner contacts%rowtype;
  v_loser  contacts%rowtype;
  v_moved  jsonb;
begin
  if not is_staff() then
    raise exception 'Not authorized to merge client records';
  end if;
  if p_winner is null or p_loser is null then
    raise exception 'Both records are required';
  end if;
  if p_winner = p_loser then
    raise exception 'A record cannot be merged into itself';
  end if;

  -- Lock both rows for the duration so two people cannot merge the same pair
  -- in opposite directions at once.
  select * into v_winner from contacts where id = p_winner for update;
  if not found then raise exception 'The record being kept no longer exists'; end if;
  select * into v_loser  from contacts where id = p_loser  for update;
  if not found then raise exception 'The record being merged no longer exists'; end if;

  if v_winner.archived_at is not null then
    raise exception 'The record being kept is archived';
  end if;
  if v_loser.archived_at is not null then
    raise exception 'That record has already been merged or archived';
  end if;

  v_moved := client_impact('contact', p_loser);

  -- Archive the loser BEFORE copying its email onto the winner. The unique
  -- index on contacts (email) covers only non-archived rows, so doing this in
  -- the other order would collide with the row being merged away.
  update contacts
     set archived_at    = now(),
         merged_into_id = p_winner
   where id = p_loser;

  -- Fill only what the surviving record is missing. Whoever confirmed the
  -- merge chose this record; its own values win.
  update contacts w
     set email             = coalesce(w.email, v_loser.email),
         phone             = coalesce(w.phone, v_loser.phone),
         company_id        = coalesce(w.company_id, v_loser.company_id),
         title             = coalesce(w.title, v_loser.title),
         preferred_contact = coalesce(w.preferred_contact, v_loser.preferred_contact),
         address_line1     = coalesce(w.address_line1, v_loser.address_line1),
         address_line2     = coalesce(w.address_line2, v_loser.address_line2),
         city              = coalesce(w.city, v_loser.city),
         state             = coalesce(w.state, v_loser.state),
         postal_code       = coalesce(w.postal_code, v_loser.postal_code),
         -- A professional on either record is a professional after the merge.
         is_professional   = w.is_professional or v_loser.is_professional,
         -- Notes are never dropped. Losing what someone wrote down is not a
         -- merge, it is data loss.
         notes             = case
                               when v_loser.notes is null then w.notes
                               when w.notes is null then v_loser.notes
                               else w.notes || E'\n\n— merged from ' ||
                                    btrim(v_loser.first_name || ' ' || v_loser.last_name) ||
                                    E' —\n' || v_loser.notes
                             end
   where w.id = p_winner;

  update opportunities     set contact_id           = p_winner where contact_id           = p_loser;
  update referrals         set referring_contact_id = p_winner where referring_contact_id = p_loser;
  update shipments         set contact_id           = p_winner where contact_id           = p_loser;
  update website_inquiries set contact_id           = p_winner where contact_id           = p_loser;

  return v_moved;
end;
$$;

-- ----------------------------------------------------- merge companies -----
create or replace function merge_companies(p_winner uuid, p_loser uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_winner companies%rowtype;
  v_loser  companies%rowtype;
  v_moved  jsonb;
begin
  if not is_staff() then
    raise exception 'Not authorized to merge client records';
  end if;
  if p_winner is null or p_loser is null then
    raise exception 'Both records are required';
  end if;
  if p_winner = p_loser then
    raise exception 'A record cannot be merged into itself';
  end if;

  select * into v_winner from companies where id = p_winner for update;
  if not found then raise exception 'The record being kept no longer exists'; end if;
  select * into v_loser  from companies where id = p_loser  for update;
  if not found then raise exception 'The record being merged no longer exists'; end if;

  if v_winner.archived_at is not null then
    raise exception 'The record being kept is archived';
  end if;
  if v_loser.archived_at is not null then
    raise exception 'That record has already been merged or archived';
  end if;

  v_moved := client_impact('company', p_loser);

  -- Archived first, for the same reason as contacts: the unique index on the
  -- normalized company name covers only non-archived rows.
  update companies
     set archived_at    = now(),
         merged_into_id = p_winner
   where id = p_loser;

  update companies w
     set website       = coalesce(w.website, v_loser.website),
         phone         = coalesce(w.phone, v_loser.phone),
         email         = coalesce(w.email, v_loser.email),
         address_line1 = coalesce(w.address_line1, v_loser.address_line1),
         address_line2 = coalesce(w.address_line2, v_loser.address_line2),
         city          = coalesce(w.city, v_loser.city),
         state         = coalesce(w.state, v_loser.state),
         postal_code   = coalesce(w.postal_code, v_loser.postal_code),
         -- 'other' is the intake default, so a real type on either record beats it.
         company_type  = case
                           when w.company_type = 'other' then v_loser.company_type
                           else w.company_type
                         end,
         notes         = case
                           when v_loser.notes is null then w.notes
                           when w.notes is null then v_loser.notes
                           else w.notes || E'\n\n— merged from ' || v_loser.name ||
                                E' —\n' || v_loser.notes
                         end
   where w.id = p_winner;

  update contacts      set company_id           = p_winner where company_id           = p_loser;
  update opportunities set company_id           = p_winner where company_id           = p_loser;
  update referrals     set referring_company_id = p_winner where referring_company_id = p_loser;
  update shipments     set company_id           = p_winner where company_id           = p_loser;

  return v_moved;
end;
$$;

-- Least privilege. `public` is revoked first because every role inherits it,
-- so revoking only from anon leaves the privilege in place through PUBLIC.
revoke all on function merge_contacts(uuid, uuid)  from public, anon;
revoke all on function merge_companies(uuid, uuid) from public, anon;
revoke all on function client_impact(text, uuid)   from public, anon;
grant execute on function merge_contacts(uuid, uuid)  to authenticated;
grant execute on function merge_companies(uuid, uuid) to authenticated;
grant execute on function client_impact(text, uuid)   to authenticated;

-- ------------------------------------------------- duplicate candidates ----
-- Candidate pairs, strongest signal first. These are suggestions: a shared
-- surname is not proof, and two people really can share a phone number at the
-- same firm. Nothing here merges anything.
--
-- The comparison is a self-join, so cost grows with the square of the client
-- count. Fine into the low thousands, which is well past where TDR is.
create or replace view v_duplicate_clients as
select
  'contact'::text                                              as kind,
  a.id                                                         as a_id,
  btrim(a.first_name || ' ' || a.last_name)                    as a_name,
  concat_ws(' · ', ca.name, a.email::text, a.phone)            as a_detail,
  a.created_at                                                 as a_created_at,
  b.id                                                         as b_id,
  btrim(b.first_name || ' ' || b.last_name)                    as b_name,
  concat_ws(' · ', cb.name, b.email::text, b.phone)            as b_detail,
  b.created_at                                                 as b_created_at,
  case
    when a.email is not null and a.email = b.email                       then 'Same email address'
    when client_digits(a.phone) = client_digits(b.phone)                 then 'Same phone number'
    when client_norm(a.first_name || ' ' || a.last_name)
       = client_norm(b.first_name || ' ' || b.last_name)                 then 'Same name'
    else 'Similar name'
  end                                                          as reason,
  case
    when a.email is not null and a.email = b.email                       then 3
    when client_digits(a.phone) = client_digits(b.phone)                 then 2
    when client_norm(a.first_name || ' ' || a.last_name)
       = client_norm(b.first_name || ' ' || b.last_name)                 then 2
    else 1
  end                                                          as score
from contacts a
join contacts b
  on a.id < b.id
 and a.archived_at is null
 and b.archived_at is null
left join companies ca on ca.id = a.company_id
left join companies cb on cb.id = b.company_id
where (a.email is not null and a.email = b.email)
   or (client_digits(a.phone) is not null
       and client_digits(a.phone) = client_digits(b.phone))
   or (client_norm(a.first_name || ' ' || a.last_name)
       = client_norm(b.first_name || ' ' || b.last_name))
   or similarity(a.first_name || ' ' || a.last_name,
                 b.first_name || ' ' || b.last_name) > 0.6

union all

select
  'company'::text,
  a.id,
  a.name,
  concat_ws(' · ', a.email::text, a.phone, a.city),
  a.created_at,
  b.id,
  b.name,
  concat_ws(' · ', b.email::text, b.phone, b.city),
  b.created_at,
  case
    when a.email is not null and a.email = b.email        then 'Same email address'
    when client_digits(a.phone) = client_digits(b.phone)  then 'Same phone number'
    when client_norm(a.name) = client_norm(b.name)        then 'Same name'
    else 'Similar name'
  end,
  case
    when a.email is not null and a.email = b.email        then 3
    when client_digits(a.phone) = client_digits(b.phone)  then 2
    when client_norm(a.name) = client_norm(b.name)        then 2
    else 1
  end
from companies a
join companies b
  on a.id < b.id
 and a.archived_at is null
 and b.archived_at is null
where (a.email is not null and a.email = b.email)
   or (client_digits(a.phone) is not null
       and client_digits(a.phone) = client_digits(b.phone))
   or (client_norm(a.name) = client_norm(b.name))
   or similarity(a.name, b.name) > 0.6;

alter view v_duplicate_clients set (security_invoker = on);

-- The directory must not offer records that have been merged away.
create or replace view v_client_directory as
select
  'contact'::text                                as kind,
  c.id                                           as id,
  (c.first_name || ' ' || c.last_name)           as name,
  co.name                                        as company_name,
  c.email::text                                  as email,
  c.phone                                        as phone,
  c.is_professional                              as is_professional,
  (c.address_line1 is not null and c.city is not null) as has_mailing_address,
  c.created_at                                   as created_at,
  concat_ws(' ', c.first_name, c.last_name, c.email, c.phone, co.name,
                 c.address_line1, c.city, c.postal_code) as search_text
from contacts c
left join companies co on co.id = c.company_id
where c.archived_at is null

union all

select
  'company'::text,
  co.id,
  co.name,
  null,
  co.email::text,
  co.phone,
  true,
  (co.address_line1 is not null and co.city is not null),
  co.created_at,
  concat_ws(' ', co.name, co.email, co.phone,
                 co.address_line1, co.city, co.postal_code)
from companies co
where co.archived_at is null;

alter view v_client_directory set (security_invoker = on);
