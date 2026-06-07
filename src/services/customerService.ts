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

type CustomerOrderRow = {
  id?: string | number | null;
  customer_id?: string | number | null;
  customer_name?: string | null;
  phone?: string | null;
  address?: string | null;
  delivery_date?: string | null;
  created_at?: string | null;
  product?: string | null;
  flavours?: string[] | string | null;
  flavour_quantities?: Array<Record<string, unknown>> | string | null;
  total_amount?: number | string | null;
  total?: number | string | null;
  final_subtotal?: number | string | null;
  delivery_fee?: number | string | null;
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

const normalizePhoneForMatch = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const phoneVariantsForLookup = (phone: string) => {
  const trimmed = phone.trim();
  const normalized = normalizePhoneForMatch(trimmed);
  const local = normalized.startsWith('60') ? `0${normalized.slice(2)}` : '';
  return Array.from(new Set([trimmed, normalized, local, normalized ? `+${normalized}` : ''].filter(Boolean)));
};

const getOrderAmount = (order: CustomerOrderRow) => {
  const directTotal = toSafeNumber(order.total_amount ?? order.total);
  if (directTotal > 0) return directTotal;

  const finalSubtotal = toSafeNumber(order.final_subtotal);
  const deliveryFee = toSafeNumber(order.delivery_fee);
  return finalSubtotal > 0 ? finalSubtotal + deliveryFee : 0;
};

const getOrderDate = (order: CustomerOrderRow) => order.delivery_date || order.created_at?.slice(0, 10) || '';

const parseFlavours = (value: CustomerOrderRow['flavours']) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/"/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

const parseFlavourQuantities = (value: CustomerOrderRow['flavour_quantities']) => {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return [];
        }
      })()
    : value;

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      return String(record.name ?? record.flavour ?? record.flavor ?? record.product ?? '').trim();
    })
    .filter(Boolean);
};

const mostFrequent = (values: string[], fallback = '') => {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
};

const loadCustomerOrders = async (phone: string, customerId?: string | number | null) => {
  const id = customerId === undefined || customerId === null || String(customerId).trim() === '' ? '' : String(customerId);
  const columns = 'id, customer_id, customer_name, phone, address, delivery_date, created_at, product, flavours, flavour_quantities, total_amount, total, final_subtotal, delivery_fee';

  if (id) {
    const { data, error } = await supabase
      .from('orders')
      .select(columns)
      .eq('customer_id', id);

    if (error) {
      console.error('Failed to load customer orders:', error);
      throw error;
    }

    if ((data ?? []).length > 0) return data as CustomerOrderRow[];
  }

  const normalizedPhone = normalizePhoneForMatch(phone);
  if (!normalizedPhone) return [];

  const { data, error } = await supabase
    .from('orders')
    .select(columns)
    .in('phone', phoneVariantsForLookup(phone));

  if (error) {
    console.error('Failed to load customer orders:', error);
    throw error;
  }

  return ((data ?? []) as CustomerOrderRow[]).filter((item) => normalizePhoneForMatch(item.phone || '') === normalizedPhone);
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
  const normalizedPhone = normalizePhoneForMatch(phone);
  const orderCustomerId = order.customerId === undefined || order.customerId === null || String(order.customerId).trim() === ''
    ? ''
    : String(order.customerId);

  const { data: customerRows, error: findError } = orderCustomerId
    ? await supabase
        .from('customers')
        .select('*')
        .eq('id', orderCustomerId)
    : await supabase
        .from('customers')
        .select('*')
        .in('phone', phoneVariantsForLookup(phone));

  if (findError) {
    console.error('Failed to find customer by phone:', findError);
    throw findError;
  }

  const existing = (customerRows ?? []).find((row) =>
    orderCustomerId
      ? String((row as CustomerRow).id || '') === orderCustomerId
      : normalizePhoneForMatch((row as CustomerRow).phone || '') === normalizedPhone
  );
  const existingCustomer = existing ? customerFromRow(existing as CustomerRow) : null;
  const customerOrders = await loadCustomerOrders(phone, existingCustomer?.id ?? orderCustomerId);
  const fallbackOrders = customerOrders.length > 0
    ? customerOrders
    : [order, ...existingOrders.filter((item) => normalizePhoneForMatch(item.phone) === normalizedPhone && item.id !== order.id)].map((item) => ({
        id: item.supabaseId || item.id,
        customer_id: item.customerId ?? null,
        customer_name: item.customerName,
        phone: item.phone,
        address: item.address,
        delivery_date: item.deliveryDate,
        product: item.product,
        flavours: item.flavours,
        flavour_quantities: item.flavourQuantities,
        total_amount: item.totalAmount,
        final_subtotal: item.finalSubtotal,
        delivery_fee: item.deliveryFee
      }));
  const sortedOrderDates = fallbackOrders.map(getOrderDate).filter(Boolean).sort();
  const totalOrders = fallbackOrders.length;
  const totalSpend = fallbackOrders.reduce((sum, item) => sum + getOrderAmount(item), 0);
  const favouriteProduct = mostFrequent(fallbackOrders.map((item) => item.product || ''), order.product);
  const favouriteFlavour = mostFrequent(
    fallbackOrders.flatMap((item) => {
      const quantityFlavours = parseFlavourQuantities(item.flavour_quantities);
      return quantityFlavours.length ? quantityFlavours : parseFlavours(item.flavours);
    }),
    order.flavours[0] || ''
  );
  const latestOrder = [...fallbackOrders].sort((a, b) => getOrderDate(b).localeCompare(getOrderDate(a)))[0];

  if (existing) {
    const payload = {
      name: order.customerName.trim() || existingCustomer?.name || 'Customer',
      phone,
      whatsapp: existingCustomer?.whatsapp || phone,
      email: existingCustomer?.email || '',
      address: existingCustomer?.address || latestOrder?.address || order.address || '',
      notes: existingCustomer?.notes || '',
      total_orders: totalOrders,
      total_spend: Number(totalSpend.toFixed(2)),
      average_order_value: totalOrders > 0 ? Number((totalSpend / totalOrders).toFixed(2)) : 0,
      first_order_date: sortedOrderDates[0] || order.deliveryDate,
      last_order_date: sortedOrderDates.slice(-1)[0] || order.deliveryDate,
      favourite_product: favouriteProduct,
      favourite_flavour: favouriteFlavour,
      status: getCustomerTier(totalSpend),
      customer_status: existingCustomer?.customerStatus || 'Active'
    };

    const query = supabase
      .from('customers')
      .update(payload);
    const { data, error } = existingCustomer?.id
      ? await query.eq('id', existingCustomer.id).select().single()
      : await query.eq('phone', phone).select().single();

    if (error) {
      console.error('Failed to update customer:', error);
      throw error;
    }
    console.log('Customer inserted/updated', data);
    return customerFromRow(data as CustomerRow);
  }

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
    last_order_date: sortedOrderDates.slice(-1)[0] || order.deliveryDate,
    favourite_product: favouriteProduct,
    favourite_flavour: favouriteFlavour,
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
