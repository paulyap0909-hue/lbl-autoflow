-- WhatsApp AI Chatbot Phase 1: inbound inbox, human-reviewed drafts and manual sends.
create extension if not exists pgcrypto;

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  customer_name text,
  phone_number text not null,
  status text not null default 'open' check (status in ('open', 'human_review', 'closed')),
  last_message text,
  last_message_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_conversations_activity_idx
  on public.whatsapp_conversations(last_message_at desc nulls last);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  meta_message_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text,
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  message_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_thread_idx
  on public.whatsapp_messages(conversation_id, message_timestamp asc);

create table if not exists public.ai_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  source_message_id uuid references public.whatsapp_messages(id) on delete set null,
  content text not null,
  model text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'discarded')),
  requires_human_review boolean not null default true,
  safety_notes text[] not null default array['Human review required before sending'],
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists ai_reply_drafts_conversation_idx
  on public.ai_reply_drafts(conversation_id, created_at desc);

create or replace function public.record_whatsapp_inbound_message(
  p_wa_id text,
  p_customer_name text,
  p_meta_message_id text,
  p_message_type text,
  p_body text,
  p_message_timestamp timestamptz,
  p_raw_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
begin
  insert into public.whatsapp_conversations (
    wa_id, customer_name, phone_number, last_message, last_message_at, updated_at
  ) values (
    p_wa_id, nullif(trim(p_customer_name), ''), p_wa_id, p_body, p_message_timestamp, now()
  )
  on conflict (wa_id) do update set
    customer_name = coalesce(nullif(trim(excluded.customer_name), ''), whatsapp_conversations.customer_name),
    phone_number = excluded.phone_number,
    updated_at = now()
  returning id into v_conversation_id;

  insert into public.whatsapp_messages (
    conversation_id, meta_message_id, direction, message_type, body,
    status, raw_payload, message_timestamp
  ) values (
    v_conversation_id, p_meta_message_id, 'inbound', coalesce(nullif(p_message_type, ''), 'text'),
    p_body, 'received', coalesce(p_raw_payload, '{}'::jsonb), p_message_timestamp
  )
  on conflict (meta_message_id) do nothing
  returning id into v_message_id;

  if v_message_id is not null then
    update public.whatsapp_conversations set
      last_message = p_body,
      last_message_at = p_message_timestamp,
      unread_count = unread_count + 1,
      updated_at = now()
    where id = v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.ai_reply_drafts enable row level security;

drop policy if exists whatsapp_conversations_read on public.whatsapp_conversations;
create policy whatsapp_conversations_read on public.whatsapp_conversations
  for select to anon, authenticated using (true);
drop policy if exists whatsapp_conversations_staff_update on public.whatsapp_conversations;
create policy whatsapp_conversations_staff_update on public.whatsapp_conversations
  for update to anon, authenticated using (true) with check (true);

drop policy if exists whatsapp_messages_read on public.whatsapp_messages;
create policy whatsapp_messages_read on public.whatsapp_messages
  for select to anon, authenticated using (true);

drop policy if exists ai_reply_drafts_read on public.ai_reply_drafts;
create policy ai_reply_drafts_read on public.ai_reply_drafts
  for select to anon, authenticated using (true);

revoke all on function public.record_whatsapp_inbound_message(text, text, text, text, text, timestamptz, jsonb) from public;
grant execute on function public.record_whatsapp_inbound_message(text, text, text, text, text, timestamptz, jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_conversations') then
      alter publication supabase_realtime add table public.whatsapp_conversations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages') then
      alter publication supabase_realtime add table public.whatsapp_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_reply_drafts') then
      alter publication supabase_realtime add table public.ai_reply_drafts;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

