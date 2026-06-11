import { supabase } from '../lib/supabase';

export type QuotationStatus = 'Draft' | 'Sent' | 'Viewed' | 'Negotiating' | 'Accepted' | 'Rejected';

export type QuotationItem = {
  id?: number | string;
  quotationId?: number | string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type QuotationHistory = {
  id?: number | string;
  quotationId: number | string;
  action: string;
  description: string;
  performedBy: string;
  createdAt?: string;
};

export type Quotation = {
  id?: number | string;
  quoteNo: string;
  leadId: number | string;
  leadName?: string;
  status: QuotationStatus;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalAmount: number;
  items: QuotationItem[];
  history: QuotationHistory[];
  createdAt?: string;
  updatedAt?: string;
};

type QuotationRow = {
  id?: number | string;
  quote_no?: string | null;
  lead_id?: number | string | null;
  status?: string | null;
  subtotal?: number | string | null;
  discount?: number | string | null;
  delivery_fee?: number | string | null;
  total_amount?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sales_leads?: { company_name?: string | null } | null;
  quotation_items?: Array<Record<string, unknown>> | null;
  quotation_history?: Array<Record<string, unknown>> | null;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value?: string | null): QuotationStatus => {
  const statuses: QuotationStatus[] = ['Draft', 'Sent', 'Viewed', 'Negotiating', 'Accepted', 'Rejected'];
  return statuses.includes(value as QuotationStatus) ? value as QuotationStatus : 'Draft';
};

const fromRow = (row: QuotationRow): Quotation => ({
  id: row.id,
  quoteNo: row.quote_no || '',
  leadId: row.lead_id || '',
  leadName: row.sales_leads?.company_name || 'Unlinked lead',
  status: normalizeStatus(row.status),
  subtotal: numberValue(row.subtotal),
  discount: numberValue(row.discount),
  deliveryFee: numberValue(row.delivery_fee),
  totalAmount: numberValue(row.total_amount),
  items: (row.quotation_items || []).map((item) => ({
    id: item.id as number | string | undefined,
    quotationId: item.quotation_id as number | string | undefined,
    productName: String(item.product_name || ''),
    quantity: numberValue(item.quantity),
    unitPrice: numberValue(item.unit_price),
    lineTotal: numberValue(item.line_total)
  })),
  history: (row.quotation_history || [])
    .map((history) => ({
      id: history.id as number | string | undefined,
      quotationId: history.quotation_id as number | string,
      action: String(history.action || ''),
      description: String(history.description || ''),
      performedBy: String(history.performed_by || 'Unknown user'),
      createdAt: history.created_at as string | undefined
    }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  createdAt: row.created_at || undefined,
  updatedAt: row.updated_at || undefined
});

const quotationSelect = '*, sales_leads(company_name), quotation_items(*), quotation_history(*)';

export async function loadQuotationsFromSupabase() {
  const { data, error } = await supabase
    .from('quotations')
    .select(quotationSelect)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load quotations:', error);
    throw error;
  }
  return (data ?? []).map((row) => fromRow(row as QuotationRow));
}

export async function generateQuotationNumber() {
  const { data, error } = await supabase.rpc('generate_quotation_number');
  if (error) {
    console.error('Failed to generate quotation number:', error);
    throw error;
  }
  return String(data || '');
}

export async function createQuotationInSupabase(
  quotation: Omit<Quotation, 'id' | 'quoteNo' | 'history' | 'createdAt' | 'updatedAt'>,
  performedBy: string
) {
  const quoteNo = await generateQuotationNumber();
  const { data, error } = await supabase
    .from('quotations')
    .insert({
      quote_no: quoteNo,
      lead_id: Number(quotation.leadId),
      status: quotation.status,
      subtotal: quotation.subtotal,
      discount: quotation.discount,
      delivery_fee: quotation.deliveryFee,
      total_amount: quotation.totalAmount,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create quotation:', error);
    throw error;
  }

  const quotationId = (data as QuotationRow).id;
  if (!quotationId) throw new Error('Quotation ID missing.');

  const { error: itemError } = await supabase.from('quotation_items').insert(
    quotation.items.map((item) => ({
      quotation_id: quotationId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.lineTotal
    }))
  );
  if (itemError) {
    await supabase.from('quotations').delete().eq('id', quotationId);
    console.error('Failed to create quotation items:', itemError);
    throw itemError;
  }

  await addQuotationHistory(quotationId, 'Quotation Created', `${quoteNo} created`, performedBy);
  return loadQuotationById(quotationId);
}

export async function loadQuotationById(quotationId: number | string) {
  const { data, error } = await supabase
    .from('quotations')
    .select(quotationSelect)
    .eq('id', quotationId)
    .single();
  if (error) throw error;
  return fromRow(data as QuotationRow);
}

export async function addQuotationHistory(quotationId: number | string, action: string, description: string, performedBy: string) {
  const { error } = await supabase.from('quotation_history').insert({
    quotation_id: quotationId,
    action,
    description,
    performed_by: performedBy || 'Unknown user'
  });
  if (error) throw error;
}

export async function updateQuotationStatusInSupabase(quotation: Quotation, status: QuotationStatus, performedBy: string) {
  if (!quotation.id) throw new Error('Quotation ID missing.');
  const { error } = await supabase
    .from('quotations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', quotation.id);
  if (error) throw error;
  await addQuotationHistory(quotation.id, `Status: ${status}`, `${quotation.quoteNo} changed to ${status}`, performedBy);
  return loadQuotationById(quotation.id);
}
