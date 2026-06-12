alter table public.sales_leads
add column if not exists sample_status text not null default 'Not Started',
add column if not exists whatsapp_ready boolean not null default false,
add column if not exists messages_sent integer not null default 0;

update public.sales_leads
set whatsapp_ready = true
where coalesce(trim(phone), '') <> '';

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

