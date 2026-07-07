# WhatsApp AI Chatbot Phase 1 Deployment

Phase 1 receives inbound messages, stores them, generates staff-requested AI drafts, and sends only after a staff member clicks **Send WhatsApp**.

## 1. Apply database migration

Run `supabase/migrations/202606200002_whatsapp_ai_chatbot_phase1.sql` in Supabase SQL Editor or through the Supabase CLI.

## 2. Configure Edge Function secrets

```powershell
supabase secrets set WHATSAPP_VERIFY_TOKEN="..." WHATSAPP_ACCESS_TOKEN="..." WHATSAPP_PHONE_NUMBER_ID="..." WHATSAPP_BUSINESS_ACCOUNT_ID="..." OPENAI_API_KEY="..." META_APP_SECRET="..."
```

Optional controlled version/model pins:

```powershell
supabase secrets set WHATSAPP_GRAPH_API_VERSION="v23.0" OPENAI_MODEL="gpt-5-mini"
```

`META_APP_SECRET` validates `X-Hub-Signature-256` on inbound webhook events. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge Function runtime.

## 3. Deploy functions

The Meta webhook must be public for verification and event delivery. The send and AI routes keep JWT verification enabled.

```powershell
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-send
supabase functions deploy whatsapp-ai-draft
```

Webhook callback URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook
```

Use the same value configured as `WHATSAPP_VERIFY_TOKEN` when Meta asks for the verification token. Subscribe the WhatsApp Business Account webhook to the `messages` field.

## Safety boundary

- No automatic reply trigger exists.
- AI output is saved as a draft with `requires_human_review = true`.
- Staff must explicitly click **Send WhatsApp** and confirm the browser prompt.
- No order, discount, refund, or urgency workflow is updated automatically.
