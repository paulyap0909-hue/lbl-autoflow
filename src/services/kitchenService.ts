import type { Order } from '../data/mockData';
import type { KitchenTask } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { toSafeNumber } from '../utils/pricing';

type KitchenTaskRow = {
  id?: string | null;
  order_id?: string | null;
  order_no?: string | null;
  product?: string | null;
  flavours?: string[] | null;
  flavour_quantities?: Order['flavourQuantities'] | string | null;
  flavourQuantities?: Order['flavourQuantities'] | string | null;
  quantity?: number | string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  ready_time?: string | null;
  required_ready_time?: string | null;
  status?: KitchenTask['kitchenStatus'] | string | null;
};

const getReadyTime = (order: Order) => {
  const date = new Date(`${order.deliveryDate} ${order.deliveryTime}`);
  if (Number.isNaN(date.getTime())) return order.deliveryTime;
  date.setMinutes(date.getMinutes() - 30);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const normalizeKitchenStatus = (status: KitchenTaskRow['status']): KitchenTask['kitchenStatus'] => {
  if (status === 'Preparing' || status === 'Ready') return status;
  return 'New';
};

const normalizeFlavourQuantities = (value: KitchenTaskRow['flavour_quantities']): Order['flavourQuantities'] => {
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
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? record.flavour ?? record.flavor ?? record.product ?? '').trim();
      const quantity = toSafeNumber(record.quantity ?? record.qty);
      return name ? { name, quantity } : null;
    })
    .filter((item): item is { name: string; quantity: number } => Boolean(item && item.quantity > 0));
};

const kitchenTaskFromRow = (row: KitchenTaskRow): KitchenTask & KitchenTaskRow => ({
  id: row.id,
  order_id: row.order_id,
  order_no: row.order_no,
  status: normalizeKitchenStatus(row.status),
  delivery_date: row.delivery_date,
  delivery_time: row.delivery_time,
  ready_time: row.ready_time,
  orderId: row.order_no || row.order_id || '',
  product: row.product || 'Mini Tart',
  flavours: row.flavours?.length ? row.flavours : [row.product || 'Mini Tart'],
  flavourQuantities: normalizeFlavourQuantities(row.flavour_quantities ?? row.flavourQuantities),
  flavour_quantities: row.flavour_quantities,
  quantity: toSafeNumber(row.quantity || 1),
  deliveryDate: row.delivery_date || '',
  deliveryTime: row.delivery_time || '',
  requiredReadyTime: row.ready_time || row.required_ready_time || '',
  kitchenStatus: normalizeKitchenStatus(row.status)
});

export async function loadKitchenTasksFromSupabase() {
  const { data, error } = await supabase
    .from('kitchen_tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load kitchen tasks:', error);
    throw error;
  }

  const tasks = (data ?? []).map((row) => kitchenTaskFromRow(row as KitchenTaskRow));
  console.log('Kitchen tasks loaded', tasks);
  return tasks;
}

export async function createKitchenTaskForOrder(order: Order) {
  const orderNo = order.orderNo || order.id;
  const query = supabase.from('kitchen_tasks').select('*');
  const { data: existing, error: existingError } = order.supabaseId
    ? await query.or(`order_no.eq.${orderNo},order_id.eq.${order.supabaseId}`).maybeSingle()
    : await query.eq('order_no', orderNo).maybeSingle();

  if (existingError) {
    console.error('Kitchen update error', existingError);
    throw existingError;
  }

  if (existing) return existing;

  const { data, error } = await supabase
    .from('kitchen_tasks')
    .insert({
      order_id: order.supabaseId || null,
      order_no: order.orderNo || order.id,
      product: order.product,
      flavours: order.flavours,
      flavour_quantities: order.flavourQuantities || [],
      quantity: order.quantity,
      delivery_date: order.deliveryDate,
      delivery_time: order.deliveryTime,
      ready_time: getReadyTime(order),
      status: 'New'
    })
    .select()
    .single();

  if (error) {
    console.error('Kitchen update error', error);
    throw error;
  }

  console.log('Kitchen task inserted', data);
  return data;
}

export async function updateKitchenTaskStatusForOrder(order: Order) {
  const { error } = await supabase
    .from('kitchen_tasks')
    .update({
      status: order.kitchenStatus
    })
    .eq('order_no', order.orderNo || order.id);

  if (error) {
    console.error('Kitchen update error', error);
    throw error;
  }
}

export async function updateKitchenTaskStatus(orderNo: string, status: KitchenTask['kitchenStatus']) {
  const orderKey = String(orderNo).trim();
  const isNumericId = /^\d+$/.test(orderKey);

  let query = supabase
    .from('kitchen_tasks')
    .update({ status });

  const { data, error } = isNumericId
    ? await query.eq('order_id', Number(orderKey)).select().single()
    : await query.eq('order_no', orderKey).select().single();

  if (error) {
    console.error('Kitchen update error', error);
    throw error;
  }

  return data;
  console.log('Kitchen status updated', { orderNo, status });
}
