alter table public.orders
add column if not exists flavour_quantities jsonb default '[]'::jsonb;

alter table public.kitchen_tasks
add column if not exists flavour_quantities jsonb default '[]'::jsonb;
