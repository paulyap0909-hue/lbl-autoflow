-- Repair and enforce LBL order numbering.
-- The production column is public.orders.order_no (not order_number).
-- Existing non-empty historical order numbers are preserved.

do $$
begin
  if exists (
    select 1
    from public.orders
    where order_no is not null and btrim(order_no) <> ''
    group by order_no
    having count(*) > 1
  ) then
    raise exception 'Duplicate orders.order_no values found. Resolve duplicates before applying this migration.';
  end if;
end
$$;

create unique index if not exists orders_order_no_unique
on public.orders (order_no)
where order_no is not null and btrim(order_no) <> '';

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

  select coalesce(max(substring(order_no from '([0-9]+)$')::integer), 0) + 1
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

update public.orders
set order_no = null
where order_no is not null
  and btrim(order_no) = '';

do $$
declare
  missing_order record;
  number_prefix text;
  next_sequence integer;
begin
  for missing_order in
    select
      id,
      to_char(
        coalesce(created_at, clock_timestamp()) at time zone 'Asia/Kuala_Lumpur',
        'YYMMDD'
      ) as date_code
    from public.orders
    where order_no is null
    order by created_at nulls last, id
  loop
    number_prefix := 'LBL-' || missing_order.date_code || '-';
    perform pg_advisory_xact_lock(hashtext('lbl-order-number-' || missing_order.date_code));

    select coalesce(max(substring(order_no from '([0-9]+)$')::integer), 0) + 1
    into next_sequence
    from public.orders
    where order_no ~ ('^LBL-' || missing_order.date_code || '-[0-9]{4,}$');

    update public.orders
    set order_no = number_prefix || lpad(next_sequence::text, 4, '0')
    where id = missing_order.id;
  end loop;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.orders
    where order_no is null or btrim(order_no) = ''
  ) then
    raise exception 'Order number backfill failed: blank orders.order_no values remain.';
  end if;
end
$$;

alter table public.orders
alter column order_no set not null;
