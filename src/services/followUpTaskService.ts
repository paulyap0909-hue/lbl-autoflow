import { getActiveSupabaseSession, supabase } from '../lib/supabase';

export type FollowUpTaskStatus = 'Pending' | 'Completed' | 'Overdue';

export type FollowUpTask = {
  id?: number | string;
  leadId: number | string;
  leadName?: string;
  title: string;
  description: string;
  followUpDate: string;
  dueDate: string;
  status: FollowUpTaskStatus;
  createdAt?: string;
};

type FollowUpTaskRow = {
  id?: number | string;
  lead_id?: number | string | null;
  title?: string | null;
  description?: string | null;
  follow_up_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  created_at?: string | null;
  sales_leads?: { company_name?: string | null } | null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const normalizeStatus = (row: FollowUpTaskRow): FollowUpTaskStatus => {
  if (row.status === 'Completed') return 'Completed';
  if ((row.due_date || row.follow_up_date || '') < todayKey()) return 'Overdue';
  return 'Pending';
};

const fromRow = (row: FollowUpTaskRow): FollowUpTask => ({
  id: row.id,
  leadId: row.lead_id || '',
  leadName: row.sales_leads?.company_name || 'Lead',
  title: row.title || '',
  description: row.description || '',
  followUpDate: row.follow_up_date || row.due_date || '',
  dueDate: row.due_date || row.follow_up_date || '',
  status: normalizeStatus(row),
  createdAt: row.created_at || undefined
});

export async function loadFollowUpTasksFromSupabase() {
  await getActiveSupabaseSession();

  await supabase
    .from('follow_up_tasks')
    .update({ status: 'Overdue' })
    .lt('due_date', todayKey())
    .neq('status', 'Completed');

  return loadFollowUpTasksReadOnlyFromSupabase();
}

export async function loadFollowUpTasksReadOnlyFromSupabase() {
  await getActiveSupabaseSession();

  const { data, error } = await supabase
    .from('follow_up_tasks')
    .select('*, sales_leads(company_name)')
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Failed to load follow-up tasks:', error);
    throw error;
  }

  return (data ?? []).map((row) => fromRow(row as FollowUpTaskRow));
}

export async function createFollowUpTaskInSupabase(task: FollowUpTask) {
  const leadId = Number(task.leadId);
  if (!Number.isFinite(leadId)) throw new Error('Lead ID missing.');
  await getActiveSupabaseSession();

  const { data, error } = await supabase
    .from('follow_up_tasks')
    .insert({
      lead_id: leadId,
      title: task.title,
      description: task.description,
      follow_up_date: task.followUpDate || task.dueDate,
      due_date: task.dueDate,
      status: 'Pending'
    })
    .select('*, sales_leads(company_name)')
    .single();

  if (error) {
    console.error('Failed to create follow-up task:', error);
    throw error;
  }

  return fromRow(data as FollowUpTaskRow);
}

export async function completeFollowUpTaskInSupabase(taskId: number | string) {
  await getActiveSupabaseSession();

  const { data, error } = await supabase
    .from('follow_up_tasks')
    .update({ status: 'Completed' })
    .eq('id', taskId)
    .select('*, sales_leads(company_name)')
    .single();

  if (error) {
    console.error('Failed to complete follow-up task:', error);
    throw error;
  }

  return fromRow(data as FollowUpTaskRow);
}

export const notifyFollowUpTasksChanged = () => {
  window.dispatchEvent(new CustomEvent('lbl:follow-up-tasks-updated'));
};
