create table if not exists public.sales_leads (
  id bigserial primary key,
  company_name text not null default '',
  industry text not null default '',
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  area text not null default '',
  lead_source text not null default '',
  status text not null default 'New' check (
    status in ('New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost')
  ),
  notes text not null default '',
  next_follow_up date,
  created_at timestamptz not null default now()
);

create index if not exists sales_leads_status_idx on public.sales_leads (status);
create index if not exists sales_leads_next_follow_up_idx on public.sales_leads (next_follow_up);
create index if not exists sales_leads_company_name_idx on public.sales_leads (company_name);
