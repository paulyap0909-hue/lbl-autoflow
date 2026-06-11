import { supabase } from '../lib/supabase';

export type SalesLeadStatus = 'New' | 'Contacted' | 'Interested' | 'Sample Scheduled' | 'Quoted' | 'Won' | 'Lost' | 'Archived';
export type SalesLeadType = 'Corporate' | 'Event Planner' | 'Wedding Planner' | 'Cafe' | 'Hotel' | 'School' | 'Government' | 'Other';
export type SalesLeadPriority = 'Hot' | 'Warm' | 'Cold';

export type SalesLead = {
  id?: number | string;
  companyName: string;
  leadType: SalesLeadType;
  industry: string;
  contactPerson: string;
  phone: string;
  email: string;
  website: string;
  facebook: string;
  instagram: string;
  area: string;
  leadSource: string;
  status: SalesLeadStatus;
  notes: string;
  lastContactDate: string;
  nextFollowUpDate: string;
  potentialValue: number;
  actualRevenue: number;
  sampleStatus: 'Not Started' | 'Requested' | 'Scheduled' | 'Delivered';
  whatsappReady: boolean;
  messagesSent: number;
  leadScore: number;
  leadPriority: SalesLeadPriority;
  automationEnabled: boolean;
  lastAutomationRun?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LeadActivity = {
  id?: number | string;
  leadId: number | string;
  activityType: string;
  description: string;
  performedBy?: string;
  createdAt?: string;
};

type SalesLeadRow = {
  id?: number | string;
  company_name?: string | null;
  lead_type?: string | null;
  industry?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  area?: string | null;
  source?: string | null;
  lead_source?: string | null;
  status?: string | null;
  notes?: string | null;
  last_contact_date?: string | null;
  next_follow_up_date?: string | null;
  estimate?: number | string | null;
  potential_value?: number | string | null;
  actual_revenue?: number | string | null;
  sample_status?: string | null;
  whatsapp_ready?: boolean | null;
  messages_sent?: number | string | null;
  lead_score?: number | string | null;
  lead_priority?: string | null;
  automation_enabled?: boolean | null;
  last_automation_run?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadActivityRow = {
  id?: number | string;
  lead_id?: number | string | null;
  activity_type?: string | null;
  description?: string | null;
  performed_by?: string | null;
  created_at?: string | null;
};

const normalizeStatus = (status?: string | null): SalesLeadStatus => {
  const valid: SalesLeadStatus[] = ['New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost', 'Archived'];
  return valid.includes(status as SalesLeadStatus) ? (status as SalesLeadStatus) : 'New';
};

const normalizeLeadType = (value?: string | null): SalesLeadType => {
  const valid: SalesLeadType[] = ['Corporate', 'Event Planner', 'Wedding Planner', 'Cafe', 'Hotel', 'School', 'Government', 'Other'];
  return valid.includes(value as SalesLeadType) ? (value as SalesLeadType) : 'Corporate';
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePriority = (value?: string | null): SalesLeadPriority =>
  value === 'Hot' || value === 'Warm' ? value : 'Cold';

export const salesLeadFromRow = (row: SalesLeadRow): SalesLead => ({
  id: row.id,
  companyName: row.company_name || '',
  leadType: normalizeLeadType(row.lead_type || row.industry),
  industry: row.industry || '',
  contactPerson: row.contact_person || '',
  phone: row.phone || '',
  email: row.email || '',
  website: row.website || '',
  facebook: row.facebook || '',
  instagram: row.instagram || '',
  area: row.area || '',
  leadSource: row.lead_source || row.source || '',
  status: normalizeStatus(row.status),
  notes: row.notes || '',
  lastContactDate: row.last_contact_date || '',
  nextFollowUpDate: row.next_follow_up_date || '',
  potentialValue: toNumber(row.potential_value ?? row.estimate),
  actualRevenue: toNumber(row.actual_revenue),
  sampleStatus: row.sample_status === 'Requested' || row.sample_status === 'Scheduled' || row.sample_status === 'Delivered'
    ? row.sample_status
    : 'Not Started',
  whatsappReady: row.whatsapp_ready ?? Boolean(row.phone?.trim()),
  messagesSent: toNumber(row.messages_sent),
  leadScore: toNumber(row.lead_score),
  leadPriority: normalizePriority(row.lead_priority),
  automationEnabled: row.automation_enabled ?? true,
  lastAutomationRun: row.last_automation_run || undefined,
  createdAt: row.created_at || undefined,
  updatedAt: row.updated_at || undefined
});

export const salesLeadToRow = (lead: SalesLead) => ({
  company_name: lead.companyName,
  lead_type: lead.leadType,
  industry: lead.industry,
  contact_person: lead.contactPerson,
  phone: lead.phone,
  email: lead.email,
  website: lead.website,
  facebook: lead.facebook,
  instagram: lead.instagram,
  area: lead.area,
  lead_source: lead.leadSource,
  status: lead.status,
  notes: lead.notes,
  last_contact_date: lead.lastContactDate || null,
  next_follow_up_date: lead.nextFollowUpDate || null,
  potential_value: lead.potentialValue || 0,
  actual_revenue: lead.actualRevenue || 0,
  sample_status: lead.sampleStatus,
  whatsapp_ready: Boolean(lead.phone.trim()),
  messages_sent: lead.messagesSent || 0,
  automation_enabled: lead.automationEnabled,
  updated_at: new Date().toISOString()
});

export async function loadSalesLeadsFromSupabase() {
  const { data, error } = await supabase
    .from('sales_leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load sales leads:', error);
    throw error;
  }

  return (data ?? []).map((row) => salesLeadFromRow(row as SalesLeadRow));
}

export async function createSalesLeadInSupabase(lead: SalesLead) {
  const { data, error } = await supabase
    .from('sales_leads')
    .insert(salesLeadToRow(lead))
    .select()
    .single();

  if (error) {
    console.error('Failed to create sales lead:', error);
    throw error;
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('sales_leads')
    .select('*')
    .eq('id', data.id)
    .single();

  if (refreshError) {
    console.error('Failed to reload automated sales lead:', refreshError);
    throw refreshError;
  }

  return salesLeadFromRow(refreshed as SalesLeadRow);
}

export async function updateSalesLeadInSupabase(lead: SalesLead) {
  if (!lead.id) throw new Error('Sales lead ID missing.');

  const { data, error } = await supabase
    .from('sales_leads')
    .update(salesLeadToRow(lead))
    .eq('id', lead.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update sales lead:', error);
    throw error;
  }

  return salesLeadFromRow(data as SalesLeadRow);
}

export async function archiveSalesLeadInSupabase(lead: SalesLead) {
  return updateSalesLeadInSupabase({
    ...lead,
    status: 'Archived'
  });
}

export async function deleteSalesLeadsFromSupabase(
  leadIds: Array<number | string>,
  performedBy: string
) {
  const numericIds = leadIds
    .map((leadId) => Number(leadId))
    .filter((leadId) => Number.isFinite(leadId));

  if (!numericIds.length) throw new Error('Sales lead ID missing.');

  const { data, error } = await supabase.rpc('delete_sales_leads', {
    p_lead_ids: numericIds,
    p_performed_by: performedBy || 'Unknown user'
  });

  if (error) {
    console.error('Failed to delete sales leads:', error);
    throw error;
  }

  return Number(data) || 0;
}

export async function loadLeadActivitiesFromSupabase() {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load lead activities:', error);
    throw error;
  }

  return (data ?? []).map((row): LeadActivity => {
    const record = row as LeadActivityRow;
    return {
      id: record.id,
      leadId: record.lead_id || '',
      activityType: record.activity_type || 'Activity',
      description: record.description || '',
      performedBy: record.performed_by || 'Unknown user',
      createdAt: record.created_at || undefined
    };
  });
}

export async function createLeadActivityInSupabase(activity: LeadActivity) {
  const numericLeadId = Number(activity.leadId);
  if (!Number.isFinite(numericLeadId)) throw new Error('Lead activity requires a Supabase lead ID.');

  const { data, error } = await supabase
    .from('lead_activities')
    .insert({
      lead_id: numericLeadId,
      activity_type: activity.activityType,
      description: activity.description,
      performed_by: activity.performedBy || 'Unknown user'
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create lead activity:', error);
    throw error;
  }

  const record = data as LeadActivityRow;
  return {
    id: record.id,
    leadId: record.lead_id || numericLeadId,
    activityType: record.activity_type || activity.activityType,
    description: record.description || activity.description,
    performedBy: record.performed_by || activity.performedBy || 'Unknown user',
    createdAt: record.created_at || undefined
  } satisfies LeadActivity;
}
