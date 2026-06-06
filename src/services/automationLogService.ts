import { supabase } from '../lib/supabase';

export type AutomationLog = {
  id: string;
  created_at: string;
  event_name: string;
  description: string;
};

type AutomationLogRow = {
  id?: string | number | null;
  created_at?: string | null;
  event_name?: string | null;
  event?: string | null;
  description?: string | null;
  result?: string | null;
};

export const automationLogFromRow = (row: AutomationLogRow): AutomationLog => ({
  id: String(row.id ?? `${row.created_at}-${row.event_name ?? row.event ?? 'log'}`),
  created_at: row.created_at || new Date().toISOString(),
  event_name: row.event_name || row.event || 'Automation Event',
  description: row.description || row.result || ''
});

export async function loadAutomationLogsFromSupabase() {
  const { data, error } = await supabase
    .from('automation_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load automation logs from Supabase:', error);
    throw error;
  }

  return (data ?? []).map((row) => automationLogFromRow(row as AutomationLogRow));
}

export async function createAutomationLog(eventName: string, description: string) {
  const { data, error } = await supabase
    .from('automation_logs')
    .insert({
      event_name: eventName,
      description,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error(`Failed to create automation log: ${eventName}`, error);
    throw error;
  }

  return automationLogFromRow(data as AutomationLogRow);
}
