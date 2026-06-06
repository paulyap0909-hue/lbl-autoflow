create table if not exists public.lead_activities (
  id bigserial primary key,
  lead_id bigint not null references public.sales_leads(id) on delete cascade,
  activity_type text not null default 'Activity',
  description text not null default '',
  created_at timestamptz not null default now()
);

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
    where next_follow_up = current_date
      and status not in ('Won', 'Lost')
  )::bigint as follow_up_today,
  coalesce(sum(potential_value) filter (where status not in ('Won', 'Lost')), 0)::numeric as pipeline_value,
  coalesce(sum(actual_revenue), 0)::numeric as revenue_generated
from public.sales_leads;

delete from public.sales_leads
where company_name in (
  'Aurelia Consulting',
  'Meridian Property Group',
  'Northstar Academy'
);

grant select, insert, update on public.sales_leads to anon, authenticated;
grant select, insert on public.lead_activities to anon, authenticated;
grant select on public.sales_metrics to anon, authenticated;

grant usage, select on sequence public.sales_leads_id_seq to anon, authenticated;
grant usage, select on sequence public.lead_activities_id_seq to anon, authenticated;
