import type { Order } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { toSafeNumber } from '../utils/pricing';
import { createAutomationLog } from './automationLogService';
import { createOrUpdateCustomerForOrder } from './customerService';
import { createDeliveryTaskForOrder, updateDeliveryTaskStatusForOrder } from './deliveryService';
import { createInvoiceForOrder, updateInvoiceStatusForOrder } from './invoiceService';
import { createKitchenTaskForOrder, updateKitchenTaskStatusForOrder } from './kitchenService';

type OrderRow = {
  id?: string | null;
  supabaseId?: string | null;
  order_id?: string | null;
  customer_id?: string | number | null;
  customerId?: string | number | null;
  order_no?: string | null;
  orderNo?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
  phone?: string | null;
  address?: string | null;
  delivery_date?: string | null;
  deliveryDate?: string | null;
  delivery_time?: string | null;
  deliveryTime?: string | null;
  subtotal?: number | string | null;
  delivery_fee?: number | string | null;
  deliveryFee?: number | string | null;
  total_amount?: number | string | null;
  total?: number | string | null;
  totalAmount?: number | string | null;
  payment_status?: Order['paymentStatus'] | string | null;
  paymentStatus?: Order['paymentStatus'] | string | null;
  order_status?: Order['workflowStatus'] | string | null;
  workflowStatus?: Order['workflowStatus'] | string | null;
  kitchen_status?: Order['kitchenStatus'] | string | null;
  kitchenStatus?: Order['kitchenStatus'] | string | null;
  delivery_status?: Order['deliveryStatus'] | string | null;
  deliveryStatus?: Order['deliveryStatus'] | string | null;
  product?: Order['product'] | string | null;
  flavours?: string[] | null;
  flavour_quantities?: Order['flavourQuantities'] | string | null;
  flavourQuantities?: Order['flavourQuantities'] | string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  unit_price?: number | string | null;
  original_unit_price?: number | string | null;
  originalUnitPrice?: number | string | null;
  final_unit_price?: number | string | null;
  finalUnitPrice?: number | string | null;
  discount_type?: Order['discountType'] | string | null;
  discountType?: Order['discountType'] | string | null;
  discount_value?: number | string | null;
  discountValue?: number | string | null;
  discount_amount?: number | string | null;
  discountAmount?: number | string | null;
  discount_reason?: string | null;
  discountReason?: string | null;
  original_subtotal?: number | string | null;
  originalSubtotal?: number | string | null;
  final_subtotal?: number | string | null;
  finalSubtotal?: number | string | null;
  remark?: string | null;
  created_at?: string | null;
};

const ORDERS_TABLE = 'orders';

const nowTimestamp = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const normalizePaymentStatus = (status: OrderRow['payment_status']): Order['paymentStatus'] => {
  if (status === 'Paid' || status === 'Overdue') return status;
  return 'Pending';
};

const normalizeOrderStatus = (status: OrderRow['order_status']): Order['workflowStatus'] => {
  const knownStatuses: Order['workflowStatus'][] = [
    'New Order',
    'Pending Payment',
    'Paid',
    'Preparing',
    'Ready',
    'Out For Delivery',
    'Completed',
    'Cancelled'
  ];
  return knownStatuses.includes(status as Order['workflowStatus'])
    ? (status as Order['workflowStatus'])
    : normalizePaymentStatus(status) === 'Paid'
      ? 'Paid'
      : 'Pending Payment';
};

const normalizeKitchenStatus = (status: OrderRow['kitchen_status'], orderStatus: Order['workflowStatus']): Order['kitchenStatus'] => {
  if (status === 'Preparing' || status === 'Ready') return status;
  if (orderStatus === 'Preparing') return 'Preparing';
  if (orderStatus === 'Ready') return 'Ready';
  return 'New';
};

const normalizeDeliveryStatus = (status: OrderRow['delivery_status'], orderStatus: Order['workflowStatus']): Order['deliveryStatus'] => {
  if (status === 'Assigned' || status === 'Out for Delivery' || status === 'Delivered') return status;
  if (orderStatus === 'Out For Delivery') return 'Out for Delivery';
  if (orderStatus === 'Completed') return 'Delivered';
  return 'Pending';
};

const normalizeDiscountType = (status: OrderRow['discount_type']): Order['discountType'] => {
  if (status === 'custom_unit_price' || status === 'percentage' || status === 'fixed_amount' || status === 'bulk_order') return status;
  return 'none';
};

const normalizeFlavourQuantities = (value: OrderRow['flavour_quantities']): NonNullable<Order['flavourQuantities']> => {
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
    .filter((item): item is NonNullable<typeof item> => Boolean(item && item.quantity > 0));
};

export const orderFromRow = (row: OrderRow): Order => {
  const total = toSafeNumber(row.total_amount ?? row.total ?? row.totalAmount);
  const deliveryFee = toSafeNumber(row.delivery_fee ?? row.deliveryFee);
  const subtotal = toSafeNumber(row.subtotal ?? total - deliveryFee);
  const status = normalizeOrderStatus(row.order_status ?? row.workflowStatus);
  const paymentStatus = normalizePaymentStatus(row.payment_status ?? row.paymentStatus);
  const orderId = row.order_no || row.orderNo || row.id || row.order_id || `LBL-${Date.now()}`;
  const flavourQuantities = normalizeFlavourQuantities(row.flavour_quantities ?? row.flavourQuantities);
  const flavours = flavourQuantities.length
    ? flavourQuantities.map((item) => item.name)
    : row.flavours?.length
      ? row.flavours
      : [String(row.product || 'Mini Tart')];
  const quantity = flavourQuantities.length
    ? flavourQuantities.reduce((sum, item) => sum + item.quantity, 0)
    : toSafeNumber(row.quantity || 1);
  const originalUnitPrice = toSafeNumber(row.original_unit_price ?? row.originalUnitPrice ?? row.unitPrice ?? row.unit_price ?? subtotal / Math.max(quantity, 1));
  const finalUnitPrice = toSafeNumber(row.final_unit_price ?? row.finalUnitPrice ?? row.unitPrice ?? row.unit_price ?? originalUnitPrice);
  const originalSubtotal = toSafeNumber(row.original_subtotal ?? row.originalSubtotal ?? originalUnitPrice * quantity);
  const finalSubtotal = toSafeNumber(row.final_subtotal ?? row.finalSubtotal ?? subtotal);
  const discountAmount = toSafeNumber(row.discount_amount ?? row.discountAmount ?? Math.max(originalSubtotal - finalSubtotal, 0));

  return {
    id: orderId,
    supabaseId: row.supabaseId || row.id || row.order_id || undefined,
    customerId: row.customer_id ?? row.customerId ?? undefined,
    orderNo: row.order_no || row.orderNo || orderId,
    customerName: row.customer_name || row.customerName || 'Customer',
    phone: row.phone || '',
    product: row.product === 'Croissant Egg Tart' ? 'Croissant Egg Tart' : 'Mini Tart',
    flavours,
    flavourQuantities,
    quantity,
    deliveryDate: row.delivery_date || row.deliveryDate || new Date().toISOString().slice(0, 10),
    deliveryTime: row.delivery_time || row.deliveryTime || '11:30',
    address: row.address || '',
    unitPrice: finalUnitPrice,
    originalUnitPrice,
    finalUnitPrice,
    discountType: normalizeDiscountType(row.discount_type ?? row.discountType),
    discountValue: toSafeNumber(row.discount_value ?? row.discountValue),
    discountAmount,
    discountReason: row.discount_reason || row.discountReason || undefined,
    originalSubtotal,
    finalSubtotal,
    deliveryFee,
    totalAmount: total,
    workflowStatus: status,
    statusHistory: [
      {
        status,
        timestamp: row.created_at ? row.created_at.slice(0, 16).replace('T', ' ') : nowTimestamp()
      }
    ],
    paymentStatus,
    kitchenStatus: normalizeKitchenStatus(row.kitchen_status ?? row.kitchenStatus, status),
    deliveryStatus: normalizeDeliveryStatus(row.delivery_status ?? row.deliveryStatus, status),
    remark: row.remark || undefined
  };
};

export const orderToRow = (order: Order) => ({
  order_no: order.orderNo || order.id,
  customer_name: order.customerName,
  phone: order.phone,
  address: order.address,
  delivery_date: order.deliveryDate,
  delivery_time: order.deliveryTime,
  subtotal: toSafeNumber(order.totalAmount) - toSafeNumber(order.deliveryFee),
  delivery_fee: toSafeNumber(order.deliveryFee),
  total: toSafeNumber(order.totalAmount),
  total_amount: toSafeNumber(order.totalAmount),
  payment_status: order.paymentStatus,
  order_status: order.workflowStatus,
  kitchen_status: order.kitchenStatus,
  delivery_status: order.deliveryStatus,
  product: order.product,
  flavours: order.flavours,
  flavour_quantities: order.flavourQuantities || [],
  quantity: order.quantity,
  unit_price: order.finalUnitPrice ?? order.unitPrice,
  original_unit_price: order.originalUnitPrice ?? order.unitPrice,
  final_unit_price: order.finalUnitPrice ?? order.unitPrice,
  discount_type: order.discountType || 'none',
  discount_value: toSafeNumber(order.discountValue),
  discount_amount: toSafeNumber(order.discountAmount),
  discount_reason: order.discountReason || '',
  original_subtotal: toSafeNumber(order.originalSubtotal ?? (order.quantity * (order.originalUnitPrice ?? order.unitPrice))),
  final_subtotal: toSafeNumber(order.finalSubtotal ?? (order.totalAmount - order.deliveryFee)),
  created_at: new Date().toISOString()
});

const getOrderLookup = (order: Order) => ({
  column: order.supabaseId ? 'id' : 'order_no',
  value: order.supabaseId || order.orderNo || order.id
});

async function safeSideEffect(label: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    console.error(`${label} failed:`, error);
  }
}

export async function syncKitchenTaskFromOrder(updatedOrder: Order) {
  const orderNo = updatedOrder.orderNo || updatedOrder.id;
  const payload = {
    order_id: updatedOrder.supabaseId || null,
    order_no: orderNo,
    product: updatedOrder.product,
    flavours: updatedOrder.flavours,
    flavour_quantities: updatedOrder.flavourQuantities || [],
    quantity: updatedOrder.quantity,
    delivery_date: updatedOrder.deliveryDate,
    delivery_time: updatedOrder.deliveryTime,
    status: updatedOrder.kitchenStatus
  };

  const { data: existing, error: findError } = updatedOrder.supabaseId
    ? await supabase.from('kitchen_tasks').select('id').or(`order_no.eq.${orderNo},order_id.eq.${updatedOrder.supabaseId}`).maybeSingle()
    : await supabase.from('kitchen_tasks').select('id').eq('order_no', orderNo).maybeSingle();

  if (findError) throw findError;
  if (!existing?.id) return null;

  const { data, error } = await supabase
    .from('kitchen_tasks')
    .update(payload)
    .eq('id', existing.id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function syncDeliveryTaskFromOrder(updatedOrder: Order) {
  const orderNo = updatedOrder.orderNo || updatedOrder.id;
  const payload = {
    order_id: updatedOrder.supabaseId || null,
    order_no: orderNo,
    customer_name: updatedOrder.customerName,
    phone: updatedOrder.phone,
    address: updatedOrder.address,
    delivery_date: updatedOrder.deliveryDate,
    delivery_time: updatedOrder.deliveryTime,
    status: updatedOrder.deliveryStatus
  };

  const { data: existing, error: findError } = updatedOrder.supabaseId
    ? await supabase.from('delivery_tasks').select('id').or(`order_no.eq.${orderNo},order_id.eq.${updatedOrder.supabaseId}`).maybeSingle()
    : await supabase.from('delivery_tasks').select('id').eq('order_no', orderNo).maybeSingle();

  if (findError) throw findError;
  if (!existing?.id) return null;

  const { data, error } = await supabase
    .from('delivery_tasks')
    .update(payload)
    .eq('id', existing.id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function syncInvoiceFromOrder(updatedOrder: Order) {
  const orderId = Number(updatedOrder.supabaseId || updatedOrder.id);
  if (!Number.isFinite(orderId)) return null;

  const { data: existing, error: findError } = await supabase
    .from('invoices')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing?.id) return null;

  const { data, error } = await supabase
    .from('invoices')
    .update({
      amount: updatedOrder.totalAmount,
      status: updatedOrder.paymentStatus
    })
    .eq('id', existing.id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateOrder(orderId: string | number, updatedOrder: Order) {
  const { data, error } = await supabase
    .from('orders')
    .update(orderToRow(updatedOrder))
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update order:', error);
    throw error;
  }

  const savedOrder = {
    ...updatedOrder,
    ...orderFromRow(data as OrderRow),
    product: updatedOrder.product,
    flavours: updatedOrder.flavours,
    flavourQuantities: updatedOrder.flavourQuantities,
    quantity: updatedOrder.quantity,
    unitPrice: updatedOrder.unitPrice,
    originalUnitPrice: updatedOrder.originalUnitPrice,
    finalUnitPrice: updatedOrder.finalUnitPrice,
    discountType: updatedOrder.discountType,
    discountValue: updatedOrder.discountValue,
    discountAmount: updatedOrder.discountAmount,
    discountReason: updatedOrder.discountReason,
    originalSubtotal: updatedOrder.originalSubtotal,
    finalSubtotal: updatedOrder.finalSubtotal,
    remark: updatedOrder.remark
  };

  await safeSideEffect('Kitchen task sync', async () => syncKitchenTaskFromOrder(savedOrder));
  await safeSideEffect('Delivery task sync', async () => syncDeliveryTaskFromOrder(savedOrder));
  await safeSideEffect('Invoice sync', async () => syncInvoiceFromOrder(savedOrder));
  await safeSideEffect('Automation log', async () => createAutomationLog('Order Updated', `${savedOrder.orderNo || savedOrder.id} edited and synced`));

  return savedOrder;
}

export async function loadOrdersFromSupabase() {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load orders from Supabase:', error);
    throw error;
  }

  return (data ?? []).map((row) => orderFromRow(row as OrderRow));
}

export async function createOrderInSupabase(order: Order) {
  const orderNo = order.orderNo || order.id;
  const { data: existingOrder, error: existingError } = await supabase
    .from(ORDERS_TABLE)
    .select('*')
    .eq('order_no', orderNo)
    .maybeSingle();

  if (existingError) {
    console.error('Failed to check existing order:', existingError);
    throw existingError;
  }

  if (existingOrder) {
    console.log('Order inserted', existingOrder);
    return {
      ...order,
      ...orderFromRow(existingOrder as OrderRow),
      product: order.product,
      flavours: order.flavours,
      flavourQuantities: order.flavourQuantities,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      originalUnitPrice: order.originalUnitPrice,
      finalUnitPrice: order.finalUnitPrice,
      discountType: order.discountType,
      discountValue: order.discountValue,
      discountAmount: order.discountAmount,
      discountReason: order.discountReason,
      originalSubtotal: order.originalSubtotal,
      finalSubtotal: order.finalSubtotal,
      remark: order.remark
    };
  }

  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .insert(orderToRow(order))
    .select()
    .single();

  if (error) {
    console.error('Failed to create order in Supabase full error:', {
  message: error?.message,
  code: error?.code,
  details: error?.details,
  hint: error?.hint,
  error,
});
    throw error;
  }

  console.log('Order inserted', data);
  return {
    ...order,
    ...orderFromRow(data as OrderRow),
    product: order.product,
    flavours: order.flavours,
    flavourQuantities: order.flavourQuantities,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    originalUnitPrice: order.originalUnitPrice,
    finalUnitPrice: order.finalUnitPrice,
    discountType: order.discountType,
    discountValue: order.discountValue,
    discountAmount: order.discountAmount,
    discountReason: order.discountReason,
    originalSubtotal: order.originalSubtotal,
    finalSubtotal: order.finalSubtotal,
    remark: order.remark
  };
}

export async function updateOrderInSupabase(order: Order) {
  const lookup = getOrderLookup(order);
  if (lookup.column === 'id') {
    return updateOrder(lookup.value, order);
  }

  const { data: existing, error } = await supabase
    .from(ORDERS_TABLE)
    .select('id')
    .eq('order_no', lookup.value)
    .maybeSingle();

  if (error) throw error;
  if (existing?.id) return updateOrder(existing.id, order);

  throw new Error('Order ID missing for update.');
}

export async function deleteOrderFromSupabase(order: Order) {
  const lookup = getOrderLookup(order);
  const { error } = await supabase.from(ORDERS_TABLE).delete().eq(lookup.column, lookup.value);
  if (error) {
    console.error('Failed to delete order from Supabase:', error);
    throw error;
  }
}

export async function createFullOrderWorkflow(order: Order, existingOrders: Order[] = []) {
  console.log('Creating full order workflow', order);
  let customerAction = 'Customer Updated';
  await createOrUpdateCustomerForOrder(order, existingOrders);
  const existingCustomer = existingOrders.some((item) => item.phone.trim() === order.phone.trim());
  customerAction = existingCustomer ? 'Customer Updated' : 'Customer Created';

  const savedOrder = await createOrderInSupabase(order);
  await createInvoiceForOrder(savedOrder);

  await safeSideEffect('Automation log', async () => createAutomationLog('New Order Created', 'Order created and related workflow records generated'));
  await safeSideEffect('Customer automation log', async () => createAutomationLog(customerAction, `${savedOrder.customerName} (${savedOrder.phone})`));
  await safeSideEffect('Invoice automation log', async () => createAutomationLog('Invoice Generated', `Invoice generated for ${savedOrder.orderNo || savedOrder.id}`));
  await safeSideEffect('Kitchen task create', async () => {
    await createKitchenTaskForOrder(savedOrder);
    await createAutomationLog('Kitchen Task Created', `Kitchen task created for ${savedOrder.orderNo || savedOrder.id}`);
  });
  await safeSideEffect('Delivery task create', async () => {
    await createDeliveryTaskForOrder(savedOrder);
    await createAutomationLog('Delivery Task Created', `Delivery task created for ${savedOrder.orderNo || savedOrder.id}`);
  });

  console.log('Workflow completed', savedOrder);
  return savedOrder;
}

export const createOrderWorkflow = createFullOrderWorkflow;
