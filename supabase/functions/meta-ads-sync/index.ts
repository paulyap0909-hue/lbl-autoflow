import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type MetaRecord = Record<string, unknown>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};

const asNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getLeadCount = (actions: unknown) => {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((highest, action) => {
    if (!action || typeof action !== 'object') return highest;
    const row = action as MetaRecord;
    const type = String(row.action_type ?? '').toLowerCase();
    return type === 'lead' || type.includes('lead_grouped') || type.endsWith('_lead')
      ? Math.max(highest, asNumber(row.value))
      : highest;
  }, 0);
};

const fetchMetaObject = async (url: URL, accessToken: string) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json() as MetaRecord & { error?: MetaRecord };
  if (!response.ok || payload.error) {
    throw new Error(String(payload.error?.message ?? `Meta API request failed (${response.status})`));
  }
  return payload;
};

const fetchMetaPages = async (url: URL, accessToken: string) => {
  const rows: MetaRecord[] = [];
  let nextUrl: string | null = url.toString();
  let pageCount = 0;

  while (nextUrl && pageCount < 100) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = await response.json() as { data?: MetaRecord[]; paging?: { next?: string }; error?: MetaRecord };
    if (!response.ok || payload.error) {
      const message = String(payload.error?.message ?? `Meta API request failed (${response.status})`);
      throw new Error(message);
    }
    rows.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;
    pageCount += 1;
  }

  return rows;
};

const metaUrl = (version: string, path: string, params: Record<string, string>) => {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    requiredSecret('META_APP_ID');
    requiredSecret('META_APP_SECRET');
    const accessToken = requiredSecret('META_ACCESS_TOKEN');
    const rawAccountId = requiredSecret('META_AD_ACCOUNT_ID').replace(/^act_/, '');
    const accountPath = `act_${rawAccountId}`;
    const graphVersion = Deno.env.get('META_GRAPH_API_VERSION')?.trim() || 'v23.0';
    const supabaseUrl = requiredSecret('SUPABASE_URL');
    const serviceRoleKey = requiredSecret('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const body = await request.json().catch(() => ({})) as { since?: string; until?: string };
    const until = /^\d{4}-\d{2}-\d{2}$/.test(body.until ?? '') ? body.until! : new Date().toISOString().slice(0, 10);
    const defaultSince = new Date(`${until}T00:00:00Z`);
    defaultSince.setUTCDate(defaultSince.getUTCDate() - 29);
    const since = /^\d{4}-\d{2}-\d{2}$/.test(body.since ?? '') ? body.since! : defaultSince.toISOString().slice(0, 10);
    const syncedAt = new Date().toISOString();

    const account = await fetchMetaObject(metaUrl(graphVersion, accountPath, {
      fields: 'id,name,currency,timezone_name,account_status'
    }), accessToken);
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
      fetchMetaPages(metaUrl(graphVersion, `${accountPath}/campaigns`, {
        fields: 'id,name,objective,status,effective_status,created_time,updated_time', limit: '500'
      }), accessToken),
      fetchMetaPages(metaUrl(graphVersion, `${accountPath}/adsets`, {
        fields: 'id,campaign_id,name,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time', limit: '500'
      }), accessToken),
      fetchMetaPages(metaUrl(graphVersion, `${accountPath}/ads`, {
        fields: 'id,campaign_id,adset_id,name,status,effective_status,created_time,updated_time', limit: '500'
      }), accessToken)
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
        daily_budget: asNumber(row.daily_budget) / 100, lifetime_budget: asNumber(row.lifetime_budget) / 100,
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

    const insightFields = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,date_start,date_stop';
    const insightLevels = ['campaign', 'adset', 'ad'] as const;
    const insightGroups = await Promise.all(insightLevels.map(async (level) => ({
      level,
      rows: await fetchMetaPages(metaUrl(graphVersion, `${accountPath}/insights`, {
        fields: insightFields,
        level,
        time_increment: '1',
        time_range: JSON.stringify({ since, until }),
        limit: '500'
      }), accessToken)
    })));

    const insightRows = insightGroups.flatMap(({ level, rows }) => rows.map((row) => ({
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
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      reach: asNumber(row.reach),
      clicks: asNumber(row.clicks),
      ctr: asNumber(row.ctr),
      cpc: asNumber(row.cpc),
      cpm: asNumber(row.cpm),
      leads: getLeadCount(row.actions),
      actions: Array.isArray(row.actions) ? row.actions : [],
      synced_at: syncedAt
    })));

    if (insightRows.length) {
      const { error } = await supabase.from('meta_ads_insights_daily').upsert(insightRows, {
        onConflict: 'ad_account_id,insight_level,date_start,date_stop,campaign_id,adset_id,ad_id'
      });
      if (error) throw error;
    }

    const campaignInsights = insightRows.filter((row) => row.insight_level === 'campaign');
    const totalSpend = campaignInsights.reduce((sum, row) => sum + row.spend, 0);
    const totalLeads = campaignInsights.reduce((sum, row) => sum + row.leads, 0);
    const totalClicks = campaignInsights.reduce((sum, row) => sum + row.clicks, 0);
    const totalImpressions = campaignInsights.reduce((sum, row) => sum + row.impressions, 0);
    const campaignTotals = new Map<string, { name: string; spend: number; leads: number; clicks: number; impressions: number }>();
    campaignInsights.forEach((row) => {
      const id = String(row.campaign_id ?? 'unknown');
      const current = campaignTotals.get(id) ?? { name: String(row.campaign_name ?? 'Unnamed Campaign'), spend: 0, leads: 0, clicks: 0, impressions: 0 };
      current.spend += row.spend; current.leads += row.leads; current.clicks += row.clicks; current.impressions += row.impressions;
      campaignTotals.set(id, current);
    });
    const ranked = Array.from(campaignTotals.values()).sort((a, b) => {
      const aCpl = a.leads > 0 ? a.spend / a.leads : Number.POSITIVE_INFINITY;
      const bCpl = b.leads > 0 ? b.spend / b.leads : Number.POSITIVE_INFINITY;
      return aCpl - bCpl;
    });
    const best = ranked.find((row) => row.leads > 0);
    const waste = [...ranked].filter((row) => row.spend > 0 && row.leads === 0).sort((a, b) => b.spend - a.spend)[0];
    const performingWell = best ? [`${best.name} generated ${best.leads} lead(s) at RM${(best.spend / best.leads).toFixed(2)} CPL.`] : ['No campaign has generated a tracked lead in this period.'];
    const wastingBudget = waste ? [`${waste.name} spent RM${waste.spend.toFixed(2)} without a tracked lead.`] : ['No obvious zero-lead budget waste detected.'];
    const suggestedActions = [
      waste ? `Review targeting and creative for ${waste.name}; pause decisions remain manual.` : 'Keep monitoring spend and lead tracking before making budget decisions.',
      totalImpressions > 0 && totalClicks / totalImpressions < 0.01 ? 'Test stronger creative or copy because account CTR is below 1%.' : 'Review winning creative and reuse its message in the next manual test.'
    ];
    const { error: reportError } = await supabase.from('meta_ads_ai_reports').insert({
      ad_account_id: accountId,
      period_start: since,
      period_end: until,
      performing_well: performingWell,
      wasting_budget: wastingBudget,
      suggested_actions: suggestedActions,
      analysis_source: 'rules_v1',
      metrics_snapshot: {
        spend: totalSpend, leads: totalLeads,
        cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
        ctr: totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0
      }
    });
    if (reportError) throw reportError;

    return json({
      success: true,
      accountId,
      period: { since, until },
      counts: { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length, insights: insightRows.length }
    });
  } catch (error) {
    console.error('Meta Ads sync failed:', error);
    return json({ error: error instanceof Error ? error.message : 'Meta Ads sync failed' }, 500);
  }
});
