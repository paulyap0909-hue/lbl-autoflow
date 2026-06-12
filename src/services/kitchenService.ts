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
  completed_at?: string | null;
  updated_at?: string | null;
};

export type KitchenTaskUpdateContext = {
  taskId?: string | number | null;
  orderId?: string | number | null;
  orderNo?: string | number | null;
  linkedOrderId?: string | number | null;
};

export type KitchenStatusSyncParams = KitchenTaskUpdateContext & {
  targetStatus: KitchenTask['kitchenStatus'];
  order?: Order | null;
};

export type KitchenStatusSyncResult = {
  kitchenTask: (KitchenTask & KitchenTaskRow) | KitchenTaskRow | null;
  order: Record<string, unknown> | null;
};

const getReadyTime = (order: Order) => {
  const date = new Date(`${order.deliveryDate} ${order.deliveryTime}`);
  if (Number.isNaN(date.getTime())) return order.deliveryTime;
  date.setMinutes(date.getMinutes() - 30);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const normalizeKitchenStatus = (status: KitchenTaskRow['status']): KitchenTask['kitchenStatus'] => {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'preparing') return 'Preparing';
  if (normalized === 'ready') return 'Ready';
  if (normalized === 'completed' || normalized === 'complete') return 'Completed';
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
  status: row.status ? normalizeKitchenStatus(row.status) : undefined,
  delivery_date: row.delivery_date,
  delivery_time: row.delivery_time,
  ready_time: row.ready_time,
  completed_at: row.completed_at,
  updated_at: row.updated_at,
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

export async function createKitchenTaskForOrder(order: Order, initialStatus: KitchenTask['kitchenStatus'] = 'New') {
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
      status: normalizeKitchenStatus(initialStatus)
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
  return syncKitchenStatusForOrder({
    orderId: order.supabaseId,
    orderNo: order.orderNo || order.id,
    linkedOrderId: order.id,
    targetStatus: order.kitchenStatus,
    order
  });
}

const toLookupValue = (value: string | number | null | undefined) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const uniqueLookupValues = (values: Array<string | number | null | undefined>) =>
  Array.from(new Set(values.map(toLookupValue).filter((value): value is string => Boolean(value))));

const getSupabaseErrorDetails = (error: unknown) => {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  return {
    message: String(record.message ?? error ?? 'Unknown Supabase error'),
    code: String(record.code ?? ''),
    details: String(record.details ?? ''),
    hint: String(record.hint ?? '')
  };
};

const isNumericLookup = (value: string) => /^\d+$/.test(value);

const buildKitchenLookupValues = (context: KitchenTaskUpdateContext, order?: Order | null) => ({
  taskIds: uniqueLookupValues([context.taskId]),
  orderIds: uniqueLookupValues([context.orderId, order?.supabaseId]).filter(isNumericLookup),
  orderNos: uniqueLookupValues([context.orderNo, order?.orderNo, order?.id, context.linkedOrderId])
});

const selectKitchenTasksBy = async (column: 'id' | 'order_id' | 'order_no', value: string) => {
  const { data, error } = await supabase
    .from('kitchen_tasks')
    .select('*')
    .eq(column, value);

  if (error) throw error;
  return (data ?? []) as KitchenTaskRow[];
};

const updateKitchenTasksBy = async (column: 'id' | 'order_id' | 'order_no', value: string, status: KitchenTask['kitchenStatus']) => {
  const updatePayload = { status };
  const { data, error } = await supabase
    .from('kitchen_tasks')
    .update(updatePayload)
    .eq(column, value)
    .select('*');

  if (error) throw error;
  return (data ?? []) as KitchenTaskRow[];
};

const buildOrderKitchenStatusPayload = (status: KitchenTask['kitchenStatus']) => ({
  kitchen_status: status
});

const updateOrderKitchenStatus = async (params: KitchenStatusSyncParams, status: KitchenTask['kitchenStatus']) => {
  const orderIds = uniqueLookupValues([params.orderId, params.order?.supabaseId]).filter(isNumericLookup);
  const orderNos = uniqueLookupValues([params.orderNo, params.order?.orderNo, params.order?.id, params.linkedOrderId]);
  const updatePayload = buildOrderKitchenStatusPayload(status);

  for (const id of orderIds) {
    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select('*');

    if (error) throw error;
    if (data?.[0]) return data[0] as Record<string, unknown>;
  }

  for (const orderNo of orderNos) {
    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('order_no', orderNo)
      .select('*');

    if (error) throw error;
    if (data?.[0]) return data[0] as Record<string, unknown>;
  }

  return null;
};

export async function syncKitchenStatusForOrder(params: KitchenStatusSyncParams): Promise<KitchenStatusSyncResult> {
  const normalizedStatus = normalizeKitchenStatus(params.targetStatus);
  const lookups = buildKitchenLookupValues(params, params.order);
  const foundTasks: KitchenTaskRow[] = [];
  let fallbackTaskCreationAttempted = false;

  try {
    for (const taskId of lookups.taskIds) {
      foundTasks.push(...await selectKitchenTasksBy('id', taskId));
      if (foundTasks.length > 0) break;
    }

    if (foundTasks.length === 0) {
      for (const orderId of lookups.orderIds) {
        foundTasks.push(...await selectKitchenTasksBy('order_id', orderId));
        if (foundTasks.length > 0) break;
      }
    }

    if (foundTasks.length === 0) {
      for (const orderNo of lookups.orderNos) {
        foundTasks.push(...await selectKitchenTasksBy('order_no', orderNo));
        if (foundTasks.length > 0) break;
      }
    }

    if (foundTasks.length === 0 && params.order) {
      fallbackTaskCreationAttempted = true;
      foundTasks.push(await createKitchenTaskForOrder(params.order, normalizedStatus) as KitchenTaskRow);
    }

    if (foundTasks.length === 0) {
      throw new Error('No kitchen task found and no order data was available to create one.');
    }

    const syncTaskIds = uniqueLookupValues(foundTasks.map((task) => task.id));
    const syncOrderIds = uniqueLookupValues([...lookups.orderIds, ...foundTasks.map((task) => task.order_id)]);
    const syncOrderNos = uniqueLookupValues([...lookups.orderNos, ...foundTasks.map((task) => task.order_no)]);
    const updatedTasks: KitchenTaskRow[] = [];

    for (const taskId of syncTaskIds) {
      updatedTasks.push(...await updateKitchenTasksBy('id', taskId, normalizedStatus));
    }
    for (const orderId of syncOrderIds) {
      updatedTasks.push(...await updateKitchenTasksBy('order_id', orderId, normalizedStatus));
    }
    for (const orderNo of syncOrderNos) {
      updatedTasks.push(...await updateKitchenTasksBy('order_no', orderNo, normalizedStatus));
    }

    const uniqueUpdatedTasks = updatedTasks.reduce<KitchenTaskRow[]>((acc, task) => {
      const taskId = toLookupValue(task.id);
      if (!taskId || !acc.some((existing) => toLookupValue(existing.id) === taskId)) acc.push(task);
      return acc;
    }, []);
    if (uniqueUpdatedTasks.length === 0) {
      throw new Error('Kitchen task update matched no rows. Check task links or Supabase UPDATE policy.');
    }

    const updatedOrder = await updateOrderKitchenStatus(params, normalizedStatus);
    if (!updatedOrder) {
      throw new Error('Kitchen task updated, but the linked order could not be found or updated.');
    }

    return {
      kitchenTask: kitchenTaskFromRow(uniqueUpdatedTasks[0]),
      order: updatedOrder
    };
  } catch (error) {
    console.error('Kitchen status sync failed:', {
      taskId: params.taskId ?? null,
      orderId: params.orderId ?? params.order?.supabaseId ?? null,
      orderNo: params.orderNo ?? params.order?.orderNo ?? params.order?.id ?? null,
      targetStatus: normalizedStatus,
      fallbackTaskCreationAttempted,
      ...getSupabaseErrorDetails(error)
    });
    throw error;
  }
}

export async function updateKitchenTaskStatus(
  lookup: string | KitchenTaskUpdateContext,
  status: KitchenTask['kitchenStatus'],
  order?: Order
) {
  const context: KitchenTaskUpdateContext = typeof lookup === 'string'
    ? { orderId: lookup, orderNo: lookup, linkedOrderId: lookup }
    : lookup;
  const result = await syncKitchenStatusForOrder({ ...context, targetStatus: status, order });
  return result.kitchenTask;
}
