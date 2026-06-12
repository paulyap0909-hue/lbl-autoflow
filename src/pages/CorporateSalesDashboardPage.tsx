import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Flame,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Send,
  Snowflake,
  Target,
  ThermometerSun
} from 'lucide-react';
import Toast from '../components/Toast';
import {
  createLeadActivityInSupabase,
  loadSalesLeadsFromSupabase,
  updateSalesLeadInSupabase,
  type SalesLead,
  type SalesLeadPriority,
  type SalesLeadStatus,
  type SalesLeadType
} from '../services/salesLeadService';
import { formatRM, toSafeNumber } from '../utils/pricing';

type PipelineStage =
  | 'New Lead'
  | 'Contacted'
  | 'Interested'
  | 'Quotation Sent'
  | 'Follow Up'
  | 'Won'
  | 'Lost';

type PriorityFilter = 'All' | SalesLeadPriority;
type TypeFilter = 'All' | SalesLeadType;
type StageFilter = 'All' | PipelineStage;

const PIPELINE_STAGES: PipelineStage[] = [
  'New Lead',
  'Contacted',
  'Interested',
  'Quotation Sent',
  'Follow Up',
  'Won',
  'Lost'
];

const LEAD_TYPES: SalesLeadType[] = [
  'Corporate',
  'Event Planner',
  'Wedding Planner',
  'Cafe',
  'Hotel',
  'School',
  'Government',
  'Other'
];

const CORPORATE_WHATSAPP_MESSAGE = `Hi, this is Selina from Layer By Layer Bakery ☺️

May I know who is the right person to contact regarding office tea breaks, staff gatherings, corporate gifting or event dessert arrangements?

We prepare premium mini tarts for company events, meetings and celebrations.`;

const todayKey = () => new Date().toISOString().slice(0, 10);

const normalizeMalaysiaPhone = (phone: string) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const getCurrentUserLabel = () => {
  try {
    const currentUser = JSON.parse(localStorage.getItem('lbl_currentUser') || '{}') as {
      email?: string;
      role?: string;
    };
    return currentUser.email || currentUser.role || 'Unknown user';
  } catch {
    return 'Unknown user';
  }
};

const stageFromStatus = (status: SalesLeadStatus): PipelineStage | null => {
  if (status === 'New') return 'New Lead';
  if (status === 'Contacted') return 'Contacted';
  if (status === 'Interested') return 'Interested';
  if (status === 'Quoted') return 'Quotation Sent';
  if (status === 'Sample Scheduled') return 'Follow Up';
  if (status === 'Won') return 'Won';
  if (status === 'Lost') return 'Lost';
  return null;
};

const statusFromStage = (stage: PipelineStage): SalesLeadStatus => {
  if (stage === 'New Lead') return 'New';
  if (stage === 'Quotation Sent') return 'Quoted';
  if (stage === 'Follow Up') return 'Sample Scheduled';
  return stage;
};

const stageTone = (stage: PipelineStage) => {
  if (stage === 'Won') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (stage === 'Lost') return 'border-rose-400/25 bg-rose-400/10 text-rose-300';
  if (stage === 'Quotation Sent') return 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E]';
  if (stage === 'Interested') return 'border-sky-400/25 bg-sky-400/10 text-sky-300';
  if (stage === 'Follow Up') return 'border-violet-400/25 bg-violet-400/10 text-violet-300';
  if (stage === 'Contacted') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  return 'border-[#475569] bg-[#1E293B] text-[#CBD5E1]';
};

const priorityTone = (priority: SalesLeadPriority) => {
  if (priority === 'Hot') return 'border-rose-400/25 bg-rose-400/10 text-rose-300';
  if (priority === 'Warm') return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
  return 'border-sky-400/20 bg-sky-400/10 text-sky-300';
};

const isFollowUpDue = (lead: SalesLead) =>
  Boolean(lead.nextFollowUpDate) &&
  lead.nextFollowUpDate <= todayKey() &&
  !['Won', 'Lost', 'Archived'].includes(lead.status);

const hasNoActivity = (lead: SalesLead) =>
  !lead.lastContactDate && lead.messagesSent <= 0 && lead.status === 'New';

function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof Building2;
  tone: string;
}) {
  return (
    <article className="ds-card min-h-[104px] rounded-xl border border-[#334155] bg-[#111111] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
          <p className="mt-2.5 truncate text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 truncate text-xs text-[#94A3B8]">{note}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
          <Icon size={17} />
        </span>
      </div>
    </article>
  );
}

function LeadCard({
  lead,
  busy,
  onWhatsApp,
  onMove
}: {
  lead: SalesLead;
  busy: boolean;
  onWhatsApp: (lead: SalesLead) => void;
  onMove: (lead: SalesLead, stage: PipelineStage) => void;
}) {
  const stage = stageFromStatus(lead.status) || 'New Lead';
  const phone = normalizeMalaysiaPhone(lead.phone);

  const actionButton = (
    label: string,
    targetStage: PipelineStage,
    className = 'border-[#334155] bg-[#0F172A] text-[#CBD5E1] hover:border-[#C8A96B]/40'
  ) => (
    <button
      type="button"
      disabled={busy || stage === targetStage}
      onClick={() => onMove(lead, targetStage)}
      className={`min-h-8 rounded-lg border px-2 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
    >
      {label}
    </button>
  );

  return (
    <article className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-3 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{lead.companyName || 'Unnamed company'}</h3>
          <p className="mt-1 truncate text-[11px] text-[#94A3B8]">
            {lead.contactPerson || 'No contact person'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${priorityTone(lead.leadPriority)}`}>
          {lead.leadPriority}
        </span>
      </div>

      <div className="mt-3 grid gap-1.5 text-[11px] text-[#94A3B8]">
        <p className="flex min-w-0 items-center gap-1.5">
          <Phone size={11} className="shrink-0 text-[#C8A96B]" />
          <span className="truncate">{lead.phone || 'No phone'}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <MapPin size={11} className="shrink-0 text-[#C8A96B]" />
          <span className="truncate">{lead.area || 'Area pending'}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <Building2 size={11} className="shrink-0 text-[#C8A96B]" />
          <span className="truncate">{lead.leadType}</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-y border-[#263348] py-2.5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.1em] text-[#64748B]">Estimated value</p>
          <p className="mt-1 text-xs font-semibold text-white">{formatRM(toSafeNumber(lead.potentialValue))}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[0.1em] text-[#64748B]">Lead score</p>
          <p className="mt-1 text-xs font-semibold text-[#E4C98E]">{toSafeNumber(lead.leadScore)}</p>
        </div>
      </div>

      <div className="mt-2.5 grid gap-1 text-[10px] text-[#64748B]">
        <p>Last contact: <span className="text-[#CBD5E1]">{lead.lastContactDate || 'No activity'}</span></p>
        <p>
          Follow-up:{' '}
          <span className={isFollowUpDue(lead) ? 'font-semibold text-rose-300' : 'text-[#CBD5E1]'}>
            {lead.nextFollowUpDate || 'Not scheduled'}
          </span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!phone || busy}
          onClick={() => onWhatsApp(lead)}
          className="min-h-8 rounded-lg bg-emerald-500/20 px-2 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-35"
        >
          WhatsApp
        </button>
        {actionButton('Mark Contacted', 'Contacted')}
        {actionButton('Mark Interested', 'Interested')}
        {actionButton('Send Quotation', 'Quotation Sent', 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E] hover:bg-[#C8A96B]/20')}
        {actionButton('Mark Won', 'Won', 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20')}
        {actionButton('Mark Lost', 'Lost', 'border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20')}
      </div>
    </article>
  );
}

export default function CorporateSalesDashboardPage() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('All');
  const [leadTypeFilter, setLeadTypeFilter] = useState<TypeFilter>('All');
  const [stageFilter, setStageFilter] = useState<StageFilter>('All');
  const [busyLeadId, setBusyLeadId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const reload = async () => {
    try {
      const leadData = await loadSalesLeadsFromSupabase();
      setLeads(leadData);
      setError('');
    } catch (loadError) {
      console.error('Corporate sales pipeline load error:', loadError);
      setLeads([]);
      setError('Unable to load live Corporate Leads data from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    window.addEventListener('lbl:sales-crm-updated', reload);
    return () => window.removeEventListener('lbl:sales-crm-updated', reload);
  }, []);

  const analytics = useMemo(() => {
    const visibleLeads = leads.filter((lead) => lead.status !== 'Archived');
    const openLeads = visibleLeads.filter((lead) => !['Won', 'Lost'].includes(lead.status));
    return {
      visibleLeads,
      total: visibleLeads.length,
      hot: visibleLeads.filter((lead) => lead.leadPriority === 'Hot' || lead.leadScore >= 80).length,
      warm: visibleLeads.filter(
        (lead) =>
          !(lead.leadPriority === 'Hot' || lead.leadScore >= 80) &&
          (lead.leadPriority === 'Warm' || (lead.leadScore >= 50 && lead.leadScore < 80))
      ).length,
      quotations: visibleLeads.filter((lead) => lead.status === 'Quoted').length,
      won: visibleLeads.filter((lead) => lead.status === 'Won').length,
      pipelineValue: openLeads.reduce((sum, lead) => sum + toSafeNumber(lead.potentialValue), 0)
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return analytics.visibleLeads.filter((lead) => {
      const stage = stageFromStatus(lead.status);
      const matchesSearch =
        !query ||
        [lead.companyName, lead.contactPerson, lead.phone, lead.area]
          .join(' ')
          .toLowerCase()
          .includes(query);
      return (
        matchesSearch &&
        (priorityFilter === 'All' || lead.leadPriority === priorityFilter) &&
        (leadTypeFilter === 'All' || lead.leadType === leadTypeFilter) &&
        (stageFilter === 'All' || stage === stageFilter)
      );
    });
  }, [analytics.visibleLeads, leadTypeFilter, priorityFilter, searchTerm, stageFilter]);

  const groupedLeads = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => ({
        stage,
        leads: filteredLeads
          .filter((lead) => stageFromStatus(lead.status) === stage)
          .sort((a, b) => {
            const aDue = a.nextFollowUpDate || '9999-12-31';
            const bDue = b.nextFollowUpDate || '9999-12-31';
            return aDue.localeCompare(bDue) || b.leadScore - a.leadScore;
          })
      })),
    [filteredLeads]
  );

  const followUpLeads = useMemo(
    () =>
      analytics.visibleLeads
        .filter((lead) => isFollowUpDue(lead) || hasNoActivity(lead))
        .sort((a, b) => {
          if (isFollowUpDue(a) !== isFollowUpDue(b)) return isFollowUpDue(a) ? -1 : 1;
          return (a.nextFollowUpDate || todayKey()).localeCompare(b.nextFollowUpDate || todayKey());
        })
        .slice(0, 8),
    [analytics.visibleLeads]
  );

  const notifyChanged = () => {
    localStorage.setItem('lbl_sales_crm_updated_at', new Date().toISOString());
    window.dispatchEvent(new CustomEvent('lbl:sales-crm-updated'));
  };

  const moveLead = async (lead: SalesLead, stage: PipelineStage) => {
    const targetStatus = statusFromStage(stage);
    if (!lead.id || lead.status === targetStatus) return;
    setBusyLeadId(lead.id);
    try {
      const updatedLead: SalesLead = {
        ...lead,
        status: targetStatus,
        lastContactDate:
          ['Contacted', 'Interested', 'Quoted', 'Sample Scheduled', 'Won', 'Lost'].includes(targetStatus)
            ? todayKey()
            : lead.lastContactDate,
        actualRevenue:
          targetStatus === 'Won' ? lead.actualRevenue || lead.potentialValue : lead.actualRevenue
      };
      await updateSalesLeadInSupabase(updatedLead);
      await createLeadActivityInSupabase({
        leadId: lead.id,
        activityType: `Moved to ${stage}`,
        description: `${lead.companyName} moved from ${stageFromStatus(lead.status) || lead.status} to ${stage}`,
        performedBy: getCurrentUserLabel()
      });
      await reload();
      notifyChanged();
      setToast({ message: `${lead.companyName} moved to ${stage}.`, type: 'success' });
    } catch (updateError) {
      console.error('Corporate pipeline update error:', updateError);
      setToast({ message: 'Failed to update lead stage.', type: 'error' });
    } finally {
      setBusyLeadId(null);
    }
  };

  const openWhatsApp = async (lead: SalesLead) => {
    const phone = normalizeMalaysiaPhone(lead.phone);
    if (!phone) {
      setToast({ message: 'Phone number missing.', type: 'error' });
      return;
    }

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(CORPORATE_WHATSAPP_MESSAGE)}`,
      '_blank',
      'noopener,noreferrer'
    );

    if (!lead.id) return;
    setBusyLeadId(lead.id);
    try {
      await updateSalesLeadInSupabase({
        ...lead,
        status: 'Contacted',
        messagesSent: toSafeNumber(lead.messagesSent) + 1,
        whatsappReady: true,
        lastContactDate: todayKey()
      });
      await createLeadActivityInSupabase({
        leadId: lead.id,
        activityType: 'WhatsApp Sent',
        description: 'Corporate outreach message opened',
        performedBy: getCurrentUserLabel()
      });
      await reload();
      notifyChanged();
      setToast({ message: 'WhatsApp opened and lead marked Contacted.', type: 'success' });
    } catch (updateError) {
      console.error('Corporate WhatsApp CRM update error:', updateError);
      setToast({ message: 'WhatsApp opened, but CRM update failed.', type: 'error' });
    } finally {
      setBusyLeadId(null);
    }
  };

  const kpis = [
    { label: 'Total Leads', value: analytics.total, note: 'Excluding archived', icon: Building2, tone: 'border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]' },
    { label: 'Hot Leads', value: analytics.hot, note: 'Priority or score 80+', icon: Flame, tone: 'border-rose-400/25 bg-rose-400/10 text-rose-300' },
    { label: 'Warm Leads', value: analytics.warm, note: 'Priority or score 50–79', icon: ThermometerSun, tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
    { label: 'Quotations Sent', value: analytics.quotations, note: 'Quoted stage', icon: Send, tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
    { label: 'Won Leads', value: analytics.won, note: 'Closed opportunities', icon: CheckCircle2, tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    { label: 'Pipeline Value', value: formatRM(analytics.pipelineValue), note: 'Open estimated value', icon: BadgeDollarSign, tone: 'border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]' }
  ];

  return (
    <div className="design-linear-page space-y-5 text-[#F8FAFC]">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="ds-hero p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ds-eyebrow">Corporate Sales OS</p>
            <h1 className="ds-page-title mt-2">Corporate Sales Pipeline</h1>
            <p className="ds-page-copy mt-2 max-w-3xl">
              Track office tea break, corporate gifting and event dessert opportunities from lead to order.
            </p>
          </div>
          <span className="ds-secondary-button flex w-fit items-center px-3 text-xs text-[#8a8f98]">
            {loading ? 'Loading Supabase...' : 'Source: Supabase'}
          </span>
        </div>
      </section>

      {error && (
        <div className="rounded-[14px] border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((item) => <KpiCard key={item.label} {...item} />)}
      </section>

      <section className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_repeat(3,minmax(150px,0.7fr))]">
          <label className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-[#64748B]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search company / phone / area"
              className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#64748B] focus:border-[#C8A96B]/60"
            />
          </label>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/60">
            <option value="All">All priorities</option>
            <option value="Hot">Hot</option>
            <option value="Warm">Warm</option>
            <option value="Cold">Cold</option>
          </select>
          <select value={leadTypeFilter} onChange={(event) => setLeadTypeFilter(event.target.value as TypeFilter)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/60">
            <option value="All">All lead types</option>
            {LEAD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as StageFilter)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/60">
            <option value="All">All stages</option>
            {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </div>
      </section>

      <section className="ds-card overflow-hidden rounded-xl border border-[#334155] bg-[#111111]">
        <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Action Queue</p>
            <h2 className="mt-1 text-base font-semibold text-white">Today&apos;s Corporate Follow-ups</h2>
          </div>
          <span className="rounded-full bg-[#C8A96B]/10 px-2.5 py-1 text-xs font-semibold text-[#E4C98E]">
            {followUpLeads.length}
          </span>
        </div>
        {followUpLeads.length > 0 ? (
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
            {followUpLeads.map((lead) => (
              <article key={String(lead.id || lead.companyName)} className="rounded-xl border border-[#334155] bg-[#0F172A] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{lead.companyName}</p>
                    <p className="mt-1 truncate text-[10px] text-[#64748B]">
                      {isFollowUpDue(lead) ? `Due ${lead.nextFollowUpDate}` : 'First outreach needed'}
                    </p>
                  </div>
                  <CalendarClock size={14} className={isFollowUpDue(lead) ? 'shrink-0 text-rose-300' : 'shrink-0 text-[#C8A96B]'} />
                </div>
                <button
                  type="button"
                  disabled={!normalizeMalaysiaPhone(lead.phone)}
                  onClick={() => openWhatsApp(lead)}
                  className="mt-3 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/20 text-[10px] font-semibold text-emerald-200 disabled:opacity-35"
                >
                  <MessageCircle size={12} />
                  WhatsApp
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[#64748B]">No corporate follow-ups need action today.</div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Live Pipeline</p>
            <h2 className="mt-1 text-base font-semibold text-white">Opportunity Board</h2>
          </div>
          <p className="text-xs text-[#64748B]">Showing {filteredLeads.length} leads</p>
        </div>

        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groupedLeads.map((group) => (
            <section key={group.stage} className="min-w-0 overflow-hidden rounded-xl border border-[#334155] bg-[#0F172A]">
              <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <CircleDot size={13} className={group.stage === 'Lost' ? 'text-rose-300' : group.stage === 'Won' ? 'text-emerald-300' : 'text-[#C8A96B]'} />
                  <h3 className="truncate text-xs font-semibold text-white">{group.stage}</h3>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${stageTone(group.stage)}`}>
                  {group.leads.length}
                </span>
              </div>
              <div className="space-y-2 p-2.5">
                {group.leads.map((lead) => (
                  <LeadCard
                    key={String(lead.id || lead.companyName)}
                    lead={lead}
                    busy={String(busyLeadId) === String(lead.id)}
                    onWhatsApp={openWhatsApp}
                    onMove={moveLead}
                  />
                ))}
                {group.leads.length === 0 && (
                  <div className="flex min-h-24 flex-col items-center justify-center rounded-[12px] border border-dashed border-[#334155] px-3 text-center">
                    {group.stage === 'Lost' ? <Snowflake size={16} className="text-[#64748B]" /> : <Target size={16} className="text-[#64748B]" />}
                    <p className="mt-2 text-[10px] text-[#64748B]">No leads in this stage</p>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>

      <p className="flex items-center gap-2 px-1 text-xs text-[#64748B]">
        <ArrowRight size={13} className="text-[#C8A96B]" />
        Pipeline mapping preserves the current database statuses: Quoted is shown as Quotation Sent, and Sample Scheduled is shown as Follow Up.
      </p>
    </div>
  );
}
