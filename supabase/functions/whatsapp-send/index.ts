import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    requiredSecret('WHATSAPP_BUSINESS_ACCOUNT_ID');
    const { conversationId, message, draftId } = await request.json() as { conversationId?: string; message?: string; draftId?: string };
    const content = message?.trim();
    if (!conversationId || !content) return json({ error: 'Conversation and message are required.' }, 400);
    if (content.length > 4096) return json({ error: 'Message exceeds WhatsApp text limit.' }, 400);

    const supabase = createClient(requiredSecret('SUPABASE_URL'), requiredSecret('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { data: conversation, error: conversationError } = await supabase.from('whatsapp_conversations')
      .select('id,wa_id').eq('id', conversationId).single();
    if (conversationError || !conversation) throw conversationError ?? new Error('Conversation not found');

    const version = Deno.env.get('WHATSAPP_GRAPH_API_VERSION')?.trim() || 'v23.0';
    const response = await fetch(`https://graph.facebook.com/${version}/${requiredSecret('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${requiredSecret('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: conversation.wa_id, type: 'text', text: { preview_url: false, body: content } })
    });
    const result = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok || result.error) throw new Error(result.error?.message || `WhatsApp send failed (${response.status})`);
    const metaMessageId = result.messages?.[0]?.id;

    const timestamp = new Date().toISOString();
    const { data: savedMessage, error: saveError } = await supabase.from('whatsapp_messages').insert({
      conversation_id: conversationId, meta_message_id: metaMessageId || null, direction: 'outbound',
      message_type: 'text', body: content, status: 'sent', raw_payload: result, message_timestamp: timestamp
    }).select().single();
    if (saveError) throw saveError;
    const { error: updateError } = await supabase.from('whatsapp_conversations').update({
      last_message: content, last_message_at: timestamp, updated_at: timestamp, unread_count: 0
    }).eq('id', conversationId);
    if (updateError) throw updateError;
    if (draftId) await supabase.from('ai_reply_drafts').update({ status: 'sent', sent_at: timestamp }).eq('id', draftId).eq('conversation_id', conversationId);
    return json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('WhatsApp send failed:', error);
    return json({ error: error instanceof Error ? error.message : 'WhatsApp send failed' }, 500);
  }
});
