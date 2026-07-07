import { supabase } from '../lib/supabase';

export type MetaAdsInsight = {
  id: string;
  campaignId: string;
  campaignName: string;
  dateStart: string;
  dateStop: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
};

export type MetaAdsReport = {
  id: string;
  periodStart: string;
  periodEnd: string;
  bestCampaign: { name?: string; spend?: number; ctr?: number; cpc?: number } | null;
  worstCampaign: { name?: string; spend?: number; ctr?: number; cpc?: number } | null;
  budgetSuggestions: string[];
  analysisSource: string;
  createdAt: string;
};

export type MetaAdsAccount = {
  id: string;
  name: string;
  currency: string;
  timezoneName: string;
  lastSyncedAt: string;
};

export type MetaGeneratedAd = {
  id: string;
  product: string;
  goal: string;
  audience: string;
  budget: number;
  adAngle: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  creativeDirection: string;
  status: string;
  humanApproved: boolean;
  createdAt: string;
};

export type MetaCampaignOptimization = {
  id: string;
  campaignId: string;
  campaignName: string;
  recommendedAction: 'keep' | 'pause' | 'test_new_creative' | 'increase_budget' | 'reduce_budget' | 'review';
  recommendationReason: string;
  next7DaysPlan: string[];
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
};

export type MetaAnalysisSummary = {
  id: string;
  bestCampaign: { name?: string; spend?: number; ctr?: number; cpc?: number } | null;
  weakCampaign: { name?: string; spend?: number; ctr?: number; cpc?: number } | null;
  budgetSuggestions: string[];
  next7DaysPlan: string[];
  recommendedAdAngles: string[];
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadMetaAdsCenterData() {
  const [accountResult, insightsResult, reportResult] = await Promise.all([
    supabase.from('meta_ad_accounts').select('*').order('last_synced_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('meta_daily_insights').select('*').eq('insight_level', 'campaign').order('date_start', { ascending: true }),
    supabase.from('meta_ai_reports').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  const errors = [accountResult.error, insightsResult.error, reportResult.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const accountRow = accountResult.data;
  const reportRow = reportResult.data;
  return {
    account: accountRow ? {
      id: String(accountRow.id),
      name: String(accountRow.name || 'Meta Ad Account'),
      currency: String(accountRow.currency || 'MYR'),
      timezoneName: String(accountRow.timezone_name || ''),
      lastSyncedAt: String(accountRow.last_synced_at || '')
    } satisfies MetaAdsAccount : null,
    insights: (insightsResult.data ?? []).map((row) => ({
      id: String(row.id),
      campaignId: String(row.campaign_id || ''),
      campaignName: String(row.campaign_name || 'Unnamed Campaign'),
      dateStart: String(row.date_start || ''),
      dateStop: String(row.date_stop || ''),
      spend: numberValue(row.spend),
      impressions: numberValue(row.impressions),
      clicks: numberValue(row.clicks),
      ctr: numberValue(row.ctr),
      cpc: numberValue(row.cpc),
      cpm: numberValue(row.cpm),
    })) satisfies MetaAdsInsight[],
    report: reportRow ? {
      id: String(reportRow.id),
      periodStart: String(reportRow.period_start || ''),
      periodEnd: String(reportRow.period_end || ''),
      bestCampaign: reportRow.best_campaign && typeof reportRow.best_campaign === 'object' ? reportRow.best_campaign as MetaAdsReport['bestCampaign'] : null,
      worstCampaign: reportRow.worst_campaign && typeof reportRow.worst_campaign === 'object' ? reportRow.worst_campaign as MetaAdsReport['worstCampaign'] : null,
      budgetSuggestions: Array.isArray(reportRow.budget_suggestions) ? reportRow.budget_suggestions.map(String) : [],
      analysisSource: String(reportRow.analysis_source || 'rules_v1'),
      createdAt: String(reportRow.created_at || '')
    } satisfies MetaAdsReport : null
  };
}

export async function syncMetaAdsInsights(since: string, until: string) {
  const { data, error } = await supabase.functions.invoke('sync-meta-insights', {
    body: { since, until }
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as {
    success: boolean;
    counts: { campaigns: number; adsets: number; ads: number; insights: number };
  };
}

const invokeMetaAdsAI = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('meta-ads-ai', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as Record<string, unknown>;
};

export async function generateMetaAd(input: { product: string; goal: string; audience: string; budget: number }) {
  const data = await invokeMetaAdsAI({ action: 'generate_ad', ...input });
  const row = data.draft as Record<string, unknown>;
  return {
    id: String(row.id),
    product: String(row.product || ''),
    goal: String(row.goal || ''),
    audience: String(row.audience || ''),
    budget: numberValue(row.budget),
    adAngle: String(row.ad_angle || ''),
    primaryText: String(row.primary_text || ''),
    headline: String(row.headline || ''),
    description: String(row.description || ''),
    cta: String(row.cta || ''),
    creativeDirection: String(row.creative_direction || ''),
    status: String(row.status || 'draft'),
    humanApproved: Boolean(row.human_approved),
    createdAt: String(row.created_at || '')
  } satisfies MetaGeneratedAd;
}

export async function optimizeMetaCampaign(input: { campaignId: string; since: string; until: string }) {
  const data = await invokeMetaAdsAI({ action: 'optimize_campaign', ...input });
  const row = data.report as Record<string, unknown>;
  const metrics = row.metrics_snapshot && typeof row.metrics_snapshot === 'object'
    ? row.metrics_snapshot as Record<string, unknown>
    : {};
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id || ''),
    campaignName: String(row.campaign_name || 'Unnamed Campaign'),
    recommendedAction: String(row.recommended_action || 'review') as MetaCampaignOptimization['recommendedAction'],
    recommendationReason: String(row.recommendation_reason || ''),
    next7DaysPlan: Array.isArray(row.next_7_days_plan) ? row.next_7_days_plan.map(String) : [],
    metrics: {
      spend: numberValue(metrics.spend),
      impressions: numberValue(metrics.impressions),
      clicks: numberValue(metrics.clicks),
      ctr: numberValue(metrics.ctr),
      cpc: numberValue(metrics.cpc),
      cpm: numberValue(metrics.cpm)
    }
  } satisfies MetaCampaignOptimization;
}

export async function generateMetaAnalysisSummary(since: string, until: string) {
  const data = await invokeMetaAdsAI({ action: 'analysis_summary', since, until });
  const row = data.report as Record<string, unknown>;
  return {
    id: String(row.id),
    bestCampaign: row.best_campaign && typeof row.best_campaign === 'object' ? row.best_campaign as MetaAnalysisSummary['bestCampaign'] : null,
    weakCampaign: row.worst_campaign && typeof row.worst_campaign === 'object' ? row.worst_campaign as MetaAnalysisSummary['weakCampaign'] : null,
    budgetSuggestions: Array.isArray(row.budget_suggestions) ? row.budget_suggestions.map(String) : [],
    next7DaysPlan: Array.isArray(row.next_7_days_plan) ? row.next_7_days_plan.map(String) : [],
    recommendedAdAngles: Array.isArray(row.recommended_ad_angles) ? row.recommended_ad_angles.map(String) : []
  } satisfies MetaAnalysisSummary;
}
