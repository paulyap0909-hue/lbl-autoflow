import type { Order } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { toSafeNumber } from '../utils/pricing';

export type InvoiceRecord = {
  id?: number | string;
  invoice_no?: string;
  order_id?: number | string | null;
  amount?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  invoice_date?: string | null;
  subtotal?: number | string | null;
  delivery_fee?: number | string | null;
  discount_amount?: number | string | null;
  grand_total?: number | string | null;
  pdf_url?: string | null;
  updated_at?: string | null;
};

const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const invoiceDateCode = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${year.slice(-2)}${month}${day}`;
};

export const isSequentialInvoiceNo = (value?: string | null) => /^LBL-\d{6}-\d{3,}$/.test(String(value || ''));

const getNumericOrderId = (order: Order) => {
  const raw = order.supabaseId || order.id;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

const getInvoiceTotals = (order: Order) => {
  const subtotal = toSafeNumber(order.finalSubtotal ?? order.originalSubtotal ?? order.totalAmount);
  const deliveryFee = toSafeNumber(order.deliveryFee);
  const discountAmount = toSafeNumber(order.discountAmount);
  const grandTotal = toSafeNumber(order.totalAmount);

  return {
    subtotal,
    deliveryFee,
    discountAmount,
    grandTotal: grandTotal || toSafeNumber(order.finalSubtotal ?? order.originalSubtotal) + deliveryFee
  };
};

export async function generateInvoiceNumber(invoiceDate = dateKey()) {
  const code = invoiceDateCode(invoiceDate);
  const prefix = `LBL-${code}-`;
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_no')
    .like('invoice_no', `${prefix}%`);

  if (error) {
    console.error('Failed to generate invoice number:', error);
    throw error;
  }

  const maxNumber = (data ?? []).reduce((max, invoice) => {
    const invoiceNo = String((invoice as InvoiceRecord).invoice_no || '');
    if (!invoiceNo.startsWith(prefix)) return max;
    const suffix = invoiceNo.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return max;
    const numberValue = Number(suffix);
    return Number.isFinite(numberValue) ? Math.max(max, numberValue) : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
}

export async function loadInvoicesFromSupabase() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load invoices:', error);
    throw error;
  }

  return data ?? [];
}

export async function getInvoiceForOrder(order: Order) {
  const orderId = getNumericOrderId(order);
  if (!orderId) return null;

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    console.error('Failed to check existing invoice:', error);
    throw error;
  }

  return data as InvoiceRecord | null;
}

export async function generateInvoiceForOrder(order: Order, options: { regenerate?: boolean } = {}) {
  const orderId = getNumericOrderId(order);
  if (!orderId) {
    throw new Error('Cannot generate invoice: Supabase order id is missing.');
  }

  const existingInvoice = await getInvoiceForOrder(order);
  const today = dateKey();
  const existingInvoiceNo = existingInvoice?.invoice_no || '';
  const shouldKeepExistingInvoiceNo = isSequentialInvoiceNo(existingInvoiceNo);
  const invoiceDate = shouldKeepExistingInvoiceNo ? existingInvoice?.invoice_date || today : today;
  const invoiceNo = shouldKeepExistingInvoiceNo ? existingInvoiceNo : await generateInvoiceNumber(invoiceDate);
  const totals = getInvoiceTotals(order);

  const payload = {
    order_id: orderId,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    subtotal: totals.subtotal,
    delivery_fee: totals.deliveryFee,
    discount_amount: totals.discountAmount,
    grand_total: totals.grandTotal,
    amount: totals.grandTotal,
    status: 'generated',
    updated_at: new Date().toISOString()
  };

  if (existingInvoice?.id) {
    const { data, error } = await supabase
      .from('invoices')
      .update(payload)
      .eq('id', existingInvoice.id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update invoice:', error);
      throw error;
    }

    return data as InvoiceRecord;
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      ...payload,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create invoice:', error);
    throw error;
  }

  console.log('Invoice inserted:', data);
  return data as InvoiceRecord;
}

export async function createInvoiceForOrder(order: Order) {
  return generateInvoiceForOrder(order);
}

export async function updateInvoiceStatusForOrder(order: Order) {
  const query = supabase
    .from('invoices')
    .update({
      status: order.paymentStatus
    });

  const orderId = getNumericOrderId(order);
  if (!orderId) return;

  const { error } = await query.eq('order_id', orderId);

  if (error) {
    console.error('Failed to update invoice status:', error);
    throw error;
  }
}
