-- Product Catalog -> Order Wizard dynamic product support.
-- Existing products remain unchanged. Seed inserts are guarded by product name.

alter table public.products
  add column if not exists sort_order integer,
  add column if not exists updated_at timestamptz default now();

alter table public.products
  alter column updated_at set default now();

update public.products
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

insert into public.products (
  name,
  category,
  unit_price,
  description,
  image_url,
  status,
  flavours,
  sort_order,
  created_at,
  updated_at
)
select
  'Dubai Chewy Cookie Pistachio',
  'Chewy Cookie',
  10.00,
  'Dubai-style chewy cookie with pistachio filling.',
  null,
  'Available',
  array['Dubai Chewy Cookie Pistachio'],
  30,
  now(),
  now()
where not exists (
  select 1
  from public.products
  where lower(trim(name)) = lower('Dubai Chewy Cookie Pistachio')
);

insert into public.products (
  name,
  category,
  unit_price,
  description,
  image_url,
  status,
  flavours,
  sort_order,
  created_at,
  updated_at
)
select
  'Dubai Chewy Cookie Biscoff',
  'Chewy Cookie',
  10.00,
  'Dubai-style chewy cookie with Biscoff filling.',
  null,
  'Available',
  array['Dubai Chewy Cookie Biscoff'],
  31,
  now(),
  now()
where not exists (
  select 1
  from public.products
  where lower(trim(name)) = lower('Dubai Chewy Cookie Biscoff')
);