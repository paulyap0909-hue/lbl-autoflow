import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const textResponse = (body: string, status = 200) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' }
});

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};

const bytesToHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
};

const verifySignature = async (body: string, signature: string, appSecret: string) => {
  if (!signature.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), {
    name: 'HMAC', hash: 'SHA-256'
  }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return safeEqual(signature.slice(7), bytesToHex(digest));
};

const extractBody = (message: Record<string, unknown>) => {
  const type = String(message.type ?? 'unknown');
  const typed = message[type];
  if (type === 'text' && typed && typeof typed === 'object') return String((typed as Record<string, unknown>).body ?? '');
  if (type === 'button' && typed && typeof typed === 'object') return String((typed as Record<string, unknown>).text ?? 'Button response');
  if (type === 'interactive' && typed && typeof typed === 'object') {
    const interactive = typed as Record<string, unknown>;
    const reply = interactive.button_reply ?? interactive.list_reply;
    if (reply && typeof reply === 'object') return String((reply as Record<string, unknown>).title ?? 'Interactive response');
  }
  return `[${type} message]`;
};

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && token && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) return textResponse(challenge);
    return textResponse('Webhook verification failed', 403);
  }
  if (request.method !== 'POST') return textResponse('Method not allowed', 405);

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') ?? '';
    if (!await verifySignature(rawBody, signature, requiredSecret('META_APP_SECRET'))) {
      return textResponse('Invalid webhook signature', 401);
    }

    const payload = JSON.parse(rawBody) as {
      entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>;
    };
    const supabase = createClient(requiredSecret('SUPABASE_URL'), requiredSecret('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false }
    });

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const contacts = Array.isArray(value.contacts) ? value.contacts as Array<Record<string, unknown>> : [];
        const contactNames = new Map(contacts.map((contact) => {
          const profile = contact.profile && typeof contact.profile === 'object' ? contact.profile as Record<string, unknown> : {};
          return [String(contact.wa_id ?? ''), String(profile.name ?? '')];
        }));
        const messages = Array.isArray(value.messages) ? value.messages as Array<Record<string, unknown>> : [];
        for (const message of messages) {
          const waId = String(message.from ?? '').replace(/\D/g, '');
          const metaMessageId = String(message.id ?? '');
          if (!waId || !metaMessageId) continue;
          const unixSeconds = Number(message.timestamp);
          const messageTimestamp = Number.isFinite(unixSeconds)
            ? new Date(unixSeconds * 1000).toISOString()
            : new Date().toISOString();
          const { error } = await supabase.rpc('record_whatsapp_inbound_message', {
            p_wa_id: waId,
            p_customer_name: contactNames.get(waId) || null,
            p_meta_message_id: metaMessageId,
            p_message_type: String(message.type ?? 'unknown'),
            p_body: extractBody(message),
            p_message_timestamp: messageTimestamp,
            p_raw_payload: message
          });
          if (error) throw error;
        }

        const statuses = Array.isArray(value.statuses) ? value.statuses as Array<Record<string, unknown>> : [];
        for (const status of statuses) {
          const metaMessageId = String(status.id ?? '');
          const nextStatus = String(status.status ?? '');
          if (!metaMessageId || !['sent', 'delivered', 'read', 'failed'].includes(nextStatus)) continue;
          const errors = Array.isArray(status.errors) ? status.errors as Array<Record<string, unknown>> : [];
          const { error } = await supabase.from('whatsapp_messages').update({
            status: nextStatus,
            error_message: errors.length ? String(errors[0].message ?? errors[0].title ?? 'WhatsApp delivery failed') : null
          }).eq('meta_message_id', metaMessageId);
          if (error) throw error;
        }
      }
    }
    return textResponse('EVENT_RECEIVED');
  } catch (error) {
    console.error('WhatsApp webhook failed:', error);
    return textResponse('Webhook processing failed', 500);
  }
});

