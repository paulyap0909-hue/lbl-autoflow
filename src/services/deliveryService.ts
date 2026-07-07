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
  driver?: string | null;
  delivery_method?: string | null;
  driver_phone?: string | null;
  driver_type?: string | null;
  status?: DeliveryTask['deliveryStatus'] | string | null;
  delivery_status?: DeliveryTask['deliveryStatus'] | string | null;
};

export type DeliveryDriverDetails = {
  driverPhone?: string;
  driverType?: DeliveryTask['driverType'] | string;
};

const normalizeDeliveryStatus = (status: DeliveryTaskRow['status']): DeliveryTask['deliveryStatus'] => {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'assigned') return 'Assigned';
  if (normalized === 'out for delivery' || normalized === 'out_for_delivery') return 'Out for Delivery';
  if (normalized === 'collected') return 'Collected';
  if (normalized === 'delivered' || normalized === 'completed' || normalized === 'complete') return 'Delivered';
  return 'Pending';
};

const getSupabaseErrorDetails = (error: unknown) => {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  return {
    code: String(record.code ?? ''),
    message: String(record.message ?? error ?? 'Unknown delivery task error'),
    details: String(record.details ?? ''),
    hint: String(record.hint ?? '')
  };
};

const buildDeliveryTaskStatusPatch = (
  status: DeliveryTask['deliveryStatus'],
  driverName?: string,
  _driverDetails?: DeliveryDriverDetails
) => {
  const patch: Record<string, string> = {
    status,
    delivery_status: status
  };

  if (driverName !== undefined) {
    patch.driver_name = driverName;
  }

  return patch;
};

export const isSelfCollectOrder = (order: Order) => {
  const address = String(order.address ?? '').trim().toLowerCase();
  const remark = String(order.remark ?? '').trim().toLowerCase();
  return /^self\s*collect$/.test(address)
    || /self\s*collect|pickup|pick\s*up|collection/.test(address)
    || /self\s*collect|pickup|pick\s*up|collection/.test(remark);
};

const deliveryTaskFromRow = (row: DeliveryTaskRow): DeliveryTask & DeliveryTaskRow => ({
  id: row.id,
  order_id: row.order_id,
  order_no: row.order_no,
  status: normalizeDeliveryStatus(row.status ?? row.delivery_status),
  customer_name: row.customer_name,
  delivery_date: row.delivery_date,
  delivery_time: row.delivery_time,
  driver_name: row.driver_name ?? row.driver,
  driver_phone: row.driver_phone,
  driver_type: row.driver_type ?? row.delivery_method,
  orderId: row.order_no || row.order_id || '',
  customerName: row.customer_name || 'Customer',
  phone: row.phone || '',
  address: row.address || '',
  deliveryDate: row.delivery_date || '',
  deliveryTime: row.delivery_time || '',
  driverName: row.driver_name || row.driver || '',
  driverPhone: row.driver_phone || '',
  driverType: (row.driver_type ?? row.delivery_method) as DeliveryTask['driverType'] | undefined,
  deliveryStatus: normalizeDeliveryStatus(row.status ?? row.delivery_status)
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
  if (isSelfCollectOrder(order)) {
    console.log('Delivery Task Skipped', {
      orderId: order.supabaseId,
      orderNo,
      reason: 'Self Collect order'
    });
    return null;
  }

  const query = supabase.from('delivery_tasks').select('*');
  const { data: existing, error: existingError } = order.supabaseId
    ? await query.or(`order_no.eq.${orderNo},order_id.eq.${order.supabaseId}`).maybeSingle()
    : await query.eq('order_no', orderNo).maybeSingle();

  if (existingError) {
    console.error('Delivery Task Failed', {
      orderId: order.supabaseId,
      orderNo,
      stage: 'existing delivery task lookup',
      error: getSupabaseErrorDetails(existingError)
    });
    throw existingError;
  }

  if (existing) {
    console.log('Delivery Task Created', {
      orderId: order.supabaseId,
      orderNo,
      reusedExisting: true
    });
    return existing;
  }

  const basePayload = {
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
  };
  const { data, error } = await supabase
    .from('delivery_tasks')
    .insert(basePayload)
    .select()
    .single();

  if (error) {
    console.error('Delivery Task Failed', {
      orderId: order.supabaseId,
      orderNo,
      payload: basePayload,
      error: getSupabaseErrorDetails(error)
    });
    throw error;
  }

  console.log('Delivery Task Created', {
    orderId: order.supabaseId,
    orderNo,
    data
  });
  return data;
}

export async function updateDeliveryTaskStatusForOrder(order: Order) {
  const patch = buildDeliveryTaskStatusPatch(order.deliveryStatus);
  const { error } = await supabase
    .from('delivery_tasks')
    .update(patch)
    .eq('order_no', order.orderNo || order.id);

  if (error) {
    console.error('Delivery tasks error:', error);
    throw error;
  }
}

export async function updateDeliveryTaskStatus(
  orderNo: string,
  status: DeliveryTask['deliveryStatus'],
  driverName?: string,
  driverDetails?: DeliveryDriverDetails
) {
  const orderKey = String(orderNo).trim();
  const isNumericId = /^\d+$/.test(orderKey);

  const patch = buildDeliveryTaskStatusPatch(status, driverName, driverDetails);

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
}
