begin;

alter table public.sales_leads
drop constraint if exists sales_leads_status_check;

alter table public.sales_leads
add constraint sales_leads_status_check check (
  status in (
    'New',
    'Contacted',
    'Interested',
    'Sample Scheduled',
    'Quoted',
    'Won',
    'Lost',
    'Archived'
  )
);

create table if not exists public.sales_lead_audit_logs (
  id bigserial primary key,
  action text not null,
  lead_id bigint,
  lead_name text not null default '',
  performed_by text not null default 'Unknown user',
  created_at timestamptz not null default now()
);

create index if not exists sales_lead_audit_logs_lead_id_idx
on public.sales_lead_audit_logs (lead_id);

create index if not exists sales_lead_audit_logs_created_at_idx
on public.sales_lead_audit_logs (created_at desc);

create or replace function public.delete_sales_leads(
  p_lead_ids bigint[],
  p_performed_by text default 'Unknown user'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 then
    return 0;
  end if;

  insert into public.sales_lead_audit_logs (
    action,
    lead_id,
    lead_name,
    performed_by,
    created_at
  )
  select
    'Delete Lead',
    id,
    company_name,
    coalesce(nullif(trim(p_performed_by), ''), 'Unknown user'),
    now()
  from public.sales_leads
  where id = any(p_lead_ids);

  if to_regclass('public.follow_up_tasks') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'follow_up_tasks'
        and column_name = 'lead_id'
    )
  then
    execute
      'delete from public.follow_up_tasks where lead_id = any($1)'
      using p_lead_ids;
  end if;

  delete from public.lead_activities
  where lead_id = any(p_lead_ids);

  delete from public.sales_leads
  where id = any(p_lead_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant select, insert on public.sales_lead_audit_logs to anon, authenticated;
grant execute on function public.delete_sales_leads(bigint[], text) to anon, authenticated;

do $$
declare
  audit_sequence text;
begin
  audit_sequence := pg_get_serial_sequence('public.sales_lead_audit_logs', 'id');
  if audit_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to anon, authenticated',
      audit_sequence
    );
  end if;
end
$$;

commit;
