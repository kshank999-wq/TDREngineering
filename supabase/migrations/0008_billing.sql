-- ===========================================================================
-- TDR Engineering — invoices and payments
--
-- TRACKING, NOT PROCESSING
--
-- Recording that a cheque arrived is a table. Taking a card is Stripe, PCI
-- scope, and a different kind of commitment entirely. Nothing here touches
-- card data, and `payments` records what was received rather than causing it.
--
-- THIS SYSTEM OWNS INVOICE NUMBERING
--
-- Accounting software receives records for tax and bookkeeping; it does not
-- originate them. So the number is assigned here, `exported_at` records when a
-- row was handed to QuickBooks, and an invoice is still a complete invoice
-- with no accounting integration configured at all.
--
-- PAID IS DERIVED, NOT DECLARED
--
-- `invoices.status` holds intent only — draft, sent, void. Whether an invoice
-- is paid, part paid or overdue is computed from its payments and its due
-- date in `v_invoice_ledger`. A stored "paid" flag is a second source of truth
-- for the same fact, and the two drift the first time a payment is corrected.
-- ===========================================================================

-- ----------------------------------------------------------- statuses -----
do $$ begin
  create type invoice_status as enum ('draft', 'sent', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('check', 'ach', 'card', 'cash', 'other');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ numbers -----
create sequence if not exists invoice_number_seq start 1;

create or replace function next_invoice_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('invoice_number_seq')::text, 4, '0');
$$;

-- ----------------------------------------------------------- invoices -----
create table if not exists invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique default next_invoice_number(),

  job_id          uuid references jobs (id) on delete set null,

  -- Who is billed. Held on the invoice, not followed through the job: an
  -- invoice is a financial document and must keep saying who it was addressed
  -- to even if the client record is later merged or re-parented.
  contact_id      uuid references contacts (id) on delete set null,
  company_id      uuid references companies (id) on delete set null,
  bill_to         text,   -- frozen address block, set when the invoice is sent

  status          invoice_status not null default 'draft',

  issue_date      date not null default current_date,
  due_date        date,
  terms           text default 'Net 30',
  po_number       text,

  -- Maintained by trigger from the lines below. Never written by hand: an
  -- invoice whose total disagrees with its own lines is worse than useless.
  subtotal        numeric(12,2) not null default 0,
  tax_rate        numeric(6,4)  not null default 0,
  tax_amount      numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  currency        text not null default 'USD',

  notes           text,

  sent_at         timestamptz,
  voided_at       timestamptz,
  -- When this invoice was handed to accounting, and in which batch.
  exported_at     timestamptz,
  export_batch    text,

  created_by      uuid references app_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,

  constraint invoices_tax_rate_sane check (tax_rate >= 0 and tax_rate < 1)
);

create index if not exists invoices_job_idx     on invoices (job_id);
create index if not exists invoices_contact_idx on invoices (contact_id);
create index if not exists invoices_company_idx on invoices (company_id);
create index if not exists invoices_status_idx  on invoices (status) where archived_at is null;
create index if not exists invoices_due_idx     on invoices (due_date) where archived_at is null;
create index if not exists invoices_export_idx  on invoices (exported_at);
create index if not exists invoices_number_trgm on invoices using gin (invoice_number gin_trgm_ops);

drop trigger if exists invoices_set_updated_at on invoices;
create trigger invoices_set_updated_at before update on invoices
  for each row execute function set_updated_at();

-- ------------------------------------------------------- invoice lines ----
create table if not exists invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices (id) on delete cascade,
  service_id  uuid references services (id) on delete set null,
  description text not null,
  quantity    numeric(12,3) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  -- Generated, so a line's amount can never disagree with its own inputs.
  amount      numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists invoice_lines_invoice_idx
  on invoice_lines (invoice_id, sort_order);

-- --------------------------------------------------------- recalculation --
-- Totals are derived from the lines every time the lines change, so they are
-- always a fact about the invoice rather than a number somebody typed.
create or replace function recalculate_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_subtotal numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_subtotal
    from invoice_lines where invoice_id = v_invoice;

  update invoices
     set subtotal   = v_subtotal,
         tax_amount = round(v_subtotal * tax_rate, 2),
         total      = v_subtotal + round(v_subtotal * tax_rate, 2)
   where id = v_invoice;

  return null;
end;
$$;

revoke all on function recalculate_invoice_totals() from public, anon;

drop trigger if exists invoice_lines_recalculate on invoice_lines;
create trigger invoice_lines_recalculate
  after insert or update or delete on invoice_lines
  for each row execute function recalculate_invoice_totals();

-- Changing the tax rate on the invoice itself has to re-derive too. BEFORE,
-- so the computed values land on the row being written rather than provoking
-- a second update.
create or replace function apply_invoice_tax()
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

drop trigger if exists invoices_apply_tax on invoices;
create trigger invoices_apply_tax before insert or update on invoices
  for each row execute function apply_invoice_tax();

-- ----------------------------------------------------------- payments -----
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices (id) on delete cascade,
  amount       numeric(12,2) not null,
  received_on  date not null default current_date,
  method       payment_method not null default 'check',
  -- Cheque number, ACH trace, deposit reference.
  reference    text,
  notes        text,
  exported_at  timestamptz,
  export_batch text,
  recorded_by  uuid references app_users (id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,

  -- A zero or negative payment is a correction, and a correction should be its
  -- own visible record rather than a quietly edited number.
  constraint payments_amount_positive check (amount > 0)
);

create index if not exists payments_invoice_idx on payments (invoice_id);
create index if not exists payments_received_idx on payments (received_on desc);
create index if not exists payments_export_idx on payments (exported_at);

-- -------------------------------------------------------------- RLS -------
alter table invoices      enable row level security;
alter table invoice_lines enable row level security;
alter table payments      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_lines', 'payments'] loop
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

-- ------------------------------------------------------------ ledger ------
-- One row per invoice with what is actually owed. `state` is derived here
-- rather than stored, so it cannot disagree with the payments it describes.
create or replace view v_invoice_ledger as
select
  i.id,
  i.invoice_number,
  i.job_id,
  j.job_number,
  j.name                                        as job_name,
  i.contact_id,
  btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as contact_name,
  i.company_id,
  co.name                                       as company_name,
  i.status,
  i.issue_date,
  i.due_date,
  i.terms,
  i.po_number,
  i.subtotal,
  i.tax_rate,
  i.tax_amount,
  i.total,
  i.currency,
  i.sent_at,
  i.exported_at,
  i.created_at,
  coalesce(p.amount_paid, 0)                    as amount_paid,
  i.total - coalesce(p.amount_paid, 0)          as balance,
  case
    when i.status = 'void'                                        then 'void'
    when i.status = 'draft'                                       then 'draft'
    when coalesce(p.amount_paid, 0) >= i.total and i.total > 0    then 'paid'
    when coalesce(p.amount_paid, 0) > 0                           then 'partial'
    when i.due_date is not null and i.due_date < current_date     then 'overdue'
    else 'sent'
  end                                           as state,
  case
    when i.due_date is null then null
    else current_date - i.due_date
  end                                           as days_past_due,
  concat_ws(' ', i.invoice_number, j.job_number, j.name,
                 c.first_name, c.last_name, co.name, i.po_number) as search_text
from invoices i
left join jobs j        on j.id  = i.job_id
left join contacts c    on c.id  = i.contact_id
left join companies co  on co.id = i.company_id
left join (
  select invoice_id, sum(amount) as amount_paid
    from payments where archived_at is null
   group by invoice_id
) p on p.invoice_id = i.id
where i.archived_at is null;

alter view v_invoice_ledger set (security_invoker = on);

-- Per-job money: what was contracted, what has been billed, what came in.
create or replace view v_job_billing as
select
  j.id                                          as job_id,
  j.contract_amount,
  coalesce(sum(l.total) filter (where l.status <> 'void'), 0)      as invoiced,
  coalesce(sum(l.amount_paid) filter (where l.status <> 'void'), 0) as paid,
  coalesce(sum(l.balance) filter (where l.status not in ('void', 'draft')), 0) as outstanding,
  count(l.id) filter (where l.status <> 'void')                    as invoice_count
from jobs j
left join v_invoice_ledger l on l.job_id = j.id
group by j.id, j.contract_amount;

alter view v_job_billing set (security_invoker = on);

grant select on v_invoice_ledger to authenticated;
grant select on v_job_billing    to authenticated;
