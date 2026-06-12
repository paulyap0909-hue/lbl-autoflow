create table if not exists public.quotations (
  id bigserial primary key,
  quote_no text not null unique,
  lead_id bigint references public.sales_leads(id) on delete set null,
  status text not null default 'Draft',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  delivery_fee numeric not null default 0,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotations
drop constraint if exists quotations_status_check;

alter table public.quotations
add constraint quotations_status_check check (
  status in ('Draft', 'Sent', 'Viewed', 'Negotiating', 'Accepted', 'Rejected')
);

create table if not exists public.quotation_items (
  id bigserial primary key,
  quotation_id bigint not null references public.quotations(id) on delete cascade,
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quotation_history (
  id bigserial primary key,
  quotation_id bigint not null references public.quotations(id) on delete cascade,
  action text not null,
  description text not null default '',
  performed_by text not null default 'Unknown user',
  created_at timestamptz not null default now()
);

create index if not exists quotations_lead_id_idx on public.quotations (lead_id);
create index if not exists quotations_status_idx on public.quotations (status);
create index if not exists quotation_items_quotation_id_idx on public.quotation_items (quotation_id);
create index if not exists quotation_history_quotation_id_idx on public.quotation_history (quotation_id);

create or replace function public.generate_quotation_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  date_code text := to_char(current_date, 'YYYYMMDD');
  prefix text := 'QTN-' || to_char(current_date, 'YYYYMMDD') || '-';
  next_sequence integer;
begin
  perform pg_advisory_xact_lock(hashtext('quotation-number-' || date_code));

  select coalesce(max((substring(quote_no from 14 for 4))::integer), 0) + 1
  into next_sequence
  from public.quotations
  where quote_no like prefix || '%';

  return prefix || lpad(next_sequence::text, 4, '0');
end;
$$;

grant select, insert, update, delete on public.quotations to anon, authenticated;
grant select, insert on public.quotation_items to anon, authenticated;
grant select, insert on public.quotation_history to anon, authenticated;
grant execute on function public.generate_quotation_number() to anon, authenticated;

do $$
declare
  sequence_name text;
begin
  foreach sequence_name in array array[
    pg_get_serial_sequence('public.quotations', 'id'),
    pg_get_serial_sequence('public.quotation_items', 'id'),
    pg_get_serial_sequence('public.quotation_history', 'id')
  ]
  loop
    if sequence_name is not null then
      execute format('grant usage, select on sequence %s to anon, authenticated', sequence_name);
    end if;
  end loop;
end
$$;
