import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
type MetaRow = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});
const secret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};
const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const apiUrl = (version: string, path: string, params: Record<string, string>) => {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
};
const fetchPages = async (initialUrl: URL, token: string) => {
  const rows: MetaRow[] = [];
  let next: string | null = initialUrl.toString();
  let page = 0;
  while (next && page < 100) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json() as { data?: MetaRow[]; paging?: { next?: string }; error?: { message?: string } };
    if (!response.ok || payload.error) throw new Error(payload.error?.message || `Meta API request failed (${response.status})`);
    rows.push(...(payload.data ?? []));
    next = payload.paging?.next ?? null;
    page += 1;
  }
  return rows;
};
const fetchObject = async (url: URL, token: string) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json() as MetaRow & { error?: { message?: string } };
  if (!response.ok || payload.error) throw new Error(payload.error?.message || `Meta API request failed (${response.status})`);
  return payload;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    secret('META_APP_ID');
    const token = secret('META_ACCESS_TOKEN');
    const rawAccountId = secret('META_AD_ACCOUNT_ID').replace(/^act_/, '');
    const accountPath = `act_${rawAccountId}`;
    const version = Deno.env.get('META_GRAPH_API_VERSION')?.trim() || 'v23.0';
    const supabase = createClient(secret('SUPABASE_URL'), secret('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false }
    });
    const input = await request.json().catch(() => ({})) as { since?: string; until?: string };
    const until = /^\d{4}-\d{2}-\d{2}$/.test(input.until ?? '') ? input.until! : new Date().toISOString().slice(0, 10);
    const sinceDate = new Date(`${until}T00:00:00Z`);
    sinceDate.setUTCDate(sinceDate.getUTCDate() - 29);
    const since = /^\d{4}-\d{2}-\d{2}$/.test(input.since ?? '') ? input.since! : sinceDate.toISOString().slice(0, 10);
    const syncedAt = new Date().toISOString();

    const account = await fetchObject(apiUrl(version, accountPath, {
      fields: 'id,name,currency,timezone_name,account_status'
    }), token);
    const accountId = String(account.id ?? rawAccountId).replace(/^act_/, '');
    const { error: accountError } = await supabase.from('meta_ad_accounts').upsert({
      id: accountId,
      name: String(account.name ?? `Meta Ad Account ${accountId}`),
      currency: account.currency ?? null,
      timezone_name: account.timezone_name ?? null,
      account_status: account.account_status ?? null,
      last_synced_at: syncedAt,
      updated_at: syncedAt
    });
    if (accountError) throw accountError;

    const [campaigns, adsets, ads] = await Promise.all([
      fetchPages(apiUrl(version, `${accountPath}/campaigns`, {
        fields: 'id,name,objective,status,effective_status,created_time,updated_time', limit: '500'
      }), token),
      fetchPages(apiUrl(version, `${accountPath}/adsets`, {
        fields: 'id,campaign_id,name,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time', limit: '500'
      }), token),
      fetchPages(apiUrl(version, `${accountPath}/ads`, {
        fields: 'id,campaign_id,adset_id,name,status,effective_status,created_time,updated_time', limit: '500'
      }), token)
    ]);

    if (campaigns.length) {
      const { error } = await supabase.from('meta_campaigns').upsert(campaigns.map((row) => ({
        id: String(row.id), ad_account_id: accountId, name: String(row.name ?? 'Campaign'),
        objective: row.objective ?? null, status: row.status ?? null, effective_status: row.effective_status ?? null,
        meta_created_time: row.created_time ?? null, meta_updated_time: row.updated_time ?? null, synced_at: syncedAt
      })));
      if (error) throw error;
    }
    if (adsets.length) {
      const { error } = await supabase.from('meta_adsets').upsert(adsets.map((row) => ({
        id: String(row.id), ad_account_id: accountId, campaign_id: row.campaign_id ?? null,
        name: String(row.name ?? 'Ad Set'), status: row.status ?? null, effective_status: row.effective_status ?? null,
        optimization_goal: row.optimization_goal ?? null, billing_event: row.billing_event ?? null,
        daily_budget: numeric(row.daily_budget) / 100, lifetime_budget: numeric(row.lifetime_budget) / 100,
        start_time: row.start_time ?? null, end_time: row.end_time ?? null,
        meta_created_time: row.created_time ?? null, meta_updated_time: row.updated_time ?? null, synced_at: syncedAt
      })));
      if (error) throw error;
    }
    if (ads.length) {
      const { error } = await supabase.from('meta_ads').upsert(ads.map((row) => ({
        id: String(row.id), ad_account_id: accountId, campaign_id: row.campaign_id ?? null,
        adset_id: row.adset_id ?? null, name: String(row.name ?? 'Ad'), status: row.status ?? null,
        effective_status: row.effective_status ?? null, meta_created_time: row.created_time ?? null,
        meta_updated_time: row.updated_time ?? null, synced_at: syncedAt
      })));
      if (error) throw error;
    }

    const levels = ['campaign', 'adset', 'ad'] as const;
    const groups = await Promise.all(levels.map(async (level) => ({
      level,
      rows: await fetchPages(apiUrl(version, `${accountPath}/insights`, {
        fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,ctr,cpc,cpm,spend,date_start,date_stop',
        level,
        time_increment: '1',
        time_range: JSON.stringify({ since, until }),
        limit: '500'
      }), token)
    })));
    const insightRows = groups.flatMap(({ level, rows }) => rows.map((row) => ({
      ad_account_id: accountId,
      insight_level: level,
      campaign_id: row.campaign_id ?? null,
      campaign_name: row.campaign_name ?? null,
      adset_id: row.adset_id ?? null,
      adset_name: row.adset_name ?? null,
      ad_id: row.ad_id ?? null,
      ad_name: row.ad_name ?? null,
      date_start: row.date_start,
      date_stop: row.date_stop,
      impressions: numeric(row.impressions),
      clicks: numeric(row.clicks),
      ctr: numeric(row.ctr),
      cpc: numeric(row.cpc),
      cpm: numeric(row.cpm),
      spend: numeric(row.spend),
      synced_at: syncedAt
    })));
    if (insightRows.length) {
      const { error } = await supabase.from('meta_daily_insights').upsert(insightRows, {
        onConflict: 'ad_account_id,insight_level,date_start,date_stop,campaign_id,adset_id,ad_id'
      });
      if (error) throw error;
    }

    const campaignTotals = new Map<string, { name: string; spend: number; clicks: number; impressions: number }>();
    insightRows.filter((row) => row.insight_level === 'campaign').forEach((row) => {
      const key = String(row.campaign_id ?? row.campaign_name ?? 'unknown');
      const current = campaignTotals.get(key) ?? { name: String(row.campaign_name ?? 'Unnamed Campaign'), spend: 0, clicks: 0, impressions: 0 };
      current.spend += row.spend; current.clicks += row.clicks; current.impressions += row.impressions;
      campaignTotals.set(key, current);
    });
    const ranked = Array.from(campaignTotals.values()).map((row) => ({
      ...row,
      ctr: row.impressions > 0 ? row.clicks / row.impressions * 100 : 0,
      cpc: row.clicks > 0 ? row.spend / row.clicks : 0
    }));
    const best = [...ranked].filter((row) => row.impressions >= 100).sort((a, b) => b.ctr - a.ctr || a.cpc - b.cpc)[0] ?? null;
    const worst = [...ranked].filter((row) => row.spend > 0).sort((a, b) => a.ctr - b.ctr || b.spend - a.spend)[0] ?? null;
    const totalSpend = ranked.reduce((sum, row) => sum + row.spend, 0);
    const totalClicks = ranked.reduce((sum, row) => sum + row.clicks, 0);
    const totalImpressions = ranked.reduce((sum, row) => sum + row.impressions, 0);
    const suggestions = [
      best ? `Consider using ${best.name} as the creative benchmark; any budget change remains manual.` : 'Collect more impressions before identifying a reliable winner.',
      worst && worst.ctr < 1 ? `Review ${worst.name} because CTR is below 1%; do not change budget without staff approval.` : 'No immediate low-CTR budget warning detected.',
      'Check tracking and campaign objectives before moving budget between campaigns.'
    ];
    const { error: reportError } = await supabase.from('meta_ai_reports').insert({
      ad_account_id: accountId,
      period_start: since,
      period_end: until,
      best_campaign: best,
      worst_campaign: worst,
      budget_suggestions: suggestions,
      analysis_source: 'rules_v1',
      metrics_snapshot: {
        spend: totalSpend,
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0,
        cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        cpm: totalImpressions > 0 ? totalSpend / totalImpressions * 1000 : 0
      }
    });
    if (reportError) throw reportError;

    return json({
      success: true,
      period: { since, until },
      counts: { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length, insights: insightRows.length }
    });
  } catch (error) {
    console.error('Meta insights sync failed:', error);
    return json({ error: error instanceof Error ? error.message : 'Meta insights sync failed' }, 500);
  }
});
