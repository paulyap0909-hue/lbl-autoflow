alter table public.lead_activities
add column if not exists description text not null default '';

alter table public.sales_leads
add column if not exists website text not null default '',
add column if not exists facebook text not null default '',
add column if not exists instagram text not null default '',
add column if not exists last_contact_date date,
add column if not exists next_follow_up_date date;

update public.sales_leads
set
  last_contact_date = coalesce(last_contact_date, last_follow_up),
  next_follow_up_date = coalesce(next_follow_up_date, next_follow_up)
where
  last_contact_date is null
  or next_follow_up_date is null;

create index if not exists sales_leads_next_follow_up_date_idx
on public.sales_leads (next_follow_up_date);

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
    where coalesce(next_follow_up_date, next_follow_up) = current_date
      and status not in ('Won', 'Lost')
  )::bigint as follow_up_today,
  coalesce(sum(potential_value) filter (where status not in ('Won', 'Lost')), 0)::numeric as pipeline_value,
  coalesce(sum(actual_revenue), 0)::numeric as revenue_generated
from public.sales_leads;

grant select, insert, update on public.sales_leads to anon, authenticated;
grant select, insert on public.lead_activities to anon, authenticated;
grant select on public.sales_metrics to anon, authenticated;
