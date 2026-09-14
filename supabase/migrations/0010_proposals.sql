-- ===========================================================================
-- TDR Engineering — proposal documents and electronic signature
--
-- A REQUEST IS NOT A PROPOSAL
--
-- `opportunities` records what a client ASKED FOR — the form they filled in,
-- the services they ticked, the description they typed. `proposals` records
-- what TDR OFFERED: scope, exclusions, fee, terms, validity. They are
-- different documents with different authors, and until now only the first
-- existed. There was nothing to sign.
--
-- One opportunity can have several proposals over time (revised fee, reduced
-- scope), and a proposal can exist with no opportunity at all, because work
-- arrives by phone. So the link is nullable in both directions, exactly as it
-- is between opportunities and jobs.
--
-- WHAT MAKES A SIGNATURE MEAN ANYTHING
--
-- ESIGN and UETA turn on a handful of facts, and this schema records each one
-- as a fact rather than assuming it:
--
--   * INTENT — the signer meant to sign. A checkbox, stored, and CHECKed to be
--     true. A row where it is false is not a signature and the database will
--     not hold one.
--   * CONSENT to transact electronically — a second, separate checkbox, stored
--     with the exact disclosure text that was on screen. Consent to a sentence
--     nobody kept a copy of is not evidence of anything.
--   * ATTRIBUTION — typed name, email, the address the link was sent to, the
--     IP and user agent it came back from.
--   * INTEGRITY — `document_hash`. The signature names the exact bytes that
--     were presented. If the proposal is edited afterwards, the hashes no
--     longer match and that is visible rather than silent.
--   * RETENTION — `snapshot`, frozen at send. What the client saw is kept
--     verbatim, not reconstructed later from rows that have since moved.
--
-- A SENT PROPOSAL IS FROZEN
--
-- Editing a proposal after it has gone out would rewrite the thing somebody
-- is being asked to agree to, and a signature on a moving document is worth
-- nothing. So sending stamps the snapshot and the hash, and the triggers below
-- refuse any change to the terms of a sent proposal. Revising means withdrawing
-- and issuing a new one, which is also how it works on paper.
--
-- EXPIRY IS DERIVED, NOT STORED
--
-- `status` holds intent — draft, sent, accepted, declined, withdrawn. Whether
-- a proposal has run past `valid_until` is computed in `v_proposal_board`,
-- the same way "paid" is computed from payments rather than stored (0008). A
-- stored expiry flag needs a scheduled job to maintain it and is wrong for
-- however long that job is late.
--
-- THE CLIENT HAS NO LOGIN, SO THE LINK IS THE CREDENTIAL
--
-- Nobody creates an account to accept a proposal. The signing page is public
-- and reached by an unguessable token — which makes that token a credential,
-- and it is treated like one: 32 random bytes, and only its SHA-256 lands in
-- the database. The raw token exists in the link and nowhere else, so a copy
-- of this database does not let anyone sign anything.
--
-- `anon` gets NO grant on any of these tables, exactly as in 0009. The public
-- page reads through the service role in a server route, after that route has
-- verified the token itself. Nothing is reachable by guessing a URL shape.
-- ===========================================================================

-- ---------------------------------------------------------- statuses ------
do $$ begin
  create type proposal_status as enum (
    'draft',      -- being written, never reachable by a client
    'sent',       -- out for signature
    'accepted',   -- signed
    'declined',   -- the client said no, on the record
    'withdrawn'   -- TDR pulled it, usually to replace it with a revision
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------- numbers ------
create sequence if not exists proposal_number_seq start 1;

create or replace function next_proposal_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'P-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('proposal_number_seq')::text, 4, '0');
$$;

-- --------------------------------------------------------- proposals ------
create table if not exists proposals (
  id                uuid primary key default gen_random_uuid(),
  proposal_number   text not null unique default next_proposal_number(),

  opportunity_id    uuid references opportunities (id) on delete set null,

  -- Who it was addressed to, held on the proposal itself. A signed proposal
  -- must keep saying who agreed to it even if that contact is later merged
  -- into another record or re-parented to a different firm.
  contact_id        uuid references contacts (id) on delete set null,
  company_id        uuid references companies (id) on delete set null,
  property_id       uuid references properties (id) on delete set null,

  title             text not null,

  -- Surveyors get argued with about exclusions more than about scope, so it
  -- is its own field rather than a paragraph somebody may forget to add.
  scope             text,
  exclusions        text,
  terms             text,

  status            proposal_status not null default 'draft',
  valid_until       date,

  -- Derived from the lines by trigger, never typed. Same rule as invoices.
  subtotal          numeric(12,2) not null default 0,
  tax_rate          numeric(6,4)  not null default 0,
  tax_amount        numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  currency          text not null default 'USD',

  -- TDR's own proposal PDF, when there is one. Optional: a proposal written
  -- in the fields above is a complete proposal with no attachment at all.
  document_file_id  uuid references files (id) on delete set null,

  -- Frozen at send. `snapshot` is what the client was shown; `content_hash`
  -- is the SHA-256 of it, and is what a signature names.
  snapshot          jsonb,
  content_hash      text,

  sent_at           timestamptz,
  accepted_at       timestamptz,
  declined_at       timestamptz,
  withdrawn_at      timestamptz,
  decline_reason    text,

  -- Internal. Never selected by anything a client can reach.
  notes             text,

  created_by        uuid references app_users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,

  constraint proposals_tax_rate_sane check (tax_rate >= 0 and tax_rate < 1)
);

create index if not exists proposals_opportunity_idx on proposals (opportunity_id);
create index if not exists proposals_contact_idx     on proposals (contact_id);
create index if not exists proposals_company_idx     on proposals (company_id);
create index if not exists proposals_status_idx      on proposals (status) where archived_at is null;
create index if not exists proposals_number_trgm     on proposals using gin (proposal_number gin_trgm_ops);

drop trigger if exists proposals_set_updated_at on proposals;
create trigger proposals_set_updated_at before update on proposals
  for each row execute function set_updated_at();

-- ---------------------------------------------------- proposal lines ------
create table if not exists proposal_lines (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals (id) on delete cascade,
  service_id  uuid references services (id) on delete set null,
  description text not null,
  quantity    numeric(12,3) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  amount      numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists proposal_lines_proposal_idx
  on proposal_lines (proposal_id, sort_order);

create or replace function recalculate_proposal_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal uuid := coalesce(new.proposal_id, old.proposal_id);
  v_subtotal numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_subtotal
    from proposal_lines where proposal_id = v_proposal;

  update proposals
     set subtotal   = v_subtotal,
         tax_amount = round(v_subtotal * tax_rate, 2),
         total      = v_subtotal + round(v_subtotal * tax_rate, 2)
   where id = v_proposal;

  return null;
end;
$$;

-- A trigger function has no business on the REST API, and this one is
-- SECURITY DEFINER, so `authenticated` is revoked too — Supabase's own
-- security advisor flags exactly this. PostgreSQL checks EXECUTE when a
-- trigger is CREATED, not when it fires (0005), so the trigger keeps working:
-- verified as the `authenticated` role with the privilege revoked, inserting
-- a line and watching the totals still derive.
revoke all on function recalculate_proposal_totals() from public, anon, authenticated;

drop trigger if exists proposal_lines_recalculate on proposal_lines;
create trigger proposal_lines_recalculate
  after insert or update or delete on proposal_lines
  for each row execute function recalculate_proposal_totals();

create or replace function apply_proposal_tax()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tax_amount := round(new.subtotal * new.tax_rate, 2);
  new.total      := new.subtotal + new.tax_amount;
  return new;
end;
$$;

drop trigger if exists proposals_apply_tax on proposals;
create trigger proposals_apply_tax before insert or update on proposals
  for each row execute function apply_proposal_tax();

-- ------------------------------------------------- the freeze, enforced ---
-- A sent proposal's terms cannot change. This is the whole basis of the
-- signature meaning anything, so it is a database rule rather than a
-- convention the application is trusted to keep.
--
-- View counts, internal notes and the signature stamps still move — it is the
-- substance that is frozen: what is being offered, for how much, until when,
-- and which document.
create or replace function freeze_sent_proposal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- ---------------------------------------------------------------------
  -- Status may only move forwards.
  --
  -- Found by test: without this, an accepted proposal could be set back to
  -- 'sent', and `decline_proposal` would then happily overwrite a SIGNED
  -- proposal as declined. The signature row survived, but the proposal it
  -- belonged to no longer said it had been accepted — which is precisely the
  -- kind of disagreement that makes a record worthless as evidence.
  --
  -- Accepted, declined and withdrawn are therefore terminal. Revising means
  -- issuing a new proposal, which is also how it works on paper.
  -- ---------------------------------------------------------------------
  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft' and new.status in ('sent', 'withdrawn'))
      or (old.status = 'sent'  and new.status in ('accepted', 'declined', 'withdrawn'))
    ) then
      raise exception
        'Proposal % cannot go from % to %. Accepted, declined and withdrawn are final.',
        old.proposal_number, old.status, new.status
        using errcode = 'check_violation';
    end if;

    -- Second half of the same guarantee, so neither alone is load-bearing: a
    -- proposal that has been signed is pinned to 'accepted', whatever its
    -- status column may have been left saying by a repair or an older row.
    --
    -- `new.status <> 'accepted'` matters. Acceptance writes the signature and
    -- THEN flips the status, so a blanket "signed rows cannot change status"
    -- rejects the one transition that is supposed to happen. Found by test:
    -- it made every real signature fail.
    if new.status <> 'accepted'
       and exists (select 1 from proposal_signatures s where s.proposal_id = old.id) then
      raise exception
        'Proposal % has been signed and can only be accepted.', old.proposal_number
        using errcode = 'check_violation';
    end if;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if new.title            is distinct from old.title
     or new.scope         is distinct from old.scope
     or new.exclusions    is distinct from old.exclusions
     or new.terms         is distinct from old.terms
     or new.subtotal      is distinct from old.subtotal
     or new.tax_rate      is distinct from old.tax_rate
     or new.total         is distinct from old.total
     or new.currency      is distinct from old.currency
     or new.valid_until   is distinct from old.valid_until
     or new.document_file_id is distinct from old.document_file_id
     or new.snapshot      is distinct from old.snapshot
     or new.content_hash  is distinct from old.content_hash
  then
    raise exception
      'Proposal % has already been sent and cannot be changed. Withdraw it and issue a revision.',
      old.proposal_number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists proposals_freeze on proposals;
create trigger proposals_freeze before update on proposals
  for each row execute function freeze_sent_proposal();

-- The lines are part of the substance, so they freeze with it.
create or replace function freeze_sent_proposal_lines()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_proposal uuid := coalesce(new.proposal_id, old.proposal_id);
  v_status   proposal_status;
  v_number   text;
begin
  select status, proposal_number into v_status, v_number
    from proposals where id = v_proposal;

  if v_status is not null and v_status <> 'draft' then
    raise exception
      'Proposal % has already been sent and its line items cannot be changed.', v_number
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists proposal_lines_freeze on proposal_lines;
create trigger proposal_lines_freeze before insert or update or delete on proposal_lines
  for each row execute function freeze_sent_proposal_lines();

-- ================================================== access tokens =========
-- The link IS the credential, so only a hash of it is stored. 32 random bytes
-- are generated in the application, put in the URL, and never written down
-- here — a copy of this database lets nobody sign anything.
create table if not exists proposal_access_tokens (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references proposals (id) on delete cascade,

  -- SHA-256 of the raw token, hex. Unique so a lookup is one indexed equality
  -- rather than a scan, and so a collision is impossible rather than unlikely.
  token_hash       text not null unique,

  -- The address the link was sent to. Part of attribution: it is the
  -- difference between "somebody typed this name" and "the person we emailed
  -- at this address typed this name".
  sent_to          citext,

  expires_at       timestamptz,
  revoked_at       timestamptz,

  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  view_count       integer not null default 0,

  created_by       uuid references app_users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists proposal_access_tokens_proposal_idx
  on proposal_access_tokens (proposal_id, created_at desc);

-- ==================================================== signatures ==========
create table if not exists proposal_signatures (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         uuid not null references proposals (id) on delete cascade,
  token_id            uuid references proposal_access_tokens (id) on delete set null,

  typed_name          text not null,
  signer_email        citext,
  signer_title        text,

  -- Both CHECKed true. A row recording that somebody did not intend to sign,
  -- or did not consent to sign electronically, is not a signature, and the
  -- database will not store one dressed up as one.
  intent_acknowledged boolean not null,
  esign_consented     boolean not null,

  -- The exact disclosure shown on screen, kept verbatim. Consent to wording
  -- nobody retained is not evidence.
  consent_text        text not null,

  -- Ties this signature to the exact document that was on screen.
  document_hash       text not null,

  signed_at           timestamptz not null default now(),
  ip_address          inet,
  user_agent          text,

  constraint proposal_signatures_intent   check (intent_acknowledged),
  constraint proposal_signatures_consent  check (esign_consented),
  constraint proposal_signatures_name     check (btrim(typed_name) <> '')
);

-- One signature per proposal. A second acceptance is a defect, not a feature,
-- and this is the backstop for the race that the application cannot see.
create unique index if not exists proposal_signatures_one_per_proposal
  on proposal_signatures (proposal_id);

-- ======================================================== audit trail =====
-- Every touch, in order. This is the evidence that supports the signature:
-- when it went out, to whom, when it was opened, from where, and what was
-- clicked. Append-only by policy — staff may read and insert, never update.
create table if not exists proposal_events (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references proposals (id) on delete cascade,
  token_id      uuid references proposal_access_tokens (id) on delete set null,

  -- 'created' | 'sent' | 'link_issued' | 'viewed' | 'downloaded'
  -- | 'accepted' | 'declined' | 'withdrawn' | 'link_revoked'
  kind          text not null,
  detail        text,

  -- Set when staff did it; null when the client did.
  actor_user_id uuid references app_users (id) on delete set null,
  ip_address    inet,
  user_agent    text,
  occurred_at   timestamptz not null default now()
);

create index if not exists proposal_events_proposal_idx
  on proposal_events (proposal_id, occurred_at desc);

-- ============================================================= RLS ========
alter table proposals              enable row level security;
alter table proposal_lines         enable row level security;
alter table proposal_access_tokens enable row level security;
alter table proposal_signatures    enable row level security;
alter table proposal_events        enable row level security;

-- Staff manage proposals, lines and tokens outright.
do $$
declare t text;
begin
  foreach t in array array['proposals', 'proposal_lines', 'proposal_access_tokens'] loop
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

-- Signatures and the audit trail are READ-ONLY to everyone who is signed in,
-- including owners. There is no legitimate reason for a person to edit a
-- signature or rewrite the trail that supports it, and the value of both is
-- precisely that nobody can. They are written by the acceptance function
-- below, which runs as the owner.
drop policy if exists proposal_signatures_staff_read on proposal_signatures;
create policy proposal_signatures_staff_read on proposal_signatures
  for select to authenticated using (is_staff());

drop policy if exists proposal_events_staff_read on proposal_events;
create policy proposal_events_staff_read on proposal_events
  for select to authenticated using (is_staff());

-- Staff may add a note to the trail ("posted a hard copy"), but nothing may
-- amend what is already there.
drop policy if exists proposal_events_staff_insert on proposal_events;
create policy proposal_events_staff_insert on proposal_events
  for insert to authenticated with check (is_staff());

-- ============================================ the public signing path =====
-- Everything below runs for a client who is not signed in as anybody. It is
-- reached only through a server route holding the service role, and only
-- after that route has hashed the token out of the URL. These functions take
-- the HASH, never the token: the secret does not travel to the database, so
-- it cannot appear in a query log.
--
-- All of them are SECURITY DEFINER and revoked from public and anon (0005).

-- What the client is shown. Columns are chosen, not inherited — `notes`,
-- `created_by` and the internal ids are absent, so nothing internal can leak
-- through a careless `select *` in a route written later.
create or replace function proposal_for_signing(p_token_hash text)
returns table (
  token_id         uuid,
  proposal_id      uuid,
  proposal_number  text,
  title            text,
  scope            text,
  exclusions       text,
  terms            text,
  status           proposal_status,
  valid_until      date,
  subtotal         numeric,
  tax_rate         numeric,
  tax_amount       numeric,
  total            numeric,
  currency         text,
  content_hash     text,
  sent_at          timestamptz,
  accepted_at      timestamptz,
  declined_at      timestamptz,
  company_name     text,
  contact_name     text,
  property_address text,
  document_file_id uuid,
  is_expired       boolean,
  lines            jsonb,
  signed_name      text,
  signed_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    p.id,
    p.proposal_number,
    p.title,
    p.scope,
    p.exclusions,
    p.terms,
    p.status,
    p.valid_until,
    p.subtotal,
    p.tax_rate,
    p.tax_amount,
    p.total,
    p.currency,
    p.content_hash,
    p.sent_at,
    p.accepted_at,
    p.declined_at,
    co.name,
    btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    concat_ws(', ', pr.address_line1, pr.city, pr.state),
    p.document_file_id,
    (p.valid_until is not null and p.valid_until < current_date),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'description', l.description,
                'quantity',    l.quantity,
                'unit_price',  l.unit_price,
                'amount',      l.amount)
              order by l.sort_order, l.created_at)
         from proposal_lines l where l.proposal_id = p.id),
      '[]'::jsonb),
    s.typed_name,
    s.signed_at
  from proposal_access_tokens t
  join proposals p on p.id = t.proposal_id
  left join companies  co on co.id = p.company_id
  left join contacts   c  on c.id  = p.contact_id
  left join properties pr on pr.id = p.property_id
  left join proposal_signatures s on s.proposal_id = p.id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now())
    and p.archived_at is null
    -- A draft is never reachable. Neither is a withdrawn proposal: pulling it
    -- back has to actually pull it back.
    and p.status in ('sent', 'accepted', 'declined');
$$;

-- Opening the link is itself evidence, so it is recorded. Separate from the
-- read above because reads happen on every render and this must stay cheap
-- and idempotent-ish rather than growing a row per refresh.
create or replace function record_proposal_view(
  p_token_hash text,
  p_ip         text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   uuid;
  v_prop    uuid;
  v_first   timestamptz;
begin
  select id, proposal_id, first_viewed_at into v_token, v_prop, v_first
    from proposal_access_tokens
   where token_hash = p_token_hash
     and revoked_at is null
     and (expires_at is null or expires_at > now());

  if v_token is null then return; end if;

  update proposal_access_tokens
     set first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at  = now(),
         view_count      = view_count + 1
   where id = v_token;

  -- One event for the first open, which is the one that matters evidentially.
  -- Every refresh afterwards is counted on the token rather than filling the
  -- trail with noise that makes the real entries harder to find.
  if v_first is null then
    insert into proposal_events (proposal_id, token_id, kind, ip_address, user_agent)
    values (v_prop, v_token, 'viewed', nullif(p_ip,'')::inet, p_user_agent);
  end if;
end;
$$;

-- Acceptance. One transaction: verify, sign, flip, record. Either all of it
-- happens or none of it does, so there is no state where a client has signed
-- and the proposal does not say so.
create or replace function accept_proposal(
  p_token_hash  text,
  p_typed_name  text,
  p_email       text,
  p_title       text,
  p_consent_text text,
  p_ip          text default null,
  p_user_agent  text default null
)
returns table (ok boolean, message text, proposal_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_prop  uuid;
  v_num   text;
  v_status proposal_status;
  v_valid date;
  v_hash  text;
  v_opp   uuid;
begin
  if btrim(coalesce(p_typed_name, '')) = '' then
    return query select false, 'Please type your full name to sign.', null::text;
    return;
  end if;
  if btrim(coalesce(p_consent_text, '')) = '' then
    return query select false, 'Consent text missing.', null::text;
    return;
  end if;

  -- FOR UPDATE: two clicks arriving together must not both pass the status
  -- check. The unique index would catch it anyway; this makes the second one
  -- a clean message instead of a constraint error.
  select t.id, p.id, p.proposal_number, p.status, p.valid_until, p.content_hash, p.opportunity_id
    into v_token, v_prop, v_num, v_status, v_valid, v_hash, v_opp
    from proposal_access_tokens t
    join proposals p on p.id = t.proposal_id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now())
     and p.archived_at is null
     for update of p;

  if v_prop is null then
    return query select false, 'This link is no longer valid.', null::text;
    return;
  end if;

  if v_status = 'accepted' then
    return query select false, 'This proposal has already been accepted.', v_num;
    return;
  end if;
  if v_status <> 'sent' then
    return query select false, 'This proposal is no longer open for signature.', v_num;
    return;
  end if;
  if v_valid is not null and v_valid < current_date then
    return query select false,
      'This proposal expired on ' || to_char(v_valid, 'FMMonth FMDD, YYYY') ||
      '. Please contact TDR Engineering for a current one.', v_num;
    return;
  end if;

  -- The unique index is the real guard against a double signature; this turns
  -- the one case it catches into a sentence a client can read rather than a
  -- constraint error on a page they are trying to sign.
  begin
    insert into proposal_signatures (
      proposal_id, token_id, typed_name, signer_email, signer_title,
      intent_acknowledged, esign_consented, consent_text, document_hash,
      ip_address, user_agent)
    values (
      v_prop, v_token, btrim(p_typed_name), nullif(btrim(coalesce(p_email,'')), ''),
      nullif(btrim(coalesce(p_title,'')), ''),
      true, true, p_consent_text, coalesce(v_hash, ''),
      nullif(p_ip,'')::inet, p_user_agent);
  exception when unique_violation then
    return query select false, 'This proposal has already been accepted.', v_num;
    return;
  end;

  update proposals
     set status = 'accepted', accepted_at = now()
   where id = v_prop;

  insert into proposal_events (proposal_id, token_id, kind, detail, ip_address, user_agent)
  values (v_prop, v_token, 'accepted', btrim(p_typed_name),
          nullif(p_ip,'')::inet, p_user_agent);

  -- Keep the request board honest. The JOB is deliberately NOT created here:
  -- a signature must never fail because job creation did, and a job appearing
  -- on the board without anybody at TDR knowing is how work gets missed. The
  -- proposal screen prompts for it instead, using the conversion that already
  -- exists and that the unique index on jobs.opportunity_id already protects.
  if v_opp is not null then
    update opportunities set status = 'won'
     where id = v_opp and status <> 'won';
  end if;

  return query select true, 'Accepted.', v_num;
end;
$$;

-- Declining is recorded, not just an absence. "They never replied" and "they
-- said no on the 14th" are different facts and only one of them is useful.
create or replace function decline_proposal(
  p_token_hash text,
  p_reason     text default null,
  p_ip         text default null,
  p_user_agent text default null
)
returns table (ok boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_prop  uuid;
  v_status proposal_status;
begin
  select t.id, p.id, p.status into v_token, v_prop, v_status
    from proposal_access_tokens t
    join proposals p on p.id = t.proposal_id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now())
     and p.archived_at is null
     for update of p;

  if v_prop is null then
    return query select false, 'This link is no longer valid.';
    return;
  end if;
  if v_status = 'accepted' then
    return query select false, 'This proposal has already been accepted.';
    return;
  end if;
  if v_status <> 'sent' then
    return query select false, 'This proposal is no longer open.';
    return;
  end if;

  update proposals
     set status = 'declined', declined_at = now(),
         decline_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = v_prop;

  insert into proposal_events (proposal_id, token_id, kind, detail, ip_address, user_agent)
  values (v_prop, v_token, 'declined', nullif(btrim(coalesce(p_reason,'')), ''),
          nullif(p_ip,'')::inet, p_user_agent);

  return query select true, 'Recorded.';
end;
$$;

-- The attached PDF, for the download link the signing page offers. Returns
-- the storage location only after the token has cleared, so the route never
-- reaches storage with a path the database has not already released.
create or replace function proposal_document_for_signing(p_token_hash text)
returns table (storage_bucket text, storage_path text, original_filename text)
language sql
stable
security definer
set search_path = public
as $$
  select f.storage_bucket, f.storage_path, f.original_filename
    from proposal_access_tokens t
    join proposals p on p.id = t.proposal_id
    join files f on f.id = p.document_file_id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now())
     and p.archived_at is null
     and f.archived_at is null
     and p.status in ('sent', 'accepted', 'declined');
$$;

-- None of these belong on the public REST API (0005). They are revoked from
-- everybody and then granted back to `service_role` alone — not even a
-- signed-in staff member may call them, because staff have no business
-- signing on a client's behalf and the narrower grant says so.
--
-- THE RE-GRANT IS NOT OPTIONAL. Revoking from `public` takes the privilege
-- away from service_role too, since service_role inherits it like every other
-- role. BYPASSRLS does not help: it skips row policies, not EXECUTE. Found by
-- test — without these four lines the signing page cannot read anything, and
-- it would have failed the first time a client opened a link.
revoke all on function proposal_for_signing(text)             from public, anon, authenticated;
revoke all on function proposal_document_for_signing(text)    from public, anon, authenticated;
revoke all on function record_proposal_view(text, text, text) from public, anon, authenticated;
revoke all on function accept_proposal(text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function decline_proposal(text, text, text, text) from public, anon, authenticated;

grant execute on function proposal_for_signing(text)             to service_role;
grant execute on function proposal_document_for_signing(text)    to service_role;
grant execute on function record_proposal_view(text, text, text) to service_role;
grant execute on function accept_proposal(text, text, text, text, text, text, text)
  to service_role;
grant execute on function decline_proposal(text, text, text, text) to service_role;

-- ============================================== proposal documents ========
-- TDR's own proposal PDF. Private, like every other bucket here: nothing is
-- readable without a signed URL minted server-side after a check.
insert into storage.buckets (id, name, public, file_size_limit)
values ('proposal-documents', 'proposal-documents', false, 104857600)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "proposal documents staff read" on storage.objects;
create policy "proposal documents staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'proposal-documents' and is_staff());

drop policy if exists "proposal documents staff insert" on storage.objects;
create policy "proposal documents staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proposal-documents' and is_staff());

drop policy if exists "proposal documents staff update" on storage.objects;
create policy "proposal documents staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'proposal-documents' and is_staff());

drop policy if exists "proposal documents staff delete" on storage.objects;
create policy "proposal documents staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proposal-documents' and is_staff());

-- `files` already carries opportunity_id and job_id; a proposal document is
-- the third thing a file can belong to.
alter table files add column if not exists proposal_id uuid
  references proposals (id) on delete set null;
create index if not exists files_proposal_idx on files (proposal_id)
  where proposal_id is not null;

-- ================================================== staff-facing views ====
-- One row per proposal with its live state. `state` is derived — expiry in
-- particular, which is a fact about today's date rather than something a
-- scheduled job has to remember to stamp.
create or replace view v_proposal_board as
select
  p.id,
  p.proposal_number,
  p.opportunity_id,
  o.opportunity_number,
  p.contact_id,
  btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as contact_name,
  c.email                                        as contact_email,
  p.company_id,
  co.name                                        as company_name,
  p.property_id,
  concat_ws(', ', pr.address_line1, pr.city, pr.state) as property_address,
  p.title,
  p.status,
  p.valid_until,
  p.total,
  p.currency,
  p.sent_at,
  p.accepted_at,
  p.declined_at,
  p.withdrawn_at,
  p.created_at,
  p.document_file_id is not null                 as has_document,
  s.typed_name                                   as signed_by,
  s.signed_at,
  s.signer_email                                 as signed_email,
  -- The signature names a hash; if the proposal's hash has moved since, that
  -- is worth seeing rather than trusting. It should never happen — the freeze
  -- trigger prevents it — which is exactly why it is shown if it ever does.
  (s.id is not null and s.document_hash is distinct from coalesce(p.content_hash, ''))
                                                 as signature_mismatch,
  j.id                                           as job_id,
  j.job_number,
  case
    when p.status = 'accepted'  then 'accepted'
    when p.status = 'declined'  then 'declined'
    when p.status = 'withdrawn' then 'withdrawn'
    when p.status = 'draft'     then 'draft'
    when p.valid_until is not null and p.valid_until < current_date then 'expired'
    else 'awaiting_signature'
  end                                            as state,
  (select count(*) from proposal_access_tokens t
    where t.proposal_id = p.id and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now()))  as live_links,
  (select max(t.last_viewed_at) from proposal_access_tokens t
    where t.proposal_id = p.id)                  as last_viewed_at,
  concat_ws(' ', p.proposal_number, p.title, o.opportunity_number,
                 c.first_name, c.last_name, co.name, pr.address_line1) as search_text
from proposals p
left join opportunities o on o.id = p.opportunity_id
left join contacts   c  on c.id  = p.contact_id
left join companies  co on co.id = p.company_id
left join properties pr on pr.id = p.property_id
left join proposal_signatures s on s.proposal_id = p.id
left join jobs j on j.opportunity_id = p.opportunity_id and j.archived_at is null
where p.archived_at is null;

alter view v_proposal_board set (security_invoker = on);
grant select on v_proposal_board to authenticated;
