import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Filter,
  History,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  Target,
  TrendingUp,
  UsersRound
} from 'lucide-react';
import type { Order } from '../data/mockData';
import {
  loadLeadActivitiesFromSupabase,
  loadSalesLeadsFromSupabase,
  type LeadActivity,
  type SalesLead,
  type SalesLeadStatus,
  type SalesLeadType
} from '../services/salesLeadService';
import {
  loadQuotationsFromSupabase,
  type Quotation
} from '../services/quotationService';
import {
  loadFollowUpTasksReadOnlyFromSupabase,
  type FollowUpTask
} from '../services/followUpTaskService';
import { formatRM, toSafeNumber } from '../utils/pricing';

type CorporateAccountsPageProps = {
  orders: Order[];
};

type Account = {
  key: string;
  companyName: string;
  leads: SalesLead[];
  orders: Order[];
  quotations: Quotation[];
  activities: LeadActivity[];
  followUps: FollowUpTask[];
  revenue: number;
  wonDeals: number;
  lastActivity: string;
  leadTypes: SalesLeadType[];
  statuses: SalesLeadStatus[];
  area: string;
  phone: string;
};

type TimelineItem = {
  id: string;
  date: string;
  title: string;
  meta: string;
  tone: 'neutral' | 'success' | 'warning';
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizePhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const safeDateValue = (value?: string) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatDate = (value?: string) => {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getOrderDate = (order: Order) =>
  order.statusHistory?.[order.statusHistory.length - 1]?.timestamp || order.deliveryDate || '';

const getOrderNumber = (order: Order) => order.orderNo || order.id || 'Order';

const getAccountKey = (lead: SalesLead) =>
  normalizeText(lead.companyName) || `lead-${String(lead.id || lead.phone || 'unknown')}`;

const statusTone = (status: SalesLeadStatus) => {
  if (status === 'Won') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (status === 'Lost' || status === 'Archived') return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
  if (status === 'Quoted' || status === 'Interested') return 'border-[#5e6ad2]/30 bg-[#5e6ad2]/10 text-[#aab2ff]';
  return 'border-[#34343a] bg-[#18191a] text-[#d0d6e0]';
};

function MetricCard({
  label,
  value,
  note,
  icon: Icon
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof Building2;
}) {
  return (
    <article className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[#8a8f98]">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-[#f7f8f8]">{value}</p>
          <p className="mt-1 truncate text-xs text-[#62666d]">{note}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#34343a] bg-[#18191a] text-[#828fff]">
          <Icon size={17} />
        </span>
      </div>
    </article>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#34343a] bg-[#0f1011] px-5 py-8 text-center">
      <Building2 className="mx-auto text-[#62666d]" size={24} />
      <p className="mt-3 text-sm font-semibold text-[#f7f8f8]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#8a8f98]">{copy}</p>
    </div>
  );
}

function Timeline({
  title,
  icon: Icon,
  items
}: {
  title: string;
  icon: typeof History;
  items: TimelineItem[];
}) {
  return (
    <section className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-[#828fff]" />
        <h3 className="text-sm font-semibold text-[#f7f8f8]">{title}</h3>
        <span className="ml-auto rounded-md border border-[#34343a] bg-[#18191a] px-2 py-1 text-[10px] font-medium text-[#8a8f98]">
          {items.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#34343a] px-3 py-5 text-center text-xs text-[#62666d]">
            No records yet
          </p>
        ) : (
          items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex gap-3 rounded-lg border border-[#23252a] bg-[#141516] p-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                item.tone === 'success'
                  ? 'bg-emerald-400'
                  : item.tone === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-[#5e6ad2]'
              }`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-[#f7f8f8]">{item.title}</p>
                  <time className="text-[10px] text-[#62666d]">{formatDate(item.date)}</time>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8a8f98]">{item.meta}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function CorporateAccountsPage({ orders }: CorporateAccountsPageProps) {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpTask[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | SalesLeadType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | SalesLeadStatus>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    Promise.all([
      loadSalesLeadsFromSupabase(),
      loadQuotationsFromSupabase(),
      loadLeadActivitiesFromSupabase(),
      loadFollowUpTasksReadOnlyFromSupabase()
    ])
      .then(([leadData, quotationData, activityData, followUpData]) => {
        if (!mounted) return;
        setLeads(leadData);
        setQuotations(quotationData);
        setActivities(activityData);
        setFollowUps(followUpData);
        setError('');
      })
      .catch((loadError) => {
        if (!mounted) return;
        console.error('Corporate accounts load error:', loadError);
        setError('Corporate account data could not be loaded from Supabase.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const accounts = useMemo(() => {
    const grouped = new Map<string, SalesLead[]>();
    leads.forEach((lead) => {
      const key = getAccountKey(lead);
      grouped.set(key, [...(grouped.get(key) || []), lead]);
    });

    return Array.from(grouped.entries()).map(([key, accountLeads]): Account => {
      const leadIds = new Set(accountLeads.map((lead) => String(lead.id || '')));
      const phones = new Set(accountLeads.map((lead) => normalizePhone(lead.phone)).filter(Boolean));
      const companyNames = new Set(accountLeads.map((lead) => normalizeText(lead.companyName)).filter(Boolean));
      const accountOrders = orders.filter((order) => {
        const phoneMatch = Boolean(normalizePhone(order.phone)) && phones.has(normalizePhone(order.phone));
        const nameMatch = Boolean(normalizeText(order.customerName)) && companyNames.has(normalizeText(order.customerName));
        return phoneMatch || nameMatch;
      });
      const accountQuotations = quotations.filter((quotation) => leadIds.has(String(quotation.leadId)));
      const accountActivities = activities.filter((activity) => leadIds.has(String(activity.leadId)));
      const accountFollowUps = followUps.filter((task) => leadIds.has(String(task.leadId)));
      const dateCandidates = [
        ...accountLeads.flatMap((lead) => [lead.updatedAt || '', lead.lastContactDate || '', lead.createdAt || '']),
        ...accountQuotations.flatMap((quotation) => [quotation.updatedAt || '', quotation.createdAt || '']),
        ...accountActivities.map((activity) => activity.createdAt || ''),
        ...accountOrders.map(getOrderDate),
        ...accountFollowUps.map((task) => task.createdAt || '')
      ].filter(Boolean);

      return {
        key,
        companyName: accountLeads.find((lead) => lead.companyName.trim())?.companyName || 'Unnamed company',
        leads: accountLeads,
        orders: accountOrders,
        quotations: accountQuotations,
        activities: accountActivities,
        followUps: accountFollowUps,
        revenue: accountOrders.reduce((sum, order) => sum + toSafeNumber(order.totalAmount), 0),
        wonDeals: accountLeads.filter((lead) => lead.status === 'Won').length,
        lastActivity: dateCandidates.sort((a, b) => safeDateValue(b) - safeDateValue(a))[0] || '',
        leadTypes: Array.from(new Set(accountLeads.map((lead) => lead.leadType))),
        statuses: Array.from(new Set(accountLeads.map((lead) => lead.status))),
        area: accountLeads.find((lead) => lead.area.trim())?.area || 'Area not set',
        phone: accountLeads.find((lead) => lead.phone.trim())?.phone || ''
      };
    }).sort((a, b) => b.revenue - a.revenue || safeDateValue(b.lastActivity) - safeDateValue(a.lastActivity));
  }, [activities, followUps, leads, orders, quotations]);

  const filteredAccounts = useMemo(() => {
    const query = normalizeText(searchTerm);
    return accounts.filter((account) => {
      const matchesSearch = !query || [
        account.companyName,
        account.area,
        account.phone,
        ...account.leads.flatMap((lead) => [lead.contactPerson, lead.email])
      ].some((value) => normalizeText(value).includes(query));
      const matchesType = typeFilter === 'All' || account.leadTypes.includes(typeFilter);
      const matchesStatus = statusFilter === 'All' || account.statuses.includes(statusFilter);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [accounts, searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    if (filteredAccounts.length === 0) {
      setSelectedKey('');
      return;
    }
    if (!filteredAccounts.some((account) => account.key === selectedKey)) {
      setSelectedKey(filteredAccounts[0].key);
    }
  }, [filteredAccounts, selectedKey]);

  const selectedAccount = accounts.find((account) => account.key === selectedKey) || null;
  const totalRevenue = accounts.reduce((sum, account) => sum + account.revenue, 0);
  const openFollowUps = followUps.filter((task) => task.status !== 'Completed').length;
  const topAccounts = accounts.filter((account) => account.revenue > 0).slice(0, 5);

  const orderTimeline = useMemo<TimelineItem[]>(() => {
    if (!selectedAccount) return [];
    return selectedAccount.orders
      .map((order) => ({
        id: `order-${order.id}`,
        date: getOrderDate(order),
        title: `${getOrderNumber(order)} · ${formatRM(order.totalAmount)}`,
        meta: `${order.product} × ${order.quantity} · ${order.workflowStatus}`,
        tone: order.workflowStatus === 'Completed' ? 'success' as const : 'neutral' as const
      }))
      .sort((a, b) => safeDateValue(b.date) - safeDateValue(a.date));
  }, [selectedAccount]);

  const quotationTimeline = useMemo<TimelineItem[]>(() => {
    if (!selectedAccount) return [];
    return selectedAccount.quotations
      .map((quotation) => ({
        id: `quotation-${quotation.id}`,
        date: quotation.updatedAt || quotation.createdAt || '',
        title: `${quotation.quoteNo} · ${formatRM(quotation.totalAmount)}`,
        meta: `${quotation.status} · ${quotation.items.length} line item${quotation.items.length === 1 ? '' : 's'}`,
        tone: quotation.status === 'Accepted' ? 'success' as const : quotation.status === 'Rejected' ? 'warning' as const : 'neutral' as const
      }))
      .sort((a, b) => safeDateValue(b.date) - safeDateValue(a.date));
  }, [selectedAccount]);

  const activityTimeline = useMemo<TimelineItem[]>(() => {
    if (!selectedAccount) return [];
    return selectedAccount.activities
      .map((activity) => ({
        id: `activity-${activity.id}`,
        date: activity.createdAt || '',
        title: activity.activityType || 'Lead activity',
        meta: `${activity.description || 'No description'} · ${activity.performedBy || 'Unknown user'}`,
        tone: 'neutral' as const
      }))
      .sort((a, b) => safeDateValue(b.date) - safeDateValue(a.date));
  }, [selectedAccount]);

  const selectedPendingFollowUps = selectedAccount?.followUps.filter((task) => task.status !== 'Completed') || [];
  const selectedCompletedFollowUps = selectedAccount?.followUps.filter((task) => task.status === 'Completed') || [];
  const primaryLead = selectedAccount?.leads[0];

  return (
    <div className="design-linear-page space-y-4">
      <header className="ds-hero flex flex-col gap-4 rounded-2xl border border-[#23252a] bg-[#0f1011] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="ds-eyebrow">Corporate relationships</p>
          <h1 className="ds-page-title mt-2">Corporate Account Center</h1>
          <p className="ds-page-copy mt-2 max-w-2xl">
            Connect company leads, quotations, orders and follow-ups in one relationship view.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#34343a] bg-[#18191a] px-3 py-2 text-xs font-medium text-[#d0d6e0]">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Source: Supabase
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Corporate Accounts" value={accounts.length} note="Unique company relationships" icon={Building2} />
        <MetricCard label="Corporate Revenue" value={formatRM(totalRevenue)} note="Matched order revenue" icon={CircleDollarSign} />
        <MetricCard label="Won Deals" value={leads.filter((lead) => lead.status === 'Won').length} note="Won corporate leads" icon={TrendingUp} />
        <MetricCard label="Open Follow-Ups" value={openFollowUps} note="Pending or overdue actions" icon={CalendarClock} />
      </section>

      <section className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-medium text-[#8a8f98]">Search accounts</span>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#62666d]" size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Company, contact, phone or area"
                className="h-11 w-full rounded-lg border border-[#23252a] bg-[#010102] pl-10 pr-3 text-sm text-[#f7f8f8] outline-none"
              />
            </span>
          </label>
          <label className="lg:w-52">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#8a8f98]"><Filter size={13} /> Lead type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'All' | SalesLeadType)} className="h-11 w-full px-3 text-sm">
              <option value="All">All lead types</option>
              {['Corporate', 'Event Planner', 'Wedding Planner', 'Cafe', 'Hotel', 'School', 'Government', 'Other'].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="lg:w-52">
            <span className="mb-1.5 block text-xs font-medium text-[#8a8f98]">Lead status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | SalesLeadStatus)} className="h-11 w-full px-3 text-sm">
              <option value="All">All statuses</option>
              {['New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost', 'Archived'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.7fr)]">
        <section className="ds-card min-w-0 rounded-xl border border-[#23252a] bg-[#0f1011] p-3">
          <div className="flex items-center justify-between gap-3 px-1 py-1">
            <div>
              <h2 className="text-sm font-semibold text-[#f7f8f8]">Account Directory</h2>
              <p className="mt-1 text-xs text-[#62666d]">{filteredAccounts.length} companies</p>
            </div>
            <UsersRound size={17} className="text-[#828fff]" />
          </div>
          <div className="mt-3 max-h-[720px] space-y-1.5 overflow-y-auto pr-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg border border-[#23252a] bg-[#141516]" />
              ))
            ) : filteredAccounts.length === 0 ? (
              <EmptyState title="No corporate accounts" copy="No companies match the current search and filters." />
            ) : (
              filteredAccounts.map((account) => {
                const active = account.key === selectedKey;
                const lead = account.leads[0];
                return (
                  <button
                    key={account.key}
                    type="button"
                    onClick={() => setSelectedKey(account.key)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      active
                        ? 'border-[#5e6ad2] bg-[#5e6ad2]/10'
                        : 'border-[#23252a] bg-[#141516] hover:border-[#34343a] hover:bg-[#18191a]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#34343a] bg-[#010102] text-xs font-semibold text-[#828fff]">
                        {account.companyName.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[#f7f8f8]">{account.companyName}</p>
                          <ChevronRight size={15} className={active ? 'text-[#828fff]' : 'text-[#62666d]'} />
                        </div>
                        <p className="mt-1 truncate text-xs text-[#8a8f98]">{lead?.contactPerson || account.area}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                          <span className={`rounded-md border px-2 py-0.5 ${statusTone(lead?.status || 'New')}`}>{lead?.status || 'New'}</span>
                          <span className="font-medium text-[#d0d6e0]">{formatRM(account.revenue)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <main className="min-w-0 space-y-4">
          {!selectedAccount ? (
            <EmptyState title="Select a corporate account" copy="Choose a company from the directory to view its relationship history." />
          ) : (
            <>
              <section className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold text-[#f7f8f8]">{selectedAccount.companyName}</h2>
                      {primaryLead ? <span className={`rounded-md border px-2 py-1 text-[10px] font-medium ${statusTone(primaryLead.status)}`}>{primaryLead.status}</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#8a8f98]">
                      <span className="inline-flex items-center gap-1.5"><Target size={13} /> {selectedAccount.leadTypes.join(', ') || 'Lead type not set'}</span>
                      <span className="inline-flex items-center gap-1.5"><MapPin size={13} /> {selectedAccount.area}</span>
                      <span className="inline-flex items-center gap-1.5"><Phone size={13} /> {selectedAccount.phone || 'Phone not set'}</span>
                    </div>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] font-medium text-[#62666d]">LAST ACTIVITY</p>
                    <p className="mt-1 text-sm font-semibold text-[#d0d6e0]">{formatDate(selectedAccount.lastActivity)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['Total Revenue', formatRM(selectedAccount.revenue)],
                    ['Total Orders', selectedAccount.orders.length],
                    ['Total Quotations', selectedAccount.quotations.length],
                    ['Won Deals', selectedAccount.wonDeals],
                    ['Open Follow-Ups', selectedPendingFollowUps.length]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#23252a] bg-[#141516] p-3">
                      <p className="text-[10px] font-medium text-[#62666d]">{label}</p>
                      <p className="mt-1.5 truncate text-lg font-semibold text-[#f7f8f8]">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                <div className="grid gap-4 md:grid-cols-2">
                  <Timeline title="Orders Timeline" icon={ShoppingBag} items={orderTimeline} />
                  <Timeline title="Quotation Timeline" icon={FileText} items={quotationTimeline} />
                  <div className="md:col-span-2">
                    <Timeline title="Lead Activity Timeline" icon={History} items={activityTimeline} />
                  </div>
                </div>

                <div className="space-y-4">
                  <section className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
                    <div className="flex items-center gap-2">
                      <CalendarClock size={16} className="text-[#828fff]" />
                      <h3 className="text-sm font-semibold text-[#f7f8f8]">Follow-Up Summary</h3>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                        <p className="text-[10px] text-amber-200">OPEN</p>
                        <p className="mt-1 text-xl font-semibold text-amber-100">{selectedPendingFollowUps.length}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                        <p className="text-[10px] text-emerald-200">COMPLETED</p>
                        <p className="mt-1 text-xl font-semibold text-emerald-100">{selectedCompletedFollowUps.length}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedPendingFollowUps.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-[#34343a] px-3 py-5 text-center text-xs text-[#62666d]">No open follow-ups</p>
                      ) : (
                        selectedPendingFollowUps.slice(0, 5).map((task) => (
                          <div key={String(task.id)} className="rounded-lg border border-[#23252a] bg-[#141516] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-[#f7f8f8]">{task.title || 'Follow up'}</p>
                              <span className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                task.status === 'Overdue'
                                  ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                                  : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                              }`}>{task.status}</span>
                            </div>
                            <p className="mt-1 text-xs text-[#8a8f98]">Due {formatDate(task.dueDate)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
                    <div className="flex items-center gap-2">
                      <ClipboardList size={16} className="text-[#828fff]" />
                      <h3 className="text-sm font-semibold text-[#f7f8f8]">Relationship Snapshot</h3>
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between gap-3 border-b border-[#23252a] pb-2">
                        <dt className="text-[#8a8f98]">Contact person</dt>
                        <dd className="text-right font-medium text-[#d0d6e0]">{primaryLead?.contactPerson || 'Not set'}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-[#23252a] pb-2">
                        <dt className="text-[#8a8f98]">Potential value</dt>
                        <dd className="text-right font-medium text-[#d0d6e0]">{formatRM(selectedAccount.leads.reduce((sum, lead) => sum + toSafeNumber(lead.potentialValue), 0))}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-[#23252a] pb-2">
                        <dt className="text-[#8a8f98]">Accepted quotes</dt>
                        <dd className="text-right font-medium text-[#d0d6e0]">{selectedAccount.quotations.filter((quotation) => quotation.status === 'Accepted').length}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#8a8f98]">Lead records</dt>
                        <dd className="text-right font-medium text-[#d0d6e0]">{selectedAccount.leads.length}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <section className="ds-card rounded-xl border border-[#23252a] bg-[#0f1011] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#f7f8f8]">Top Corporate Customers</h2>
            <p className="mt-1 text-xs text-[#62666d]">Ranked by matched order revenue</p>
          </div>
          <CheckCircle2 size={17} className="text-[#828fff]" />
        </div>
        {topAccounts.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No matched corporate revenue" copy="Corporate orders will appear here when phone or company name matches a lead." />
          </div>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {topAccounts.map((account, index) => (
              <button
                key={account.key}
                type="button"
                onClick={() => setSelectedKey(account.key)}
                className="rounded-lg border border-[#23252a] bg-[#141516] p-3 text-left transition hover:border-[#34343a] hover:bg-[#18191a]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-[#62666d]">#{index + 1}</span>
                  <span className="text-xs font-semibold text-[#828fff]">{formatRM(account.revenue)}</span>
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-[#f7f8f8]">{account.companyName}</p>
                <p className="mt-1 text-xs text-[#8a8f98]">{account.orders.length} orders</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
