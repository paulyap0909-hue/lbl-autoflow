import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  FileText,
  Filter,
  Import,
  MessageCircle,
  MoreHorizontal,
  Search,
  Target,
  Trash2,
  X
} from 'lucide-react';
import Toast from '../components/Toast';
import {
  archiveSalesLeadInSupabase,
  createLeadActivityInSupabase,
  createSalesLeadInSupabase,
  deleteSalesLeadsFromSupabase,
  loadLeadActivitiesFromSupabase,
  loadSalesLeadsFromSupabase,
  recordSalesLeadWhatsAppContact,
  updateSalesLeadInSupabase,
  type LeadActivity,
  type SalesLead,
  type SalesLeadStatus,
  type SalesLeadType
} from '../services/salesLeadService';
import {
  completeFollowUpTaskInSupabase,
  createFollowUpTaskInSupabase,
  loadFollowUpTasksFromSupabase,
  notifyFollowUpTasksChanged,
  type FollowUpTask
} from '../services/followUpTaskService';
import { buildCorporateWhatsAppUrl, normalizeMalaysiaMobile } from '../utils/corporateWhatsApp';
import {
  buildLeadFirstContactMessage,
  buildLeadFollowUpReplyMessage
} from '../config/leadMessageTemplates';

type LeadCenterStatus = 'New' | 'Contacted' | 'Interested' | 'Quoted' | 'Won' | 'Lost';
type StatusFilter = 'All' | LeadCenterStatus;

const PAGE_SIZE = 25;
const LEAD_STATUSES: LeadCenterStatus[] = ['New', 'Contacted', 'Interested', 'Quoted', 'Won', 'Lost'];
const LEAD_TYPES: SalesLeadType[] = ['Corporate', 'Event Planner', 'Wedding Planner', 'Cafe', 'Hotel', 'School', 'Government', 'Other'];

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};

const getCurrentUserLabel = () => {
  try {
    const currentUser = JSON.parse(localStorage.getItem('lbl_currentUser') || '{}') as { email?: string; role?: string };
    return currentUser.email || currentUser.role || 'Unknown user';
  } catch {
    return 'Unknown user';
  }
};

const notifySalesDataChanged = () => {
  localStorage.setItem('lbl_sales_crm_updated_at', new Date().toISOString());
  window.dispatchEvent(new CustomEvent('lbl:sales-crm-updated'));
};

const displayStatus = (status: SalesLeadStatus): LeadCenterStatus =>
  status === 'Sample Scheduled' ? 'Interested' : status === 'Archived' ? 'Lost' : status;

const statusTone = (status: LeadCenterStatus) => {
  if (status === 'Won') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  if (status === 'Lost') return 'border-rose-500/25 bg-rose-500/10 text-rose-300';
  if (status === 'Quoted') return 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E]';
  if (status === 'Interested') return 'border-sky-500/25 bg-sky-500/10 text-sky-300';
  if (status === 'Contacted') return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  return 'border-[#334155] bg-[#0F172A] text-[#CBD5E1]';
};

const blankLead = (): SalesLead => ({
  companyName: '',
  leadType: 'Corporate',
  industry: '',
  contactPerson: '',
  phone: '',
  email: '',
  website: '',
  facebook: '',
  instagram: '',
  area: '',
  leadSource: '',
  status: 'New',
  notes: '',
  lastContactDate: '',
  nextFollowUpDate: '',
  potentialValue: 0,
  actualRevenue: 0,
  sampleStatus: 'Not Started',
  whatsappReady: false,
  messagesSent: 0,
  leadScore: 0,
  leadPriority: 'Cold',
  automationEnabled: true
});

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
};

const parseLeadCsv = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const normalizeHeader = (header: string) => header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const getValue = (values: string[], ...keys: string[]) => {
    const index = keys.map(normalizeHeader).map((key) => headers.indexOf(key)).find((candidate) => candidate >= 0);
    return index === undefined ? '' : values[index] || '';
  };
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const statusValue = getValue(values, 'status');
    const status = LEAD_STATUSES.find((item) => item.toLowerCase() === statusValue.toLowerCase()) || 'New';
    const typeValue = getValue(values, 'lead_type', 'lead type');
    const leadType = LEAD_TYPES.find((item) => item.toLowerCase() === typeValue.toLowerCase()) || 'Corporate';
    return {
      ...blankLead(),
      companyName: getValue(values, 'company_name', 'company name'),
      leadType,
      industry: getValue(values, 'industry'),
      contactPerson: getValue(values, 'contact_person', 'contact person'),
      phone: getValue(values, 'phone'),
      email: getValue(values, 'email'),
      website: getValue(values, 'website'),
      facebook: getValue(values, 'facebook'),
      instagram: getValue(values, 'instagram'),
      area: getValue(values, 'area'),
      leadSource: getValue(values, 'lead_source', 'lead source', 'source'),
      status,
      notes: getValue(values, 'notes'),
      nextFollowUpDate: getValue(values, 'next_follow_up_date', 'next follow up date', 'next_follow_up'),
      potentialValue: Number(getValue(values, 'potential_value', 'potential value')) || 0,
      whatsappReady: Boolean(getValue(values, 'phone').trim())
    } satisfies SalesLead;
  }).filter((lead) => lead.companyName.trim());
};

function KpiCard({
  label,
  value,
  note,
  active,
  onClick
}: {
  label: string;
  value: number;
  note: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[98px] rounded-xl border p-3.5 text-left transition ${
        active
          ? 'border-[#C8A96B]/45 bg-[#C8A96B]/10'
          : 'border-[#334155] bg-[#111111] hover:border-[#C8A96B]/30'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] text-[#94A3B8]">{note}</p>
    </button>
  );
}

export default function SalesCRMPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | SalesLeadType>('All');
  const [areaFilter, setAreaFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<string | number | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadDraft, setLeadDraft] = useState<SalesLead>(blankLead());
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const reload = async () => {
    setLoading(true);
    const [leadResult, activityResult, followUpResult] = await Promise.allSettled([
      loadSalesLeadsFromSupabase(),
      loadLeadActivitiesFromSupabase(),
      loadFollowUpTasksFromSupabase()
    ]);
    const warnings: string[] = [];
    if (leadResult.status === 'fulfilled') setLeads(leadResult.value);
    else warnings.push('Lead records are unavailable.');
    if (activityResult.status === 'fulfilled') setActivities(activityResult.value);
    else warnings.push('Activity history is unavailable.');
    if (followUpResult.status === 'fulfilled') setFollowUps(followUpResult.value);
    else warnings.push('Follow-up history is unavailable.');
    setLoadError(warnings.join(' '));
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const activeLeads = useMemo(() => leads.filter((lead) => lead.status !== 'Archived'), [leads]);
  const today = localDateKey();
  const taskLeadIdsDueToday = useMemo(
    () => new Set(followUps.filter((task) => task.dueDate === today && task.status !== 'Completed').map((task) => String(task.leadId))),
    [followUps, today]
  );
  const areas = useMemo(() => Array.from(new Set(activeLeads.map((lead) => lead.area).filter(Boolean))).sort(), [activeLeads]);
  const kpis = useMemo(() => ({
    new: activeLeads.filter((lead) => displayStatus(lead.status) === 'New').length,
    needContact: activeLeads.filter((lead) => displayStatus(lead.status) === 'New' && !lead.lastContactDate).length,
    followUp: activeLeads.filter((lead) => lead.nextFollowUpDate === today || taskLeadIdsDueToday.has(String(lead.id))).length,
    quoted: activeLeads.filter((lead) => displayStatus(lead.status) === 'Quoted').length,
    won: activeLeads.filter((lead) => displayStatus(lead.status) === 'Won').length,
    lost: activeLeads.filter((lead) => displayStatus(lead.status) === 'Lost').length
  }), [activeLeads, taskLeadIdsDueToday, today]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeLeads
      .filter((lead) => {
        const status = displayStatus(lead.status);
        return (
          (statusFilter === 'All' || status === statusFilter) &&
          (typeFilter === 'All' || lead.leadType === typeFilter) &&
          (areaFilter === 'All' || lead.area === areaFilter) &&
          (!query || [lead.companyName, lead.contactPerson, lead.phone, lead.area, lead.email].join(' ').toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        const aDue = a.nextFollowUpDate || '9999-12-31';
        const bDue = b.nextFollowUpDate || '9999-12-31';
        return aDue.localeCompare(bDue) || a.companyName.localeCompare(b.companyName);
      });
  }, [activeLeads, areaFilter, search, statusFilter, typeFilter]);

  useEffect(() => setPage(1), [areaFilter, search, statusFilter, typeFilter]);

  const totalPages = Math.max(Math.ceil(filteredLeads.length / PAGE_SIZE), 1);
  const visibleLeads = filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedLead = leads.find((lead) => String(lead.id) === String(selectedLeadId)) || null;
  const selectedTasks = selectedLead
    ? followUps.filter((task) => String(task.leadId) === String(selectedLead.id))
    : [];
  const selectedActivities = selectedLead
    ? activities.filter((activity) => String(activity.leadId) === String(selectedLead.id)).slice(0, 8)
    : [];

  const logActivity = async (lead: SalesLead, action: string, description: string) => {
    if (lead.id === undefined) return;
    const activity = await createLeadActivityInSupabase({
      leadId: lead.id,
      activityType: action,
      description,
      performedBy: getCurrentUserLabel()
    });
    setActivities((current) => [activity, ...current]);
  };

  const updateLead = async (lead: SalesLead, patch: Partial<SalesLead>, successMessage: string) => {
    if (!lead.id) return;
    setSaving(true);
    try {
      const saved = await updateSalesLeadInSupabase({ ...lead, ...patch });
      setLeads((current) => current.map((item) => item.id === saved.id ? saved : item));
      await logActivity(lead, `Moved to ${displayStatus(saved.status)}`, successMessage);
      notifySalesDataChanged();
      setToast({ message: successMessage, type: 'success' });
    } catch (error) {
      console.error('Lead Center update error:', error);
      setToast({ message: 'Lead update failed.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openWhatsApp = async (lead: SalesLead) => {
    const url = buildCorporateWhatsAppUrl(
      lead.phone,
      buildLeadFirstContactMessage(lead.companyName)
    );
    if (!url) {
      setToast({ message: 'Valid Malaysian mobile number missing.', type: 'error' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    if (!lead.id || ['Won', 'Lost', 'Archived'].includes(lead.status)) return;
    try {
      const saved = await recordSalesLeadWhatsAppContact(lead, today, dateAfterDays(3));
      setLeads((current) => current.map((item) => item.id === saved.id ? saved : item));
      await logActivity(lead, 'WhatsApp Sent', 'Corporate outreach message opened');
      notifySalesDataChanged();
      setToast({ message: 'WhatsApp opened and follow-up set for 3 days.', type: 'success' });
    } catch (error) {
      console.error('Lead Center WhatsApp update error:', error);
      setToast({ message: 'WhatsApp opened, but CRM update failed.', type: 'error' });
    }
  };

  const openSuggestedReply = (lead: SalesLead) => {
    const url = buildCorporateWhatsAppUrl(
      lead.phone,
      buildLeadFollowUpReplyMessage(lead.contactPerson)
    );
    if (!url) {
      setToast({ message: 'Valid Malaysian mobile number missing.', type: 'error' });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setToast({ message: 'Follow-up reply prepared for staff review.', type: 'info' });
  };

  const openQuotation = (lead: SalesLead) => {
    localStorage.setItem('lbl_selected_sales_lead_id', String(lead.id || ''));
    onNavigate?.('quotations');
  };

  const openCreateLead = () => {
    setLeadDraft(blankLead());
    setShowLeadForm(true);
  };

  const saveLead = async () => {
    if (!leadDraft.companyName.trim()) {
      setToast({ message: 'Company name is required.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (leadDraft.id) {
        const saved = await updateSalesLeadInSupabase(leadDraft);
        setLeads((current) => current.map((lead) => lead.id === saved.id ? saved : lead));
        await logActivity(saved, 'Lead Updated', `${saved.companyName} details updated`);
      } else {
        const saved = await createSalesLeadInSupabase(leadDraft);
        setLeads((current) => [saved, ...current]);
        await logActivity(saved, 'Lead Created', `${saved.companyName} added to Lead Center`);
      }
      setShowLeadForm(false);
      notifySalesDataChanged();
      setToast({ message: 'Lead saved successfully.', type: 'success' });
    } catch (error) {
      console.error('Lead save error:', error);
      setToast({ message: 'Failed to save lead.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const candidates = parseLeadCsv(await file.text());
      const phones = new Set(leads.map((lead) => normalizeMalaysiaMobile(lead.phone)).filter(Boolean));
      const companyAreas = new Set(leads.map((lead) => `${lead.companyName.trim().toLowerCase()}|${lead.area.trim().toLowerCase()}`));
      for (const candidate of candidates) {
        const phone = normalizeMalaysiaMobile(candidate.phone);
        const companyArea = `${candidate.companyName.trim().toLowerCase()}|${candidate.area.trim().toLowerCase()}`;
        if ((phone && phones.has(phone)) || companyAreas.has(companyArea)) {
          skipped += 1;
          continue;
        }
        try {
          const saved = await createSalesLeadInSupabase(candidate);
          setLeads((current) => [saved, ...current]);
          if (phone) phones.add(phone);
          companyAreas.add(companyArea);
          imported += 1;
        } catch (error) {
          console.error('Lead CSV row import error:', error);
          failed += 1;
        }
      }
      notifySalesDataChanged();
      setToast({ message: `Imported: ${imported} | Skipped duplicate: ${skipped} | Failed: ${failed}`, type: failed ? 'info' : 'success' });
    } catch (error) {
      console.error('Lead CSV import error:', error);
      setToast({ message: 'CSV import failed.', type: 'error' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const scheduleFollowUp = async (lead: SalesLead, dueDate: string, note: string) => {
    if (!lead.id || !dueDate) return;
    setSaving(true);
    try {
      const task = await createFollowUpTaskInSupabase({
        leadId: lead.id,
        leadName: lead.companyName,
        title: 'Sales follow-up',
        description: note || 'Follow up with corporate lead.',
        followUpDate: dueDate,
        dueDate,
        status: 'Pending'
      });
      const saved = await updateSalesLeadInSupabase({ ...lead, nextFollowUpDate: dueDate });
      setFollowUps((current) => [...current, task].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
      setLeads((current) => current.map((item) => item.id === saved.id ? saved : item));
      await logActivity(lead, 'Follow-up Created', `Follow-up scheduled for ${dueDate}`);
      notifyFollowUpTasksChanged();
      notifySalesDataChanged();
      setToast({ message: 'Follow-up scheduled.', type: 'success' });
    } catch (error) {
      console.error('Lead follow-up error:', error);
      setToast({ message: 'Failed to schedule follow-up.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (task: FollowUpTask) => {
    if (!task.id) return;
    try {
      const saved = await completeFollowUpTaskInSupabase(task.id);
      setFollowUps((current) => current.map((item) => item.id === saved.id ? saved : item));
      notifyFollowUpTasksChanged();
      setToast({ message: 'Follow-up completed.', type: 'success' });
    } catch (error) {
      console.error('Complete follow-up error:', error);
      setToast({ message: 'Failed to complete follow-up.', type: 'error' });
    }
  };

  const archiveLead = async (lead: SalesLead) => {
    if (!window.confirm(`Archive ${lead.companyName}?`)) return;
    try {
      await archiveSalesLeadInSupabase(lead);
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      setSelectedLeadId(null);
      notifySalesDataChanged();
      setToast({ message: 'Lead archived.', type: 'success' });
    } catch (error) {
      console.error('Archive lead error:', error);
      setToast({ message: 'Failed to archive lead.', type: 'error' });
    }
  };

  const deleteLead = async (lead: SalesLead) => {
    if (!lead.id || !window.confirm(`Delete ${lead.companyName}? This cannot be undone.`)) return;
    try {
      await deleteSalesLeadsFromSupabase([lead.id], getCurrentUserLabel());
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      setSelectedLeadId(null);
      notifySalesDataChanged();
      setToast({ message: 'Lead deleted successfully.', type: 'success' });
    } catch (error) {
      console.error('Delete lead error:', error);
      setToast({ message: 'Failed to delete lead.', type: 'error' });
    }
  };

  return (
    <div className="space-y-4 text-[#F8FAFC]">
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

      <header className="rounded-xl border border-[#334155] bg-[#111111] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Sales Operations</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Lead Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#94A3B8]">Contact, follow up, quote and close corporate opportunities from one focused workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="flex h-10 items-center gap-2 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs font-semibold text-[#CBD5E1] disabled:opacity-50">
              <Import size={14} /> {importing ? 'Importing...' : 'Import Leads'}
            </button>
            <button type="button" onClick={openCreateLead} className="flex h-10 items-center gap-2 rounded-lg bg-[#C8A96B] px-3 text-xs font-semibold text-[#111111]">
              <CirclePlus size={14} /> Add Lead
            </button>
            <span className="flex h-10 items-center rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs text-[#94A3B8]">Source: Supabase</span>
          </div>
        </div>
      </header>

      {loadError ? <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{loadError}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="New Leads" value={kpis.new} note="Not contacted yet" active={statusFilter === 'New'} onClick={() => setStatusFilter('New')} />
        <KpiCard label="Need Contact Today" value={kpis.needContact} note="First outreach required" onClick={() => { setStatusFilter('New'); setSearch(''); }} />
        <KpiCard label="Follow Up Today" value={kpis.followUp} note="Lead or task due today" onClick={() => setSearch('')} />
        <KpiCard label="Quoted" value={kpis.quoted} note="Awaiting response" active={statusFilter === 'Quoted'} onClick={() => setStatusFilter('Quoted')} />
        <KpiCard label="Won" value={kpis.won} note="Corporate accounts" active={statusFilter === 'Won'} onClick={() => setStatusFilter('Won')} />
        <KpiCard label="Lost" value={kpis.lost} note="Closed without order" active={statusFilter === 'Lost'} onClick={() => setStatusFilter('Lost')} />
      </section>

      <section className="rounded-xl border border-[#334155] bg-[#111111] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(150px,0.6fr))]">
          <label className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-[#64748B]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, contact or phone" className="h-10 w-full rounded-lg border border-[#334155] bg-[#0F172A] pl-9 pr-3 text-sm text-white outline-none focus:border-[#C8A96B]/50" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white">
            <option value="All">All statuses</option>
            {LEAD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'All' | SalesLeadType)} className="h-10 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white">
            <option value="All">All lead types</option>
            {LEAD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className="h-10 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white">
            <option value="All">All areas</option>
            {areas.map((area) => <option key={area} value={area}>{area}</option>)}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#334155] bg-[#111111]">
        <div className="flex items-center justify-between border-b border-[#334155] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Lead Directory</h2>
            <p className="mt-1 text-xs text-[#64748B]">{filteredLeads.length} matching leads</p>
          </div>
          <Filter size={15} className="text-[#C8A96B]" />
        </div>
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-[#0F172A]" />)}</div>
        ) : visibleLeads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="bg-[#0F172A] text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
                <tr>
                  {['Company', 'Contact Person', 'Phone', 'Lead Type', 'Area', 'Status', 'Last Contact', 'Next Follow-Up', 'Action'].map((header) => <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263348]">
                {visibleLeads.map((lead) => {
                  const status = displayStatus(lead.status);
                  const dueToday = lead.nextFollowUpDate === today || taskLeadIdsDueToday.has(String(lead.id));
                  return (
                    <tr key={String(lead.id || lead.companyName)} className="transition hover:bg-white/[0.025]">
                      <td className="max-w-[220px] px-3 py-3 font-semibold text-white"><button type="button" onClick={() => setSelectedLeadId(lead.id || null)} className="truncate text-left hover:text-[#E4C98E]">{lead.companyName || 'Unnamed company'}</button></td>
                      <td className="px-3 py-3 text-[#CBD5E1]">{lead.contactPerson || 'No contact person'}</td>
                      <td className="px-3 py-3 text-[#CBD5E1]">{lead.phone || '-'}</td>
                      <td className="px-3 py-3 text-[#94A3B8]">{lead.leadType}</td>
                      <td className="px-3 py-3 text-[#94A3B8]">{lead.area || '-'}</td>
                      <td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{status}</span></td>
                      <td className="px-3 py-3 text-[#94A3B8]">{lead.lastContactDate || 'Not contacted'}</td>
                      <td className={`px-3 py-3 ${dueToday ? 'font-semibold text-amber-300' : 'text-[#94A3B8]'}`}>{lead.nextFollowUpDate || 'Not scheduled'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <button type="button" disabled={!normalizeMalaysiaMobile(lead.phone)} onClick={() => void openWhatsApp(lead)} className="flex h-8 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 text-[10px] font-semibold text-emerald-200 disabled:opacity-35"><MessageCircle size={12} /> WhatsApp</button>
                          {['Contacted', 'Interested'].includes(lead.status) ? (
                            <button type="button" disabled={!normalizeMalaysiaMobile(lead.phone)} onClick={() => openSuggestedReply(lead)} className="h-8 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 text-[10px] font-semibold text-sky-200 disabled:opacity-35">Suggested Reply</button>
                          ) : null}
                          <button type="button" onClick={() => openQuotation(lead)} className="flex h-8 items-center gap-1 rounded-lg border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-2.5 text-[10px] font-semibold text-[#E4C98E]"><FileText size={12} /> Quote</button>
                          <button type="button" disabled={saving || status === 'Won'} onClick={() => void updateLead(lead, { status: 'Won' }, `${lead.companyName} marked Won.`)} className="h-8 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 text-[10px] font-semibold text-emerald-300 disabled:opacity-35">Mark Won</button>
                          <button type="button" onClick={() => setSelectedLeadId(lead.id || null)} className="flex h-8 items-center gap-1 rounded-lg border border-[#334155] bg-[#0F172A] px-2.5 text-[10px] font-semibold text-[#CBD5E1]"><MoreHorizontal size={12} /> More</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-12 text-center">
            <Target size={22} className="mx-auto text-[#64748B]" />
            <p className="mt-3 text-sm font-semibold text-white">No leads found</p>
            <p className="mt-1 text-xs text-[#64748B]">Adjust the filters or import a new lead list.</p>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[#334155] px-4 py-3 text-xs text-[#94A3B8]">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="flex h-8 items-center gap-1 rounded-lg border border-[#334155] bg-[#0F172A] px-2.5 disabled:opacity-35"><ChevronLeft size={13} /> Previous</button>
            <button type="button" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))} className="flex h-8 items-center gap-1 rounded-lg border border-[#334155] bg-[#0F172A] px-2.5 disabled:opacity-35">Next <ChevronRight size={13} /></button>
          </div>
        </div>
      </section>

      {selectedLead ? (
        <LeadDrawer
          lead={selectedLead}
          tasks={selectedTasks}
          activities={selectedActivities}
          saving={saving}
          onClose={() => setSelectedLeadId(null)}
          onWhatsApp={() => void openWhatsApp(selectedLead)}
          onSuggestedReply={() => openSuggestedReply(selectedLead)}
          onQuote={() => openQuotation(selectedLead)}
          onEdit={() => { setLeadDraft(selectedLead); setShowLeadForm(true); }}
          onStatus={(status) => void updateLead(selectedLead, { status }, `${selectedLead.companyName} moved to ${status}.`)}
          onFollowUp={(date, note) => void scheduleFollowUp(selectedLead, date, note)}
          onCompleteTask={(task) => void completeTask(task)}
          onArchive={() => void archiveLead(selectedLead)}
          onDelete={() => void deleteLead(selectedLead)}
        />
      ) : null}

      {showLeadForm ? (
        <LeadFormModal
          lead={leadDraft}
          saving={saving}
          onChange={setLeadDraft}
          onClose={() => setShowLeadForm(false)}
          onSave={() => void saveLead()}
        />
      ) : null}
    </div>
  );
}

function LeadDrawer({
  lead,
  tasks,
  activities,
  saving,
  onClose,
  onWhatsApp,
  onSuggestedReply,
  onQuote,
  onEdit,
  onStatus,
  onFollowUp,
  onCompleteTask,
  onArchive,
  onDelete
}: {
  lead: SalesLead;
  tasks: FollowUpTask[];
  activities: LeadActivity[];
  saving: boolean;
  onClose: () => void;
  onWhatsApp: () => void;
  onSuggestedReply: () => void;
  onQuote: () => void;
  onEdit: () => void;
  onStatus: (status: LeadCenterStatus) => void;
  onFollowUp: (date: string, note: string) => void;
  onCompleteTask: (task: FollowUpTask) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [followUpDate, setFollowUpDate] = useState(lead.nextFollowUpDate || localDateKey());
  const [followUpNote, setFollowUpNote] = useState('');
  const status = displayStatus(lead.status);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65">
      <button type="button" aria-label="Close lead drawer" onClick={onClose} className="min-w-0 flex-1" />
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-[#334155] bg-[#090A0B] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#334155] pb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Lead Details</p>
            <h2 className="mt-2 truncate text-xl font-semibold text-white">{lead.companyName}</h2>
            <p className="mt-1 text-sm text-[#94A3B8]">{lead.contactPerson || 'No contact person'} · {lead.phone || 'No phone'}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-[#94A3B8]"><X size={16} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={!normalizeMalaysiaMobile(lead.phone)} onClick={onWhatsApp} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500/15 text-xs font-semibold text-emerald-200 disabled:opacity-35"><MessageCircle size={14} /> WhatsApp</button>
          <button type="button" onClick={onQuote} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[#C8A96B]/30 bg-[#C8A96B]/10 text-xs font-semibold text-[#E4C98E]"><FileText size={14} /> Create Quote</button>
          {['Contacted', 'Interested'].includes(lead.status) ? (
            <button type="button" disabled={!normalizeMalaysiaMobile(lead.phone)} onClick={onSuggestedReply} className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 text-xs font-semibold text-sky-200 disabled:opacity-35"><MessageCircle size={14} /> Use Follow-up Reply Template</button>
          ) : null}
          <button type="button" onClick={onEdit} className="h-10 rounded-lg border border-[#334155] bg-[#111111] text-xs font-semibold text-[#CBD5E1]">Edit Lead</button>
          <select value={status} disabled={saving} onChange={(event) => onStatus(event.target.value as LeadCenterStatus)} className="h-10 rounded-lg border border-[#334155] bg-[#111111] px-3 text-xs font-semibold text-white">
            {LEAD_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <section className="mt-4 rounded-xl border border-[#334155] bg-[#111111] p-4">
          <h3 className="text-sm font-semibold text-white">Company Profile</h3>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            {[
              ['Lead Type', lead.leadType],
              ['Area', lead.area || '-'],
              ['Email', lead.email || '-'],
              ['Lead Source', lead.leadSource || '-'],
              ['Last Contact', lead.lastContactDate || 'Not contacted'],
              ['Next Follow-Up', lead.nextFollowUpDate || 'Not scheduled']
            ].map(([label, value]) => <div key={label}><dt className="text-[#64748B]">{label}</dt><dd className="mt-1 font-medium text-[#CBD5E1]">{value}</dd></div>)}
          </dl>
          {lead.notes ? <p className="mt-4 rounded-lg border border-[#263348] bg-[#0F172A] p-3 text-xs leading-5 text-[#94A3B8]">{lead.notes}</p> : null}
        </section>

        <section className="mt-4 rounded-xl border border-[#334155] bg-[#111111] p-4">
          <div className="flex items-center gap-2"><CalendarClock size={15} className="text-[#C8A96B]" /><h3 className="text-sm font-semibold text-white">Schedule Follow-Up</h3></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
            <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} className="h-10 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white" />
            <input value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="Follow-up note" className="h-10 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white" />
          </div>
          <button type="button" disabled={!followUpDate || saving} onClick={() => onFollowUp(followUpDate, followUpNote)} className="mt-2 h-9 w-full rounded-lg bg-[#C8A96B] text-xs font-semibold text-[#111111] disabled:opacity-40">Save Follow-Up</button>
          <div className="mt-3 space-y-2">
            {tasks.filter((task) => task.status !== 'Completed').map((task) => (
              <div key={String(task.id)} className="flex items-center justify-between gap-3 rounded-lg border border-[#263348] bg-[#0F172A] p-3">
                <div><p className="text-xs font-semibold text-white">{task.title}</p><p className="mt-1 text-[11px] text-[#94A3B8]">{task.dueDate} · {task.description}</p></div>
                <button type="button" onClick={() => onCompleteTask(task)} className="flex h-8 items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 text-[10px] font-semibold text-emerald-300"><Check size={12} /> Done</button>
              </div>
            ))}
            {!tasks.some((task) => task.status !== 'Completed') ? <p className="py-3 text-center text-xs text-[#64748B]">No open follow-ups.</p> : null}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-[#334155] bg-[#111111] p-4">
          <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
          <div className="mt-3 space-y-2">
            {activities.map((activity) => <div key={String(activity.id)} className="border-l-2 border-[#C8A96B]/40 pl-3"><p className="text-xs font-semibold text-[#CBD5E1]">{activity.activityType}</p><p className="mt-1 text-[11px] text-[#64748B]">{activity.createdAt?.slice(0, 10) || '-'} · {activity.description}</p></div>)}
            {!activities.length ? <p className="text-xs text-[#64748B]">No activity recorded.</p> : null}
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#334155] pt-4">
          <button type="button" onClick={onArchive} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 text-xs font-semibold text-amber-200"><Archive size={14} /> Archive</button>
          <button type="button" onClick={onDelete} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 text-xs font-semibold text-rose-200"><Trash2 size={14} /> Delete</button>
        </div>
      </aside>
    </div>
  );
}

function LeadFormModal({
  lead,
  saving,
  onChange,
  onClose,
  onSave
}: {
  lead: SalesLead;
  saving: boolean;
  onChange: (lead: SalesLead) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const field = (key: keyof SalesLead, value: string | number) => onChange({ ...lead, [key]: value });
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#334155] bg-[#111111] p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] uppercase tracking-[0.16em] text-[#C8A96B]">{lead.id ? 'Edit Lead' : 'New Lead'}</p><h2 className="mt-2 text-xl font-semibold text-white">{lead.id ? lead.companyName : 'Add Corporate Lead'}</h2></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-[#94A3B8]"><X size={16} /></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <FormInput label="Company Name" value={lead.companyName} onChange={(value) => field('companyName', value)} required />
          <FormInput label="Contact Person" value={lead.contactPerson} onChange={(value) => field('contactPerson', value)} />
          <FormInput label="Phone" value={lead.phone} onChange={(value) => field('phone', value)} />
          <FormInput label="Email" value={lead.email} onChange={(value) => field('email', value)} />
          <label><span className="mb-1.5 block text-xs text-[#94A3B8]">Lead Type</span><select value={lead.leadType} onChange={(event) => field('leadType', event.target.value)} className="h-10 w-full rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white">{LEAD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <FormInput label="Area" value={lead.area} onChange={(value) => field('area', value)} />
          <FormInput label="Industry" value={lead.industry} onChange={(value) => field('industry', value)} />
          <FormInput label="Lead Source" value={lead.leadSource} onChange={(value) => field('leadSource', value)} />
          <label><span className="mb-1.5 block text-xs text-[#94A3B8]">Status</span><select value={displayStatus(lead.status)} onChange={(event) => field('status', event.target.value)} className="h-10 w-full rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white">{LEAD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <FormInput label="Next Follow-Up" value={lead.nextFollowUpDate} onChange={(value) => field('nextFollowUpDate', value)} type="date" />
          <FormInput label="Potential Value" value={String(lead.potentialValue)} onChange={(value) => field('potentialValue', Number(value) || 0)} type="number" />
          <FormInput label="Website" value={lead.website} onChange={(value) => field('website', value)} />
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs text-[#94A3B8]">Notes</span><textarea value={lead.notes} onChange={(event) => field('notes', event.target.value)} rows={4} className="w-full rounded-lg border border-[#334155] bg-[#0F172A] p-3 text-sm text-white outline-none" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-[#334155] px-4 text-xs font-semibold text-[#CBD5E1]">Cancel</button>
          <button type="button" disabled={saving} onClick={onSave} className="h-10 rounded-lg bg-[#C8A96B] px-4 text-xs font-semibold text-[#111111] disabled:opacity-50">{saving ? 'Saving...' : 'Save Lead'}</button>
        </div>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span className="mb-1.5 block text-xs text-[#94A3B8]">{label}{required ? ' *' : ''}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/50" /></label>;
}
