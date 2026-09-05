-- ===========================================================================
-- TDR Engineering — client mailing addresses and shipping labels
--
-- Adds what is needed to print a shipping label from a client record:
--   * a MAILING address on contacts and companies — distinct from
--     properties.address_line1, which is the job site. Plans get mailed to an
--     office, not to the lot being surveyed.
--   * a `shipments` table recording every label bought, including a frozen
--     copy of the address it was printed with.
--
-- Buying a label is a real financial transaction, so this table is an audit
-- record, not a cache: it keeps the rate paid, the carrier, the tracking
-- number, and whether it was bought against a Shippo test token.
-- ===========================================================================

-- ------------------------------------------------- mailing addresses ------
alter table contacts
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city          text,
  add column if not exists state         text,
  add column if not exists postal_code   text,
  add column if not exists country       text not null default 'US';

alter table companies
  add column if not exists country       text not null default 'US';

comment on column contacts.address_line1 is
  'Mailing address for deliverables. Not the project site — that is properties.';
comment on column companies.address_line1 is
  'Mailing address for deliverables. Not the project site — that is properties.';

-- ------------------------------------------------------- shipments -------
do $$ begin
  create type shipment_status as enum (
    'draft',      -- rates fetched, nothing purchased, no money spent
    'purchased',  -- label bought and available
    'refunded',   -- label voided with the carrier
    'error'       -- the purchase failed; `error_message` says why
  );
exception when duplicate_object then null; end $$;

create table if not exists shipments (
  id                 uuid primary key default gen_random_uuid(),

  -- Who it went to. At least one of these is set; the frozen address below is
  -- what actually got printed.
  contact_id         uuid references contacts (id) on delete set null,
  company_id         uuid references companies (id) on delete set null,
  -- Optional link to the job this shipment belongs to.
  opportunity_id     uuid references opportunities (id) on delete set null,

  status             shipment_status not null default 'draft',

  -- Frozen at purchase. A client's address may be corrected next week; the
  -- label that already went out was printed with this one, and reprinting or
  -- disputing a delivery needs the address as it was.
  to_address         jsonb not null,
  from_address       jsonb not null,
  parcel             jsonb not null,

  -- What TDR actually bought.
  carrier            text,
  service_level      text,
  rate_amount        numeric(10,2),
  rate_currency      text default 'USD',
  estimated_days     integer,

  tracking_number    text,
  tracking_url       text,
  label_url          text,

  -- Shippo identifiers, kept so a shipment can be reconciled against the
  -- Shippo dashboard or refunded later.
  shippo_shipment_id    text,
  shippo_rate_id        text,
  shippo_transaction_id text,

  -- True when bought against a Shippo test token. Test labels are not real
  -- postage and must never be mistaken for a shipment that will actually move.
  is_test            boolean not null default false,

  error_message      text,
  reference          text,   -- free-text note, e.g. "signed ALTA + 2 prints"

  created_by         uuid references app_users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,

  -- A shipment with no recipient at all is meaningless.
  constraint shipments_has_recipient
    check (contact_id is not null or company_id is not null)
);

create index if not exists shipments_contact_idx     on shipments (contact_id);
create index if not exists shipments_company_idx     on shipments (company_id);
create index if not exists shipments_opportunity_idx on shipments (opportunity_id);
create index if not exists shipments_created_idx     on shipments (created_at desc);
create index if not exists shipments_tracking_idx    on shipments (tracking_number);

drop trigger if exists shipments_set_updated_at on shipments;
create trigger shipments_set_updated_at before update on shipments
  for each row execute function set_updated_at();

-- ------------------------------------------------------------ RLS --------
alter table shipments enable row level security;

drop policy if exists shipments_staff_read on shipments;
create policy shipments_staff_read on shipments
  for select to authenticated using (is_staff());

-- Labels are bought server-side with the service role, but staff may annotate
-- a shipment (its reference note) from the browser.
drop policy if exists shipments_staff_update on shipments;
create policy shipments_staff_update on shipments
  for update to authenticated using (is_staff()) with check (is_staff());

-- ------------------------------------------- client directory search ------
-- One row per client — contacts and companies together — so the admin can
-- search people and firms in a single query rather than two.
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
