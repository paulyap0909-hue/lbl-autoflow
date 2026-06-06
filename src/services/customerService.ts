import type { Customer, Order } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { toSafeNumber } from '../utils/pricing';

type CustomerRow = {
  id?: string | null;
  name?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  total_orders?: number | string | null;
  totalOrders?: number | string | null;
  total_spend?: number | string | null;
  totalSpend?: number | string | null;
  average_order_value?: number | string | null;
  averageOrderValue?: number | string | null;
  first_order_date?: string | null;
  firstOrderDate?: string | null;
  last_order_date?: string | null;
  lastOrderDate?: string | null;
  favourite_product?: string | null;
  favouriteProduct?: string | null;
  favourite_flavour?: string | null;
  favouriteFlavour?: string | null;
  status?: Customer['status'] | string | null;
  customer_tier?: Customer['status'] | string | null;
  customerTier?: Customer['status'] | string | null;
  customer_status?: Customer['customerStatus'] | string | null;
  customerStatus?: Customer['customerStatus'] | string | null;
};

const normalizeStatus = (status: CustomerRow['status']): Customer['status'] => {
  if (status === 'Silver' || status === 'Gold' || status === 'VIP') return status;
  return 'Bronze';
};

const getCustomerTier = (spend: number): Customer['status'] => {
  if (spend >= 1000) return 'VIP';
  if (spend >= 500) return 'Gold';
  if (spend >= 250) return 'Silver';
  return 'Bronze';
};

export const customerFromRow = (row: CustomerRow): Customer => ({
  id: row.id || undefined,
  name: row.name || row.customer_name || 'Customer',
  phone: row.phone || '',
  whatsapp: row.whatsapp || row.phone || '',
  email: row.email || '',
  address: row.address || '',
  notes: row.notes || '',
  totalOrders: toSafeNumber(row.total_orders ?? row.totalOrders),
  totalSpend: toSafeNumber(row.total_spend ?? row.totalSpend),
  averageOrderValue: toSafeNumber(row.average_order_value ?? row.averageOrderValue),
  firstOrderDate: row.first_order_date || row.firstOrderDate || '',
  lastOrderDate: row.last_order_date || row.lastOrderDate || '',
  favouriteProduct: row.favourite_product || row.favouriteProduct || '',
  favouriteFlavour: row.favourite_flavour || row.favouriteFlavour || '',
  status: normalizeStatus(row.customer_tier ?? row.customerTier ?? row.status),
  customerTier: normalizeStatus(row.customer_tier ?? row.customerTier ?? row.status),
  customer_tier: normalizeStatus(row.customer_tier ?? row.customerTier ?? row.status),
  customerStatus: row.customer_status === 'Archived' || row.customerStatus === 'Archived' || row.status === 'Archived' ? 'Archived' : 'Active'
});

export async function loadCustomersFromSupabase() {
  const { data, error } = await supabase.from('customers').select('*');
  if (error) {
    console.error('Failed to load customers from Supabase:', error);
    throw error;
  }

  const customers = (data ?? []).map((row) => customerFromRow(row as CustomerRow));
  console.log("Customers loaded from Supabase:", customers);
  return customers;
}

export async function createOrUpdateCustomerForOrder(order: Order, existingOrders: Order[] = []) {
  const phone = order.phone.trim();
  if (!phone) return null;

  const customerOrders = [order, ...existingOrders.filter((item) => item.phone.trim() === phone && item.id !== order.id)];
  const calculatedSpend = customerOrders.reduce((sum, item) => sum + toSafeNumber(item.totalAmount), 0);
  const calculatedOrders = customerOrders.length;
  const sortedOrderDates = customerOrders.map((item) => item.deliveryDate).filter(Boolean).sort();

  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (findError) {
    console.error('Failed to find customer by phone:', findError);
    throw findError;
  }

  if (existing) {
    const existingCustomer = customerFromRow(existing as CustomerRow);
    const totalOrders = Math.max(existingCustomer.totalOrders, calculatedOrders);
    const totalSpend = Math.max(existingCustomer.totalSpend, calculatedSpend);
    const payload = {
      name: order.customerName.trim() || existingCustomer.name || 'Customer',
      phone,
      whatsapp: existingCustomer.whatsapp || phone,
      email: existingCustomer.email || '',
      address: existingCustomer.address || order.address || '',
      notes: existingCustomer.notes || '',
      total_orders: totalOrders,
      total_spend: Number(totalSpend.toFixed(2)),
      average_order_value: totalOrders > 0 ? Number((totalSpend / totalOrders).toFixed(2)) : 0,
      first_order_date: existingCustomer.firstOrderDate || sortedOrderDates[0] || order.deliveryDate,
      last_order_date: [existingCustomer.lastOrderDate, order.deliveryDate].filter(Boolean).sort().slice(-1)[0] || order.deliveryDate,
      favourite_product: order.product || existingCustomer.favouriteProduct,
      favourite_flavour: order.flavours[0] || existingCustomer.favouriteFlavour || '',
      status: getCustomerTier(totalSpend),
      customer_status: existingCustomer.customerStatus || 'Active'
    };

    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('phone', phone)
      .select()
      .single();

    if (error) {
      console.error('Failed to update customer:', error);
      throw error;
    }
    console.log('Customer inserted/updated', data);
    return customerFromRow(data as CustomerRow);
  }

  const totalSpend = calculatedSpend;
  const totalOrders = calculatedOrders;
  const payload = {
    name: order.customerName.trim() || 'Customer',
    phone,
    whatsapp: phone,
    email: '',
    address: order.address || '',
    notes: '',
    total_orders: totalOrders,
    total_spend: Number(totalSpend.toFixed(2)),
    average_order_value: totalOrders > 0 ? Number((totalSpend / totalOrders).toFixed(2)) : 0,
    first_order_date: sortedOrderDates[0] || order.deliveryDate,
    last_order_date: order.deliveryDate,
    favourite_product: order.product,
    favourite_flavour: order.flavours[0] || '',
    status: getCustomerTier(totalSpend),
    customer_status: 'Active'
  };

  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Failed to create customer:', error);
    throw error;
  }

  console.log('Customer inserted/updated', data);
  return customerFromRow(data as CustomerRow);
}
