alter table public.sales_leads
add column if not exists lead_score integer not null default 0,
add column if not exists lead_priority text not null default 'Cold',
add column if not exists automation_enabled boolean not null default true,
add column if not exists last_automation_run timestamptz;

alter table public.sales_leads
drop constraint if exists sales_leads_lead_score_check;

alter table public.sales_leads
add constraint sales_leads_lead_score_check check (lead_score between 0 and 100);

alter table public.sales_leads
drop constraint if exists sales_leads_lead_priority_check;

alter table public.sales_leads
add constraint sales_leads_lead_priority_check check (
  lead_priority in ('Hot', 'Warm', 'Cold')
);

create or replace function public.calculate_sales_lead_score(
  p_phone text,
  p_email text,
  p_website text,
  p_facebook text,
  p_instagram text,
  p_lead_type text,
  p_industry text,
  p_area text
)
returns integer
language sql
immutable
as $$
  select least(
    100,
    (case when nullif(trim(coalesce(p_phone, '')), '') is not null then 20 else 0 end) +
    (case when nullif(trim(coalesce(p_email, '')), '') is not null then 10 else 0 end) +
    (case when nullif(trim(coalesce(p_website, '')), '') is not null then 10 else 0 end) +
    (case when nullif(trim(coalesce(p_facebook, '')), '') is not null
            or nullif(trim(coalesce(p_instagram, '')), '') is not null then 10 else 0 end) +
    (
      case
        when lower(coalesce(p_lead_type, '')) like '%event planner%' then 25
        when lower(coalesce(p_lead_type, '')) like '%wedding%'
          or lower(coalesce(p_industry, '')) like '%wedding%' then 25
        when lower(coalesce(p_lead_type, '')) like '%catering%'
          or lower(coalesce(p_industry, '')) like '%catering%' then 20
        when lower(coalesce(p_lead_type, '')) = 'corporate' then 15
        else 0
      end
    ) +
    (
      case
        when lower(coalesce(p_area, '')) ~ '(kuala lumpur|(^|[^a-z])kl([^a-z]|$)|petaling jaya|(^|[^a-z])pj([^a-z]|$)|shah alam|klang valley)'
          then 10
        else 0
      end
    )
  );
$$;

create or replace function public.apply_sales_lead_scoring()
returns trigger
language plpgsql
as $$
begin
  new.lead_score := public.calculate_sales_lead_score(
    new.phone,
    new.email,
    new.website,
    new.facebook,
    new.instagram,
    new.lead_type,
    new.industry,
    new.area
  );

  new.lead_priority := case
    when new.lead_score >= 80 then 'Hot'
    when new.lead_score >= 50 then 'Warm'
    else 'Cold'
  end;

  return new;
end;
$$;

drop trigger if exists sales_leads_apply_scoring on public.sales_leads;

create trigger sales_leads_apply_scoring
before insert or update of phone, email, website, facebook, instagram, lead_type, industry, area
on public.sales_leads
for each row
execute function public.apply_sales_lead_scoring();

create or replace function public.run_new_sales_lead_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(new.automation_enabled, true) then
    return new;
  end if;

  insert into public.follow_up_tasks (
    lead_id,
    title,
    description,
    follow_up_date,
    due_date,
    status
  )
  values
    (new.id, 'First outreach', 'Introduce LBL corporate and event packages.', current_date + 1, current_date + 1, 'Pending'),
    (new.id, 'Follow-up message', 'Follow up after the first outreach.', current_date + 3, current_date + 3, 'Pending'),
    (new.id, 'Catalogue / package reminder', 'Send the LBL catalogue or package reminder.', current_date + 7, current_date + 7, 'Pending'),
    (new.id, 'Final follow-up', 'Complete the final follow-up for this lead.', current_date + 14, current_date + 14, 'Pending');

  insert into public.lead_activities (
    lead_id,
    activity_type,
    description,
    performed_by
  )
  values
    (
      new.id,
      'Lead Scored as ' || new.lead_priority,
      'Automation assigned score ' || new.lead_score || ' and priority ' || new.lead_priority || '.',
      'Sales Automation'
    ),
    (
      new.id,
      'Auto Follow-up Schedule Created',
      'Day 1, Day 3, Day 7 and Day 14 follow-up tasks created.',
      'Sales Automation'
    );

  update public.sales_leads
  set last_automation_run = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists sales_leads_run_new_automation on public.sales_leads;

create trigger sales_leads_run_new_automation
after insert on public.sales_leads
for each row
execute function public.run_new_sales_lead_automation();

update public.sales_leads
set
  lead_score = public.calculate_sales_lead_score(
    phone,
    email,
    website,
    facebook,
    instagram,
    lead_type,
    industry,
    area
  ),
  lead_priority = case
    when public.calculate_sales_lead_score(
      phone, email, website, facebook, instagram, lead_type, industry, area
    ) >= 80 then 'Hot'
    when public.calculate_sales_lead_score(
      phone, email, website, facebook, instagram, lead_type, industry, area
    ) >= 50 then 'Warm'
    else 'Cold'
  end;

create index if not exists sales_leads_lead_priority_idx
on public.sales_leads (lead_priority);

create index if not exists sales_leads_lead_score_idx
on public.sales_leads (lead_score desc);

grant select, update on public.sales_leads to anon, authenticated;
