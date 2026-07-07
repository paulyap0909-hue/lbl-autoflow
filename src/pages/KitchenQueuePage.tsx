import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronUp, Clock3, X } from 'lucide-react';
import type { KitchenTask, Order } from '../data/mockData';
import Toast from '../components/Toast';
import { createAutomationLog } from '../services/automationLogService';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';
import { getOrderFulfillmentDate, isActiveOrder } from '../utils/orderLifecycle';
import {
  loadKitchenTasksFromSupabase,
  syncKitchenStatusForOrder,
  type KitchenTaskUpdateContext
} from '../services/kitchenService';

type KitchenQueuePageProps = {
  kitchenTasks: KitchenTask[];
  orders: Order[];
  onUpdateKitchenStatus: (
    orderId: string,
    newStatus: 'Preparing' | 'Ready' | 'Completed',
    taskContext?: KitchenTaskUpdateContext
  ) => void | Promise<void>;
};

type KitchenTaskRecord = Partial<KitchenTask> & Record<string, unknown>;
type KitchenStatus = 'New' | 'Preparing' | 'Ready' | 'Completed';
type CompletedHistoryRange = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Custom';
const statusPriority: Record<KitchenStatus, number> = {
  New: 0,
  Preparing: 1,
  Ready: 2,
  Completed: 3
};
const MAX_VISIBLE_KITCHEN_ITEM_ROWS = 8;
type KitchenItemLine = {
  name: string;
  quantity: number;
};

const toSafeQuantity = (value: unknown) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return trimmed;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const cleanItemName = (value: unknown) => {
  return String(value ?? '')
    .replace(/^\s*["']|["']\s*$/g, '')
    .trim();
};

const extractQuantityMap = (task: KitchenTaskRecord) => {
  const raw =
    task.flavourQuantities ??
    task.flavour_quantities ??
    task.flavorQuantities ??
    task.flavor_quantities ??
    task.item_quantities ??
    task.itemQuantities;
  const parsed = parseMaybeJson(raw);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, number>>((acc, [name, quantity]) => {
    const cleanedName = cleanItemName(name);
    if (cleanedName) acc[cleanedName] = toSafeQuantity(quantity);
    return acc;
  }, {});
};

const extractLineItems = (task: KitchenTaskRecord) => {
  const raw = task.items ?? task.order_items ?? task.orderItems ?? task.line_items ?? task.lineItems;
  const parsed = parseMaybeJson(raw);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = cleanItemName(record.name ?? record.product ?? record.flavour ?? record.flavor ?? record.product_name);
      const quantity = toSafeQuantity(record.quantity ?? record.qty ?? record.item_quantity);
      return name ? { name, quantity } : null;
    })
    .filter((item): item is KitchenItemLine => Boolean(item));
};

const formatKitchenQuantity = (quantity: number) => {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '');
};

const parseFlavourQuantityList = (value: unknown) => {
  const parsed = parseMaybeJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = cleanItemName(record.name ?? record.flavour ?? record.flavor ?? record.product ?? record.product_name);
      const quantity = toSafeQuantity(record.quantity ?? record.qty ?? record.item_quantity);
      return name && quantity > 0 ? { name, quantity } : null;
    })
    .filter((item): item is KitchenItemLine => Boolean(item));
};

const getKitchenFlavourLines = (task: KitchenTaskRecord, order?: Order) => {
  const structuredLines =
    parseFlavourQuantityList(task.flavourQuantities)
      .concat(parseFlavourQuantityList(task.flavour_quantities))
      .concat(parseFlavourQuantityList(order?.flavourQuantities));

  if (structuredLines.length > 0) {
    const uniqueLines = structuredLines.reduce<KitchenItemLine[]>((acc, item) => {
      if (!acc.some((existing) => existing.name === item.name && existing.quantity === item.quantity)) {
        acc.push(item);
      }
      return acc;
    }, []);

    return uniqueLines.map((item) => ({
      name: item.name,
      qty: formatKitchenQuantity(item.quantity)
    }));
  }

  const realLineItems = extractLineItems(task).filter((item) => item.quantity > 0);
  if (realLineItems.length > 0) {
    return realLineItems.map((item) => ({
      name: item.name,
      qty: formatKitchenQuantity(item.quantity)
    }));
  }

  const quantityMap = extractQuantityMap(task);
  const totalQty = Number(task.quantity || task.qty || 0);
  const rawFlavours = task.flavours as unknown;
  let flavours: string[] = [];

  if (Array.isArray(rawFlavours)) {
    flavours = rawFlavours.map((item) => cleanItemName(item)).filter(Boolean);
  } else if (typeof rawFlavours === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawFlavours);
      flavours = Array.isArray(parsed) ? parsed.map((item) => cleanItemName(item)).filter(Boolean) : [cleanItemName(rawFlavours)].filter(Boolean);
    } catch {
      flavours = rawFlavours
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split('"').join('')
        .split(',')
        .map((item: string) => item.trim())
        .filter(Boolean);
    }
  }

  if (flavours.length === 0) {
    flavours = [cleanItemName(task.product) || 'Product'];
  }

  const qtyPerFlavour =
    flavours.length > 1 && totalQty > 0
      ? Math.floor(totalQty / flavours.length)
      : totalQty;

  return flavours.map((flavour) => ({
    name: flavour,
    qty: formatKitchenQuantity(quantityMap[flavour] || qtyPerFlavour || totalQty || 1)
  }));
};

const normalizeStatus = (value: unknown): KitchenStatus => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'preparing') return 'Preparing';
  if (normalized === 'ready') return 'Ready';
  if (normalized === 'completed' || normalized === 'complete') return 'Completed';
  return 'New';
};

const getSyncedKitchenStatus = (task: KitchenTaskRecord, order?: Order): KitchenStatus => {
  const taskStatus = String(task.status ?? '').trim();
  if (taskStatus) return normalizeStatus(taskStatus);

  const orderStatus = String(order?.kitchenStatus ?? '').trim();
  if (orderStatus) return normalizeStatus(orderStatus);

  return normalizeStatus(task.kitchenStatus);
};

const isCancelledKitchenTask = (task: KitchenTaskRecord, order?: Order) => {
  const orderRecord = order as (Order & Record<string, unknown>) | undefined;
  return [
    task.status,
    task.kitchenStatus,
    order?.workflowStatus,
    orderRecord?.status,
    orderRecord?.order_status
  ].some((value) => ['cancelled', 'canceled'].includes(String(value ?? '').trim().toLowerCase()));
};

const toTaskDateTime = (task: KitchenTaskRecord, order?: Order) => {
  const productionDate = getTaskProductionDate(task, order);
  const productionTime = getTaskProductionTime(task, order);
  if (!productionDate || productionDate === '-' || !productionTime || productionTime === '-') return Number.POSITIVE_INFINITY;

  const parsed = new Date(`${productionDate} ${productionTime}`).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const getTaskOrderNo = (task: KitchenTaskRecord) => String(task.order_no ?? task.orderId ?? task.order_id ?? '-');
const getTaskId = (task: KitchenTaskRecord) => String(task.id ?? '');
const getCompletedTimestamp = (task: KitchenTaskRecord) =>
  String(task.completed_at ?? task.completedAt ?? task.updated_at ?? task.updatedAt ?? '');
const getTimestampDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : getMalaysiaDateTimeInputs(parsed).date;
};
const formatCompletedTime = (value: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || '-';
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
};
const getTaskTotalItems = (task: KitchenTaskRecord, order?: Order) => {
  const lines = getKitchenFlavourLines(task, order);
  const lineTotal = lines.reduce((sum, item) => sum + toSafeQuantity(item.qty), 0);
  return lineTotal || toSafeQuantity(task.quantity ?? task.qty) || order?.quantity || 0;
};

const getTaskReadyTime = (task: KitchenTaskRecord) => String(task.ready_time ?? task.requiredReadyTime ?? task.required_ready_time ?? '-');
const getTaskProductionDate = (task: KitchenTaskRecord, order?: Order) => {
  const taskDate = [
    task.delivery_date,
    task.deliveryDate,
    task.pickup_date,
    task.pickupDate,
    task.self_collect_date,
    task.selfCollectDate
  ].find((value) => typeof value === 'string' && value.trim());

  return String(
    taskDate
    || getOrderFulfillmentDate(order as (Order & Record<string, unknown>) | undefined)
    || '-'
  );
};
const getTaskProductionTime = (task: KitchenTaskRecord, order?: Order) => {
  const orderRecord = order as (Order & Record<string, unknown>) | undefined;
  return String(
    task.delivery_time
    ?? task.deliveryTime
    ?? task.pickup_time
    ?? task.pickupTime
    ?? task.self_collect_time
    ?? task.selfCollectTime
    ?? orderRecord?.delivery_time
    ?? order?.deliveryTime
    ?? orderRecord?.pickup_time
    ?? orderRecord?.pickupTime
    ?? orderRecord?.self_collect_time
    ?? orderRecord?.selfCollectTime
    ?? '-'
  );
};
const getTaskDeadlineTime = (task: KitchenTaskRecord, order?: Order) => {
  const readyTime = getTaskReadyTime(task);
  return readyTime && readyTime !== '-' ? readyTime : getTaskProductionTime(task, order);
};
const toTaskDeadlineDateTime = (task: KitchenTaskRecord, order?: Order) => {
  const productionDate = getTaskProductionDate(task, order);
  const deadlineTime = getTaskDeadlineTime(task, order);
  if (!productionDate || productionDate === '-' || !deadlineTime || deadlineTime === '-') return Number.POSITIVE_INFINITY;

  const parsed = new Date(`${productionDate} ${deadlineTime}`).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};
const getTaskCustomerName = (task: KitchenTaskRecord, order?: Order) =>
  String(task.customer_name ?? task.customerName ?? order?.customerName ?? 'Customer unavailable');
const getTaskAddress = (task: KitchenTaskRecord, order?: Order) =>
  String(task.address ?? order?.address ?? 'Pickup / address unavailable');
const getTaskKey = (task: KitchenTaskRecord, index = 0) => `${getTaskId(task) || getTaskOrderNo(task)}-${index}`;
const isSameKitchenTask = (candidate: KitchenTaskRecord, target: KitchenTaskRecord) => {
  const candidateId = getTaskId(candidate);
  const targetId = getTaskId(target);
  if (candidateId && targetId && candidateId === targetId) return true;

  const candidateOrderId = String(candidate.order_id ?? '');
  const targetOrderId = String(target.order_id ?? '');
  if (candidateOrderId && targetOrderId && candidateOrderId === targetOrderId) return true;

  const candidateOrderNo = String(candidate.order_no ?? candidate.orderId ?? '');
  const targetOrderNo = String(target.order_no ?? target.orderId ?? '');
  return Boolean(candidateOrderNo && targetOrderNo && candidateOrderNo === targetOrderNo);
};

export default function KitchenQueuePage({ kitchenTasks, orders, onUpdateKitchenStatus }: KitchenQueuePageProps) {
  const [supabaseTasks, setSupabaseTasks] = useState<KitchenTaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedSupabase, setHasLoadedSupabase] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [completedTodayOpen, setCompletedTodayOpen] = useState(false);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [completedHistoryOpen, setCompletedHistoryOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<CompletedHistoryRange>('This Week');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [expandedTaskKey, setExpandedTaskKey] = useState('');
  const [viewingTask, setViewingTask] = useState<KitchenTaskRecord | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const reloadKitchenTasks = async () => {
    setIsLoading(true);
    try {
      const tasks = await loadKitchenTasksFromSupabase();
      setSupabaseTasks(tasks as KitchenTaskRecord[]);
      setHasLoadedSupabase(true);
    } catch (error) {
      console.error('Kitchen status update error:', error);
      setToast({ message: 'Unable to load kitchen tasks from Supabase.', type: 'error' });
      setSupabaseTasks([]);
      setHasLoadedSupabase(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadKitchenTasks();
  }, []);

  const findLinkedOrder = (task: KitchenTaskRecord) => {
    const orderId = String(task.order_id ?? '');
    const orderNo = String(task.order_no ?? task.orderId ?? '');
    return orders.find((order) =>
      Boolean(orderId && String(order.supabaseId ?? '') === orderId) ||
      Boolean(orderNo && (String(order.id) === orderNo || String(order.orderNo ?? '') === orderNo))
    );
  };

  const allTasks = useMemo(() => {
    const sourceTasks = hasLoadedSupabase
      ? [...supabaseTasks, ...(kitchenTasks as KitchenTaskRecord[])].filter((task, index, tasks) =>
          tasks.findIndex((candidate) => isSameKitchenTask(candidate, task)) === index
        )
      : (kitchenTasks as KitchenTaskRecord[]);

    return sourceTasks
      .slice()
      .sort((first, second) => {
        const firstDate = toTaskDateTime(first, findLinkedOrder(first));
        const secondDate = toTaskDateTime(second, findLinkedOrder(second));

        if (firstDate !== secondDate) {
          if (!Number.isFinite(firstDate)) return 1;
          if (!Number.isFinite(secondDate)) return -1;
          return firstDate - secondDate;
        }

        return statusPriority[getSyncedKitchenStatus(first, findLinkedOrder(first))] - statusPriority[getSyncedKitchenStatus(second, findLinkedOrder(second))];
      });
  }, [hasLoadedSupabase, kitchenTasks, supabaseTasks]);

  const completedTasks = useMemo(() => allTasks.filter((task) => {
    const linkedOrder = findLinkedOrder(task);
    const status = getSyncedKitchenStatus(task, linkedOrder);
    return status === 'Completed' || status === 'Ready';
  }), [allTasks, orders]);

  const todayDate = getMalaysiaDateTimeInputs().date;
  const malaysiaNow = useMemo(() => {
    const inputs = getMalaysiaDateTimeInputs();
    return new Date(`${inputs.date} ${inputs.time}`).getTime();
  }, [allTasks, orders]);

  const activeProductionTasks = useMemo(() => allTasks.filter((task) => {
    const linkedOrder = findLinkedOrder(task);
    return getSyncedKitchenStatus(task, linkedOrder) !== 'Completed'
      && linkedOrder?.deliveryStatus !== 'Delivered'
      && (!linkedOrder || isActiveOrder(linkedOrder))
      && !isCancelledKitchenTask(task, linkedOrder);
  }), [allTasks, orders]);

  const getTaskCompletedDate = (task: KitchenTaskRecord) => {
    const linkedOrder = findLinkedOrder(task);
    const completedTimestamp = getCompletedTimestamp(task);
    return completedTimestamp ? getTimestampDate(completedTimestamp) : getTaskProductionDate(task, linkedOrder);
  };

  const getOverdueDuration = (task: KitchenTaskRecord) => {
    const linkedOrder = findLinkedOrder(task);
    const deadline = toTaskDeadlineDateTime(task, linkedOrder);
    if (!Number.isFinite(deadline) || deadline >= malaysiaNow) return 'Not overdue';

    const totalMinutes = Math.max(Math.floor((malaysiaNow - deadline) / 60000), 1);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h overdue`;
    if (hours > 0) return `${hours}h ${minutes}m overdue`;
    return `${minutes}m overdue`;
  };

  const todayTasks = useMemo(
    () => allTasks.filter((task) => {
      const linkedOrder = findLinkedOrder(task);
      return getTaskProductionDate(task, linkedOrder) === todayDate
        && !isCancelledKitchenTask(task, linkedOrder);
    }),
    [allTasks, orders, todayDate]
  );

  const todayActiveTasks = useMemo(
    () => activeProductionTasks.filter((task) => {
      const linkedOrder = findLinkedOrder(task);
      const status = getSyncedKitchenStatus(task, linkedOrder);
      return getTaskProductionDate(task, linkedOrder) === todayDate
        && (status === 'New' || status === 'Preparing');
    }),
    [activeProductionTasks, orders, todayDate]
  );

  const overdueTasks = useMemo(
    () => activeProductionTasks
      .filter((task) => {
        const linkedOrder = findLinkedOrder(task);
        const status = getSyncedKitchenStatus(task, linkedOrder);
        const productionDate = getTaskProductionDate(task, linkedOrder);
        const deadline = toTaskDeadlineDateTime(task, linkedOrder);

        return productionDate !== '-'
          && productionDate <= todayDate
          && status !== 'Ready'
          && status !== 'Completed'
          && Number.isFinite(deadline)
          && deadline < malaysiaNow;
      })
      .sort((first, second) => toTaskDeadlineDateTime(first, findLinkedOrder(first)) - toTaskDeadlineDateTime(second, findLinkedOrder(second))),
    [activeProductionTasks, orders, todayDate, malaysiaNow]
  );

  const upcomingTasks = useMemo(
    () => activeProductionTasks
      .filter((task) => {
        const productionDate = getTaskProductionDate(task, findLinkedOrder(task));
        const status = getSyncedKitchenStatus(task, findLinkedOrder(task));
        return productionDate !== '-' && productionDate > todayDate && status !== 'Ready';
      })
      .sort((first, second) => {
        const dateTimeDifference = toTaskDateTime(first, findLinkedOrder(first))
          - toTaskDateTime(second, findLinkedOrder(second));

        return dateTimeDifference || getTaskOrderNo(first).localeCompare(getTaskOrderNo(second));
      }),
    [activeProductionTasks, orders, todayDate]
  );

  const kpis = useMemo(() => {
    return {
      todayOrders: todayTasks.length,
      todayItems: todayTasks.reduce((sum, task) => sum + getTaskTotalItems(task, findLinkedOrder(task)), 0),
      preparing: activeProductionTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === 'Preparing').length,
      ready: activeProductionTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === 'Ready').length,
      completed: todayTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === 'Completed').length,
      overdue: overdueTasks.length
    };
  }, [todayTasks, activeProductionTasks, overdueTasks, orders]);

  const priorityQueue = useMemo(() => todayActiveTasks
    .slice()
    .sort((first, second) => {
      const firstDelivery = toTaskDateTime(first, findLinkedOrder(first));
      const secondDelivery = toTaskDateTime(second, findLinkedOrder(second));
      if (firstDelivery !== secondDelivery) {
        if (!Number.isFinite(firstDelivery)) return 1;
        if (!Number.isFinite(secondDelivery)) return -1;
        return firstDelivery - secondDelivery;
      }
      return statusPriority[getSyncedKitchenStatus(first, findLinkedOrder(first))] - statusPriority[getSyncedKitchenStatus(second, findLinkedOrder(second))];
    }), [todayActiveTasks, orders]);

  const productionSummary = useMemo(() => {
    const productMap = new Map<string, { flavours: Map<string, number>; total: number }>();

    todayTasks.forEach((task) => {
      const linkedOrder = findLinkedOrder(task);
      const product = String(task.product ?? linkedOrder?.product ?? 'Bakery Product');
      const summary = productMap.get(product) ?? { flavours: new Map<string, number>(), total: 0 };
      const lines = getKitchenFlavourLines(task, linkedOrder);

      lines.forEach((line) => {
        const quantity = toSafeQuantity(line.qty);
        summary.flavours.set(line.name, (summary.flavours.get(line.name) ?? 0) + quantity);
        summary.total += quantity;
      });
      productMap.set(product, summary);
    });

    return Array.from(productMap.entries()).map(([product, summary]) => ({
      product,
      total: summary.total,
      flavours: Array.from(summary.flavours.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((first, second) => second.quantity - first.quantity || first.name.localeCompare(second.name))
    }));
  }, [todayTasks, orders]);

  const completedToday = useMemo(() => {
    return completedTasks.filter((task) => {
      return getTaskCompletedDate(task) === todayDate;
    });
  }, [completedTasks, orders, todayDate]);

  const completedHistoryTasks = useMemo(() => {
    const dateParts = todayDate.split('-').map(Number);
    const today = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    const monthStart = `${todayDate.slice(0, 7)}-01`;
    const toDateKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const yesterdayKey = toDateKey(yesterday);
    const weekStartKey = toDateKey(weekStart);

    return completedTasks
      .filter((task) => {
        const completedDate = getTaskCompletedDate(task);
        if (!completedDate || completedDate === '-') return false;
        if (historyRange === 'Today') return completedDate === todayDate;
        if (historyRange === 'Yesterday') return completedDate === yesterdayKey;
        if (historyRange === 'This Week') return completedDate >= weekStartKey && completedDate <= todayDate;
        if (historyRange === 'This Month') return completedDate >= monthStart && completedDate <= todayDate;
        return (!historyStartDate || completedDate >= historyStartDate)
          && (!historyEndDate || completedDate <= historyEndDate);
      })
      .sort((first, second) => {
        const firstDate = getTaskCompletedDate(first);
        const secondDate = getTaskCompletedDate(second);
        return secondDate.localeCompare(firstDate)
          || getTaskOrderNo(second).localeCompare(getTaskOrderNo(first));
      });
  }, [completedTasks, orders, todayDate, historyRange, historyStartDate, historyEndDate]);

  const getStatusBadgeClass = (status: string) => {
    if (status === 'Ready') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
    if (status === 'Preparing') return 'bg-sky-500/10 text-sky-200 border-sky-500/20';
    return 'bg-white/5 text-cream border-white/10';
  };

  const applyLocalKitchenStatus = (task: KitchenTaskRecord, newStatus: KitchenStatus) => {
    const updatedAt = new Date().toISOString();
    setSupabaseTasks((currentTasks) => {
      const sourceTasks = hasLoadedSupabase ? currentTasks : (kitchenTasks as KitchenTaskRecord[]);
      return sourceTasks.map((candidate) => (
        isSameKitchenTask(candidate, task)
          ? {
              ...candidate,
              status: newStatus,
              kitchenStatus: newStatus,
              updated_at: updatedAt,
              updatedAt
            }
          : candidate
      ));
    });
    setHasLoadedSupabase(true);
    setViewingTask((currentTask) => (
      currentTask && isSameKitchenTask(currentTask, task)
        ? {
            ...currentTask,
            status: newStatus,
            kitchenStatus: newStatus,
            updated_at: updatedAt,
            updatedAt
          }
        : currentTask
    ));
  };

  const updateKitchenTaskStatus = async (task: KitchenTaskRecord, newStatus: 'Preparing' | 'Ready' | 'Completed') => {
    const taskId = getTaskId(task);
    const orderNo = String(task.order_no ?? task.orderId ?? '');
    const linkedOrder = findLinkedOrder(task);
    const targetStatus = normalizeStatus(newStatus);

    if (!taskId && !linkedOrder && !orderNo) {
      console.error('Kitchen status update blocked: missing kitchen task and order identifiers.', {
        task,
        taskId: task.id ?? null,
        orderId: task.order_id ?? null,
        orderNo: task.order_no ?? task.orderId ?? null,
        targetStatus
      });
      setToast({ message: 'Kitchen task is missing order details. Please refresh and try again.', type: 'error' });
      return;
    }

    setUpdatingTaskId(taskId || orderNo);
    try {
      const taskContext: KitchenTaskUpdateContext = {
        taskId: taskId || null,
        orderId: task.order_id as string | number | null | undefined,
        orderNo: orderNo || null,
        linkedOrderId: linkedOrder?.id || null
      };

      if (linkedOrder) {
        await onUpdateKitchenStatus(linkedOrder.id, newStatus, taskContext);
      } else {
        await syncKitchenStatusForOrder({ ...taskContext, targetStatus });
        await createAutomationLog('Kitchen Status Updated', `Kitchen task for ${orderNo || taskId} updated to ${newStatus}`);
      }

      applyLocalKitchenStatus(task, newStatus);
      await reloadKitchenTasks();
      setToast({ message: `Kitchen task ${orderNo || linkedOrder?.id || taskId} updated to ${newStatus}.`, type: 'success' });
    } catch (error) {
      const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : {};
      console.error('Kitchen Start Preparing flow failed:', {
        task,
        taskId: task.id ?? null,
        orderId: task.order_id ?? null,
        orderNo: task.order_no ?? task.orderId ?? null,
        displayedOrderNo: getTaskOrderNo(task),
        linkedOrderId: linkedOrder?.id ?? null,
        linkedOrderSupabaseId: linkedOrder?.supabaseId ?? null,
        targetStatus,
        supabasePayload: { status: targetStatus },
        message: String(errorRecord.message ?? error ?? 'Unknown error'),
        code: String(errorRecord.code ?? ''),
        details: String(errorRecord.details ?? ''),
        hint: String(errorRecord.hint ?? '')
      });
      const message = error instanceof Error ? error.message : 'Kitchen update failed. Please try again.';
      setToast({ message, type: 'error' });
    } finally {
      setUpdatingTaskId('');
    }
  };

  const renderKitchenAction = (task: KitchenTaskRecord, mode: 'primary' | 'compact' = 'primary') => {
    const status = getSyncedKitchenStatus(task, findLinkedOrder(task));
    const taskId = getTaskId(task);
    const orderNo = getTaskOrderNo(task);
    const updateKey = taskId || orderNo;
    const isUpdating = updatingTaskId === updateKey;
    const baseClass = mode === 'compact'
      ? 'rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45'
      : 'rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45';

    if (status === 'Ready') {
      return (
        <button
          type="button"
          onClick={() => updateKitchenTaskStatus(task, 'Completed')}
          disabled={isUpdating}
          className={`${baseClass} bg-[#C8A96B] text-[#0F172A] hover:bg-[#dec38c]`}
        >
          {isUpdating ? 'Completing...' : 'Complete / Handover'}
        </button>
      );
    }

    if (status === 'Preparing') {
      return (
        <button
          type="button"
          onClick={() => updateKitchenTaskStatus(task, 'Ready')}
          disabled={isUpdating}
          className={`${baseClass} bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`}
        >
          {isUpdating ? 'Updating...' : 'Mark Ready'}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => updateKitchenTaskStatus(task, 'Preparing')}
        disabled={isUpdating}
        className={`${baseClass} bg-sky-500/10 text-sky-200 hover:bg-sky-500/20`}
      >
        {isUpdating ? 'Starting...' : 'Start Preparing'}
      </button>
    );
  };

  return (
    <div className="space-y-4 bg-[#0F172A]">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#C8A96B]">Production Operations</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Kitchen Command Center</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">See what to produce today, then work through the queue in priority order.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reloadKitchenTasks}
              disabled={isLoading}
              className="rounded-xl bg-[#C8A96B] px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#d6b77d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Refreshing...' : 'Refresh Queue'}
            </button>
            <span className="rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E]">
              Source: {hasLoadedSupabase ? 'Supabase' : 'Fallback'}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel md:p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Production Queue</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Work from Priority 1 downward</h4>
          </div>
          <p className="text-xs text-slate-500">Sorted by delivery or collection date and time.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {isLoading && <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-5 text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">Loading production queue...</div>}
          {!isLoading && priorityQueue.length === 0 && <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] p-6 text-center text-sm text-slate-500 lg:col-span-2 2xl:col-span-3">No active kitchen tasks for today.</div>}
          {!isLoading && priorityQueue.map((task, index) => {
            const linkedOrder = findLinkedOrder(task);
            const status = getSyncedKitchenStatus(task, linkedOrder);
            const taskKey = getTaskKey(task, index);
            const orderNo = getTaskOrderNo(task);
            const deliveryDate = getTaskProductionDate(task, linkedOrder);
            const deliveryTime = getTaskProductionTime(task, linkedOrder);
            const kitchenLines = getKitchenFlavourLines(task, linkedOrder);
            const expanded = expandedTaskKey === taskKey;
            const hasHiddenItemRows = kitchenLines.length > MAX_VISIBLE_KITCHEN_ITEM_ROWS;
            const visibleKitchenLines = hasHiddenItemRows && !expanded
              ? kitchenLines.slice(0, MAX_VISIBLE_KITCHEN_ITEM_ROWS)
              : kitchenLines;
            const totalItems = getTaskTotalItems(task, linkedOrder);
            const product = String(task.product ?? linkedOrder?.product ?? 'Bakery Product');
            const isSelfCollect = /self\s*collect|pickup|pick\s*up|collection/i.test(getTaskAddress(task, linkedOrder));

            return (
              <article key={taskKey} className="flex min-h-full flex-col rounded-[18px] border border-[#334155] bg-[#0F172A] p-3.5 text-sm text-slate-300 transition hover:border-[#C8A96B]/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Priority {index + 1}</p>
                  <h4 className="mt-1 truncate text-lg font-semibold text-white">{orderNo}</h4>
                  <p className="mt-1 truncate text-sm text-slate-400">{getTaskCustomerName(task, linkedOrder)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(status)}`}>{status}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 rounded-[14px] border border-[#334155] bg-[#111111] p-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{isSelfCollect ? 'Collection' : 'Delivery'}</p>
                  <p className="mt-1 font-semibold text-white">{deliveryTime}</p>
                  <p className="mt-1 text-xs text-slate-500">{deliveryDate}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Items</p>
                  <p className="mt-1 font-semibold text-white">{product} x{formatKitchenQuantity(totalItems)}</p>
                </div>
              </div>

                <div className="mt-3 space-y-2 border-t border-[#334155] pt-3">
                  {visibleKitchenLines.map((item, itemIndex) => (
                    <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                      <span className="text-sm font-semibold text-white">{item.name}</span>
                      <span className="shrink-0 rounded-full bg-[#C8A96B]/15 px-3 py-1 text-xs font-semibold text-[#E4C98E]">&times; {item.qty}</span>
                    </div>
                  ))}
                  {kitchenLines.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[#334155] px-3 py-4 text-center text-xs text-slate-500">No flavour breakdown available.</p>
                  )}
                  {hasHiddenItemRows && (
                    <button
                      type="button"
                      onClick={() => setExpandedTaskKey((current) => current === taskKey ? '' : taskKey)}
                      className="w-full rounded-xl border border-[#334155] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/40 hover:text-white"
                    >
                      {expanded ? 'Show fewer items' : `View all items (${kitchenLines.length})`}
                    </button>
                  )}
                  <div className="rounded-xl border border-[#334155] bg-[#111111] px-3 py-2 text-xs text-slate-400">
                    Ready time: <span className="font-semibold text-white">{getTaskReadyTime(task)}</span>
                  </div>
                </div>

              <div className="mt-auto flex justify-end border-t border-[#334155] pt-4">
                {renderKitchenAction(task)}
              </div>
            </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Today's Orders", kpis.todayOrders],
          ["Today's Items", kpis.todayItems],
          ['Preparing', kpis.preparing],
          ['Ready', kpis.ready],
          ['Completed', kpis.completed],
          ['Overdue', kpis.overdue]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel transition hover:border-[#C8A96B]/40">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Today Production Summary</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Today&apos;s total product and flavour quantities</h4>
          </div>
          <p className="text-xs text-slate-500">Today only, including completed handovers</p>
        </div>

        {isLoading ? (
          <div className="mt-4 rounded-[16px] border border-[#334155] bg-[#0F172A] p-6 text-sm text-slate-400">
            Loading production summary...
          </div>
        ) : productionSummary.length > 0 ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {productionSummary.map((group) => (
              <div key={group.product} className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-4">
                <div className="flex items-center justify-between gap-3 border-b border-[#334155] pb-3">
                  <h5 className="font-semibold text-white">{group.product} Production</h5>
                  <span className="rounded-full bg-[#C8A96B]/15 px-3 py-1 text-sm font-semibold text-[#E4C98E]">
                    {formatKitchenQuantity(group.total)} pcs
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {group.flavours.map((flavour) => (
                    <div key={flavour.name} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-300">{flavour.name}</span>
                      <span className="text-sm font-semibold text-white">{formatKitchenQuantity(flavour.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#334155] pt-3 text-sm">
                  <span className="font-semibold text-slate-300">Total {group.product}</span>
                  <span className="font-semibold text-[#E4C98E]">{formatKitchenQuantity(group.total)} pcs</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] p-7 text-center text-sm text-slate-500">
            No production scheduled for today.
          </div>
        )}
      </section>

      <section className="rounded-[18px] border border-rose-500/30 bg-[#111111] p-3.5 shadow-panel md:p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-rose-300">Overdue Orders</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Past ready time and still not finished</h4>
          </div>
          <span className="w-fit rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200">
            {overdueTasks.length} overdue
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {overdueTasks.map((task, index) => {
            const linkedOrder = findLinkedOrder(task);
            const status = getSyncedKitchenStatus(task, linkedOrder);
            const taskKey = `overdue-${getTaskKey(task, index)}`;
            const kitchenLines = getKitchenFlavourLines(task, linkedOrder);
            const hasHiddenItemRows = kitchenLines.length > MAX_VISIBLE_KITCHEN_ITEM_ROWS;
            const expanded = expandedTaskKey === taskKey;
            const visibleKitchenLines = hasHiddenItemRows && !expanded
              ? kitchenLines.slice(0, MAX_VISIBLE_KITCHEN_ITEM_ROWS)
              : kitchenLines;
            const totalItems = getTaskTotalItems(task, linkedOrder);
            const product = String(task.product ?? linkedOrder?.product ?? kitchenLines[0]?.name ?? 'Bakery Product');

            return (
              <article key={taskKey} className="flex min-h-full flex-col rounded-[18px] border border-rose-500/30 bg-[#0F172A] p-3.5 text-sm text-slate-300 transition hover:border-rose-400/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">{getTaskOrderNo(task)}</p>
                    <p className="mt-1 truncate text-sm text-slate-400">{getTaskCustomerName(task, linkedOrder)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(status)}`}>{status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-[14px] border border-[#334155] bg-[#111111] p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Date</p>
                    <p className="mt-1 font-semibold text-white">{getTaskProductionDate(task, linkedOrder)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Time</p>
                    <p className="mt-1 font-semibold text-rose-200">{getTaskDeadlineTime(task, linkedOrder)}</p>
                  </div>
                  <div className="col-span-2 border-t border-[#334155] pt-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Overdue</p>
                    <p className="mt-1 font-semibold text-rose-200">{getOverdueDuration(task)}</p>
                    <p className="mt-2 font-semibold text-white">{product} x{formatKitchenQuantity(totalItems)}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2 border-t border-[#334155] pt-3">
                  {visibleKitchenLines.map((item, itemIndex) => (
                    <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                      <span className="text-sm font-semibold text-white">{item.name}</span>
                      <span className="shrink-0 rounded-full bg-[#C8A96B]/15 px-3 py-1 text-xs font-semibold text-[#E4C98E]">&times; {item.qty}</span>
                    </div>
                  ))}
                  {hasHiddenItemRows && (
                    <button
                      type="button"
                      onClick={() => setExpandedTaskKey((current) => current === taskKey ? '' : taskKey)}
                      className="w-full rounded-xl border border-[#334155] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/40 hover:text-white"
                    >
                      {expanded ? 'Show fewer items' : `View all items (${kitchenLines.length})`}
                    </button>
                  )}
                </div>
                <div className="mt-auto flex justify-end border-t border-[#334155] pt-4">
                  <button
                    type="button"
                    onClick={() => updateKitchenTaskStatus(task, 'Ready')}
                    disabled={updatingTaskId === (getTaskId(task) || getTaskOrderNo(task))}
                    className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Mark Ready
                  </button>
                </div>
              </article>
            );
          })}
          {overdueTasks.length === 0 && (
            <div className="rounded-[16px] border border-dashed border-rose-500/25 bg-[#0F172A] p-6 text-center text-sm text-slate-500 lg:col-span-2 2xl:col-span-3">
              No overdue kitchen orders.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#334155] bg-[#111111] shadow-panel">
        <button
          type="button"
          onClick={() => setUpcomingOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            {upcomingOpen ? <ChevronUp size={18} className="text-[#C8A96B]" /> : <ChevronRight size={18} className="text-[#C8A96B]" />}
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Upcoming Orders</p>
              <p className="mt-1 text-sm text-slate-400">Tomorrow and future kitchen work</p>
            </div>
          </div>
          <span className="rounded-full border border-[#334155] bg-[#0F172A] px-3 py-1 text-xs font-semibold text-white">{upcomingTasks.length}</span>
        </button>

        {upcomingOpen && (
          <div className="border-t border-[#334155] p-3.5 md:p-4">
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {upcomingTasks.map((task, index) => {
                const linkedOrder = findLinkedOrder(task);
                const status = getSyncedKitchenStatus(task, linkedOrder);
                const taskKey = `upcoming-${getTaskKey(task, index)}`;
                const expanded = expandedTaskKey === taskKey;
                const kitchenLines = getKitchenFlavourLines(task, linkedOrder);
                const hasHiddenItemRows = kitchenLines.length > MAX_VISIBLE_KITCHEN_ITEM_ROWS;
                const visibleKitchenLines = hasHiddenItemRows && !expanded
                  ? kitchenLines.slice(0, MAX_VISIBLE_KITCHEN_ITEM_ROWS)
                  : kitchenLines;
                const totalItems = getTaskTotalItems(task, linkedOrder);
                const product = String(task.product ?? linkedOrder?.product ?? kitchenLines[0]?.name ?? 'Bakery Product');
                const hiddenItemCount = Math.max(kitchenLines.length - MAX_VISIBLE_KITCHEN_ITEM_ROWS, 0);

                return (
                  <article
                    key={taskKey}
                    className="flex min-h-full flex-col rounded-[18px] border border-[#334155] bg-[#0F172A] p-3.5 text-sm text-slate-300 transition hover:border-[#C8A96B]/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-white">{getTaskOrderNo(task)}</p>
                        <p className="mt-1 truncate text-sm text-slate-400">{getTaskCustomerName(task, linkedOrder)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(status)}`}>
                        {status}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-[14px] border border-[#334155] bg-[#111111] p-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Date</p>
                        <p className="mt-1 font-semibold text-white">{getTaskProductionDate(task, linkedOrder)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Time</p>
                        <p className="mt-1 font-semibold text-[#E4C98E]">{getTaskProductionTime(task, linkedOrder)}</p>
                      </div>
                      <div className="col-span-2 border-t border-[#334155] pt-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Items</p>
                            <p className="mt-1 truncate font-semibold text-white">
                              {product} x{formatKitchenQuantity(totalItems)}
                            </p>
                          </div>
                          {hasHiddenItemRows && !expanded && (
                            <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                              +{hiddenItemCount} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 border-t border-[#334155] pt-3">
                      {visibleKitchenLines.map((item, itemIndex) => (
                        <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                          <span className="text-sm font-semibold text-white">{item.name}</span>
                          <span className="shrink-0 rounded-full bg-[#C8A96B]/15 px-3 py-1 text-xs font-semibold text-[#E4C98E]">&times; {item.qty}</span>
                        </div>
                      ))}
                      {kitchenLines.length === 0 && (
                        <p className="rounded-xl border border-dashed border-[#334155] px-3 py-4 text-center text-xs text-slate-500">
                          No product breakdown available.
                        </p>
                      )}
                      {hasHiddenItemRows && (
                        <button
                          type="button"
                          onClick={() => setExpandedTaskKey((current) => current === taskKey ? '' : taskKey)}
                          className="w-full rounded-xl border border-[#334155] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/40 hover:text-white"
                        >
                          {expanded ? 'Show fewer items' : `View all items (${kitchenLines.length})`}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {upcomingTasks.length === 0 && (
                <p className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] px-5 py-8 text-center text-sm text-slate-500 lg:col-span-2 2xl:col-span-3">
                  No upcoming kitchen orders.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#334155] bg-[#111111] shadow-panel">
        <button
          type="button"
          onClick={() => setCompletedTodayOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            {completedTodayOpen ? <ChevronUp size={18} className="text-[#C8A96B]" /> : <ChevronRight size={18} className="text-[#C8A96B]" />}
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Completed Today</p>
              <p className="mt-1 text-sm text-slate-400">{completedToday.length} handovers completed</p>
            </div>
          </div>
          <span className="rounded-full border border-[#334155] bg-[#0F172A] px-3 py-1 text-xs font-semibold text-white">{completedToday.length}</span>
        </button>

        {completedTodayOpen && (
          <div className="border-t border-[#334155] p-3.5 md:p-4">
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {completedToday.map((task, index) => {
              const linkedOrder = findLinkedOrder(task);
              const completedAt = getCompletedTimestamp(task);
              const status = getSyncedKitchenStatus(task, linkedOrder);
              const kitchenLines = getKitchenFlavourLines(task, linkedOrder);
              return (
                <article key={`today-${getTaskId(task) || getTaskOrderNo(task)}-${index}`} className="rounded-[18px] border border-[#334155] bg-[#0F172A] p-3.5 text-sm text-slate-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-white">{getTaskOrderNo(task)}</p>
                      <p className="mt-1 truncate text-sm text-slate-400">{getTaskCustomerName(task, linkedOrder)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(status)}`}>{status}</span>
                  </div>
                  <div className="mt-3 rounded-[14px] border border-[#334155] bg-[#111111] p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Completed Time</p>
                    <p className="mt-1 font-semibold text-[#E4C98E]">{formatCompletedTime(completedAt)}</p>
                  </div>
                  <div className="mt-3 space-y-2 border-t border-[#334155] pt-3">
                    {kitchenLines.map((item, itemIndex) => (
                      <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                        <span className="text-sm font-semibold text-white">{item.name}</span>
                        <span className="shrink-0 rounded-full bg-[#C8A96B]/15 px-3 py-1 text-xs font-semibold text-[#E4C98E]">&times; {item.qty}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setViewingTask(task)} className="mt-3 w-full rounded-xl border border-[#C8A96B]/30 px-3 py-2 text-xs font-semibold text-[#C8A96B] transition hover:bg-[#C8A96B]/10">
                    View
                  </button>
                </article>
              );
            })}
            {completedToday.length === 0 && <p className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] px-5 py-8 text-center text-sm text-slate-500 lg:col-span-2 2xl:col-span-3">No completed handovers today.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#334155] bg-[#111111] shadow-panel">
        <button
          type="button"
          onClick={() => setCompletedHistoryOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            {completedHistoryOpen ? <ChevronUp size={18} className="text-[#C8A96B]" /> : <ChevronRight size={18} className="text-[#C8A96B]" />}
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Completed History</p>
              <p className="mt-1 text-sm text-slate-400">Kitchen completion records for handover and customer checks</p>
            </div>
          </div>
          <span className="rounded-full border border-[#334155] bg-[#0F172A] px-3 py-1 text-xs font-semibold text-white">{completedHistoryTasks.length}</span>
        </button>

        {completedHistoryOpen && (
          <div className="border-t border-[#334155] p-3.5 md:p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {(['Today', 'Yesterday', 'This Week', 'This Month', 'Custom'] as CompletedHistoryRange[]).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setHistoryRange(range)}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      historyRange === range
                        ? 'border-[#C8A96B]/50 bg-[#C8A96B]/15 text-[#E4C98E]'
                        : 'border-[#334155] bg-[#0F172A] text-slate-400 hover:border-[#C8A96B]/40 hover:text-white'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
              {historyRange === 'Custom' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(event) => setHistoryStartDate(event.target.value)}
                    className="h-10 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/50"
                  />
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(event) => setHistoryEndDate(event.target.value)}
                    className="h-10 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/50"
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {completedHistoryTasks.map((task, index) => {
                const linkedOrder = findLinkedOrder(task);
                const kitchenLines = getKitchenFlavourLines(task, linkedOrder);
                const completedAt = getCompletedTimestamp(task);
                return (
                  <article key={`history-${getTaskId(task) || getTaskOrderNo(task)}-${index}`} className="rounded-[18px] border border-[#334155] bg-[#0F172A] p-3.5 text-sm text-slate-300">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-white">{getTaskOrderNo(task)}</p>
                        <p className="mt-1 truncate text-sm text-slate-400">{getTaskCustomerName(task, linkedOrder)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(getSyncedKitchenStatus(task, linkedOrder))}`}>
                        {getSyncedKitchenStatus(task, linkedOrder)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-[14px] border border-[#334155] bg-[#111111] p-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Date</p>
                        <p className="mt-1 font-semibold text-white">{getTaskCompletedDate(task)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Completed</p>
                        <p className="mt-1 font-semibold text-[#E4C98E]">{formatCompletedTime(completedAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 border-t border-[#334155] pt-3">
                      {kitchenLines.slice(0, MAX_VISIBLE_KITCHEN_ITEM_ROWS).map((item, itemIndex) => (
                        <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                          <span className="text-sm font-semibold text-white">{item.name}</span>
                          <span className="shrink-0 rounded-full bg-[#C8A96B]/15 px-3 py-1 text-xs font-semibold text-[#E4C98E]">&times; {item.qty}</span>
                        </div>
                      ))}
                      {kitchenLines.length > MAX_VISIBLE_KITCHEN_ITEM_ROWS && (
                        <p className="rounded-xl border border-[#334155] px-3 py-2 text-center text-xs text-slate-500">
                          +{kitchenLines.length - MAX_VISIBLE_KITCHEN_ITEM_ROWS} more items
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
              {completedHistoryTasks.length === 0 && (
                <p className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] px-5 py-8 text-center text-sm text-slate-500 lg:col-span-2 2xl:col-span-3">
                  No completed kitchen history for this filter.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[20px] border border-[#334155] bg-[#111111] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Completed Kitchen Order</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{getTaskOrderNo(viewingTask)}</h3>
              </div>
              <button type="button" onClick={() => setViewingTask(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-slate-300"><X size={16} /></button>
            </div>
            <div className="mt-5 space-y-2">
              {getKitchenFlavourLines(viewingTask, findLinkedOrder(viewingTask)).map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
                  <span className="text-sm font-semibold text-white">{item.name}</span>
                  <span className="text-sm font-semibold text-[#C8A96B]">&times; {item.qty}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
              <Clock3 size={15} className="text-[#C8A96B]" />
              Completed {formatCompletedTime(getCompletedTimestamp(viewingTask))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
