alter table public.lead_activities
add column if not exists performed_by text not null default 'Unknown user';

create index if not exists lead_activities_activity_type_idx
on public.lead_activities (activity_type);

grant select, insert on public.lead_activities to anon, authenticated;
