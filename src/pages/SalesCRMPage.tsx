import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Toast from '../components/Toast';
import { formatRM } from '../utils/pricing';
import {
  createFollowUpTaskInSupabase,
  loadFollowUpTasksFromSupabase,
  notifyFollowUpTasksChanged,
  type FollowUpTask
} from '../services/followUpTaskService';
import {
  archiveSalesLeadInSupabase,
  createLeadActivityInSupabase,
  createSalesLeadInSupabase,
  deleteSalesLeadsFromSupabase,
  loadLeadActivitiesFromSupabase,
  loadSalesLeadsFromSupabase,
  updateSalesLeadInSupabase,
  type LeadActivity,
  type SalesLead,
  type SalesLeadStatus,
  type SalesLeadType
} from '../services/salesLeadService';

const statuses: SalesLeadStatus[] = ['New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost'];
const leadTypes: SalesLeadType[] = ['Corporate', 'Event Planner', 'Wedding Planner', 'Cafe', 'Hotel', 'School', 'Government', 'Other'];

const todayKey = () => new Date().toISOString().slice(0, 10);

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

const notifySalesDataChanged = () => {
  localStorage.setItem('lbl_sales_crm_updated_at', new Date().toISOString());
  window.dispatchEvent(new CustomEvent('lbl:sales-crm-updated'));
};

const corporateLeadsWhatsAppMessage = `Hi, this is Selina from Layer By Layer Bakery ☺️

May I know who would be the best person to speak with regarding staff events, office tea breaks, corporate gifting or company celebrations?

We specialise in premium handcrafted mini tarts that are commonly ordered for meetings, appreciation events, training sessions and company gatherings.

Would appreciate if you could point me in the right direction. Thank you 😊`;

type WhatsAppTemplate = 'First Outreach' | 'Follow-up 1' | 'Follow-up 2' | 'Quotation Follow-up';
type QuickFilter = 'All Active' | 'Today' | 'Hot' | 'Corporate' | 'School' | 'Hotel' | 'Wedding' | 'Event' | 'Overdue';
type PriorityFilter = 'All' | SalesLead['leadPriority'];

const whatsappTemplates: WhatsAppTemplate[] = [
  'First Outreach',
  'Follow-up 1',
  'Follow-up 2',
  'Quotation Follow-up'
];

const generateWhatsAppMessage = (_lead: SalesLead, _template: WhatsAppTemplate) => corporateLeadsWhatsAppMessage;

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
  nextFollowUpDate: todayKey(),
  potentialValue: 0,
  actualRevenue: 0,
  sampleStatus: 'Not Started',
  whatsappReady: false,
  messagesSent: 0,
  leadScore: 0,
  leadPriority: 'Cold',
  automationEnabled: true
});

const normalizeMalaysiaPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const isDue = (lead: SalesLead) =>
  Boolean(lead.nextFollowUpDate) && lead.nextFollowUpDate <= todayKey() && lead.status !== 'Won' && lead.status !== 'Lost';

const isFollowUpToday = (lead: SalesLead) =>
  lead.nextFollowUpDate === todayKey() && lead.status !== 'Won' && lead.status !== 'Lost';

const sampleStatusForLead = (lead: SalesLead) => lead.sampleStatus;

const statusTone = (status: SalesLeadStatus) => {
  if (status === 'Archived') return 'border-slate-500/20 bg-slate-500/10 text-slate-300';
  if (status === 'Won') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'Lost') return 'border-rose-500/20 bg-rose-500/10 text-rose-200';
  if (status === 'Quoted') return 'border-gold/30 bg-gold/15 text-softGold';
  if (status === 'Sample Scheduled') return 'border-sky-500/20 bg-sky-500/10 text-sky-200';
  if (status === 'Interested') return 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200';
  if (status === 'Contacted') return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  return 'border-white/10 bg-white/5 text-slate-300';
};

const toNumber = (value: string) => {
  const parsed = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: string): SalesLeadStatus => {
  const match = statuses.find((status) => status.toLowerCase() === value.trim().toLowerCase());
  return match || 'New';
};

const normalizeLeadType = (value: string): SalesLeadType => {
  const match = leadTypes.find((type) => type.toLowerCase() === value.trim().toLowerCase());
  return match || 'Corporate';
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && quoted && nextChar === '"') {
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
  const valueAt = (values: string[], ...names: string[]) => {
    const index = names
      .map(normalizeHeader)
      .map((name) => headers.indexOf(name))
      .find((headerIndex) => headerIndex >= 0);
    return index === undefined ? '' : values[index] || '';
  };

  return lines.slice(1).map((line): SalesLead => {
    const values = parseCsvLine(line);
    const industry = valueAt(values, 'industry');
    return {
      companyName: valueAt(values, 'company_name', 'company name'),
      leadType: normalizeLeadType(valueAt(values, 'lead_type', 'lead type') || 'Corporate'),
      industry,
      contactPerson: valueAt(values, 'contact_person', 'contact person'),
      phone: valueAt(values, 'phone'),
      email: valueAt(values, 'email'),
      website: valueAt(values, 'website'),
      facebook: valueAt(values, 'facebook'),
      instagram: valueAt(values, 'instagram'),
      area: valueAt(values, 'area'),
      leadSource: valueAt(values, 'lead_source', 'lead source'),
      status: normalizeStatus(valueAt(values, 'status') || 'New'),
      notes: valueAt(values, 'notes'),
      lastContactDate: valueAt(values, 'last_contact_date', 'last contact date'),
      nextFollowUpDate: valueAt(values, 'next_follow_up_date', 'next follow up date', 'next_follow_up'),
      potentialValue: toNumber(valueAt(values, 'potential_value', 'potential value')),
      actualRevenue: 0,
      sampleStatus: 'Not Started',
      whatsappReady: Boolean(valueAt(values, 'phone').trim()),
      messagesSent: 0,
      leadScore: 0,
      leadPriority: 'Cold',
      automationEnabled: true
    };
  });
};

const priorityTone = (priority: SalesLead['leadPriority']) => {
  if (priority === 'Hot') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (priority === 'Warm') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/20 bg-sky-500/10 text-sky-200';
};

export default function SalesCRMPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | number | null>(null);
  const [draftLead, setDraftLead] = useState<SalesLead>(blankLead());
  const [noteDraft, setNoteDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'All' | SalesLeadType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | SalesLeadStatus>('All');
  const [areaFilter, setAreaFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [loadError, setLoadError] = useState('');
  const [drawerLeadId, setDrawerLeadId] = useState<string | number | null>(null);
  const [draggingLeadId, setDraggingLeadId] = useState<string | number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<SalesLeadStatus | null>(null);
  const [leadPendingDelete, setLeadPendingDelete] = useState<SalesLead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [templateLead, setTemplateLead] = useState<SalesLead | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate>('First Outreach');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('All Active');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('All');
  const [visibleActiveCount, setVisibleActiveCount] = useState(30);
  const [expandedSections, setExpandedSections] = useState({
    analytics: false,
    won: false,
    lost: false,
    archived: false
  });
  const [isSelectedPanelExpanded, setIsSelectedPanelExpanded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    Promise.all([
      loadSalesLeadsFromSupabase(),
      loadLeadActivitiesFromSupabase(),
      loadFollowUpTasksFromSupabase()
    ])
      .then(([leadData, activityData, taskData]) => {
        setLeads(leadData);
        setActivities(activityData);
        setFollowUpTasks(taskData);
        setSelectedLeadId(leadData[0]?.id || null);
        setLoadError('');
      })
      .catch((error) => {
        console.error('Sales CRM load error:', error);
        setLeads([]);
        setActivities([]);
        setSelectedLeadId(null);
        setLoadError(error instanceof Error ? error.message : 'Unable to load Sales CRM from Supabase.');
      });
  }, []);

  const nonArchivedLeads = useMemo(() => leads.filter((lead) => lead.status !== 'Archived'), [leads]);
  const activePipelineStatuses: SalesLeadStatus[] = ['New', 'Contacted', 'Interested', 'Quoted'];
  const activeLeads = useMemo(() => nonArchivedLeads.filter((lead) => activePipelineStatuses.includes(lead.status)), [nonArchivedLeads]);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;
  const areas = useMemo(() => Array.from(new Set(nonArchivedLeads.map((lead) => lead.area).filter(Boolean))).sort(), [nonArchivedLeads]);
  const leadSources = useMemo(() => Array.from(new Set(nonArchivedLeads.map((lead) => lead.leadSource).filter(Boolean))).sort(), [nonArchivedLeads]);

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return activeLeads.filter((lead) => {
      const matchesLeadType = leadTypeFilter === 'All' || lead.leadType === leadTypeFilter;
      const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
      const matchesArea = areaFilter === 'All' || lead.area === areaFilter;
      const matchesSource = sourceFilter === 'All' || lead.leadSource === sourceFilter;
      const matchesPriority = priorityFilter === 'All' || lead.leadPriority === priorityFilter;
      const matchesQuickFilter =
        quickFilter === 'All Active' ||
        (quickFilter === 'Today' && (isFollowUpToday(lead) || (lead.status === 'New' && !lead.lastContactDate))) ||
        (quickFilter === 'Hot' && (lead.leadPriority === 'Hot' || lead.leadScore >= 80)) ||
        (quickFilter === 'Corporate' && lead.leadType === 'Corporate') ||
        (quickFilter === 'School' && lead.leadType === 'School') ||
        (quickFilter === 'Hotel' && lead.leadType === 'Hotel') ||
        (quickFilter === 'Wedding' && lead.leadType === 'Wedding Planner') ||
        (quickFilter === 'Event' && lead.leadType === 'Event Planner') ||
        (quickFilter === 'Overdue' && isDue(lead) && !isFollowUpToday(lead));
      const matchesSearch = !query || [
        lead.companyName,
        lead.leadType,
        lead.industry,
        lead.contactPerson,
        lead.phone,
        lead.email,
        lead.website,
        lead.facebook,
        lead.instagram,
        lead.area,
        lead.leadSource,
        lead.notes
      ].join(' ').toLowerCase().includes(query);
      return matchesLeadType && matchesStatus && matchesArea && matchesSource && matchesPriority && matchesQuickFilter && matchesSearch;
    });
  }, [activeLeads, areaFilter, leadTypeFilter, priorityFilter, quickFilter, searchTerm, sourceFilter, statusFilter]);

  useEffect(() => {
    setVisibleActiveCount(30);
  }, [areaFilter, leadTypeFilter, priorityFilter, quickFilter, searchTerm, sourceFilter, statusFilter]);

  const groupedLeads = useMemo(() => {
    return statuses.reduce<Record<SalesLeadStatus, SalesLead[]>>((acc, status) => {
      acc[status] = filteredLeads.filter((lead) => lead.status === status);
      return acc;
    }, {
      New: [],
      Contacted: [],
      Interested: [],
      'Sample Scheduled': [],
      Quoted: [],
      Won: [],
      Lost: [],
      Archived: []
    });
  }, [filteredLeads]);

  const kpis = useMemo(() => ({
    total: nonArchivedLeads.length,
    needContactToday: nonArchivedLeads.filter((lead) => lead.status === 'New' && !lead.lastContactDate && lead.messagesSent === 0).length,
    followUpToday: nonArchivedLeads.filter(isFollowUpToday).length,
    overdueLeads: nonArchivedLeads.filter((lead) => isDue(lead) && !isFollowUpToday(lead)).length,
    pipelineValue: nonArchivedLeads
      .filter((lead) => lead.status !== 'Won' && lead.status !== 'Lost')
      .reduce((sum, lead) => sum + lead.potentialValue, 0),
    new: nonArchivedLeads.filter((lead) => lead.status === 'New').length,
    contacted: nonArchivedLeads.filter((lead) => lead.status === 'Contacted').length,
    interested: nonArchivedLeads.filter((lead) => lead.status === 'Interested').length,
    sample: nonArchivedLeads.filter((lead) => lead.status === 'Sample Scheduled').length,
    quoted: nonArchivedLeads.filter((lead) => lead.status === 'Quoted').length,
    won: nonArchivedLeads.filter((lead) => lead.status === 'Won').length,
    lost: nonArchivedLeads.filter((lead) => lead.status === 'Lost').length,
    revenue: nonArchivedLeads.reduce((sum, lead) => sum + lead.actualRevenue, 0)
  }), [nonArchivedLeads]);

  const automationKpis = useMemo(() => {
    const today = todayKey();
    return {
      hot: nonArchivedLeads.filter((lead) => lead.leadPriority === 'Hot' || lead.leadScore >= 80).length,
      warm: nonArchivedLeads.filter((lead) => lead.leadPriority === 'Warm').length,
      cold: nonArchivedLeads.filter((lead) => lead.leadPriority === 'Cold').length,
      autoFollowUps: activities.filter((activity) => activity.activityType === 'Auto Follow-up Schedule Created').length,
      needingContactToday: followUpTasks.filter((task) => task.dueDate === today && task.status !== 'Completed').length
    };
  }, [nonArchivedLeads, activities, followUpTasks]);

  const followUpKpis = useMemo(() => {
    const today = todayKey();
    return {
      dueToday: followUpTasks.filter((task) => task.dueDate === today && task.status !== 'Completed').length,
      overdue: followUpTasks.filter((task) => task.status === 'Overdue').length,
      completed: followUpTasks.filter((task) => task.status === 'Completed').length
    };
  }, [followUpTasks]);

  const whatsappStats = useMemo(() => {
    const withPhone = nonArchivedLeads.filter((lead) => normalizeMalaysiaPhone(lead.phone)).length;
    const sentLeadIds = new Set(
      activities
        .filter((activity) => activity.activityType === 'WhatsApp' || activity.activityType === 'WhatsApp Sent')
        .map((activity) => String(activity.leadId))
    );
    const sent = nonArchivedLeads.filter((lead) => lead.id !== undefined && sentLeadIds.has(String(lead.id))).length;
    const pending = Math.max(withPhone - sent, 0);
    return { withPhone, sent, pending };
  }, [nonArchivedLeads, activities]);

  const sampleBoxStats = useMemo(() => {
    const scheduled = nonArchivedLeads.filter((lead) => sampleStatusForLead(lead) === 'Scheduled').length;
    const requested = nonArchivedLeads.filter((lead) => sampleStatusForLead(lead) === 'Requested').length;
    const delivered = nonArchivedLeads.filter((lead) => sampleStatusForLead(lead) === 'Delivered').length;
    return { scheduled, requested, delivered };
  }, [nonArchivedLeads]);

  const activityTimeline = useMemo(() => {
    const leadNames = new Map(leads.map((lead) => [String(lead.id), lead.companyName]));
    return activities.slice(0, 10).map((activity) => ({
      id: String(activity.id || `${activity.leadId}-${activity.createdAt}`),
      date: activity.createdAt?.slice(0, 10) || '',
      title: leadNames.get(String(activity.leadId)) || 'Lead',
      detail: activity.description || activity.activityType,
      action: activity.activityType,
      user: activity.performedBy || 'Unknown user'
    }));
  }, [activities, leads]);

  const visibleActiveLeads = useMemo(() => filteredLeads.slice(0, visibleActiveCount), [filteredLeads, visibleActiveCount]);
  const wonLeads = useMemo(() => leads.filter((lead) => lead.status === 'Won'), [leads]);
  const lostLeads = useMemo(() => leads.filter((lead) => lead.status === 'Lost'), [leads]);
  const archivedLeads = useMemo(() => leads.filter((lead) => lead.status === 'Archived'), [leads]);
  const quickFilters: QuickFilter[] = ['All Active', 'Today', 'Hot', 'Corporate', 'School', 'Hotel', 'Wedding', 'Event', 'Overdue'];

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const recordActivity = async (leadId: number | string | undefined, activityType: string, description: string) => {
    if (leadId === undefined) return;
    try {
      const created = await createLeadActivityInSupabase({
        leadId,
        activityType,
        description,
        performedBy: getCurrentUserLabel()
      });
      setActivities((current) => [created, ...current]);
    } catch (error) {
      console.error('Lead activity error:', error);
      setToast({ message: 'Lead saved, but activity logging failed.', type: 'error' });
    }
  };

  const refreshSalesCRMData = async () => {
    const [leadData, activityData, taskData] = await Promise.all([
      loadSalesLeadsFromSupabase(),
      loadLeadActivitiesFromSupabase(),
      loadFollowUpTasksFromSupabase()
    ]);
    setLeads(leadData);
    setActivities(activityData);
    setFollowUpTasks(taskData);
    setSelectedLeadId((current) => (
      leadData.some((lead) => lead.id === current && lead.status !== 'Archived')
        ? current
        : leadData.find((lead) => lead.status !== 'Archived')?.id || null
    ));
    notifySalesDataChanged();
  };

  const persistUpdatedLead = async (updatedLead: SalesLead) => {
    try {
      const saved = await updateSalesLeadInSupabase(updatedLead);
      setLeads((current) => current.map((lead) => lead.id === saved.id ? saved : lead));
      setToast({ message: 'Lead updated.', type: 'success' });
    } catch (error) {
      console.error('Sales lead update error:', error);
      setToast({ message: 'Failed to update lead in Supabase.', type: 'error' });
      throw error;
    }
  };

  const moveLeadToStatus = async (lead: SalesLead, status: SalesLeadStatus) => {
    if (lead.status === status || status === 'Archived') return;

    try {
      const updatedLead = {
        ...lead,
        status,
        lastContactDate: todayKey(),
        actualRevenue: status === 'Won' ? lead.actualRevenue || lead.potentialValue : lead.actualRevenue
      };
      await updateSalesLeadInSupabase(updatedLead);
      await createLeadActivityInSupabase({
        leadId: lead.id || '',
        activityType: `Moved to ${status}`,
        description: `${lead.companyName} moved from ${lead.status} to ${status}`,
        performedBy: getCurrentUserLabel()
      });
      await refreshSalesCRMData();
      setToast({ message: `Lead moved to ${status}.`, type: 'success' });
    } catch (error) {
      console.error('Move lead error:', error);
      setToast({ message: 'Failed to move lead.', type: 'error' });
    } finally {
      setDraggingLeadId(null);
      setDragOverStatus(null);
    }
  };

  const handleLeadDrop = async (status: SalesLeadStatus) => {
    const lead = leads.find((item) => String(item.id) === String(draggingLeadId));
    if (!lead) {
      setDraggingLeadId(null);
      setDragOverStatus(null);
      return;
    }
    await moveLeadToStatus(lead, status);
  };

  const createLead = async (lead: SalesLead, quiet = false) => {
    try {
      const saved = await createSalesLeadInSupabase(lead);
      setLeads((current) => [saved, ...current]);
      setSelectedLeadId(saved.id || null);
      await recordActivity(saved.id, 'Lead Created', `Lead created for ${saved.companyName}`);
      notifySalesDataChanged();
      if (!quiet) setToast({ message: 'Lead created in Supabase.', type: 'success' });
    } catch (error) {
      console.error('Sales lead create error:', error);
      if (!quiet) setToast({ message: 'Failed to create lead in Supabase.', type: 'error' });
      throw error;
    }
  };

  const addLead = async () => {
    if (!draftLead.companyName.trim()) {
      setToast({ message: 'Company name is required.', type: 'error' });
      return;
    }
    await createLead(draftLead);
    setDraftLead(blankLead());
  };

  const handleCsvImport = async (file: File) => {
    setIsImporting(true);
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const text = await file.text();
      const parsedLeads = parseLeadCsv(text);
      if (!parsedLeads.length) {
        setToast({ message: 'Imported: 0 | Skipped duplicate: 0 | Failed: 0', type: 'error' });
        return;
      }

      const currentLeads = await loadSalesLeadsFromSupabase();
      const phoneKeys = new Set(
        currentLeads
          .map((lead) => normalizeMalaysiaPhone(lead.phone))
          .filter(Boolean)
      );
      const companyAreaKeys = new Set(
        currentLeads.map((lead) => `${lead.companyName.trim().toLowerCase()}|${lead.area.trim().toLowerCase()}`)
      );

      for (const lead of parsedLeads) {
        if (!lead.companyName.trim()) {
          failed += 1;
          continue;
        }

        const phoneKey = normalizeMalaysiaPhone(lead.phone);
        const companyAreaKey = `${lead.companyName.trim().toLowerCase()}|${lead.area.trim().toLowerCase()}`;
        const isDuplicate = (Boolean(phoneKey) && phoneKeys.has(phoneKey)) || companyAreaKeys.has(companyAreaKey);

        if (isDuplicate) {
          skipped += 1;
          continue;
        }

        try {
          await createSalesLeadInSupabase({
            ...lead,
            status: 'New',
            potentialValue: 0,
            actualRevenue: 0,
            sampleStatus: 'Not Started',
            whatsappReady: Boolean(phoneKey),
            messagesSent: 0
          });
          imported += 1;
          if (phoneKey) phoneKeys.add(phoneKey);
          companyAreaKeys.add(companyAreaKey);
        } catch (error) {
          console.error('CSV lead import error:', error);
          failed += 1;
        }
      }

      const refreshedLeads = await loadSalesLeadsFromSupabase();
      setLeads(refreshedLeads);
      setSelectedLeadId(refreshedLeads[0]?.id || null);
      setLoadError('');
      notifySalesDataChanged();
      setToast({
        message: `Imported: ${imported} | Skipped duplicate: ${skipped} | Failed: ${failed}`,
        type: failed > 0 ? 'info' : 'success'
      });
    } catch (error) {
      console.error('CSV import error:', error);
      setToast({
        message: `Imported: ${imported} | Skipped duplicate: ${skipped} | Failed: ${Math.max(failed, 1)}`,
        type: 'error'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const archiveLead = async (lead: SalesLead) => {
    try {
      await recordActivity(lead.id, 'Archive Lead', `Lead archived: ${lead.companyName}`);
      await archiveSalesLeadInSupabase(lead);
      if (drawerLeadId === lead.id) setDrawerLeadId(null);
      await refreshSalesCRMData();
      setToast({ message: 'Lead archived successfully', type: 'success' });
    } catch (error) {
      console.error('Archive lead error:', error);
      setToast({ message: 'Failed to archive lead', type: 'error' });
    }
  };

  const deleteLeads = async (leadIds: Array<number | string>) => {
    await deleteSalesLeadsFromSupabase(leadIds, getCurrentUserLabel());
    await refreshSalesCRMData();
  };

  const confirmDeleteLead = async () => {
    if (!leadPendingDelete?.id) {
      setToast({ message: 'Failed to delete lead', type: 'error' });
      return;
    }

    setIsDeleting(true);
    try {
      await deleteLeads([leadPendingDelete.id]);
      if (drawerLeadId === leadPendingDelete.id) setDrawerLeadId(null);
      setLeadPendingDelete(null);
      setToast({ message: 'Lead deleted successfully', type: 'success' });
    } catch (error) {
      console.error('Delete lead error:', error);
      setToast({ message: 'Failed to delete lead', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const updateSelectedStatus = (status: SalesLeadStatus) => {
    if (!selectedLead) return;
    moveLeadToStatus(selectedLead, status);
  };

  const addNote = () => {
    if (!selectedLead || !noteDraft.trim()) return;
    const notes = `${todayKey()}: ${noteDraft.trim()}\n${selectedLead.notes || ''}`.trim();
    const note = noteDraft.trim();
    persistUpdatedLead({ ...selectedLead, notes, lastContactDate: todayKey() })
      .then(() => recordActivity(selectedLead.id, 'Note Added', note))
      .catch(() => undefined);
    setNoteDraft('');
  };

  const createFollowUpTask = async (lead: SalesLead, task: Pick<FollowUpTask, 'title' | 'description' | 'dueDate'>) => {
    try {
      if (!lead.id) throw new Error('Lead ID missing.');
      const created = await createFollowUpTaskInSupabase({
        leadId: lead.id,
        ...task,
        followUpDate: task.dueDate,
        status: 'Pending'
      });
      await createLeadActivityInSupabase({
        leadId: lead.id,
        activityType: 'Follow-up Created',
        description: `${created.title} due ${created.dueDate}`,
        performedBy: getCurrentUserLabel()
      });
      await refreshSalesCRMData();
      notifyFollowUpTasksChanged();
      setToast({ message: 'Follow-up task created.', type: 'success' });
    } catch (error) {
      console.error('Follow-up task create error:', error);
      setToast({ message: 'Failed to create follow-up task.', type: 'error' });
      throw error;
    }
  };

  const openWhatsApp = async (lead: SalesLead, message = corporateLeadsWhatsAppMessage) => {
    const phone = normalizeMalaysiaPhone(lead.phone);
    if (!phone) {
      setToast({ message: 'Phone number missing.', type: 'error' });
      return;
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');

    try {
      await updateSalesLeadInSupabase({
        ...lead,
        status: 'Contacted',
        messagesSent: lead.messagesSent + 1,
        whatsappReady: true,
        lastContactDate: todayKey()
      });
      await createLeadActivityInSupabase({
        leadId: lead.id || '',
        activityType: 'WhatsApp Sent',
        description: 'Outreach message opened',
        performedBy: getCurrentUserLabel()
      });
      await refreshSalesCRMData();
      setToast({ message: 'WhatsApp outreach opened.', type: 'success' });
    } catch (error) {
      console.error('WhatsApp outreach error:', error);
      await refreshSalesCRMData().catch(() => undefined);
      setToast({ message: 'WhatsApp opened, but CRM update failed.', type: 'error' });
    }
  };

  const openTemplateEngine = (lead: SalesLead) => {
    setTemplateLead(lead);
    setSelectedTemplate('First Outreach');
    setGeneratedMessage(generateWhatsAppMessage(lead, 'First Outreach'));
  };

  const generateSelectedTemplate = async () => {
    if (!templateLead) return;
    const message = generateWhatsAppMessage(templateLead, selectedTemplate);
    setGeneratedMessage(message);
    await recordActivity(
      templateLead.id,
      'WhatsApp Template Generated',
      `${selectedTemplate} template generated`
    );
    notifySalesDataChanged();
    setToast({ message: 'WhatsApp message generated.', type: 'success' });
  };

  const openLeadDrawer = (lead: SalesLead) => {
    setSelectedLeadId(lead.id || null);
    setDrawerLeadId(lead.id || null);
  };

  return (
    <div className="design-linear-page space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="ds-hero p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="ds-eyebrow">Corporate Leads</p>
            <h3 className="ds-page-title mt-2">Sales Command Center</h3>
            <p className="ds-page-copy mt-2 max-w-3xl">
              Manage corporate, school, hotel, wedding and event leads in one focused pipeline.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleCsvImport(file);
                event.currentTarget.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="ds-primary-button px-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting ? 'Importing...' : 'Import Leads'}
            </button>
            <div className="ds-secondary-button flex items-center px-4 text-[#8a8f98]">Source: Supabase</div>
          </div>
        </div>
      </section>

      {loadError && (
        <section className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-200">Supabase Connection Error</p>
          <p className="mt-2 text-sm text-rose-100">{loadError}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Need Contact Today" value={kpis.needContactToday} note="New leads awaiting first outreach" tone="green" />
        <KpiTile label="Follow Up Today" value={kpis.followUpToday} note="Next follow-up is today" tone="gold" />
        <KpiTile label="Hot Leads" value={automationKpis.hot} note="Hot priority or score 80+" tone="red" />
        <KpiTile label="Overdue Leads" value={kpis.overdueLeads} note="Past follow-up date" tone="blue" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['New', kpis.new],
          ['Contacted', kpis.contacted],
          ['Interested', kpis.interested],
          ['Quoted', kpis.quoted],
          ['Won', kpis.won],
          ['Lost', kpis.lost]
        ].map(([label, value]) => (
          <KpiTile key={label} label={String(label)} value={value as number} note="Pipeline total" />
        ))}
      </section>

      <section className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(150px,1fr))]">
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search company, contact, phone" className="h-11 rounded-2xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-gold/40" />
          <select value={leadTypeFilter} onChange={(event) => setLeadTypeFilter(event.target.value as 'All' | SalesLeadType)} className="h-11 rounded-2xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {leadTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | SalesLeadStatus)} className="h-11 rounded-2xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className="h-11 rounded-2xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {areas.map((area) => <option key={area}>{area}</option>)}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)} className="h-11 rounded-2xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            <option>Hot</option>
            <option>Warm</option>
            <option>Cold</option>
          </select>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="h-11 rounded-2xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none focus:border-gold/40 lg:col-start-5">
            <option>All</option>
            {leadSources.map((leadSource) => <option key={leadSource}>{leadSource}</option>)}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setQuickFilter(filter)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                quickFilter === filter ? 'border-gold/60 bg-gold text-charcoal' : 'border-[#334155] bg-[#0F172A] text-slate-300 hover:border-gold/40'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      <section className="ds-card grid gap-3 rounded-xl border border-white/10 bg-[#141414] p-4 md:grid-cols-2 xl:grid-cols-4">
        <input value={draftLead.companyName} onChange={(event) => setDraftLead({ ...draftLead, companyName: event.target.value })} placeholder="Company Name" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <select value={draftLead.leadType} onChange={(event) => setDraftLead({ ...draftLead, leadType: event.target.value as SalesLeadType })} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40">
          {leadTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <input value={draftLead.industry} onChange={(event) => setDraftLead({ ...draftLead, industry: event.target.value })} placeholder="Industry" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.contactPerson} onChange={(event) => setDraftLead({ ...draftLead, contactPerson: event.target.value })} placeholder="Contact Person" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.phone} onChange={(event) => setDraftLead({ ...draftLead, phone: event.target.value })} placeholder="Phone" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.email} onChange={(event) => setDraftLead({ ...draftLead, email: event.target.value })} placeholder="Email" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.website} onChange={(event) => setDraftLead({ ...draftLead, website: event.target.value })} placeholder="Website" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.facebook} onChange={(event) => setDraftLead({ ...draftLead, facebook: event.target.value })} placeholder="Facebook" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.instagram} onChange={(event) => setDraftLead({ ...draftLead, instagram: event.target.value })} placeholder="Instagram" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.area} onChange={(event) => setDraftLead({ ...draftLead, area: event.target.value })} placeholder="Area" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.leadSource} onChange={(event) => setDraftLead({ ...draftLead, leadSource: event.target.value })} placeholder="Lead Source" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.notes} onChange={(event) => setDraftLead({ ...draftLead, notes: event.target.value })} placeholder="Notes" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-xs text-slate-500">
          Last contact
          <input type="date" value={draftLead.lastContactDate} onChange={(event) => setDraftLead({ ...draftLead, lastContactDate: event.target.value })} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
        </label>
        <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-xs text-slate-500">
          Next follow-up
          <input type="date" value={draftLead.nextFollowUpDate} onChange={(event) => setDraftLead({ ...draftLead, nextFollowUpDate: event.target.value })} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
        </label>
        <button onClick={addLead} className="ds-primary-button h-11 px-4">Add Lead</button>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
        <div className="space-y-5">
          <section className="ds-card rounded-xl border border-[#334155] bg-[#1E293B] p-5">
            <div className="flex flex-col gap-2 border-b border-[#334155] pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-softGold">Active Leads</p>
                <h4 className="mt-2 text-xl font-semibold text-white">Who to contact next</h4>
              </div>
              <p className="text-sm text-slate-400">Showing {visibleActiveLeads.length} of {filteredLeads.length}</p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {visibleActiveLeads.map((lead) => (
                <SalesLeadCard
                  key={lead.id}
                  lead={lead}
                  selected={String(selectedLeadId) === String(lead.id)}
                  onSelect={() => {
                    setSelectedLeadId(lead.id || null);
                    setIsSelectedPanelExpanded(false);
                  }}
                  onOpenWhatsApp={openWhatsApp}
                  onGenerateWhatsApp={openTemplateEngine}
                  onFollowUp={(item) => {
                    setSelectedLeadId(item.id || null);
                    setIsSelectedPanelExpanded(true);
                  }}
                  onViewDetails={(item) => {
                    setSelectedLeadId(item.id || null);
                    openLeadDrawer(item);
                  }}
                  onArchive={archiveLead}
                  onDelete={setLeadPendingDelete}
                />
              ))}

              {!loadError && filteredLeads.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#334155] bg-[#0F172A] p-8 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
                  No active leads match the current filters.
                </div>
              )}
            </div>

            {filteredLeads.length > visibleActiveLeads.length && (
              <button
                onClick={() => setVisibleActiveCount((count) => count + 30)}
                className="ds-secondary-button mt-5 w-full px-4"
              >
                Load More
              </button>
            )}
          </section>

          <CollapsibleBlock title="Analytics Summary" count={5} expanded={expandedSections.analytics} onToggle={() => toggleSection('analytics')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MiniStat label="Warm Leads" value={automationKpis.warm} />
              <MiniStat label="Cold Leads" value={automationKpis.cold} />
              <MiniStat label="Auto Follow-ups" value={automationKpis.autoFollowUps} />
              <MiniStat label="Completed Tasks" value={followUpKpis.completed} />
              <MiniStat label="Sample Scheduled" value={kpis.sample} />
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              <MiniStat label="Sample Requested" value={sampleBoxStats.requested} />
              <MiniStat label="Messages Sent" value={whatsappStats.sent} />
              <MiniStat label="Pending Outreach" value={whatsappStats.pending} />
            </div>
          </CollapsibleBlock>

          <LeadArchiveList title="Won Leads" leads={wonLeads} expanded={expandedSections.won} onToggle={() => toggleSection('won')} onView={openLeadDrawer} />
          <LeadArchiveList title="Lost Leads" leads={lostLeads} expanded={expandedSections.lost} onToggle={() => toggleSection('lost')} onView={openLeadDrawer} />
          <LeadArchiveList title="Archived Leads" leads={archivedLeads} expanded={expandedSections.archived} onToggle={() => toggleSection('archived')} onView={openLeadDrawer} />
        </div>

        <SelectedLeadPanel
          lead={selectedLead}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onAddNote={addNote}
          onOpenWhatsApp={openWhatsApp}
          onGenerateWhatsApp={openTemplateEngine}
          onStatusChange={updateSelectedStatus}
          onUpdate={persistUpdatedLead}
          onArchive={archiveLead}
          onDelete={setLeadPendingDelete}
          onEdit={openLeadDrawer}
          onCreateFollowUp={createFollowUpTask}
          onViewHistory={openLeadDrawer}
          expanded={isSelectedPanelExpanded}
          setExpanded={setIsSelectedPanelExpanded}
        />
      </section>

      {drawerLeadId && (() => {
        const drawerLead = leads.find((lead) => lead.id === drawerLeadId) || null;
        if (!drawerLead) return null;
        return (
          <LeadDetailDrawer
            lead={drawerLead}
            activities={activities.filter((activity) => String(activity.leadId) === String(drawerLead.id))}
            onClose={() => setDrawerLeadId(null)}
            onOpenWhatsApp={openWhatsApp}
            onGenerateWhatsApp={openTemplateEngine}
            onStatusChange={(status) => {
              moveLeadToStatus(drawerLead, status);
            }}
            onUpdate={persistUpdatedLead}
            onArchive={archiveLead}
            onDelete={setLeadPendingDelete}
          />
        );
      })()}

      {templateLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="whatsapp-template-title" className="ds-card w-full max-w-2xl rounded-xl border border-gold/20 bg-[#141414] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-softGold">WhatsApp Template Engine</p>
                <h3 id="whatsapp-template-title" className="mt-2 text-2xl font-semibold text-white">{templateLead.companyName}</h3>
              </div>
              <button onClick={() => setTemplateLead(null)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5">Close</button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedTemplate}
                onChange={(event) => {
                  const template = event.target.value as WhatsAppTemplate;
                  setSelectedTemplate(template);
                  setGeneratedMessage(generateWhatsAppMessage(templateLead, template));
                }}
                className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40"
              >
                {whatsappTemplates.map((template) => <option key={template}>{template}</option>)}
              </select>
              <button onClick={generateSelectedTemplate} className="rounded-2xl bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold">
                Generate Message
              </button>
            </div>

            <textarea
              value={generatedMessage}
              onChange={(event) => setGeneratedMessage(event.target.value)}
              rows={11}
              className="mt-4 w-full rounded-[20px] border border-white/10 bg-[#0f0f0f] px-4 py-4 text-sm leading-6 text-white outline-none focus:border-gold/40"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(generatedMessage);
                  setToast({ message: 'Message copied.', type: 'success' });
                }}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                Copy Message
              </button>
              <button
                disabled={!normalizeMalaysiaPhone(templateLead.phone)}
                onClick={() => openWhatsApp(templateLead, generatedMessage)}
                className="rounded-2xl bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {leadPendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-lead-title" className="ds-card w-full max-w-md rounded-xl border border-white/10 bg-[#141414] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-rose-300">Permanent Action</p>
            <h3 id="delete-lead-title" className="mt-2 text-2xl font-semibold text-white">Delete Lead</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Are you sure you want to delete this lead?
            </p>
            <p className="mt-2 text-sm font-semibold text-white">{leadPendingDelete.companyName}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setLeadPendingDelete(null)}
                disabled={isDeleting}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteLead}
                disabled={isDeleting}
                className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, note, tone = 'gold' }: { label: string; value: number | string; note: string; tone?: 'gold' | 'green' | 'red' | 'blue' }) {
  const toneClass = {
    gold: 'text-softGold',
    green: 'text-emerald-300',
    red: 'text-rose-300',
    blue: 'text-sky-300'
  }[tone];

  return (
    <div className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-4 transition">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      <p className={`mt-2 text-xs ${toneClass}`}>{note}</p>
    </div>
  );
}

function CollapsibleBlock({
  title,
  count,
  expanded,
  onToggle,
  children
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <section className="ds-card rounded-xl border border-[#334155] bg-[#111111]">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{count} items</p>
        </div>
        <span className="flex items-center gap-3">
          <span className="rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold text-softGold">{count}</span>
          <Icon size={18} className="text-softGold" />
        </span>
      </button>
      {expanded && <div className="border-t border-[#334155] p-5">{children}</div>}
    </section>
  );
}

function SalesLeadCard({
  lead,
  selected,
  onSelect,
  onOpenWhatsApp,
  onGenerateWhatsApp,
  onFollowUp,
  onViewDetails,
  onArchive,
  onDelete
}: {
  lead: SalesLead;
  selected: boolean;
  onSelect: () => void;
  onOpenWhatsApp: (lead: SalesLead) => void;
  onGenerateWhatsApp: (lead: SalesLead) => void;
  onFollowUp: (lead: SalesLead) => void;
  onViewDetails: (lead: SalesLead) => void;
  onArchive: (lead: SalesLead) => void;
  onDelete: (lead: SalesLead) => void;
}) {
  return (
    <article onClick={onSelect} className={`ds-card rounded-xl border bg-[#111111] p-4 transition ${selected ? 'border-[#5e6ad2] bg-[#141516]' : 'border-[#334155]'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h5 className="truncate text-lg font-semibold text-white">{lead.companyName || 'Unnamed company'}</h5>
          <p className="mt-1 text-sm text-slate-400">{lead.leadType} | {lead.industry || 'No industry'}</p>
          <p className="mt-1 text-sm text-slate-400">{lead.area || 'No area'}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(lead.leadPriority)}`}>{lead.leadPriority}</span>
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        <p className="text-slate-300">{lead.contactPerson || 'No contact person'}</p>
        <p className="text-slate-400">{lead.phone || 'No phone'}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(lead.status)}`}>{lead.status}</span>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Score {lead.leadScore}</span>
        {isDue(lead) && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">Reminder</span>}
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.16em] text-slate-500">Next Follow-up</p>
      <p className="mt-1 text-sm font-semibold text-white">{lead.nextFollowUpDate || 'Not scheduled'}</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={(event) => { event.stopPropagation(); onOpenWhatsApp(lead); }} className="rounded-2xl bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30">WhatsApp</button>
        <button onClick={(event) => { event.stopPropagation(); onGenerateWhatsApp(lead); }} className="rounded-2xl border border-[#334155] bg-[#0F172A] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-gold/30">Generate Message</button>
        <button onClick={(event) => { event.stopPropagation(); onFollowUp(lead); }} className="rounded-2xl bg-gold/15 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/25">Follow Up</button>
        <button onClick={(event) => { event.stopPropagation(); onViewDetails(lead); }} className="rounded-2xl border border-[#334155] bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10">View Details</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#334155] pt-3">
        <button onClick={(event) => { event.stopPropagation(); onArchive(lead); }} className="rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/20">Archive</button>
        <button onClick={(event) => { event.stopPropagation(); onDelete(lead); }} className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20">Delete</button>
      </div>
    </article>
  );
}

function LeadArchiveList({
  title,
  leads,
  expanded,
  onToggle,
  onView
}: {
  title: string;
  leads: SalesLead[];
  expanded: boolean;
  onToggle: () => void;
  onView: (lead: SalesLead) => void;
}) {
  return (
    <CollapsibleBlock title={title} count={leads.length} expanded={expanded} onToggle={onToggle}>
      <div className="space-y-2">
        {leads.slice(0, 30).map((lead) => (
          <div key={lead.id} className="flex flex-col gap-3 rounded-xl border border-[#334155] bg-[#0F172A] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">{lead.companyName}</p>
              <p className="mt-1 text-sm text-slate-400">{lead.leadType} | {lead.area || 'No area'} | {lead.phone || 'No phone'}</p>
            </div>
            <button onClick={() => onView(lead)} className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-softGold transition hover:bg-gold/20">View</button>
          </div>
        ))}
        {leads.length === 0 && <p className="text-sm text-slate-500">No leads.</p>}
      </div>
    </CollapsibleBlock>
  );
}

function SelectedLeadPanel({
  lead,
  noteDraft,
  setNoteDraft,
  onAddNote,
  onOpenWhatsApp,
  onGenerateWhatsApp,
  onStatusChange,
  onUpdate,
  onArchive,
  onDelete,
  onEdit,
  onCreateFollowUp,
  onViewHistory,
  expanded,
  setExpanded
}: {
  lead: SalesLead | null;
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  onAddNote: () => void;
  onOpenWhatsApp: (lead: SalesLead) => void;
  onGenerateWhatsApp: (lead: SalesLead) => void;
  onStatusChange: (status: SalesLeadStatus) => void;
  onUpdate: (lead: SalesLead) => void;
  onArchive: (lead: SalesLead) => void;
  onDelete: (lead: SalesLead) => void;
  onEdit: (lead: SalesLead) => void;
  onCreateFollowUp: (lead: SalesLead, task: Pick<FollowUpTask, 'title' | 'description' | 'dueDate'>) => Promise<void>;
  onViewHistory: (lead: SalesLead) => void;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}) {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(todayKey());
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [detailBlocks, setDetailBlocks] = useState({
    contact: true,
    online: false,
    crm: false,
    notes: false
  });
  const toggleDetailBlock = (key: keyof typeof detailBlocks) => {
    setDetailBlocks((current) => ({ ...current, [key]: !current[key] }));
  };

  if (!lead) {
    return (
      <aside className="ds-card rounded-xl border border-[#334155] bg-[#111111] p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-softGold">Selected Lead Panel</p>
        <p className="mt-4 text-sm text-slate-400">Select a lead to view details.</p>
      </aside>
    );
  }

  if (!expanded) {
    return (
      <aside className="ds-card sticky top-4 rounded-xl border border-[#334155] bg-[#111111] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-softGold">Selected Lead Panel</p>
            <h4 className="mt-2 text-2xl font-semibold text-white">{lead.companyName}</h4>
            <p className="mt-2 text-sm text-slate-400">{lead.leadType} | {lead.area || 'No area'}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(lead.leadPriority)}`}>{lead.leadPriority}</span>
        </div>

        <div className="mt-5 grid gap-3">
          <Info label="Phone" value={lead.phone || '-'} />
          <Info label="Status" value={lead.status} />
          <Info label="Lead Score" value={`${lead.leadScore} / 100`} />
        </div>

        <div className="mt-5 grid gap-2">
          <button onClick={() => onOpenWhatsApp(lead)} className="rounded-2xl bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30">WhatsApp</button>
          <button onClick={() => onGenerateWhatsApp(lead)} className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-semibold text-softGold transition hover:bg-gold/20">Generate Message</button>
          <button onClick={() => setExpanded(true)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-gold/30">Expand Details</button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ds-card sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-[#334155] bg-[#111111] p-5">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-softGold">Selected Lead Panel</p>
            <h4 className="mt-2 text-2xl font-semibold text-white">{lead.companyName}</h4>
            <p className="mt-1 text-sm text-slate-400">{lead.contactPerson || 'No contact'} | {lead.phone || 'No phone'}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setExpanded(false)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5">Collapse</button>
            <button onClick={() => onOpenWhatsApp(lead)} className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
            <button onClick={() => onGenerateWhatsApp(lead)} className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-softGold transition hover:bg-gold/20">Generate Message</button>
            <button onClick={() => onArchive(lead)} className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-softGold transition hover:bg-gold/20">Archive Lead</button>
            <button onClick={() => onDelete(lead)} className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20">Delete Lead</button>
          </div>
        </div>

        <CollapsibleBlock title="Contact Info" count={4} expanded={detailBlocks.contact} onToggle={() => toggleDetailBlock('contact')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Contact Person" value={lead.contactPerson || 'No contact person'} />
            <Info label="Phone" value={lead.phone || '-'} />
            <Info label="Email" value={lead.email || '-'} />
            <Info label="Area" value={lead.area || '-'} />
          </div>
        </CollapsibleBlock>

        <CollapsibleBlock title="Online Presence" count={3} expanded={detailBlocks.online} onToggle={() => toggleDetailBlock('online')}>
          <div className="grid gap-3">
            <Info label="Website" value={lead.website || '-'} />
            <Info label="Facebook" value={lead.facebook || '-'} />
            <Info label="Instagram" value={lead.instagram || '-'} />
          </div>
        </CollapsibleBlock>

        <CollapsibleBlock title="CRM Info" count={8} expanded={detailBlocks.crm} onToggle={() => toggleDetailBlock('crm')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Lead Type" value={lead.leadType} />
            <Info label="Lead Source" value={lead.leadSource || '-'} />
            <Info label="Potential Value" value={formatRM(lead.potentialValue)} />
            <Info label="Actual Revenue" value={formatRM(lead.actualRevenue)} />
            <Info label="Lead Score" value={`${lead.leadScore} / 100`} />
            <Info label="Lead Priority" value={lead.leadPriority} />
            <Info label="Last Contact" value={lead.lastContactDate || '-'} />
            <Info label="Next Follow-up" value={lead.nextFollowUpDate || '-'} />
          </div>
        </CollapsibleBlock>

        <div className="grid gap-3 sm:grid-cols-3">
          <button onClick={() => onEdit(lead)} className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-semibold text-softGold transition hover:bg-gold/20">Edit Lead</button>
          <button onClick={() => onViewHistory(lead)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-gold/30">View Activity History</button>
        </div>

        <div className="rounded-[22px] border border-sky-500/20 bg-sky-500/[0.05] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Create Follow-up Task</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task Title" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40" />
            <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-sky-500/40" />
            <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Description" rows={3} className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40 sm:col-span-2" />
          </div>
          <button
            disabled={!taskTitle.trim() || !taskDueDate || isCreatingTask}
            onClick={async () => {
              setIsCreatingTask(true);
              try {
                await onCreateFollowUp(lead, {
                  title: taskTitle.trim(),
                  description: taskDescription.trim(),
                  dueDate: taskDueDate
                });
                setTaskTitle('');
                setTaskDescription('');
                setTaskDueDate(todayKey());
              } catch {
                // Parent handler displays the Supabase error toast.
              } finally {
                setIsCreatingTask(false);
              }
            }}
            className="mt-4 rounded-2xl bg-sky-500/20 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isCreatingTask ? 'Creating...' : 'Create Follow-up Task'}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Next Follow Up
            <input type="date" value={lead.nextFollowUpDate || ''} onChange={(event) => onUpdate({ ...lead, nextFollowUpDate: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Actual Revenue
            <input value={lead.actualRevenue || ''} onChange={(event) => onUpdate({ ...lead, actualRevenue: toNumber(event.target.value) })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
          </label>
        </div>

        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-softGold">Status Pipeline</p>
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button key={status} onClick={() => onStatusChange(status)} className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${lead.status === status ? 'border-gold/50 bg-gold text-charcoal' : 'border-white/10 bg-white/5 text-slate-300 hover:border-gold/30'}`}>
                {status}
              </button>
            ))}
          </div>
        </div>

        <CollapsibleBlock title="Notes / Activity" count={1} expanded={detailBlocks.notes} onToggle={() => toggleDetailBlock('notes')}>
          <div className="mt-4 flex gap-2">
            <input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add follow-up note" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
            <button onClick={onAddNote} className="rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold">Add</button>
          </div>
          <div className="mt-4 whitespace-pre-line rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
            {lead.notes || 'No notes yet.'}
          </div>
        </CollapsibleBlock>
      </div>
    </aside>
  );
}

function LeadDetailDrawer({
  lead,
  activities,
  onClose,
  onOpenWhatsApp,
  onGenerateWhatsApp,
  onStatusChange,
  onUpdate,
  onArchive,
  onDelete
}: {
  lead: SalesLead;
  activities: LeadActivity[];
  onClose: () => void;
  onOpenWhatsApp: (lead: SalesLead) => void;
  onGenerateWhatsApp: (lead: SalesLead) => void;
  onStatusChange: (status: SalesLeadStatus) => void;
  onUpdate: (lead: SalesLead) => void;
  onArchive: (lead: SalesLead) => void;
  onDelete: (lead: SalesLead) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <button className="flex-1 cursor-default" aria-label="Close lead drawer" onClick={onClose} />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0f1011] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-softGold">Lead Detail Drawer</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{lead.companyName}</h3>
            <p className="mt-2 text-sm text-slate-400">{lead.contactPerson || 'No contact'} | {lead.phone || 'No phone'}</p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">Close</button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {isFollowUpToday(lead) && <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-softGold">Follow Up Today</span>}
          {isDue(lead) && !isFollowUpToday(lead) && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">Follow-up Due</span>}
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(lead.status)}`}>{lead.status}</span>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone(lead.leadPriority)}`}>{lead.leadPriority} | Score {lead.leadScore}</span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Sample: {sampleStatusForLead(lead)}</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button onClick={() => onArchive(lead)} className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-softGold transition hover:bg-gold/20">Archive Lead</button>
          <button onClick={() => onDelete(lead)} className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20">Delete Lead</button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Info label="Lead Type" value={lead.leadType} />
          <Info label="Industry" value={lead.industry || '-'} />
          <Info label="Area" value={lead.area || '-'} />
          <Info label="Email" value={lead.email || '-'} />
          <Info label="Website" value={lead.website || '-'} />
          <Info label="Facebook" value={lead.facebook || '-'} />
          <Info label="Instagram" value={lead.instagram || '-'} />
          <Info label="Lead Source" value={lead.leadSource || '-'} />
          <Info label="Potential Value" value={formatRM(lead.potentialValue)} />
          <Info label="Actual Revenue" value={formatRM(lead.actualRevenue)} />
          <Info label="Last Contact" value={lead.lastContactDate || '-'} />
          <Info label="Next Follow-up" value={lead.nextFollowUpDate || '-'} />
        </div>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#141414] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-softGold">Edit Lead</p>
              <h4 className="mt-2 text-lg font-semibold text-white">Contact and sales details</h4>
            </div>
            <button onClick={() => onOpenWhatsApp(lead)} className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
            <button onClick={() => onGenerateWhatsApp(lead)} className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-softGold transition hover:bg-gold/20">Generate Message</button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Company
              <input value={lead.companyName} onChange={(event) => onUpdate({ ...lead, companyName: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Contact Person
              <input value={lead.contactPerson} onChange={(event) => onUpdate({ ...lead, contactPerson: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Phone
              <input value={lead.phone} onChange={(event) => onUpdate({ ...lead, phone: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Email
              <input value={lead.email} onChange={(event) => onUpdate({ ...lead, email: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Area
              <input value={lead.area} onChange={(event) => onUpdate({ ...lead, area: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Next Follow Up
              <input type="date" value={lead.nextFollowUpDate || ''} onChange={(event) => onUpdate({ ...lead, nextFollowUpDate: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Actual Revenue
              <input value={lead.actualRevenue || ''} onChange={(event) => onUpdate({ ...lead, actualRevenue: toNumber(event.target.value) })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button key={status} onClick={() => onStatusChange(status)} className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${lead.status === status ? 'border-gold/50 bg-gold text-charcoal' : 'border-white/10 bg-white/5 text-slate-300 hover:border-gold/30'}`}>
                {status}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#141414] p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-softGold">Activity Timeline</p>
          <div className="mt-4 space-y-3">
            {activities.length === 0 && <p className="text-sm text-slate-400">No recorded activity yet.</p>}
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{activity.activityType}</p>
                  <span className="text-xs text-softGold">{activity.createdAt?.slice(0, 10) || '-'}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{activity.description}</p>
                <p className="mt-2 text-xs text-slate-500">User: {activity.performedBy || 'Unknown user'}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
