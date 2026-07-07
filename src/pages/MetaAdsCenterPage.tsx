import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CircleDollarSign,
  Eye,
  Gauge,
  Lightbulb,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
} from 'lucide-react';
import Toast from '../components/Toast';
import {
  generateMetaAd,
  generateMetaAnalysisSummary,
  loadMetaAdsCenterData,
  optimizeMetaCampaign,
  syncMetaAdsInsights,
  type MetaAdsAccount,
  type MetaAnalysisSummary,
  type MetaCampaignOptimization,
  type MetaGeneratedAd,
  type MetaAdsInsight,
  type MetaAdsReport
} from '../services/metaAdsService';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';

const money = (value: number) => new Intl.NumberFormat('en-MY', {
  style: 'currency', currency: 'MYR', minimumFractionDigits: 2
}).format(Number.isFinite(value) ? value : 0);

const number = (value: number) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 }).format(value || 0);
const percentage = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;

const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

type CampaignTotal = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
};

function KpiCard({ label, value, note, icon: Icon, tone = 'text-[#C8A96B]' }: {
  label: string;
  value: string;
  note: string;
  icon: typeof BarChart3;
  tone?: string;
}) {
  return (
    <article className="rounded-xl border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 truncate text-xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-[11px] text-slate-500">{note}</p>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] ${tone}`}>
          <Icon size={16} />
        </span>
      </div>
    </article>
  );
}

export default function MetaAdsCenterPage() {
  const today = getMalaysiaDateTimeInputs().date;
  const [since, setSince] = useState(() => addDays(today, -29));
  const [until, setUntil] = useState(today);
  const [account, setAccount] = useState<MetaAdsAccount | null>(null);
  const [insights, setInsights] = useState<MetaAdsInsight[]>([]);
  const [report, setReport] = useState<MetaAdsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [aiBusy, setAiBusy] = useState<'generator' | 'optimizer' | 'summary' | null>(null);
  const [adInput, setAdInput] = useState({ product: 'LBL Mini Tart', goal: 'Generate enquiries', audience: 'Companies and event organisers in Klang Valley', budget: '50' });
  const [generatedAd, setGeneratedAd] = useState<MetaGeneratedAd | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [optimization, setOptimization] = useState<MetaCampaignOptimization | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<MetaAnalysisSummary | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadMetaAdsCenterData();
      setAccount(data.account);
      setInsights(data.insights);
      setReport(data.report);
    } catch (loadError) {
      console.error('Meta Ads Center load failed:', loadError);
      const message = loadError instanceof Error ? loadError.message : String((loadError as { message?: string })?.message || 'Unable to load Meta Ads data.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const visibleInsights = useMemo(
    () => insights.filter((row) => row.dateStart >= since && row.dateStart <= until),
    [insights, since, until]
  );

  const campaignTotals = useMemo(() => {
    const totals = new Map<string, Omit<CampaignTotal, 'ctr' | 'cpc' | 'cpm' | 'cpl'>>();
    visibleInsights.forEach((row) => {
      const key = row.campaignId || row.campaignName;
      const current = totals.get(key) ?? {
        id: key, name: row.campaignName, spend: 0, impressions: 0, clicks: 0
      };
      current.spend += row.spend;
      current.impressions += row.impressions;
      current.clicks += row.clicks;
      totals.set(key, current);
    });
    return Array.from(totals.values()).map<CampaignTotal>((row) => ({
      ...row,
      ctr: row.impressions > 0 ? row.clicks / row.impressions * 100 : 0,
      cpc: row.clicks > 0 ? row.spend / row.clicks : 0,
      cpm: row.impressions > 0 ? row.spend / row.impressions * 1000 : 0,
      cpl: 0
    })).sort((a, b) => b.spend - a.spend);
  }, [visibleInsights]);

  const totals = useMemo(() => {
    const aggregate = campaignTotals.reduce((sum, row) => ({
      spend: sum.spend + row.spend,
      clicks: sum.clicks + row.clicks,
      impressions: sum.impressions + row.impressions
    }), { spend: 0, clicks: 0, impressions: 0 });
    return {
      ...aggregate,
      ctr: aggregate.impressions > 0 ? aggregate.clicks / aggregate.impressions * 100 : 0,
      cpc: aggregate.clicks > 0 ? aggregate.spend / aggregate.clicks : 0,
      cpm: aggregate.impressions > 0 ? aggregate.spend / aggregate.impressions * 1000 : 0
    };
  }, [campaignTotals]);

  const bestCampaign = useMemo(() => [...campaignTotals]
    .filter((row) => row.impressions >= 100)
    .sort((a, b) => b.ctr - a.ctr || a.cpc - b.cpc)[0] ?? null, [campaignTotals]);
  const worstCampaign = useMemo(() => [...campaignTotals]
    .filter((row) => row.spend > 0)
    .sort((a, b) => {
      return a.ctr - b.ctr || b.spend - a.spend;
    })[0] ?? null, [campaignTotals]);

  const sync = async () => {
    if (!since || !until || since > until) {
      setToast({ message: 'Choose a valid date range.', type: 'error' });
      return;
    }
    setSyncing(true);
    try {
      const result = await syncMetaAdsInsights(since, until);
      await loadData();
      setToast({ message: `Meta data synced: ${result.counts.insights} daily insight rows.`, type: 'success' });
    } catch (syncError) {
      console.error('Meta Ads sync failed:', syncError);
      setToast({ message: syncError instanceof Error ? syncError.message : 'Meta Ads sync failed.', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!selectedCampaignId && campaignTotals[0]?.id) setSelectedCampaignId(campaignTotals[0].id);
  }, [campaignTotals, selectedCampaignId]);

  const runAdGenerator = async () => {
    const budget = Number(adInput.budget);
    if (!adInput.product.trim() || !adInput.goal.trim() || !adInput.audience.trim() || !Number.isFinite(budget) || budget <= 0) {
      setToast({ message: 'Complete the product, goal, audience and budget fields.', type: 'error' });
      return;
    }
    setAiBusy('generator');
    try {
      setGeneratedAd(await generateMetaAd({ ...adInput, budget }));
      setToast({ message: 'Ad draft generated and saved for human review.', type: 'success' });
    } catch (generationError) {
      console.error('Meta ad generation failed:', generationError);
      setToast({ message: generationError instanceof Error ? generationError.message : 'Unable to generate ad draft.', type: 'error' });
    } finally {
      setAiBusy(null);
    }
  };

  const runOptimizer = async () => {
    if (!selectedCampaignId) return;
    setAiBusy('optimizer');
    try {
      setOptimization(await optimizeMetaCampaign({ campaignId: selectedCampaignId, since, until }));
      setToast({ message: 'Campaign recommendation saved. No live ad was changed.', type: 'success' });
    } catch (optimizationError) {
      console.error('Meta campaign optimization failed:', optimizationError);
      setToast({ message: optimizationError instanceof Error ? optimizationError.message : 'Unable to analyze campaign.', type: 'error' });
    } finally {
      setAiBusy(null);
    }
  };

  const runAnalysisSummary = async () => {
    setAiBusy('summary');
    try {
      setAnalysisSummary(await generateMetaAnalysisSummary(since, until));
      setToast({ message: 'AI analysis summary saved for review.', type: 'success' });
    } catch (summaryError) {
      console.error('Meta analysis summary failed:', summaryError);
      setToast({ message: summaryError instanceof Error ? summaryError.message : 'Unable to generate analysis summary.', type: 'error' });
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

      <section className="rounded-2xl border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C8A96B]">Paid Media Intelligence</p>
            <h1 className="mt-1.5 text-2xl font-semibold text-white">Meta Ads Center</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-400">Monitor campaign performance, lead efficiency and budget signals without changing live ads.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">From
              <input type="date" value={since} onChange={(event) => setSince(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs text-white" />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">To
              <input type="date" value={until} max={today} onChange={(event) => setUntil(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs text-white" />
            </label>
            <button type="button" onClick={sync} disabled={syncing} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#C8A96B] px-4 text-xs font-semibold text-black disabled:opacity-50">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing...' : 'Sync Meta Data'}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="rounded-full border border-[#334155] bg-[#0F172A] px-2.5 py-1">Read-only</span>
          <span className="rounded-full border border-[#334155] bg-[#0F172A] px-2.5 py-1">{account?.name || 'Account not synced'}</span>
          <span className="rounded-full border border-[#334155] bg-[#0F172A] px-2.5 py-1">Last sync: {account?.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString('en-MY') : 'Never'}</span>
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" /><div><p className="text-sm font-semibold text-amber-100">Meta Ads database setup required</p><p className="mt-1 text-xs leading-5 text-amber-200/75">{error}</p></div></div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Spend" value={money(totals.spend)} note={`${since} to ${until}`} icon={CircleDollarSign} />
        <KpiCard label="CTR" value={percentage(totals.ctr)} note="Clicks / impressions" icon={Gauge} tone="text-sky-300" />
        <KpiCard label="CPC" value={money(totals.cpc)} note="Spend / clicks" icon={MousePointerClick} />
        <KpiCard label="CPM" value={money(totals.cpm)} note="Cost per 1,000 impressions" icon={BarChart3} />
        <KpiCard label="Clicks" value={number(totals.clicks)} note={`${number(totals.impressions)} impressions`} icon={MousePointerClick} tone="text-emerald-300" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#334155] bg-[#111111] shadow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Campaign Performance</p><p className="mt-1 text-xs text-slate-500">Daily insights aggregated by campaign</p></div>
            <Megaphone size={18} className="text-[#C8A96B]" />
          </div>
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-white/5" />)}</div>
          ) : campaignTotals.length ? (
            <div className="divide-y divide-[#263348]">
              {campaignTotals.map((campaign) => (
                <article key={campaign.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1.5fr)_repeat(6,minmax(70px,0.6fr))] lg:items-center">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{campaign.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{number(campaign.clicks)} clicks · {number(campaign.impressions)} impressions</p></div>
                  {[
                    ['Spend', money(campaign.spend)], ['Clicks', number(campaign.clicks)], ['Impressions', number(campaign.impressions)],
                    ['CTR', percentage(campaign.ctr)], ['CPC', money(campaign.cpc)], ['CPM', money(campaign.cpm)]
                  ].map(([label, value]) => <div key={label}><p className="text-[9px] uppercase text-slate-600">{label}</p><p className="mt-1 text-xs font-semibold text-slate-200">{value}</p></div>)}
                </article>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center"><Eye size={24} className="mx-auto text-slate-600" /><p className="mt-3 text-sm font-semibold text-white">No Meta Ads data yet</p><p className="mt-1 text-xs text-slate-500">Apply the migration, configure Edge Function secrets, then sync the account.</p></div>
          )}
        </section>

        <section className="rounded-2xl border border-[#334155] bg-[#111111] p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">AI Analysis</p><p className="mt-1 text-xs text-slate-500">Rule-based V1 · advisory only</p></div><BrainCircuit size={19} className="text-[#C8A96B]" /></div>
          <div className="mt-4 space-y-4">
            {[
              ['Best Campaign', report?.bestCampaign?.name ? [`${report.bestCampaign.name} · CTR ${percentage(Number(report.bestCampaign.ctr) || 0)} · CPC ${money(Number(report.bestCampaign.cpc) || 0)}`] : bestCampaign ? [`${bestCampaign.name} · CTR ${percentage(bestCampaign.ctr)} · CPC ${money(bestCampaign.cpc)}`] : [], 'border-emerald-500/20 bg-emerald-500/5'],
              ['Worst Campaign', report?.worstCampaign?.name ? [`${report.worstCampaign.name} · CTR ${percentage(Number(report.worstCampaign.ctr) || 0)} · Spend ${money(Number(report.worstCampaign.spend) || 0)}`] : worstCampaign ? [`${worstCampaign.name} · CTR ${percentage(worstCampaign.ctr)} · Spend ${money(worstCampaign.spend)}`] : [], 'border-rose-500/20 bg-rose-500/5'],
              ['Budget Suggestions', report?.budgetSuggestions || [], 'border-[#C8A96B]/25 bg-[#C8A96B]/5']
            ].map(([title, items, className]) => (
              <div key={String(title)} className={`rounded-xl border p-3 ${className}`}>
                <p className="text-xs font-semibold text-white">{String(title)}</p>
                <ul className="mt-2 space-y-2">{(items as string[]).length ? (items as string[]).map((item) => <li key={item} className="text-xs leading-5 text-slate-300">{item}</li>) : <li className="text-xs text-slate-500">Sync data to generate analysis.</li>}</ul>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-[#334155] bg-[#0F172A] px-3 py-2 text-[11px] leading-5 text-slate-500">No campaign, ad set, ad or budget changes are performed by this module.</p>
        </section>
      </div>

      <section className="rounded-2xl border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C8A96B]">AI Ads Workbench V2</p>
            <h2 className="mt-1.5 text-lg font-semibold text-white">Draft, analyze and plan with human approval</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">AI outputs are saved internally. Nothing is published or changed in Meta.</p>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-300"><ShieldCheck size={14} /> Read-only analysis</span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <article className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">AI Ad Generator</p><p className="mt-1 text-[11px] text-slate-500">Create an internal ad draft.</p></div><WandSparkles size={18} className="text-[#C8A96B]" /></div>
            <div className="mt-4 grid gap-3">
              {([
                ['Product', 'product', 'LBL Mini Tart'],
                ['Goal', 'goal', 'Generate enquiries'],
                ['Audience', 'audience', 'Companies in Klang Valley']
              ] as const).map(([label, key, placeholder]) => (
                <label key={key} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}
                  <input value={adInput[key]} onChange={(event) => setAdInput((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} className="mt-1.5 h-9 w-full rounded-lg border border-[#334155] bg-[#111111] px-3 text-xs text-white outline-none focus:border-[#C8A96B]" />
                </label>
              ))}
              <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Daily Budget (RM)
                <input type="number" min="1" step="1" value={adInput.budget} onChange={(event) => setAdInput((current) => ({ ...current, budget: event.target.value }))} className="mt-1.5 h-9 w-full rounded-lg border border-[#334155] bg-[#111111] px-3 text-xs text-white outline-none focus:border-[#C8A96B]" />
              </label>
              <button type="button" onClick={runAdGenerator} disabled={aiBusy !== null} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#C8A96B] px-4 text-xs font-semibold text-black disabled:opacity-50"><Sparkles size={14} /> {aiBusy === 'generator' ? 'Generating...' : 'Generate Draft'}</button>
            </div>
            {generatedAd ? (
              <div className="mt-4 space-y-3 rounded-xl border border-[#C8A96B]/20 bg-[#C8A96B]/5 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#E7D5A8]">Saved Draft</p><span className="rounded-full bg-white/5 px-2 py-1 text-[9px] uppercase text-slate-400">Human review</span></div>
                {[
                  ['Angle', generatedAd.adAngle], ['Primary Text', generatedAd.primaryText], ['Headline', generatedAd.headline],
                  ['Description', generatedAd.description], ['CTA', generatedAd.cta], ['Creative Direction', generatedAd.creativeDirection]
                ].map(([label, value]) => <div key={label}><p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">{label}</p><p className="mt-1 text-xs leading-5 text-slate-200">{value}</p></div>)}
              </div>
            ) : null}
          </article>

          <article className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">AI Ad Optimizer</p><p className="mt-1 text-[11px] text-slate-500">Analyze one existing campaign.</p></div><Target size={18} className="text-sky-300" /></div>
            <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Campaign
              <select value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-[#334155] bg-[#111111] px-3 text-xs text-white outline-none focus:border-[#C8A96B]">
                <option value="">Select campaign</option>
                {campaignTotals.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={runOptimizer} disabled={aiBusy !== null || !selectedCampaignId} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-4 text-xs font-semibold text-sky-200 disabled:opacity-50"><BrainCircuit size={14} /> {aiBusy === 'optimizer' ? 'Analyzing...' : 'Analyze Campaign'}</button>
            {optimization ? (
              <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Recommendation</p>
                <p className="mt-1 text-sm font-semibold capitalize text-sky-200">{optimization.recommendedAction.replace(/_/g, ' ')}</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">{optimization.recommendationReason}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">{[['Spend', money(optimization.metrics.spend)], ['CTR', percentage(optimization.metrics.ctr)], ['CPC', money(optimization.metrics.cpc)]].map(([label, value]) => <div key={label} className="rounded-lg bg-black/20 p-2"><p className="text-[9px] text-slate-600">{label}</p><p className="mt-1 text-xs font-semibold text-white">{value}</p></div>)}</div>
                <ul className="mt-3 space-y-1.5">{optimization.next7DaysPlan.map((item) => <li key={item} className="text-[11px] leading-5 text-slate-400">• {item}</li>)}</ul>
              </div>
            ) : <p className="mt-4 text-[11px] leading-5 text-slate-600">Recommendations are advisory: keep, pause, test creative, increase budget or reduce budget.</p>}
          </article>

          <article className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">AI Ads Analysis Summary</p><p className="mt-1 text-[11px] text-slate-500">Current range: {since} to {until}</p></div><Lightbulb size={18} className="text-amber-300" /></div>
            <button type="button" onClick={runAnalysisSummary} disabled={aiBusy !== null || campaignTotals.length === 0} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-4 text-xs font-semibold text-[#E7D5A8] disabled:opacity-50"><Sparkles size={14} /> {aiBusy === 'summary' ? 'Building Plan...' : 'Generate Analysis Summary'}</button>
            {analysisSummary ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-2.5"><p className="text-[9px] uppercase text-emerald-300/70">Best</p><p className="mt-1 text-xs font-semibold text-white">{analysisSummary.bestCampaign?.name || 'No data'}</p></div>
                  <div className="rounded-lg border border-rose-500/15 bg-rose-500/5 p-2.5"><p className="text-[9px] uppercase text-rose-300/70">Weak</p><p className="mt-1 text-xs font-semibold text-white">{analysisSummary.weakCampaign?.name || 'No data'}</p></div>
                </div>
                {[
                  ['Budget Suggestions', analysisSummary.budgetSuggestions],
                  ['Next 7 Days', analysisSummary.next7DaysPlan],
                  ['Recommended Ad Angles', analysisSummary.recommendedAdAngles]
                ].map(([label, items]) => <div key={String(label)}><p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">{String(label)}</p><ul className="mt-1.5 space-y-1.5">{(items as string[]).map((item) => <li key={item} className="text-[11px] leading-5 text-slate-300">• {item}</li>)}</ul></div>)}
              </div>
            ) : <p className="mt-4 text-[11px] leading-5 text-slate-600">Uses only the insight rows loaded for this date range. No fake performance metrics are generated.</p>}
          </article>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-100/75"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />Human approval is required before any ad, campaign or budget decision. This module cannot publish ads or change live campaign settings.</div>
      </section>
    </div>
  );
}
