import React, { useEffect, useMemo, useRef, useState } from 'react';
import Toast from '../components/Toast';
import { formatRM } from '../utils/pricing';
import {
  createLeadActivityInSupabase,
  createSalesLeadInSupabase,
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

const whatsappMessage = `Hi,\n\nI'm Paul from Layer By Layer Bakery.\n\nWe're currently offering complimentary tasting sessions for selected companies in Klang Valley.\n\nWould your team be interested in receiving a sample box for evaluation? 😊`;

const blankLead = (): SalesLead => ({
  companyName: '',
  leadType: 'Corporate',
  contactPerson: '',
  phone: '',
  email: '',
  area: '',
  leadSource: '',
  status: 'New',
  notes: '',
  lastFollowUp: '',
  nextFollowUp: todayKey(),
  potentialValue: 0,
  actualRevenue: 0
});

const normalizeMalaysiaPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const isDue = (lead: SalesLead) =>
  Boolean(lead.nextFollowUp) && lead.nextFollowUp <= todayKey() && lead.status !== 'Won' && lead.status !== 'Lost';

const isFollowUpToday = (lead: SalesLead) =>
  lead.nextFollowUp === todayKey() && lead.status !== 'Won' && lead.status !== 'Lost';

const sampleStatusForLead = (lead: SalesLead) => {
  if (lead.status === 'Sample Scheduled') return 'Scheduled';
  if (lead.notes.toLowerCase().includes('sample delivered')) return 'Delivered';
  if (lead.notes.toLowerCase().includes('sample')) return 'Requested';
  return 'Not Started';
};

const statusTone = (status: SalesLeadStatus) => {
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

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const valueAt = (values: string[], name: string) => values[headers.indexOf(name.toLowerCase())] || '';

  return lines.slice(1).map((line): SalesLead => {
    const values = parseCsvLine(line);
    return {
      companyName: valueAt(values, 'Company Name'),
      leadType: normalizeLeadType(valueAt(values, 'Lead Type')),
      contactPerson: valueAt(values, 'Contact Person'),
      phone: valueAt(values, 'Phone'),
      email: valueAt(values, 'Email'),
      area: valueAt(values, 'Area'),
      leadSource: valueAt(values, 'Lead Source'),
      status: normalizeStatus(valueAt(values, 'Status')),
      notes: valueAt(values, 'Notes'),
      lastFollowUp: '',
      nextFollowUp: valueAt(values, 'Next Follow Up'),
      potentialValue: toNumber(valueAt(values, 'Potential Value')),
      actualRevenue: 0
    };
  }).filter((lead) => lead.companyName);
};

export default function SalesCRMPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    Promise.all([
      loadSalesLeadsFromSupabase(),
      loadLeadActivitiesFromSupabase()
    ])
      .then(([leadData, activityData]) => {
        setLeads(leadData);
        setActivities(activityData);
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

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;
  const areas = useMemo(() => Array.from(new Set(leads.map((lead) => lead.area).filter(Boolean))).sort(), [leads]);
  const leadSources = useMemo(() => Array.from(new Set(leads.map((lead) => lead.leadSource).filter(Boolean))).sort(), [leads]);

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesLeadType = leadTypeFilter === 'All' || lead.leadType === leadTypeFilter;
      const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
      const matchesArea = areaFilter === 'All' || lead.area === areaFilter;
      const matchesSource = sourceFilter === 'All' || lead.leadSource === sourceFilter;
      const matchesSearch = !query || [
        lead.companyName,
        lead.leadType,
        lead.contactPerson,
        lead.phone,
        lead.email,
        lead.area,
        lead.leadSource,
        lead.notes
      ].join(' ').toLowerCase().includes(query);
      return matchesLeadType && matchesStatus && matchesArea && matchesSource && matchesSearch;
    });
  }, [areaFilter, leads, leadTypeFilter, searchTerm, sourceFilter, statusFilter]);

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
      Lost: []
    });
  }, [filteredLeads]);

  const kpis = useMemo(() => ({
    total: leads.length,
    followUpToday: leads.filter(isFollowUpToday).length,
    pipelineValue: leads
      .filter((lead) => lead.status !== 'Won' && lead.status !== 'Lost')
      .reduce((sum, lead) => sum + lead.potentialValue, 0),
    contacted: leads.filter((lead) => lead.status === 'Contacted').length,
    interested: leads.filter((lead) => lead.status === 'Interested').length,
    sample: leads.filter((lead) => lead.status === 'Sample Scheduled').length,
    quoted: leads.filter((lead) => lead.status === 'Quoted').length,
    won: leads.filter((lead) => lead.status === 'Won').length,
    lost: leads.filter((lead) => lead.status === 'Lost').length,
    revenue: leads.reduce((sum, lead) => sum + lead.actualRevenue, 0)
  }), [leads]);

  const whatsappStats = useMemo(() => {
    const withPhone = leads.filter((lead) => normalizeMalaysiaPhone(lead.phone)).length;
    const sentLeadIds = new Set(
      activities
        .filter((activity) => activity.activityType === 'WhatsApp')
        .map((activity) => String(activity.leadId))
    );
    const sent = leads.filter((lead) => lead.id !== undefined && sentLeadIds.has(String(lead.id))).length;
    const pending = Math.max(withPhone - sent, 0);
    return { withPhone, sent, pending };
  }, [activities, leads]);

  const sampleBoxStats = useMemo(() => {
    const scheduled = leads.filter((lead) => sampleStatusForLead(lead) === 'Scheduled').length;
    const requested = leads.filter((lead) => sampleStatusForLead(lead) === 'Requested').length;
    const delivered = leads.filter((lead) => sampleStatusForLead(lead) === 'Delivered').length;
    return { scheduled, requested, delivered };
  }, [leads]);

  const activityTimeline = useMemo(() => {
    const leadNames = new Map(leads.map((lead) => [String(lead.id), lead.companyName]));
    return activities.slice(0, 10).map((activity) => ({
      id: String(activity.id || `${activity.leadId}-${activity.createdAt}`),
      date: activity.createdAt?.slice(0, 10) || '',
      title: leadNames.get(String(activity.leadId)) || 'Lead',
      detail: activity.description || activity.activityType,
      tone: activity.activityType
    }));
  }, [activities, leads]);

  const recordActivity = async (leadId: number | string | undefined, activityType: string, description: string) => {
    if (leadId === undefined) return;
    try {
      const created = await createLeadActivityInSupabase({
        leadId,
        activityType,
        description
      });
      setActivities((current) => [created, ...current]);
    } catch (error) {
      console.error('Lead activity error:', error);
      setToast({ message: 'Lead saved, but activity logging failed.', type: 'error' });
    }
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

  const createLead = async (lead: SalesLead, quiet = false) => {
    try {
      const saved = await createSalesLeadInSupabase(lead);
      setLeads((current) => [saved, ...current]);
      setSelectedLeadId(saved.id || null);
      await recordActivity(saved.id, 'Lead Created', `Lead created for ${saved.companyName}`);
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
    const text = await file.text();
    const parsedLeads = parseLeadCsv(text);
    if (!parsedLeads.length) {
      setToast({ message: 'No valid leads found in CSV.', type: 'error' });
      return;
    }
    for (const lead of parsedLeads) {
      await createLead(lead, true);
    }
    setToast({ message: `${parsedLeads.length} leads imported.`, type: 'success' });
  };

  const updateSelectedStatus = (status: SalesLeadStatus) => {
    if (!selectedLead) return;
    const updatedLead = {
      ...selectedLead,
      status,
      lastFollowUp: todayKey(),
      actualRevenue: status === 'Won' ? selectedLead.actualRevenue || selectedLead.potentialValue : selectedLead.actualRevenue
    };
    persistUpdatedLead(updatedLead)
      .then(() => recordActivity(selectedLead.id, 'Status Changed', `Status changed to ${status}`))
      .catch(() => undefined);
  };

  const addNote = () => {
    if (!selectedLead || !noteDraft.trim()) return;
    const notes = `${todayKey()}: ${noteDraft.trim()}\n${selectedLead.notes || ''}`.trim();
    const note = noteDraft.trim();
    persistUpdatedLead({ ...selectedLead, notes, lastFollowUp: todayKey() })
      .then(() => recordActivity(selectedLead.id, 'Note Added', note))
      .catch(() => undefined);
    setNoteDraft('');
  };

  const openWhatsApp = (lead: SalesLead) => {
    const phone = normalizeMalaysiaPhone(lead.phone);
    if (!phone) {
      setToast({ message: 'Phone number missing.', type: 'error' });
      return;
    }
    const notes = `${todayKey()}: WhatsApp sample invite sent\n${lead.notes || ''}`.trim();
    persistUpdatedLead({ ...lead, notes, lastFollowUp: todayKey() })
      .then(() => recordActivity(lead.id, 'WhatsApp', 'WhatsApp tasting invitation opened'))
      .catch(() => undefined);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`, '_blank', 'noopener,noreferrer');
  };

  const openLeadDrawer = (lead: SalesLead) => {
    setSelectedLeadId(lead.id || null);
    setDrawerLeadId(lead.id || null);
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">Sales CRM</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">Single lead management command center</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Corporate, event, wedding, cafe, hotel, school and government leads in one pipeline.
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
            <button onClick={() => fileInputRef.current?.click()} className="rounded-3xl border border-gold/30 bg-gold/10 px-5 py-3 text-sm font-semibold text-softGold transition hover:bg-gold/20">Import Leads</button>
            <div className="rounded-3xl border border-gold/20 bg-gold/10 px-5 py-3 text-sm text-softGold">Source: Supabase</div>
          </div>
        </div>
      </section>

      {loadError && (
        <section className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-200">Supabase Connection Error</p>
          <p className="mt-2 text-sm text-rose-100">{loadError}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {[
          ['Total Leads', kpis.total],
          ['Follow Up Today', kpis.followUpToday],
          ['Pipeline Value', formatRM(kpis.pipelineValue)],
          ['Contacted', kpis.contacted],
          ['Interested', kpis.interested],
          ['Sample Scheduled', kpis.sample],
          ['Quoted', kpis.quoted],
          ['Won', kpis.won],
          ['Lost', kpis.lost],
          ['Revenue Generated', formatRM(kpis.revenue)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-[#141414] p-5 shadow-panel transition hover:border-gold/30">
            <p className="text-xs uppercase tracking-[0.18em] text-softGold">{label}</p>
            <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[24px] border border-white/10 bg-[#141414] p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-5">
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search company, contact, phone" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
          <select value={leadTypeFilter} onChange={(event) => setLeadTypeFilter(event.target.value as 'All' | SalesLeadType)} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {leadTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | SalesLeadStatus)} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {areas.map((area) => <option key={area}>{area}</option>)}
          </select>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40">
            <option>All</option>
            {leadSources.map((leadSource) => <option key={leadSource}>{leadSource}</option>)}
          </select>
        </div>
      </section>

      <section className="grid gap-4 rounded-[24px] border border-white/10 bg-[#141414] p-4 shadow-panel lg:grid-cols-6">
        <input value={draftLead.companyName} onChange={(event) => setDraftLead({ ...draftLead, companyName: event.target.value })} placeholder="Company Name" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <select value={draftLead.leadType} onChange={(event) => setDraftLead({ ...draftLead, leadType: event.target.value as SalesLeadType })} className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40">
          {leadTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
        <input value={draftLead.contactPerson} onChange={(event) => setDraftLead({ ...draftLead, contactPerson: event.target.value })} placeholder="Contact Person" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.phone} onChange={(event) => setDraftLead({ ...draftLead, phone: event.target.value })} placeholder="Phone" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <input value={draftLead.area} onChange={(event) => setDraftLead({ ...draftLead, area: event.target.value })} placeholder="Area" className="h-11 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
        <button onClick={addLead} className="h-11 rounded-2xl bg-gold px-4 text-sm font-semibold text-charcoal transition hover:bg-softGold">Add Lead</button>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">Sample Box Tracking</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MiniStat label="Requested" value={sampleBoxStats.requested} />
            <MiniStat label="Scheduled" value={sampleBoxStats.scheduled} />
            <MiniStat label="Delivered" value={sampleBoxStats.delivered} />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">WhatsApp Statistics</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MiniStat label="Phone Ready" value={whatsappStats.withPhone} />
            <MiniStat label="Messages Sent" value={whatsappStats.sent} />
            <MiniStat label="Pending Outreach" value={whatsappStats.pending} />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">Activity Timeline</p>
          <div className="mt-4 max-h-[260px] space-y-3 overflow-y-auto pr-1">
            {activityTimeline.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
            {activityTimeline.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                  <span className="text-xs text-softGold">{item.date}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-7">
        {statuses.map((status) => (
          <div key={status} className="rounded-[24px] border border-white/10 bg-[#141414] p-4 shadow-panel">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-white">{status}</h4>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{groupedLeads[status].length}</span>
            </div>
            <div className="space-y-3">
              {groupedLeads[status].slice(0, 5).map((lead) => (
                <button key={lead.id} onClick={() => setSelectedLeadId(lead.id || null)} className="w-full rounded-2xl border border-white/10 bg-[#0f0f0f] p-3 text-left transition hover:border-gold/30">
                  <p className="truncate text-sm font-semibold text-white">{lead.companyName}</p>
                  <p className="mt-1 text-xs text-slate-400">{lead.leadType} | {lead.area || 'No area'}</p>
                  <p className="mt-1 text-xs text-softGold">{formatRM(lead.potentialValue)}</p>
                  {isDue(lead) && <span className="mt-2 inline-flex rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">Follow-up due</span>}
                  <span className="mt-2 inline-flex rounded-full bg-white/5 px-2 py-1 text-[11px] text-slate-300">Sample: {sampleStatusForLead(lead)}</span>
                </button>
              ))}
              {groupedLeads[status].length === 0 && <p className="text-xs text-slate-500">No leads</p>}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#141414] shadow-panel">
          <div className="border-b border-white/10 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-softGold">Lead Table View</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Sales opportunities</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-[#0f0f0f] text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-5 py-4">Company</th>
                  <th className="px-5 py-4">Lead Type</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Area</th>
                  <th className="px-5 py-4">Source</th>
                  <th className="px-5 py-4">Potential</th>
                  <th className="px-5 py-4">Next Follow-up</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-5 py-4">
                      <button onClick={() => openLeadDrawer(lead)} className="text-left font-semibold text-white hover:text-softGold">{lead.companyName || '-'}</button>
                      <p className="mt-1 text-xs text-slate-500">{lead.email || '-'}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{lead.leadType}</td>
                    <td className="px-5 py-4 text-slate-300">{lead.contactPerson || '-'}<p className="mt-1 text-xs text-slate-500">{lead.phone || '-'}</p></td>
                    <td className="px-5 py-4 text-slate-300">{lead.area || '-'}</td>
                    <td className="px-5 py-4 text-slate-300">{lead.leadSource || '-'}</td>
                    <td className="px-5 py-4 font-semibold text-white">{formatRM(lead.potentialValue)}</td>
                    <td className={`px-5 py-4 ${isDue(lead) ? 'text-amber-200' : 'text-slate-300'}`}>
                      {lead.nextFollowUp || '-'}
                      {isFollowUpToday(lead) && <span className="ml-2 rounded-full bg-gold/15 px-2 py-1 text-[11px] font-semibold text-softGold">Today</span>}
                      {isDue(lead) && !isFollowUpToday(lead) && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">Due</span>}
                    </td>
                    <td className="px-5 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(lead.status)}`}>{lead.status}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openWhatsApp(lead)} className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
                        <button onClick={() => openLeadDrawer(lead)} className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/20">Detail</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loadError && filteredLeads.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">No sales leads in Supabase yet.</div>
            )}
          </div>
        </div>

        <LeadDetailPanel
          lead={selectedLead}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onAddNote={addNote}
          onOpenWhatsApp={openWhatsApp}
          onStatusChange={updateSelectedStatus}
          onUpdate={persistUpdatedLead}
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
            onStatusChange={(status) => {
              persistUpdatedLead({ ...drawerLead, status, lastFollowUp: todayKey() })
                .then(() => recordActivity(drawerLead.id, 'Status Changed', `Status changed to ${status}`))
                .catch(() => undefined);
            }}
            onUpdate={persistUpdatedLead}
          />
        );
      })()}
    </div>
  );
}

function LeadDetailPanel({
  lead,
  noteDraft,
  setNoteDraft,
  onAddNote,
  onOpenWhatsApp,
  onStatusChange,
  onUpdate
}: {
  lead: SalesLead | null;
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  onAddNote: () => void;
  onOpenWhatsApp: (lead: SalesLead) => void;
  onStatusChange: (status: SalesLeadStatus) => void;
  onUpdate: (lead: SalesLead) => void;
}) {
  if (!lead) {
    return (
      <aside className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
        <p className="text-sm text-slate-400">Select a lead to view details.</p>
      </aside>
    );
  }

  return (
    <aside className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-softGold">Lead Detail Panel</p>
            <h4 className="mt-2 text-2xl font-semibold text-white">{lead.companyName}</h4>
            <p className="mt-1 text-sm text-slate-400">{lead.contactPerson || 'No contact'} | {lead.phone || 'No phone'}</p>
          </div>
          <button onClick={() => onOpenWhatsApp(lead)} className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Lead Type" value={lead.leadType} />
          <Info label="Area" value={lead.area || '-'} />
          <Info label="Email" value={lead.email || '-'} />
          <Info label="Lead Source" value={lead.leadSource || '-'} />
          <Info label="Last Follow-up" value={lead.lastFollowUp || '-'} />
          <Info label="Next Follow-up" value={lead.nextFollowUp || '-'} />
          <Info label="Potential Value" value={formatRM(lead.potentialValue)} />
          <Info label="Actual Revenue" value={formatRM(lead.actualRevenue)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Next Follow Up
            <input type="date" value={lead.nextFollowUp || ''} onChange={(event) => onUpdate({ ...lead, nextFollowUp: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
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

        <div className="rounded-[22px] border border-white/10 bg-[#0f0f0f] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-softGold">Notes History</p>
          <div className="mt-4 flex gap-2">
            <input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add follow-up note" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-gold/40" />
            <button onClick={onAddNote} className="rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold">Add</button>
          </div>
          <div className="mt-4 whitespace-pre-line rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
            {lead.notes || 'No notes yet.'}
          </div>
        </div>
      </div>
    </aside>
  );
}

function LeadDetailDrawer({
  lead,
  activities,
  onClose,
  onOpenWhatsApp,
  onStatusChange,
  onUpdate
}: {
  lead: SalesLead;
  activities: LeadActivity[];
  onClose: () => void;
  onOpenWhatsApp: (lead: SalesLead) => void;
  onStatusChange: (status: SalesLeadStatus) => void;
  onUpdate: (lead: SalesLead) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <button className="flex-1 cursor-default" aria-label="Close lead drawer" onClick={onClose} />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0d0d0d] p-6 shadow-2xl">
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
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Sample: {sampleStatusForLead(lead)}</span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Info label="Lead Type" value={lead.leadType} />
          <Info label="Area" value={lead.area || '-'} />
          <Info label="Email" value={lead.email || '-'} />
          <Info label="Lead Source" value={lead.leadSource || '-'} />
          <Info label="Potential Value" value={formatRM(lead.potentialValue)} />
          <Info label="Actual Revenue" value={formatRM(lead.actualRevenue)} />
          <Info label="Last Follow-up" value={lead.lastFollowUp || '-'} />
          <Info label="Next Follow-up" value={lead.nextFollowUp || '-'} />
        </div>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-[#141414] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-softGold">Sales Actions</p>
              <h4 className="mt-2 text-lg font-semibold text-white">Follow-up workflow</h4>
            </div>
            <button onClick={() => onOpenWhatsApp(lead)} className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Next Follow Up
              <input type="date" value={lead.nextFollowUp || ''} onChange={(event) => onUpdate({ ...lead, nextFollowUp: event.target.value })} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none focus:border-gold/40" />
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
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-[#0f0f0f] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
