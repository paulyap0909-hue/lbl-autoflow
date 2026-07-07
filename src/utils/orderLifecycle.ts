import type { Order } from '../data/mockData';

type OrderLifecycleRecord = Partial<Order> & Record<string, unknown>;

const isTruthyFlag = (value: unknown) =>
  value === true || String(value ?? '').trim().toLowerCase() === 'true';

const normalizeStatus = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/_/g, ' ');

const terminalStatuses = new Set([
  'completed',
  'complete',
  'delivered',
  'collected',
  'cancelled',
  'canceled',
  'deleted',
  'archived'
]);

export const isOrderRecordAvailable = (order: OrderLifecycleRecord | null | undefined) => {
  if (!order) return false;

  const deletedAt = order.deleted_at ?? order.deletedAt;
  const isDeleted = order.is_deleted ?? order.isDeleted;

  return !deletedAt && !isTruthyFlag(isDeleted);
};

export const isActiveOrder = (order: OrderLifecycleRecord | null | undefined) => {
  if (!isOrderRecordAvailable(order)) return false;
  if (!order) return false;

  const completedAt = order.completed_at ?? order.completedAt;
  const isCompleted = order.is_completed ?? order.isCompleted;
  if (completedAt || isTruthyFlag(isCompleted)) return false;

  return ![
    order.status,
    order.order_status,
    order.orderStatus,
    order.workflow_status,
    order.workflowStatus,
    order.delivery_status,
    order.deliveryStatus,
    order.fulfillment_status,
    order.fulfillmentStatus
  ].some((status) => terminalStatuses.has(normalizeStatus(status)));
};

export const getOrderFulfillmentDate = (
  order: OrderLifecycleRecord | null | undefined
) => {
  if (!order) return '';

  const date = [
    order.delivery_date,
    order.deliveryDate,
    order.pickup_date,
    order.pickupDate,
    order.collection_date,
    order.collectionDate,
    order.self_collect_date,
    order.selfCollectDate,
    order.scheduled_date,
    order.scheduledDate,
    order.order_date,
    order.orderDate,
    order.created_at,
    order.createdAt
  ].find((value) => typeof value === 'string' && value.trim());

  return typeof date === 'string' ? date.slice(0, 10) : '';
};

export const getOrderIdentityKeys = (order: OrderLifecycleRecord) =>
  [order.supabaseId, order.id, order.orderNo, order.order_no]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value));
