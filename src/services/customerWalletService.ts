import { supabase } from '../lib/supabase';
import { toSafeNumber } from '../utils/pricing';

export type WalletTransactionType = 'top_up' | 'deduct' | 'refund' | 'adjustment';
export type WalletPaymentMethod = 'Cash' | 'QR' | 'Bank Transfer' | 'Card' | 'Customer Wallet';

export type CustomerWalletTransaction = {
  id: string;
  customerId: string;
  transactionType: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  paymentMethod: string;
  linkedOrderId?: string;
  remark: string;
  createdAt: string;
  createdBy: string;
};

type WalletTransactionRow = {
  id: string | number;
  customer_id: string | number;
  transaction_type: WalletTransactionType;
  amount: number | string;
  balance_before: number | string;
  balance_after: number | string;
  payment_method?: string | null;
  linked_order_id?: string | number | null;
  remark?: string | null;
  created_at: string;
  created_by?: string | null;
};

const fromRow = (row: WalletTransactionRow): CustomerWalletTransaction => ({
  id: String(row.id),
  customerId: String(row.customer_id),
  transactionType: row.transaction_type,
  amount: toSafeNumber(row.amount),
  balanceBefore: toSafeNumber(row.balance_before),
  balanceAfter: toSafeNumber(row.balance_after),
  paymentMethod: row.payment_method || '',
  linkedOrderId: row.linked_order_id == null ? undefined : String(row.linked_order_id),
  remark: row.remark || '',
  createdAt: row.created_at,
  createdBy: row.created_by || ''
});

export async function loadWalletTransactions(customerId: string | number) {
  const { data, error } = await supabase
    .from('customer_wallet_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => fromRow(row as WalletTransactionRow));
}

export async function getCustomerWalletBalance(customerId: string | number) {
  const { data, error } = await supabase
    .from('customers')
    .select('wallet_balance')
    .eq('id', customerId)
    .single();

  if (error) throw error;
  return toSafeNumber(data?.wallet_balance);
}

export async function recordWalletTransaction(input: {
  customerId: string | number;
  transactionType: WalletTransactionType;
  amount: number;
  paymentMethod?: string;
  linkedOrderId?: string | number;
  remark?: string;
  createdBy?: string;
}) {
  const { data, error } = await supabase.rpc('record_customer_wallet_transaction', {
    p_customer_id: Number(input.customerId),
    p_transaction_type: input.transactionType,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod || null,
    p_linked_order_id: input.linkedOrderId == null ? null : Number(input.linkedOrderId),
    p_remark: input.remark || null,
    p_created_by: input.createdBy || null
  });

  if (error) throw error;
  return fromRow(data as WalletTransactionRow);
}

export async function payOrderWithCustomerWallet(input: {
  customerId: string | number;
  orderId: string | number;
  amount: number;
  remark?: string;
  createdBy?: string;
}) {
  const { data, error } = await supabase.rpc('pay_order_with_customer_wallet', {
    p_customer_id: Number(input.customerId),
    p_order_id: Number(input.orderId),
    p_amount: input.amount,
    p_remark: input.remark || null,
    p_created_by: input.createdBy || null
  });

  if (error) throw error;
  return fromRow(data as WalletTransactionRow);
}
