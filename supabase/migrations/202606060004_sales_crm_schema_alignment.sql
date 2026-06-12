begin;

alter table public.sales_leads
add column if not exists industry text not null default '',
add column if not exists website text not null default '',
add column if not exists facebook text not null default '',
add column if not exists instagram text not null default '',
add column if not exists lead_source text not null default '',
add column if not exists notes text not null default '',
add column if not exists last_contact_date date,
add column if not exists next_follow_up_date date,
add column if not exists potential_value numeric not null default 0,
add column if not exists actual_revenue numeric not null default 0,
add column if not exists sample_status text not null default 'Not Started',
add column if not exists whatsapp_ready boolean not null default false,
add column if not exists messages_sent integer not null default 0,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_leads'
      and column_name = 'source'
  ) then
    execute $sql$
      update public.sales_leads
      set lead_source = source
      where coalesce(lead_source, '') = ''
        and coalesce(source, '') <> ''
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_leads'
      and column_name = 'estimate'
  ) then
    execute $sql$
      update public.sales_leads
      set potential_value = estimate
      where coalesce(potential_value, 0) = 0
        and estimate is not null
    $sql$;
  end if;
end
$$;

update public.sales_leads
set whatsapp_ready = coalesce(trim(phone), '') <> '';

alter table public.sales_leads
drop constraint if exists sales_leads_status_check;

alter table public.sales_leads
add constraint sales_leads_status_check check (
  status in ('New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost')
);

alter table public.sales_leads
drop constraint if exists sales_leads_sample_status_check;

alter table public.sales_leads
add constraint sales_leads_sample_status_check check (
  sample_status in ('Not Started', 'Requested', 'Scheduled', 'Delivered')
);

alter table public.sales_leads
drop constraint if exists sales_leads_messages_sent_check;

alter table public.sales_leads
add constraint sales_leads_messages_sent_check check (messages_sent >= 0);

create table if not exists public.lead_activities (
  id bigserial primary key,
  lead_id bigint not null references public.sales_leads(id) on delete cascade,
  activity_type text not null default 'Activity',
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table public.lead_activities
add column if not exists activity_type text not null default 'Activity',
add column if not exists description text not null default '',
add column if not exists created_at timestamptz not null default now();

create index if not exists sales_leads_status_idx
on public.sales_leads (status);

create index if not exists sales_leads_company_name_idx
on public.sales_leads (company_name);

create index if not exists sales_leads_phone_idx
on public.sales_leads (phone);

create index if not exists sales_leads_next_follow_up_date_idx
on public.sales_leads (next_follow_up_date);

create index if not exists lead_activities_lead_id_idx
on public.lead_activities (lead_id);

create index if not exists lead_activities_created_at_idx
on public.lead_activities (created_at desc);

create or replace view public.sales_metrics
with (security_invoker = true)
as
select
  count(*)::bigint as total_leads,
  count(*) filter (where status = 'Contacted')::bigint as contacted,
  count(*) filter (where status = 'Interested')::bigint as interested,
  count(*) filter (where status = 'Sample Scheduled')::bigint as sample_scheduled,
  count(*) filter (where status = 'Quoted')::bigint as quoted,
  count(*) filter (where status = 'Won')::bigint as won,
  count(*) filter (where status = 'Lost')::bigint as lost,
  count(*) filter (
    where next_follow_up_date = current_date
      and status not in ('Won', 'Lost')
  )::bigint as follow_up_today,
  coalesce(
    sum(potential_value) filter (where status not in ('Won', 'Lost')),
    0
  )::numeric as pipeline_value,
  coalesce(sum(actual_revenue), 0)::numeric as revenue_generated
from public.sales_leads;

grant select, insert, update on public.sales_leads to anon, authenticated;
grant select, insert on public.lead_activities to anon, authenticated;
grant select on public.sales_metrics to anon, authenticated;

do $$
declare
  sales_leads_sequence text;
  lead_activities_sequence text;
begin
  sales_leads_sequence := pg_get_serial_sequence('public.sales_leads', 'id');
  lead_activities_sequence := pg_get_serial_sequence('public.lead_activities', 'id');

  if sales_leads_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to anon, authenticated',
      sales_leads_sequence
    );
  end if;

  if lead_activities_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to anon, authenticated',
      lead_activities_sequence
    );
  end if;
end
$$;

commit;
