import { supabase } from '../lib/supabase';

export type SalesLeadStatus = 'New' | 'Contacted' | 'Interested' | 'Sample Scheduled' | 'Quoted' | 'Won' | 'Lost';
export type SalesLeadType = 'Corporate' | 'Event Planner' | 'Wedding Planner' | 'Cafe' | 'Hotel' | 'School' | 'Government' | 'Other';

export type SalesLead = {
  id?: number | string;
  companyName: string;
  leadType: SalesLeadType;
  contactPerson: string;
  phone: string;
  email: string;
  area: string;
  leadSource: string;
  status: SalesLeadStatus;
  notes: string;
  lastFollowUp: string;
  nextFollowUp: string;
  potentialValue: number;
  actualRevenue: number;
  createdAt?: string;
  updatedAt?: string;
};

export type LeadActivity = {
  id?: number | string;
  leadId: number | string;
  activityType: string;
  description: string;
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
  area?: string | null;
  lead_source?: string | null;
  status?: string | null;
  notes?: string | null;
  last_follow_up?: string | null;
  next_follow_up?: string | null;
  potential_value?: number | string | null;
  actual_revenue?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadActivityRow = {
  id?: number | string;
  lead_id?: number | string | null;
  activity_type?: string | null;
  description?: string | null;
  created_at?: string | null;
};

const normalizeStatus = (status?: string | null): SalesLeadStatus => {
  const valid: SalesLeadStatus[] = ['New', 'Contacted', 'Interested', 'Sample Scheduled', 'Quoted', 'Won', 'Lost'];
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

export const salesLeadFromRow = (row: SalesLeadRow): SalesLead => ({
  id: row.id,
  companyName: row.company_name || '',
  leadType: normalizeLeadType(row.lead_type || row.industry),
  contactPerson: row.contact_person || '',
  phone: row.phone || '',
  email: row.email || '',
  area: row.area || '',
  leadSource: row.lead_source || '',
  status: normalizeStatus(row.status),
  notes: row.notes || '',
  lastFollowUp: row.last_follow_up || '',
  nextFollowUp: row.next_follow_up || '',
  potentialValue: toNumber(row.potential_value),
  actualRevenue: toNumber(row.actual_revenue),
  createdAt: row.created_at || undefined,
  updatedAt: row.updated_at || undefined
});

export const salesLeadToRow = (lead: SalesLead) => ({
  company_name: lead.companyName,
  lead_type: lead.leadType,
  contact_person: lead.contactPerson,
  phone: lead.phone,
  email: lead.email,
  area: lead.area,
  lead_source: lead.leadSource,
  status: lead.status,
  notes: lead.notes,
  last_follow_up: lead.lastFollowUp || null,
  next_follow_up: lead.nextFollowUp || null,
  potential_value: lead.potentialValue || 0,
  actual_revenue: lead.actualRevenue || 0,
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

  return salesLeadFromRow(data as SalesLeadRow);
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
      description: activity.description
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
    createdAt: record.created_at || undefined
  } satisfies LeadActivity;
}
