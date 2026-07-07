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
  loadLeadActivitiesFromSupabase,
  loadSalesLeadsFromSupabase,
  recordSalesLeadWhatsAppContact,
  updateSalesLeadInSupabase,
  type LeadActivity,
  type SalesLead,
  type SalesLeadPriority,
  type SalesLeadStatus,
  type SalesLeadType
} from '../services/salesLeadService';
import { loadQuotationsFromSupabase, type Quotation } from '../services/quotationService';
import type { Order } from '../data/mockData';
import {
  buildCorporateWhatsAppUrl,
  normalizeMalaysiaMobile
} from '../utils/corporateWhatsApp';
import {
  buildLeadFirstContactMessage,
  buildLeadFollowUpReplyMessage
} from '../config/leadMessageTemplates';
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
type FollowUpFilter = 'All' | 'Hot' | 'No Reply' | 'Quotation' | 'New Lead' | 'Repeat Opportunity';
type FollowUpReason =
  | 'Needs First Contact'
  | 'No Reply Follow-Up'
  | 'Send Quotation'
  | 'Quotation Follow-Up'
  | 'Repeat Order Opportunity'
  | 'Scheduled Follow-Up'
  | 'Hot Lead Review';

type CorporateFollowUp = {
  lead: SalesLead;
  reason: FollowUpReason;
  category: Exclude<FollowUpFilter, 'All'> | 'Scheduled';
  suggestedAction: string;
  daysSinceActivity: number;
  dueDate: string;
  overdue: boolean;
  quotation?: Quotation;
};

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

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayKey = () => localDateKey(new Date());

const dateKey = (value?: string) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? localDateKey(parsed) : '';
};

const dateValue = (value?: string) => {
  const key = dateKey(value);
  if (!key) return 0;
  const parsed = new Date(`${key}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const daysSince = (value?: string) => {
  const timestamp = dateValue(value);
  const today = dateValue(todayKey());
  if (!timestamp || !today) return 0;
  return Math.max(Math.floor((today - timestamp) / 86400000), 0);
};

const addDays = (value: string, days: number) => {
  const key = dateKey(value);
  if (!key) return todayKey();
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

const latestDate = (values: Array<string | undefined>) =>
  values
    .filter((value): value is string => Boolean(value) && dateValue(value) > 0)
    .sort((a, b) => dateValue(b) - dateValue(a))[0] || '';

const normalizeText = (value: unknown) =>
  String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

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

const getOrderDate = (order: Order) =>
  order.statusHistory?.[order.statusHistory.length - 1]?.timestamp || order.deliveryDate || '';

const orderMatchesLead = (order: Order, lead: SalesLead) => {
  const orderPhone = normalizeMalaysiaMobile(order.phone);
  const leadPhone = normalizeMalaysiaMobile(lead.phone);
  if (orderPhone && leadPhone) return orderPhone === leadPhone;
  return Boolean(normalizeText(order.customerName)) &&
    normalizeText(order.customerName) === normalizeText(lead.companyName);
};

const followUpReasonTone = (reason: FollowUpReason) => {
  if (reason === 'Quotation Follow-Up' || reason === 'Send Quotation') {
    return 'border-violet-400/25 bg-violet-400/10 text-violet-200';
  }
  if (reason === 'Repeat Order Opportunity') {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  }
  if (reason === 'No Reply Follow-Up') {
    return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  }
  if (reason === 'Needs First Contact') {
    return 'border-sky-400/25 bg-sky-400/10 text-sky-200';
  }
  return 'border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]';
};

const isMeaningfulSalesActivity = (activity: LeadActivity) => {
  const activityType = String(activity.activityType || '').toLowerCase();
  return ![
    'lead created',
    'lead scored',
    'automation',
    'auto follow-up schedule'
  ].some((ignoredType) => activityType.includes(ignoredType));
};

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
  onSuggestedReply,
  onMove
}: {
  lead: SalesLead;
  busy: boolean;
  onWhatsApp: (lead: SalesLead) => void;
  onSuggestedReply: (lead: SalesLead) => void;
  onMove: (lead: SalesLead, stage: PipelineStage) => void;
}) {
  const stage = stageFromStatus(lead.status) || 'New Lead';
  const phone = normalizeMalaysiaMobile(lead.phone);

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
        {['Contacted', 'Interested'].includes(lead.status) && (
          <button
            type="button"
            disabled={!phone || busy}
            onClick={() => onSuggestedReply(lead)}
            className="col-span-2 min-h-8 rounded-lg border border-sky-400/25 bg-sky-400/10 px-2 text-[10px] font-semibold text-sky-200 disabled:opacity-35"
          >
            Use Follow-up Reply Template
          </button>
        )}
        {actionButton('Mark Contacted', 'Contacted')}
        {actionButton('Mark Interested', 'Interested')}
        {actionButton('Send Quotation', 'Quotation Sent', 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E] hover:bg-[#C8A96B]/20')}
        {actionButton('Mark Won', 'Won', 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20')}
        {actionButton('Mark Lost', 'Lost', 'border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20')}
      </div>
    </article>
  );
}

export default function CorporateSalesDashboardPage({ orders = [] }: { orders?: Order[] }) {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dataAvailability, setDataAvailability] = useState({
    activities: false,
    quotations: false
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('All');
  const [leadTypeFilter, setLeadTypeFilter] = useState<TypeFilter>('All');
  const [stageFilter, setStageFilter] = useState<StageFilter>('All');
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('All');
  const [busyLeadId, setBusyLeadId] = useState<string | number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const reload = async () => {
    const [leadResult, activityResult, quotationResult] = await Promise.allSettled([
      loadSalesLeadsFromSupabase(),
      loadLeadActivitiesFromSupabase(),
      loadQuotationsFromSupabase()
    ]);
    const nextWarnings: string[] = [];

    if (leadResult.status === 'fulfilled') {
      setLeads(leadResult.value);
    } else {
      console.error('Corporate sales pipeline load error:', leadResult.reason);
      setLeads([]);
      nextWarnings.push('Corporate leads could not be loaded.');
    }
    if (activityResult.status === 'fulfilled') {
      setActivities(activityResult.value);
    } else {
      console.error('Corporate follow-up activity load error:', activityResult.reason);
      setActivities([]);
      nextWarnings.push('Activity history is temporarily unavailable.');
    }
    if (quotationResult.status === 'fulfilled') {
      setQuotations(quotationResult.value);
    } else {
      console.error('Corporate follow-up quotation load error:', quotationResult.reason);
      setQuotations([]);
      nextWarnings.push('Quotation follow-up data is temporarily unavailable.');
    }

    setDataAvailability({
      activities: activityResult.status === 'fulfilled',
      quotations: quotationResult.status === 'fulfilled'
    });
    setWarnings(nextWarnings);
    setLoading(false);
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

  const contactedTodayLeads = useMemo(
    () => analytics.visibleLeads
      .filter((lead) =>
        lead.lastContactDate === todayKey() &&
        !['Won', 'Lost', 'Archived'].includes(lead.status)
      )
      .sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [analytics.visibleLeads]
  );

  const corporateFollowUps = useMemo(() => {
    const activitiesByLead = new Map<string, LeadActivity[]>();
    activities.forEach((activity) => {
      const leadId = String(activity.leadId || '');
      activitiesByLead.set(leadId, [...(activitiesByLead.get(leadId) || []), activity]);
    });
    const quotationsByLead = new Map<string, Quotation[]>();
    quotations.forEach((quotation) => {
      const leadId = String(quotation.leadId || '');
      quotationsByLead.set(leadId, [...(quotationsByLead.get(leadId) || []), quotation]);
    });

    return analytics.visibleLeads
      .flatMap((lead): CorporateFollowUp[] => {
        const leadId = String(lead.id || '');
        const leadActivities = activitiesByLead.get(leadId) || [];
        const meaningfulActivities = leadActivities.filter(isMeaningfulSalesActivity);
        const leadQuotations = quotationsByLead.get(leadId) || [];
        const latestActivity = latestDate([
          ...meaningfulActivities.map((activity) => activity.createdAt),
          lead.lastContactDate,
          lead.createdAt
        ]);
        const activeQuotation = leadQuotations
          .filter((quotation) => ['Sent', 'Viewed', 'Negotiating'].includes(quotation.status))
          .sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt))[0];
        const hasSentQuotation = leadQuotations.some((quotation) =>
          ['Sent', 'Viewed', 'Negotiating', 'Accepted'].includes(quotation.status)
        );
        const matchedOrderDates = orders
          .filter((order) => orderMatchesLead(order, lead))
          .map(getOrderDate);
        const latestWonTouch = latestDate([
          latestActivity,
          lead.updatedAt,
          ...matchedOrderDates
        ]);
        const scheduledDue = Boolean(lead.nextFollowUpDate) && lead.nextFollowUpDate <= todayKey();
        let item: CorporateFollowUp | null = null;

        if (lead.status === 'Lost') return [];

        if (lead.status === 'Won') {
          if (!dataAvailability.activities || daysSince(latestWonTouch) < 14) return [];
          return [{
            lead,
            reason: 'Repeat Order Opportunity',
            category: 'Repeat Opportunity',
            suggestedAction: 'Ask about the next event or staff order.',
            daysSinceActivity: daysSince(latestWonTouch),
            dueDate: addDays(latestWonTouch || lead.updatedAt || lead.createdAt || todayKey(), 14),
            overdue: daysSince(latestWonTouch) > 14
          }];
        }

        if (dataAvailability.quotations && activeQuotation) {
          const referenceDate = activeQuotation.updatedAt || activeQuotation.createdAt || '';
          if (daysSince(referenceDate) >= 3) {
            item = {
              lead,
              reason: 'Quotation Follow-Up',
              category: 'Quotation',
              suggestedAction: `Follow up on ${activeQuotation.quoteNo || 'the quotation'}.`,
              daysSinceActivity: daysSince(referenceDate),
              dueDate: addDays(referenceDate, 3),
              overdue: daysSince(referenceDate) > 3,
              quotation: activeQuotation
            };
          }
        } else if (
          dataAvailability.activities &&
          dataAvailability.quotations &&
          lead.status === 'Interested' &&
          !hasSentQuotation &&
          daysSince(latestActivity) >= 2
        ) {
          item = {
            lead,
            reason: 'Send Quotation',
            category: 'Quotation',
            suggestedAction: 'Prepare and send a quotation.',
            daysSinceActivity: daysSince(latestActivity),
            dueDate: addDays(latestActivity || lead.createdAt || todayKey(), 2),
            overdue: daysSince(latestActivity) > 2
          };
        } else if (
          dataAvailability.activities &&
          lead.status === 'Contacted' &&
          daysSince(latestActivity) >= 3
        ) {
          item = {
            lead,
            reason: 'No Reply Follow-Up',
            category: 'No Reply',
            suggestedAction: 'Send a short follow-up message.',
            daysSinceActivity: daysSince(latestActivity),
            dueDate: addDays(latestActivity || lead.createdAt || todayKey(), 3),
            overdue: daysSince(latestActivity) > 3
          };
        } else if (
          lead.status === 'New' &&
          dataAvailability.activities &&
          meaningfulActivities.length === 0 &&
          !lead.lastContactDate &&
          daysSince(lead.createdAt) >= 1
        ) {
          item = {
            lead,
            reason: 'Needs First Contact',
            category: 'New Lead',
            suggestedAction: 'Open WhatsApp and introduce LBL.',
            daysSinceActivity: daysSince(lead.createdAt),
            dueDate: addDays(lead.createdAt || todayKey(), 1),
            overdue: daysSince(lead.createdAt) > 1
          };
        } else if (scheduledDue && !['Lost', 'Archived'].includes(lead.status)) {
          item = {
            lead,
            reason: 'Scheduled Follow-Up',
            category: 'Scheduled',
            suggestedAction: 'Complete the scheduled follow-up.',
            daysSinceActivity: daysSince(latestActivity),
            dueDate: lead.nextFollowUpDate,
            overdue: lead.nextFollowUpDate < todayKey()
          };
        } else if (
          (lead.leadPriority === 'Hot' || lead.leadScore >= 80) &&
          !['Won', 'Lost', 'Archived'].includes(lead.status)
        ) {
          item = {
            lead,
            reason: 'Hot Lead Review',
            category: 'Hot',
            suggestedAction: 'Prioritize a personal sales check-in today.',
            daysSinceActivity: daysSince(latestActivity),
            dueDate: todayKey(),
            overdue: false
          };
        }

        return item ? [item] : [];
      })
      .sort((a, b) => {
        const aHot = a.lead.leadPriority === 'Hot' || a.lead.leadScore >= 80;
        const bHot = b.lead.leadPriority === 'Hot' || b.lead.leadScore >= 80;
        if (aHot !== bHot) return aHot ? -1 : 1;
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if ((a.category === 'Quotation') !== (b.category === 'Quotation')) return a.category === 'Quotation' ? -1 : 1;
        if ((a.category === 'New Lead') !== (b.category === 'New Lead')) return a.category === 'New Lead' ? -1 : 1;
        return b.daysSinceActivity - a.daysSinceActivity;
      });
  }, [activities, analytics.visibleLeads, dataAvailability, orders, quotations]);

  const filteredFollowUps = useMemo(
    () => corporateFollowUps.filter((item) => {
      if (followUpFilter === 'All') return true;
      if (followUpFilter === 'Hot') {
        return !['Won', 'Lost', 'Archived'].includes(item.lead.status) &&
          (item.lead.leadPriority === 'Hot' || item.lead.leadScore >= 80);
      }
      return item.category === followUpFilter;
    }),
    [corporateFollowUps, followUpFilter]
  );

  const followUpStats = useMemo(() => ({
    dueToday: corporateFollowUps.filter((item) => item.dueDate === todayKey()).length,
    overdue: corporateFollowUps.filter((item) => item.overdue).length,
    hot: corporateFollowUps.filter((item) =>
      !['Won', 'Lost', 'Archived'].includes(item.lead.status) &&
      (item.lead.leadPriority === 'Hot' || item.lead.leadScore >= 80)
    ).length,
    quotations: corporateFollowUps.filter((item) => item.category === 'Quotation').length,
    repeat: corporateFollowUps.filter((item) => item.category === 'Repeat Opportunity').length
  }), [corporateFollowUps]);

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
    const whatsappUrl = buildCorporateWhatsAppUrl(
      lead.phone,
      buildLeadFirstContactMessage(lead.companyName)
    );
    if (!whatsappUrl) {
      setToast({ message: 'Valid Malaysian mobile number missing.', type: 'error' });
      return;
    }

    window.open(
      whatsappUrl,
      '_blank',
      'noopener,noreferrer'
    );

    if (!lead.id || ['Won', 'Lost', 'Archived'].includes(lead.status)) {
      setToast({ message: 'WhatsApp opened. Lead status was not changed.', type: 'info' });
      return;
    }
    setBusyLeadId(lead.id);
    try {
      const saved = await recordSalesLeadWhatsAppContact(
        lead,
        todayKey(),
        addDays(todayKey(), 3)
      );
      setLeads((current) => current.map((item) => item.id === saved.id ? saved : item));
      await createLeadActivityInSupabase({
        leadId: lead.id,
        activityType: 'WhatsApp Sent',
        description: 'Corporate outreach message opened',
        performedBy: getCurrentUserLabel()
      });
      await reload();
      notifyChanged();
      setToast({ message: 'Lead moved to Contacted Today.', type: 'success' });
    } catch (updateError) {
      console.error('Corporate WhatsApp CRM update error:', updateError);
      setToast({ message: 'WhatsApp opened, but CRM update failed.', type: 'error' });
    } finally {
      setBusyLeadId(null);
    }
  };

  const openFollowUpWhatsApp = (lead: SalesLead) => {
    const useReplyTemplate = ['Contacted', 'Interested'].includes(lead.status);
    const whatsappUrl = buildCorporateWhatsAppUrl(
      lead.phone,
      useReplyTemplate
        ? buildLeadFollowUpReplyMessage(lead.contactPerson)
        : buildLeadFirstContactMessage(lead.companyName)
    );
    if (!whatsappUrl) {
      setToast({ message: 'Valid Malaysian mobile number missing.', type: 'error' });
      return;
    }
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    if (!lead.id || ['Won', 'Lost', 'Archived'].includes(lead.status)) return;
    const leadId = lead.id;

    void (async () => {
      setBusyLeadId(leadId);
      try {
        const saved = await recordSalesLeadWhatsAppContact(
          lead,
          todayKey(),
          addDays(todayKey(), 3)
        );
        setLeads((current) => current.map((item) => item.id === saved.id ? saved : item));
        await createLeadActivityInSupabase({
          leadId,
          activityType: 'WhatsApp Sent',
          description: 'Corporate follow-up message opened',
          performedBy: getCurrentUserLabel()
        });
        await reload();
        notifyChanged();
        setToast({ message: 'Lead moved to Contacted Today.', type: 'success' });
      } catch (updateError) {
        console.error('Corporate follow-up WhatsApp update error:', updateError);
        setToast({ message: 'WhatsApp opened, but lead update failed.', type: 'error' });
      } finally {
        setBusyLeadId(null);
      }
    })();
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

      {warnings.length > 0 && (
        <div className="rounded-[14px] border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">Some follow-up signals are temporarily unavailable.</p>
          <p className="mt-1 text-xs text-amber-100/75">{warnings.join(' ')}</p>
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Due Today', followUpStats.dueToday, 'Follow up today'],
          ['Overdue', followUpStats.overdue, 'Past recommended date'],
          ['Hot Leads', followUpStats.hot, 'Priority opportunities'],
          ['Quotation Follow-Ups', followUpStats.quotations, 'Quotes needing action'],
          ['Repeat Opportunities', followUpStats.repeat, 'Won leads to re-engage']
        ].map(([label, value, note]) => (
          <article key={label} className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">{note}</p>
          </article>
        ))}
      </section>

      <section className="ds-card overflow-hidden rounded-xl border border-[#334155] bg-[#111111]">
        <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Action Queue</p>
            <h2 className="mt-1 text-base font-semibold text-white">Today&apos;s Corporate Follow-ups</h2>
          </div>
          <span className="rounded-full bg-[#C8A96B]/10 px-2.5 py-1 text-xs font-semibold text-[#E4C98E]">
            {filteredFollowUps.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-[#334155] px-3 py-2.5">
          {(['All', 'Hot', 'No Reply', 'Quotation', 'New Lead', 'Repeat Opportunity'] as FollowUpFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setFollowUpFilter(filter)}
              className={`min-h-8 rounded-lg border px-3 text-[11px] font-semibold transition ${
                followUpFilter === filter
                  ? 'border-[#C8A96B]/40 bg-[#C8A96B]/15 text-[#E4C98E]'
                  : 'border-[#334155] bg-[#0F172A] text-[#94A3B8] hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        {filteredFollowUps.length > 0 ? (
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredFollowUps.map((item) => {
              const lead = item.lead;
              return (
              <article key={String(lead.id || lead.companyName)} className="rounded-xl border border-[#334155] bg-[#0F172A] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{lead.companyName}</p>
                    <p className="mt-1 truncate text-[10px] text-[#64748B]">{lead.contactPerson || 'No contact person'} · {lead.phone || 'No phone'}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${priorityTone(lead.leadPriority)}`}>
                    {lead.leadPriority}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold ${stageTone(stageFromStatus(lead.status) || 'New Lead')}`}>
                    {stageFromStatus(lead.status) || lead.status}
                  </span>
                  <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold ${followUpReasonTone(item.reason)}`}>
                    {item.reason}
                  </span>
                  {item.overdue && <span className="rounded-md border border-rose-400/25 bg-rose-400/10 px-2 py-1 text-[9px] font-semibold text-rose-200">Overdue</span>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[#263348] bg-[#111111] p-2.5 text-[10px]">
                  <div>
                    <p className="text-[#64748B]">Since activity</p>
                    <p className="mt-1 font-semibold text-white">{item.daysSinceActivity} days</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#64748B]">Suggested action</p>
                    <p className="mt-1 font-semibold text-[#E4C98E]">{item.suggestedAction}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!normalizeMalaysiaMobile(lead.phone)}
                  onClick={() => openFollowUpWhatsApp(lead)}
                  className="mt-3 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/20 text-[10px] font-semibold text-emerald-200 disabled:opacity-35"
                >
                  <MessageCircle size={12} />
                  {['Contacted', 'Interested'].includes(lead.status) ? 'Use Follow-up Reply Template' : 'WhatsApp'}
                </button>
              </article>
            )})}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[#64748B]">All corporate leads are up to date.</div>
        )}
      </section>

      <section className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-4">
        <div className="flex items-end justify-between gap-3 border-b border-[#334155] pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Outreach Progress</p>
            <h2 className="mt-1 text-base font-semibold text-white">Contacted Today</h2>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">{contactedTodayLeads.length}</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {contactedTodayLeads.map((lead) => (
            <article key={String(lead.id)} className="rounded-xl border border-[#334155] bg-[#0F172A] p-3">
              <p className="truncate text-sm font-semibold text-white">{lead.companyName || 'Unnamed company'}</p>
              <p className="mt-1 text-xs text-[#94A3B8]">{lead.phone || 'No phone'} · {lead.status}</p>
              <p className="mt-1 text-xs text-[#64748B]">Next follow-up: {lead.nextFollowUpDate || 'Not scheduled'}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={!normalizeMalaysiaMobile(lead.phone)} onClick={() => openFollowUpWhatsApp(lead)} className="min-h-8 flex-1 rounded-lg bg-sky-500/15 px-3 text-xs font-semibold text-sky-100 disabled:opacity-40">Use Follow-up Reply Template</button>
                <button type="button" onClick={() => setStageFilter(stageFromStatus(lead.status) || 'All')} className="min-h-8 rounded-lg border border-[#334155] bg-white/5 px-3 text-xs font-semibold text-[#CBD5E1]">View Details</button>
              </div>
            </article>
          ))}
          {contactedTodayLeads.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#334155] bg-[#0F172A] p-5 text-center text-sm text-[#64748B] md:col-span-2 xl:col-span-3">No leads contacted today yet.</p>
          )}
        </div>
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
                    onSuggestedReply={openFollowUpWhatsApp}
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
