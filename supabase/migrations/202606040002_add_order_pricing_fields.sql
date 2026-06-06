alter table public.orders
add column if not exists original_unit_price numeric default 0,
add column if not exists final_unit_price numeric default 0,
add column if not exists discount_type text default 'none',
add column if not exists discount_value numeric default 0,
add column if not exists discount_amount numeric default 0,
add column if not exists discount_reason text default '',
add column if not exists original_subtotal numeric default 0,
add column if not exists final_subtotal numeric default 0;
