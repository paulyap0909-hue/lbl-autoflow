-- LBL simplified document numbering.
-- Audit queries before deployment:
-- select order_no, count(*) from public.orders
-- where order_no is not null and btrim(order_no) <> ''
-- group by order_no having count(*) > 1;
--
-- select invoice_no, count(*) from public.invoices
-- where invoice_no is not null and btrim(invoice_no) <> ''
-- group by invoice_no having count(*) > 1;
--
-- select order_id, count(*) from public.invoices
-- where order_id is not null
-- group by order_id having count(*) > 1;

do $$
begin
  if exists (
    select 1
    from public.orders
    where order_no is not null and btrim(order_no) <> ''
    group by order_no
    having count(*) > 1
  ) then
    raise exception 'Duplicate orders.order_no values found. Resolve them before applying this migration.';
  end if;

  if exists (
    select 1
    from public.invoices
    where invoice_no is not null and btrim(invoice_no) <> ''
    group by invoice_no
    having count(*) > 1
  ) then
    raise exception 'Duplicate invoices.invoice_no values found. Resolve them before applying this migration.';
  end if;

  if exists (
    select 1
    from public.invoices
    where order_id is not null
    group by order_id
    having count(*) > 1
  ) then
    raise exception 'Multiple invoices found for the same order_id. Resolve them before applying this migration.';
  end if;
end
$$;

create unique index if not exists orders_order_no_unique
on public.orders (order_no)
where order_no is not null and btrim(order_no) <> '';

create unique index if not exists invoices_invoice_no_unique
on public.invoices (invoice_no)
where invoice_no is not null and btrim(invoice_no) <> '';

create unique index if not exists invoices_order_id_unique
on public.invoices (order_id)
where order_id is not null;

create or replace function public.assign_lbl_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  malaysia_now timestamp := clock_timestamp() at time zone 'Asia/Kuala_Lumpur';
  date_code text;
  number_prefix text;
  next_sequence integer;
begin
  if new.order_no is not null and btrim(new.order_no) <> '' then
    return new;
  end if;

  date_code := to_char(malaysia_now, 'YYMMDD');
  number_prefix := 'LBL-' || date_code || '-';

  perform pg_advisory_xact_lock(hashtext('lbl-order-number-' || date_code));

  select coalesce(
    max(substring(order_no from '([0-9]+)$')::integer),
    0
  ) + 1
  into next_sequence
  from public.orders
  where order_no ~ ('^LBL-' || date_code || '-[0-9]{4,}$');

  new.order_no := number_prefix || lpad(next_sequence::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists orders_assign_lbl_order_number on public.orders;

create trigger orders_assign_lbl_order_number
before insert on public.orders
for each row
execute function public.assign_lbl_order_number();

create or replace function public.assign_lbl_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  malaysia_now timestamp := clock_timestamp() at time zone 'Asia/Kuala_Lumpur';
  date_code text;
  number_prefix text;
  next_sequence integer;
begin
  if new.invoice_no is not null and btrim(new.invoice_no) <> '' then
    return new;
  end if;

  date_code := to_char(malaysia_now, 'YYMMDD');
  number_prefix := 'INV-' || date_code || '-';

  perform pg_advisory_xact_lock(hashtext('lbl-invoice-number-' || date_code));

  select coalesce(
    max(substring(invoice_no from '([0-9]+)$')::integer),
    0
  ) + 1
  into next_sequence
  from public.invoices
  where invoice_no ~ ('^INV-' || date_code || '-[0-9]{4,}$');

  new.invoice_no := number_prefix || lpad(next_sequence::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists invoices_assign_lbl_invoice_number on public.invoices;

create trigger invoices_assign_lbl_invoice_number
before insert on public.invoices
for each row
execute function public.assign_lbl_invoice_number();
