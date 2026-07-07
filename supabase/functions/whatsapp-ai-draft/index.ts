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
const SAFE_FALLBACK_REPLY = 'Hi, thank you for contacting Layer By Layer. May I know if this is for personal enjoyment, a birthday party, or an event?';

const outputText = (response: Record<string, unknown>) => {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const choices = Array.isArray(response.choices) ? response.choices as Array<Record<string, unknown>> : [];
  const firstMessage = choices[0]?.message;
  if (firstMessage && typeof firstMessage === 'object') {
    const chatContent = (firstMessage as Record<string, unknown>).content;
    if (typeof chatContent === 'string' && chatContent.trim()) return chatContent.trim();
  }

  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [];
    for (const part of content) {
      if (typeof part.text === 'string' && part.text.trim()) return part.text.trim();
    }
  }
  return '';
};

const responseShape = (response: Record<string, unknown>) => {
  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  const choices = Array.isArray(response.choices) ? response.choices as Array<Record<string, unknown>> : [];
  return {
    object: typeof response.object === 'string' ? response.object : null,
    status: typeof response.status === 'string' ? response.status : null,
    hasOutputText: typeof response.output_text === 'string' && response.output_text.length > 0,
    outputCount: output.length,
    outputTypes: output.map((item) => String(item.type ?? 'unknown')),
    contentTypes: output.flatMap((item) => Array.isArray(item.content)
      ? (item.content as Array<Record<string, unknown>>).map((part) => String(part.type ?? 'unknown'))
      : []),
    choicesCount: choices.length,
    finishReason: choices[0] ? String(choices[0].finish_reason ?? '') : null,
    incompleteReason: response.incomplete_details && typeof response.incomplete_details === 'object'
      ? String((response.incomplete_details as Record<string, unknown>).reason ?? '')
      : null,
    hasError: Boolean(response.error)
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { conversationId } = await request.json() as { conversationId?: string };
    if (!conversationId) return json({ error: 'Conversation is required.' }, 400);
    const supabase = createClient(requiredSecret('SUPABASE_URL'), requiredSecret('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { data: conversation, error: conversationError } = await supabase.from('whatsapp_conversations')
      .select('id,customer_name,phone_number').eq('id', conversationId).single();
    if (conversationError || !conversation) throw conversationError ?? new Error('Conversation not found');
    const { data: messages, error: messagesError } = await supabase.from('whatsapp_messages')
      .select('id,direction,body,message_timestamp').eq('conversation_id', conversationId)
      .order('message_timestamp', { ascending: false }).limit(20);
    if (messagesError) throw messagesError;
    const chronological = [...(messages ?? [])].reverse();
    const latestInbound = [...chronological].reverse().find((message) => message.direction === 'inbound');
    if (!latestInbound) return json({ error: 'No inbound customer message to answer.' }, 400);

    const transcript = chronological.map((message) => `${message.direction === 'inbound' ? 'Customer' : 'Staff'}: ${message.body || '[non-text message]'}`).join('\n');
    const model = Deno.env.get('OPENAI_MODEL')?.trim() || 'gpt-5-mini';
    const prompt = `You are a reply drafting assistant for Layer By Layer Bakery in Malaysia. Draft one concise WhatsApp reply for staff review.\n\nBusiness facts:\n- Mini Tarts are RM2.50 per piece.\n- Flavours: Matcha Red Bean, Chocolate Noir, Honey Brulee, Lime Cheese, Biscoff, Black Sesame.\n- Orders of 100 pieces and above may receive 10% discount; 200 pieces and above may receive 20% discount, but staff approval is required.\n- Pre-order is normally 1 day in advance. Delivery depends on location. Products are best consumed the same day.\n\nSafety rules:\n- Never confirm an order, stock availability, urgent timing, delivery fee, refund, complaint resolution, or special discount.\n- Never claim payment was received.\n- Ask at most one useful next question.\n- If urgent, complaint, refund, cancellation, partnership, special discount or more than 200 pieces is involved, explicitly say a staff member will check.\n- Do not mention that you are AI.\n- Output only the suggested reply.\n\nConversation:\n${transcript}`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requiredSecret('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: prompt, max_output_tokens: 300 })
    });
    const result = await response.json() as Record<string, unknown> & { error?: { message?: string } };
    console.log('OpenAI response shape:', responseShape(result));
    if (!response.ok || result.error) throw new Error(result.error?.message || `OpenAI request failed (${response.status})`);
    const generatedContent = outputText(result);
    const content = generatedContent || SAFE_FALLBACK_REPLY;
    if (!generatedContent) console.warn('OpenAI returned no text; using safe LBL fallback draft.');

    const { data: draft, error: draftError } = await supabase.from('ai_reply_drafts').insert({
      conversation_id: conversationId,
      source_message_id: latestInbound.id,
      content,
      model,
      requires_human_review: true,
      safety_notes: [
        'Human review required before sending',
        'No automatic order confirmation',
        'No automatic discount approval',
        ...(generatedContent ? [] : ['Safe fallback used because OpenAI returned empty output'])
      ]
    }).select().single();
    if (draftError) throw draftError;
    return json({ success: true, draft });
  } catch (error) {
    console.error('AI reply draft failed:', error);
    return json({ error: error instanceof Error ? error.message : 'AI reply draft failed' }, 500);
  }
});
