alter table public.follow_up_tasks
add column if not exists follow_up_date date;

update public.follow_up_tasks
set follow_up_date = due_date
where follow_up_date is null;

alter table public.follow_up_tasks
alter column follow_up_date set not null;

create index if not exists follow_up_tasks_follow_up_date_idx
on public.follow_up_tasks (follow_up_date);
