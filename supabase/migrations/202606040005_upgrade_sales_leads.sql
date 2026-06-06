alter table public.sales_leads
add column if not exists lead_type text not null default 'Corporate',
add column if not exists last_follow_up date,
add column if not exists potential_value numeric not null default 0,
add column if not exists actual_revenue numeric not null default 0,
add column if not exists updated_at timestamptz not null default now();

update public.sales_leads
set lead_type = case
  when lead_type in ('Corporate', 'Event Planner', 'Wedding Planner', 'Cafe', 'Hotel', 'School', 'Government', 'Other') then lead_type
  when industry is not null and industry <> '' then 'Corporate'
  else 'Corporate'
end;

alter table public.sales_leads
drop constraint if exists sales_leads_status_check;

alter table public.sales_leads
add constraint sales_leads_status_check check (
  status in ('New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost')
);

alter table public.sales_leads
drop constraint if exists sales_leads_lead_type_check;

alter table public.sales_leads
add constraint sales_leads_lead_type_check check (
  lead_type in ('Corporate', 'Event Planner', 'Wedding Planner', 'Cafe', 'Hotel', 'School', 'Government', 'Other')
);

create index if not exists sales_leads_lead_type_idx on public.sales_leads (lead_type);
create index if not exists sales_leads_area_idx on public.sales_leads (area);
create index if not exists sales_leads_lead_source_idx on public.sales_leads (lead_source);
