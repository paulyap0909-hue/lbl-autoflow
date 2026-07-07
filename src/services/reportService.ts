import { supabase } from '../lib/supabase';

export type ReportRow = Record<string, unknown>;

export type ReportsData = {
  orders: ReportRow[];
  invoices: ReportRow[];
  deliveryTasks: ReportRow[];
  salesLeads: ReportRow[];
  quotations: ReportRow[];
  warnings: string[];
  loadedAt: string;
};

type ReportDataset = {
  key: Exclude<keyof ReportsData, 'warnings' | 'loadedAt'>;
  table: string;
  orderColumn: string;
};

const datasets: ReportDataset[] = [
  { key: 'orders', table: 'orders', orderColumn: 'created_at' },
  { key: 'invoices', table: 'invoices', orderColumn: 'created_at' },
  { key: 'deliveryTasks', table: 'delivery_tasks', orderColumn: 'created_at' },
  { key: 'salesLeads', table: 'sales_leads', orderColumn: 'created_at' },
  { key: 'quotations', table: 'quotations', orderColumn: 'created_at' }
];

export async function loadReportsDataFromSupabase(): Promise<ReportsData> {
  const results = await Promise.allSettled(
    datasets.map(async ({ table, orderColumn }) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderColumn, { ascending: false });

      if (error) throw error;
      return (data ?? []) as ReportRow[];
    })
  );

  const reportData: ReportsData = {
    orders: [],
    invoices: [],
    deliveryTasks: [],
    salesLeads: [],
    quotations: [],
    warnings: [],
    loadedAt: new Date().toISOString()
  };

  results.forEach((result, index) => {
    const dataset = datasets[index];
    if (result.status === 'fulfilled') {
      reportData[dataset.key] = result.value;
      return;
    }

    console.error(`Reports Center failed to load ${dataset.table}:`, result.reason);
    reportData.warnings.push(`${dataset.table} is temporarily unavailable.`);
  });

  return reportData;
}
