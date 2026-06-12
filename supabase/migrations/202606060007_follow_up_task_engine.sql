create table if not exists public.follow_up_tasks (
  id bigserial primary key,
  lead_id bigint not null references public.sales_leads(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date not null,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.follow_up_tasks
add column if not exists lead_id bigint,
add column if not exists title text not null default '',
add column if not exists description text not null default '',
add column if not exists due_date date not null default current_date,
add column if not exists status text not null default 'Pending',
add column if not exists created_at timestamptz not null default now();

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'follow_up_tasks'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'lead_id'
  loop
    execute format(
      'alter table public.follow_up_tasks drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;

alter table public.follow_up_tasks
add constraint follow_up_tasks_lead_id_fkey
foreign key (lead_id) references public.sales_leads(id) on delete cascade;

alter table public.follow_up_tasks
drop constraint if exists follow_up_tasks_status_check;

alter table public.follow_up_tasks
add constraint follow_up_tasks_status_check check (
  status in ('Pending', 'Completed', 'Overdue')
);

create index if not exists follow_up_tasks_lead_id_idx
on public.follow_up_tasks (lead_id);

create index if not exists follow_up_tasks_due_date_idx
on public.follow_up_tasks (due_date);

create index if not exists follow_up_tasks_status_idx
on public.follow_up_tasks (status);

grant select, insert, update, delete on public.follow_up_tasks to anon, authenticated;

do $$
declare
  task_sequence text;
begin
  task_sequence := pg_get_serial_sequence('public.follow_up_tasks', 'id');
  if task_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to anon, authenticated',
      task_sequence
    );
  end if;
end
$$;
