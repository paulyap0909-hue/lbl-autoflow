import type { Order } from '../data/mockData';
import type { DeliveryTask } from '../data/mockData';
import { supabase } from '../lib/supabase';

type DeliveryTaskRow = {
  id?: string | null;
  order_id?: string | null;
  order_no?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  address?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  driver_name?: string | null;
  status?: DeliveryTask['deliveryStatus'] | string | null;
};

const normalizeDeliveryStatus = (status: DeliveryTaskRow['status']): DeliveryTask['deliveryStatus'] => {
  if (status === 'Assigned' || status === 'Out for Delivery' || status === 'Delivered') return status;
  return 'Pending';
};

const deliveryTaskFromRow = (row: DeliveryTaskRow): DeliveryTask & DeliveryTaskRow => ({
  id: row.id,
  order_id: row.order_id,
  order_no: row.order_no,
  status: normalizeDeliveryStatus(row.status),
  customer_name: row.customer_name,
  delivery_date: row.delivery_date,
  delivery_time: row.delivery_time,
  driver_name: row.driver_name,
  orderId: row.order_no || row.order_id || '',
  customerName: row.customer_name || 'Customer',
  phone: row.phone || '',
  address: row.address || '',
  deliveryDate: row.delivery_date || '',
  deliveryTime: row.delivery_time || '',
  driverName: row.driver_name || '',
  deliveryStatus: normalizeDeliveryStatus(row.status)
});

export async function loadDeliveryTasksFromSupabase() {
  const { data, error } = await supabase
    .from('delivery_tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Delivery tasks error:', error);
    throw error;
  }

  console.log('Delivery tasks loaded:', data);
  return (data ?? []).map((row) => deliveryTaskFromRow(row as DeliveryTaskRow));
}

export async function createDeliveryTaskForOrder(order: Order) {
  const orderNo = order.orderNo || order.id;
  const query = supabase.from('delivery_tasks').select('*');
  const { data: existing, error: existingError } = order.supabaseId
    ? await query.or(`order_no.eq.${orderNo},order_id.eq.${order.supabaseId}`).maybeSingle()
    : await query.eq('order_no', orderNo).maybeSingle();

  if (existingError) {
    console.error('Delivery tasks error:', existingError);
    throw existingError;
  }

  if (existing) return existing;

  const { data, error } = await supabase
    .from('delivery_tasks')
    .insert({
      order_id: order.supabaseId || null,
      order_no: order.orderNo || order.id,
      customer_name: order.customerName,
      phone: order.phone,
      address: order.address,
      delivery_date: order.deliveryDate,
      delivery_time: order.deliveryTime,
      driver_name: '',
      status: 'Pending',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Delivery tasks error:', error);
    throw error;
  }

  console.log('Delivery task inserted:', data);
  return data;
}

export async function updateDeliveryTaskStatusForOrder(order: Order) {
  const { error } = await supabase
    .from('delivery_tasks')
    .update({
      status: order.deliveryStatus
    })
    .eq('order_no', order.orderNo || order.id);

  if (error) {
    console.error('Delivery tasks error:', error);
    throw error;
  }
}

export async function updateDeliveryTaskStatus(
  orderNo: string,
  status: DeliveryTask['deliveryStatus'],
  driverName?: string
) {
  const orderKey = String(orderNo).trim();
  const isNumericId = /^\d+$/.test(orderKey);

  const patch: Record<string, string> = { status };

  if (driverName !== undefined) {
    patch.driver_name = driverName;
  }

  let query = supabase
    .from('delivery_tasks')
    .update(patch);

  const { data, error } = isNumericId
    ? await query.eq('order_id', Number(orderKey)).select().maybeSingle()
    : await query.eq('order_no', orderKey).select().maybeSingle();

  if (error) {
    console.error('Delivery tasks error:', error);
    throw error;
  }

  return data;
  console.log('Delivery status updated:', data);
}
