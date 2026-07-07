import { supabase } from '../lib/supabase';

export type WhatsAppConversation = {
  id: string;
  waId: string;
  customerName: string;
  phoneNumber: string;
  status: 'open' | 'human_review' | 'closed';
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type WhatsAppMessage = {
  id: string;
  conversationId: string;
  metaMessageId: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  body: string;
  status: 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage: string;
  messageTimestamp: string;
};

export type AiReplyDraft = {
  id: string;
  conversationId: string;
  content: string;
  model: string;
  status: 'draft' | 'sent' | 'discarded';
  requiresHumanReview: boolean;
  safetyNotes: string[];
  createdAt: string;
};

const fromConversation = (row: Record<string, unknown>): WhatsAppConversation => ({
  id: String(row.id),
  waId: String(row.wa_id || ''),
  customerName: String(row.customer_name || 'WhatsApp Customer'),
  phoneNumber: String(row.phone_number || row.wa_id || ''),
  status: String(row.status || 'open') as WhatsAppConversation['status'],
  lastMessage: String(row.last_message || ''),
  lastMessageAt: String(row.last_message_at || ''),
  unreadCount: Number(row.unread_count) || 0
});

const fromMessage = (row: Record<string, unknown>): WhatsAppMessage => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  metaMessageId: String(row.meta_message_id || ''),
  direction: String(row.direction) as WhatsAppMessage['direction'],
  messageType: String(row.message_type || 'text'),
  body: String(row.body || ''),
  status: String(row.status || 'received') as WhatsAppMessage['status'],
  errorMessage: String(row.error_message || ''),
  messageTimestamp: String(row.message_timestamp || row.created_at || '')
});

const fromDraft = (row: Record<string, unknown>): AiReplyDraft => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  content: String(row.content || ''),
  model: String(row.model || ''),
  status: String(row.status || 'draft') as AiReplyDraft['status'],
  requiresHumanReview: row.requires_human_review !== false,
  safetyNotes: Array.isArray(row.safety_notes) ? row.safety_notes.map(String) : [],
  createdAt: String(row.created_at || '')
});

export async function loadWhatsAppConversations() {
  const { data, error } = await supabase.from('whatsapp_conversations').select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((row) => fromConversation(row));
}

export async function loadWhatsAppThread(conversationId: string) {
  const [messagesResult, draftsResult] = await Promise.all([
    supabase.from('whatsapp_messages').select('*').eq('conversation_id', conversationId).order('message_timestamp', { ascending: true }),
    supabase.from('ai_reply_drafts').select('*').eq('conversation_id', conversationId).eq('status', 'draft').order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  if (messagesResult.error) throw messagesResult.error;
  if (draftsResult.error) throw draftsResult.error;
  return {
    messages: (messagesResult.data ?? []).map((row) => fromMessage(row)),
    draft: draftsResult.data ? fromDraft(draftsResult.data) : null
  };
}

export async function markConversationHumanReview(conversationId: string) {
  const { error } = await supabase.from('whatsapp_conversations').update({
    status: 'human_review', updated_at: new Date().toISOString()
  }).eq('id', conversationId);
  if (error) throw error;
}

export async function markConversationRead(conversationId: string) {
  const { error } = await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conversationId);
  if (error) throw error;
}

export async function generateWhatsAppAiDraft(conversationId: string) {
  const { data, error } = await supabase.functions.invoke('whatsapp-ai-draft', { body: { conversationId } });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return fromDraft(data.draft as Record<string, unknown>);
}

export async function sendWhatsAppCloudMessage(input: { conversationId: string; message: string; draftId?: string }) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', { body: input });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return fromMessage(data.message as Record<string, unknown>);
}

export const subscribeToWhatsAppInbox = (onChange: () => void) => {
  const channel = supabase.channel('whatsapp-assistant-inbox')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_reply_drafts' }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
};

