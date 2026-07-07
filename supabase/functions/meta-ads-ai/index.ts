import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};

const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const outputText = (response: Record<string, unknown>) => {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [];
    for (const part of content) {
      if (typeof part.text === 'string' && part.text.trim()) return part.text.trim();
    }
  }
  const choices = Array.isArray(response.choices) ? response.choices as Array<Record<string, unknown>> : [];
  const message = choices[0]?.message;
  if (message && typeof message === 'object') {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string' && content.trim()) return content.trim();
  }
  return '';
};

const parseJsonObject = (text: string) => {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const responseShape = (response: Record<string, unknown>) => ({
  status: typeof response.status === 'string' ? response.status : null,
  hasOutputText: typeof response.output_text === 'string' && response.output_text.length > 0,
  outputCount: Array.isArray(response.output) ? response.output.length : 0,
  choicesCount: Array.isArray(response.choices) ? response.choices.length : 0,
  hasError: Boolean(response.error)
});

const callOpenAI = async (prompt: string) => {
  const model = Deno.env.get('OPENAI_MODEL')?.trim() || 'gpt-5-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredSecret('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, input: prompt, max_output_tokens: 900 })
  });
  const result = await response.json() as Record<string, unknown> & { error?: { message?: string } };
  console.log('Meta Ads AI response shape:', responseShape(result));
  if (!response.ok || result.error) throw new Error(result.error?.message || `OpenAI request failed (${response.status})`);
  return { model, parsed: parseJsonObject(outputText(result)) };
};

type InsightRow = {
  ad_account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
};

const aggregateCampaigns = (rows: InsightRow[]) => {
  const map = new Map<string, { id: string; name: string; spend: number; impressions: number; clicks: number }>();
  rows.forEach((row) => {
    const id = row.campaign_id || row.campaign_name || 'unknown';
    const current = map.get(id) || { id, name: row.campaign_name || 'Unnamed Campaign', spend: 0, impressions: 0, clicks: 0 };
    current.spend += finiteNumber(row.spend);
    current.impressions += finiteNumber(row.impressions);
    current.clicks += finiteNumber(row.clicks);
    map.set(id, current);
  });
  return Array.from(map.values()).map((row) => ({
    ...row,
    ctr: row.impressions > 0 ? row.clicks / row.impressions * 100 : 0,
    cpc: row.clicks > 0 ? row.spend / row.clicks : 0,
    cpm: row.impressions > 0 ? row.spend / row.impressions * 1000 : 0
  }));
};

const actionFallback = (metrics: { spend: number; impressions: number; clicks: number; ctr: number }) => {
  if (metrics.spend > 0 && metrics.clicks === 0) return 'pause';
  if (metrics.impressions < 500) return 'test_new_creative';
  if (metrics.ctr < 0.8) return 'reduce_budget';
  if (metrics.ctr >= 2) return 'increase_budget';
  return 'keep';
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');
    const supabase = createClient(requiredSecret('SUPABASE_URL'), requiredSecret('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false }
    });
    const { data: account } = await supabase.from('meta_ad_accounts').select('id').order('last_synced_at', { ascending: false }).limit(1).maybeSingle();
    const accountId = account?.id ? String(account.id) : null;

    if (action === 'generate_ad') {
      const product = String(body.product || '').trim();
      const goal = String(body.goal || '').trim();
      const audience = String(body.audience || '').trim();
      const budget = finiteNumber(body.budget);
      if (!product || !goal || !audience || budget <= 0) return json({ error: 'Product, goal, audience and a positive budget are required.' }, 400);

      const fallback = {
        ad_angle: `${product} for memorable bakery moments`,
        primary_text: `Make your next gathering feel more special with ${product} from Layer By Layer Bakery. Crafted for sharing, gifting and events in Klang Valley.`,
        headline: `Premium ${product} by Layer By Layer`,
        description: 'Handcrafted bakery treats for celebrations, offices and events.',
        cta: 'Send Message',
        creative_direction: `Use a clean close-up of ${product} in real packaging, natural light and the LBL black-gold visual identity.`
      };
      const prompt = `You are a Malaysian paid social copywriter for Layer By Layer Bakery. Create one Meta ad concept as JSON only.
Product: ${product}
Goal: ${goal}
Audience: ${audience}
Daily budget: RM${budget.toFixed(2)}

Return exactly these string keys: ad_angle, primary_text, headline, description, cta, creative_direction.
Use clear premium English suitable for Klang Valley. Do not invent prices, guarantees, discounts or availability. The CTA must be one standard Meta-style action. This is a draft for human approval and must not be published automatically.`;
      const { model, parsed } = await callOpenAI(prompt);
      const draft = { ...fallback, ...(parsed || {}) };
      const { data, error } = await supabase.from('meta_generated_ads').insert({
        ad_account_id: accountId,
        product,
        goal,
        audience,
        budget,
        ad_angle: String(draft.ad_angle || fallback.ad_angle),
        primary_text: String(draft.primary_text || fallback.primary_text),
        headline: String(draft.headline || fallback.headline),
        description: String(draft.description || fallback.description),
        cta: String(draft.cta || fallback.cta),
        creative_direction: String(draft.creative_direction || fallback.creative_direction),
        status: 'draft',
        human_approved: false,
        model
      }).select().single();
      if (error) throw error;
      return json({ success: true, draft: data });
    }

    const since = String(body.since || '');
    const until = String(body.until || '');
    if (!since || !until || since > until) return json({ error: 'A valid date range is required.' }, 400);
    let query = supabase.from('meta_daily_insights').select('ad_account_id,campaign_id,campaign_name,spend,impressions,clicks')
      .eq('insight_level', 'campaign').gte('date_start', since).lte('date_start', until);
    if (action === 'optimize_campaign') query = query.eq('campaign_id', String(body.campaignId || ''));
    const { data: rows, error: insightError } = await query;
    if (insightError) throw insightError;
    const campaigns = aggregateCampaigns((rows || []) as InsightRow[]);

    if (action === 'optimize_campaign') {
      const campaign = campaigns[0];
      if (!campaign) return json({ error: 'No insight data is available for this campaign and date range.' }, 404);
      const fallbackAction = actionFallback(campaign);
      const fallback = {
        recommended_action: fallbackAction,
        recommendation_reason: `Based on ${campaign.impressions} impressions, ${campaign.clicks} clicks, ${campaign.ctr.toFixed(2)}% CTR and RM${campaign.cpc.toFixed(2)} CPC. Review the recommendation before making any live change.`,
        next_7_days_plan: ['Keep current setup unchanged while reviewing the recommendation.', 'Test one creative variable at a time.', 'Review CTR, CPC and spend again after sufficient impressions.']
      };
      const prompt = `Analyze one Meta campaign for Layer By Layer Bakery. Return JSON only.
Campaign: ${campaign.name}
Spend: RM${campaign.spend.toFixed(2)}
Impressions: ${campaign.impressions}
Clicks: ${campaign.clicks}
CTR: ${campaign.ctr.toFixed(2)}%
CPC: RM${campaign.cpc.toFixed(2)}
CPM: RM${campaign.cpm.toFixed(2)}

Return: recommended_action (exactly one of keep, pause, test_new_creative, increase_budget, reduce_budget, review), recommendation_reason (string), next_7_days_plan (array of short strings).
Be conservative when data volume is low. This is read-only advice. Do not claim that any live change was made.`;
      const { model, parsed } = await callOpenAI(prompt);
      const allowed = new Set(['keep', 'pause', 'test_new_creative', 'increase_budget', 'reduce_budget', 'review']);
      const recommendedAction = allowed.has(String(parsed?.recommended_action)) ? String(parsed?.recommended_action) : fallback.recommended_action;
      const nextPlan = Array.isArray(parsed?.next_7_days_plan) ? parsed.next_7_days_plan.map(String) : fallback.next_7_days_plan;
      const { data, error } = await supabase.from('meta_ai_reports').insert({
        ad_account_id: campaign.id === 'unknown' ? accountId : (rows?.[0]?.ad_account_id || accountId),
        period_start: since,
        period_end: until,
        report_type: 'campaign_optimizer',
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        recommended_action: recommendedAction,
        recommendation_reason: String(parsed?.recommendation_reason || fallback.recommendation_reason),
        next_7_days_plan: nextPlan,
        analysis_source: 'openai_v2',
        metrics_snapshot: campaign,
        input_snapshot: { since, until, campaign_id: campaign.id },
        human_approved: false,
        model
      }).select().single();
      if (error) throw error;
      return json({ success: true, report: data });
    }

    if (action === 'analysis_summary') {
      if (!campaigns.length) return json({ error: 'No insight data is available for this date range.' }, 404);
      const eligible = campaigns.filter((campaign) => campaign.impressions >= 100);
      const best = [...(eligible.length ? eligible : campaigns)].sort((a, b) => b.ctr - a.ctr || a.cpc - b.cpc)[0];
      const weak = [...campaigns].filter((campaign) => campaign.spend > 0).sort((a, b) => a.ctr - b.ctr || b.spend - a.spend)[0] || null;
      const fallback = {
        budget_suggestions: ['Protect spend on campaigns with stable CTR and CPC.', 'Do not increase budget until a campaign has enough impressions for a reliable comparison.'],
        next_7_days_plan: ['Day 1: confirm tracking and campaign naming.', 'Days 2-4: test one new creative angle.', 'Days 5-7: compare CTR, CPC and spend before approving changes.'],
        recommended_ad_angles: ['Mini Tart: premium handcrafted variety for sharing and gifting.', 'Corporate Tea Break: convenient dessert packages for meetings and staff appreciation.']
      };
      const prompt = `Create a concise executive Meta Ads analysis for Layer By Layer Bakery from these campaign metrics:
${JSON.stringify(campaigns)}

Return JSON only with: budget_suggestions (array), next_7_days_plan (array), recommended_ad_angles (array).
The ad angles must include one for LBL Mini Tart and one for Corporate Tea Break. Advice is read-only and requires human approval. Do not claim any campaign or budget was changed.`;
      const { model, parsed } = await callOpenAI(prompt);
      const budgetSuggestions = Array.isArray(parsed?.budget_suggestions) ? parsed.budget_suggestions.map(String) : fallback.budget_suggestions;
      const nextPlan = Array.isArray(parsed?.next_7_days_plan) ? parsed.next_7_days_plan.map(String) : fallback.next_7_days_plan;
      const angles = Array.isArray(parsed?.recommended_ad_angles) ? parsed.recommended_ad_angles.map(String) : fallback.recommended_ad_angles;
      const { data, error } = await supabase.from('meta_ai_reports').insert({
        ad_account_id: rows?.[0]?.ad_account_id || accountId,
        period_start: since,
        period_end: until,
        report_type: 'summary',
        best_campaign: best,
        worst_campaign: weak,
        budget_suggestions: budgetSuggestions,
        next_7_days_plan: nextPlan,
        recommended_ad_angles: angles,
        analysis_source: 'openai_v2',
        metrics_snapshot: { campaigns },
        input_snapshot: { since, until },
        human_approved: false,
        model
      }).select().single();
      if (error) throw error;
      return json({ success: true, report: data });
    }

    return json({ error: 'Unsupported Meta Ads AI action.' }, 400);
  } catch (error) {
    console.error('Meta Ads AI failed:', error);
    return json({ error: error instanceof Error ? error.message : 'Meta Ads AI request failed.' }, 500);
  }
});
