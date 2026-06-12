import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Clock3, History, Search, X } from 'lucide-react';
import type { KitchenTask, Order } from '../data/mockData';
import Toast from '../components/Toast';
import { createAutomationLog } from '../services/automationLogService';
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
type KitchenTab = 'All Active' | 'New' | 'Preparing' | 'Ready' | 'Due Soon' | 'Overdue';

const tabs: KitchenTab[] = ['All Active', 'New', 'Preparing', 'Ready', 'Due Soon', 'Overdue'];
const statusPriority: Record<KitchenStatus, number> = {
  New: 0,
  Preparing: 1,
  Ready: 2,
  Completed: 3
};
const HISTORY_PAGE_SIZE = 20;

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

const toTaskDateTime = (task: KitchenTaskRecord) => {
  const deliveryDate = String(task.delivery_date ?? task.deliveryDate ?? '');
  const deliveryTime = String(task.delivery_time ?? task.deliveryTime ?? '');
  if (!deliveryDate || !deliveryTime) return Number.POSITIVE_INFINITY;

  const parsed = new Date(`${deliveryDate} ${deliveryTime}`).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const getUrgency = (task: KitchenTaskRecord) => {
  const status = normalizeStatus(task.status ?? task.kitchenStatus);
  if (status === 'Ready') return null;

  const deliveryAt = toTaskDateTime(task);
  if (!Number.isFinite(deliveryAt)) return null;

  const diffMs = deliveryAt - Date.now();
  if (diffMs < 0) return 'Overdue';
  if (diffMs <= 2 * 60 * 60 * 1000) return 'Due Soon';
  return null;
};

const getTaskOrderNo = (task: KitchenTaskRecord) => String(task.order_no ?? task.orderId ?? task.order_id ?? '-');
const getTaskId = (task: KitchenTaskRecord) => String(task.id ?? '');
const getCompletedTimestamp = (task: KitchenTaskRecord) =>
  String(task.completed_at ?? task.completedAt ?? task.updated_at ?? task.updatedAt ?? '');
const getTimestampDate = (value: string) => value ? value.slice(0, 10) : '';
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
const getTaskDeliveryDate = (task: KitchenTaskRecord) => String(task.delivery_date ?? task.deliveryDate ?? '-');
const getTaskDeliveryTime = (task: KitchenTaskRecord) => String(task.delivery_time ?? task.deliveryTime ?? '-');
const getTaskCustomerName = (task: KitchenTaskRecord, order?: Order) =>
  String(task.customer_name ?? task.customerName ?? order?.customerName ?? 'Customer unavailable');
const getTaskPhone = (task: KitchenTaskRecord, order?: Order) =>
  String(task.phone ?? order?.phone ?? '-');
const getTaskAddress = (task: KitchenTaskRecord, order?: Order) =>
  String(task.address ?? order?.address ?? 'Pickup / address unavailable');
const getTaskNotes = (task: KitchenTaskRecord, order?: Order) =>
  String(task.notes ?? task.remark ?? order?.remark ?? '');
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
  const [activeTab, setActiveTab] = useState<KitchenTab>('All Active');
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedSupabase, setHasLoadedSupabase] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [completedTodayOpen, setCompletedTodayOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const [historyCustomer, setHistoryCustomer] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
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
    const sourceTasks = hasLoadedSupabase ? supabaseTasks : (kitchenTasks as KitchenTaskRecord[]);

    return sourceTasks
      .slice()
      .sort((first, second) => {
        const firstDate = toTaskDateTime(first);
        const secondDate = toTaskDateTime(second);

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
    return getSyncedKitchenStatus(task, linkedOrder) === 'Completed' || linkedOrder?.deliveryStatus === 'Delivered';
  }), [allTasks, orders]);

  const productionTasks = useMemo(() => allTasks.filter((task) => {
    const linkedOrder = findLinkedOrder(task);
    return getSyncedKitchenStatus(task, linkedOrder) !== 'Completed' && linkedOrder?.deliveryStatus !== 'Delivered';
  }), [allTasks, orders]);

  const kpis = useMemo(() => {
    const newOrders = productionTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === 'New').length;
    const preparing = productionTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === 'Preparing').length;
    const ready = productionTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === 'Ready').length;
    const dueSoon = productionTasks.filter((task) => getUrgency(task) === 'Due Soon').length;
    const overdue = productionTasks.filter((task) => getUrgency(task) === 'Overdue').length;

    return { activeTasks: productionTasks.length, newOrders, preparing, ready, dueSoon, overdue };
  }, [productionTasks]);

  const tabCounts = useMemo(() => ({
    'All Active': productionTasks.length,
    New: kpis.newOrders,
    Preparing: kpis.preparing,
    Ready: kpis.ready,
    'Due Soon': kpis.dueSoon,
    Overdue: kpis.overdue
  }), [kpis, productionTasks.length]);

  const visibleTasks = useMemo(() => {
    if (activeTab === 'All Active') return productionTasks;
    if (activeTab === 'Due Soon') return productionTasks.filter((task) => getUrgency(task) === 'Due Soon');
    if (activeTab === 'Overdue') return productionTasks.filter((task) => getUrgency(task) === 'Overdue');
    return productionTasks.filter((task) => getSyncedKitchenStatus(task, findLinkedOrder(task)) === activeTab);
  }, [activeTab, productionTasks]);

  const priorityQueue = useMemo(() => productionTasks
    .slice()
    .sort((first, second) => {
      const firstUrgency = getUrgency(first);
      const secondUrgency = getUrgency(second);
      const urgencyRank = (urgency: string | null) => urgency === 'Overdue' ? 0 : urgency === 'Due Soon' ? 1 : 2;
      const firstReady = toTaskDateTime({ ...first, delivery_time: getTaskReadyTime(first) });
      const secondReady = toTaskDateTime({ ...second, delivery_time: getTaskReadyTime(second) });

      if (urgencyRank(firstUrgency) !== urgencyRank(secondUrgency)) {
        return urgencyRank(firstUrgency) - urgencyRank(secondUrgency);
      }
      if (firstReady !== secondReady) {
        if (!Number.isFinite(firstReady)) return 1;
        if (!Number.isFinite(secondReady)) return -1;
        return firstReady - secondReady;
      }
      return statusPriority[getSyncedKitchenStatus(first, findLinkedOrder(first))] - statusPriority[getSyncedKitchenStatus(second, findLinkedOrder(second))];
    })
    .slice(0, 6), [productionTasks]);

  const completedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return completedTasks.filter((task) => getTimestampDate(getCompletedTimestamp(task)) === today);
  }, [completedTasks]);

  const filteredHistory = useMemo(() => {
    const orderQuery = historySearch.trim().toLowerCase();
    const customerQuery = historyCustomer.trim().toLowerCase();
    return completedTasks.filter((task) => {
      const linkedOrder = findLinkedOrder(task);
      const orderNo = getTaskOrderNo(task).toLowerCase();
      const completedDate = getTimestampDate(getCompletedTimestamp(task));
      return (!orderQuery || orderNo.includes(orderQuery))
        && (!historyDate || completedDate === historyDate)
        && (!customerQuery || (linkedOrder?.customerName || '').toLowerCase().includes(customerQuery));
    });
  }, [completedTasks, historyCustomer, historyDate, historySearch, orders]);

  const historyPageCount = Math.max(Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE), 1);
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historyDate, historyCustomer]);

  const getStatusBadgeClass = (status: string) => {
    if (status === 'Ready') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
    if (status === 'Preparing') return 'bg-sky-500/10 text-sky-200 border-sky-500/20';
    return 'bg-white/5 text-cream border-white/10';
  };

const getUrgencyBadgeClass = (urgency: string) => {
  if (urgency === 'Overdue') return 'border-rose-500/25 bg-rose-500/10 text-rose-200';
  return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
};

const getLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDeliveryPriorityBadges = (task: KitchenTaskRecord) => {
  const deliveryDate = String(task.delivery_date ?? task.deliveryDate ?? '');
  const deliveryAt = toTaskDateTime(task);
  const now = new Date();
  const today = getLocalDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = getLocalDateKey(tomorrowDate);
  const badges: Array<'URGENT' | 'TODAY' | 'TOMORROW'> = [];

  if (Number.isFinite(deliveryAt) && deliveryAt - now.getTime() <= 2 * 60 * 60 * 1000) {
    badges.push('URGENT');
  }
  if (deliveryDate === today) badges.push('TODAY');
  if (deliveryDate === tomorrow) badges.push('TOMORROW');

  return badges;
};

const getPriorityBadgeClass = (badge: string) => {
  if (badge === 'URGENT') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (badge === 'TODAY') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
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
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Prioritize bakes, production timing and ready handoffs.</p>
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {([
          ['New Orders', kpis.newOrders, 'Start production on fresh paid orders.'],
          ['Preparing', kpis.preparing, 'Keep active bakes moving.'],
          ['Ready', kpis.ready, 'Handover or move to delivery.'],
          ['Due Soon', kpis.dueSoon, 'Check timing within 2 hours.'],
          ['Overdue', kpis.overdue, 'Needs immediate attention.']
        ] as const).map(([label, value, hint]) => (
          <button
            key={label}
            type="button"
            onClick={() => setActiveTab(label === 'New Orders' ? 'New' : label)}
            className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 text-left shadow-panel transition hover:border-[#C8A96B]/40"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
              <span className="rounded-full bg-[#C8A96B]/15 px-3 py-1 text-sm font-semibold text-[#E4C98E]">{value}</span>
            </div>
            <p className="mt-3 text-sm leading-5 text-slate-400">{hint}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Active Kitchen Tasks', kpis.activeTasks],
          ['New Orders', kpis.newOrders],
          ['Preparing', kpis.preparing],
          ['Ready', kpis.ready],
          ['Due Soon', kpis.dueSoon],
          ['Overdue', kpis.overdue]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel transition hover:border-[#C8A96B]/40">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel md:p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Priority Production Queue</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Next kitchen actions</h4>
          </div>
          <p className="text-xs text-slate-500">Sorted by urgency, ready time and production status.</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {isLoading && <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-5 text-sm text-slate-400 xl:col-span-2">Loading priority queue...</div>}
          {!isLoading && priorityQueue.length === 0 && <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] p-6 text-center text-sm text-slate-500 xl:col-span-2">No active kitchen tasks need attention.</div>}
          {!isLoading && priorityQueue.map((task, index) => {
            const linkedOrder = findLinkedOrder(task);
            const status = getSyncedKitchenStatus(task, linkedOrder);
            const urgency = getUrgency(task);
            const priorityBadges = getDeliveryPriorityBadges(task);
            return (
              <div key={`priority-${getTaskKey(task, index)}`} className="grid gap-3 rounded-[16px] border border-[#334155] bg-[#0F172A] p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{getTaskOrderNo(task)}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(status)}`}>{status}</span>
                    {urgency && <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getUrgencyBadgeClass(urgency)}`}>{urgency}</span>}
                    {priorityBadges.map((badge) => (
                      <span key={badge} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPriorityBadgeClass(badge)}`}>{badge}</span>
                    ))}
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-400">{getTaskCustomerName(task, linkedOrder)}</p>
                  <p className="mt-1 text-xs text-slate-500">Ready {getTaskReadyTime(task)} - Delivery {getTaskDeliveryTime(task)}</p>
                </div>
                <div className="flex md:justify-end">{renderKitchenAction(task, 'compact')}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-[16px] border p-3 text-left text-xs font-semibold transition ${
              activeTab === tab
                ? 'border-[#C8A96B]/70 bg-[#C8A96B]/10 text-[#E4C98E]'
                : 'border-[#334155] bg-[#111111] text-slate-300 hover:border-[#C8A96B]/40 hover:text-white'
            }`}
          >
            <span className="block uppercase tracking-[0.14em]">{tab}</span>
            <span className="mt-2 block text-lg text-white">{tabCounts[tab]}</span>
          </button>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {isLoading && (
          <div className="rounded-[18px] border border-white/10 bg-[#141414] p-6 text-center text-sm text-slate-400 md:col-span-2 2xl:col-span-3">
            Loading kitchen tasks...
          </div>
        )}

        {!isLoading && visibleTasks.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-[#334155] bg-[#111111] p-7 text-center md:col-span-2 2xl:col-span-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Production Queue</p>
            <h4 className="mt-3 text-xl font-semibold text-white">No kitchen tasks in this view</h4>
            <p className="mt-2 text-sm text-slate-500">Switch pipeline filters or refresh the queue when new orders arrive.</p>
          </div>
        )}

        {!isLoading && visibleTasks.map((task, index) => {
          const taskKey = getTaskKey(task, index);
          const orderNo = getTaskOrderNo(task);
          const deliveryDate = getTaskDeliveryDate(task);
          const deliveryTime = getTaskDeliveryTime(task);
          const readyTime = getTaskReadyTime(task);
          const linkedOrder = findLinkedOrder(task);
          const status = getSyncedKitchenStatus(task, linkedOrder);
          const urgency = getUrgency(task);
          const kitchenLines = getKitchenFlavourLines(task, linkedOrder);
          const expanded = expandedTaskKey === taskKey;
          const totalItems = getTaskTotalItems(task, linkedOrder);
          const notes = getTaskNotes(task, linkedOrder);
          const priorityBadges = getDeliveryPriorityBadges(task);

          return (
            <article
              key={taskKey}
              className="flex min-h-full flex-col rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 text-sm text-slate-300 shadow-panel transition hover:border-[#C8A96B]/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#C8A96B]">Order No</p>
                  <h4 className="mt-1 truncate text-lg font-semibold text-white">{orderNo}</h4>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                    {status}
                  </span>
                  {urgency && (
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getUrgencyBadgeClass(urgency)}`}>
                      {urgency}
                    </span>
                  )}
                  {priorityBadges.map((badge) => (
                    <span key={badge} className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityBadgeClass(badge)}`}>
                      {badge}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-[14px] border border-[#334155] bg-[#0F172A] p-2.5 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Date</p>
                  <p className="mt-1 truncate font-semibold text-white">{deliveryDate}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Ready</p>
                  <p className="mt-1 truncate font-semibold text-[#E4C98E]">{readyTime}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Delivery</p>
                  <p className="mt-1 truncate font-semibold text-white">{deliveryTime}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Items</p>
                  <p className="mt-1 truncate font-semibold text-white">{totalItems}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {kitchenLines.map((item, itemIndex) => (
                  <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                    <span className="truncate text-sm font-semibold text-white">{item.name}</span>
                    <span className="shrink-0 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-softGold">&times; {item.qty}</span>
                  </div>
                ))}
              </div>

              {expanded && (
                <div className="mt-3 space-y-3 border-t border-[#334155] pt-3">
                  <div className="grid gap-3 rounded-[16px] border border-[#334155] bg-[#0F172A] p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Customer</p>
                      <p className="mt-2 font-semibold text-white">{getTaskCustomerName(task, linkedOrder)}</p>
                      <p className="mt-1 text-xs text-slate-400">{getTaskPhone(task, linkedOrder)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Address / Pickup</p>
                      <p className="mt-2 text-sm leading-5 text-slate-300">{getTaskAddress(task, linkedOrder)}</p>
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Notes</p>
                    <p className="mt-2 text-sm text-slate-300">{notes || 'No kitchen notes.'}</p>
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-3 border-t border-[#334155] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setExpandedTaskKey((current) => current === taskKey ? '' : taskKey)}
                  className="rounded-xl border border-[#334155] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/40 hover:text-white"
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
                <div className="flex sm:justify-end">{renderKitchenAction(task)}</div>
              </div>
            </article>
          );
        })}
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
          <div className="border-t border-[#334155]">
            <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-slate-500 md:grid">
              <span>Order No</span>
              <span>Delivery Time</span>
              <span>Total Items</span>
              <span>Completed Time</span>
              <span>Action</span>
            </div>
            {completedToday.map((task, index) => {
              const linkedOrder = findLinkedOrder(task);
              const completedAt = getCompletedTimestamp(task);
              return (
                <div key={`today-${getTaskId(task) || getTaskOrderNo(task)}-${index}`} className="grid gap-3 border-t border-[#334155] px-5 py-4 text-sm md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:items-center">
                  <span className="font-semibold text-white">{getTaskOrderNo(task)}</span>
                  <span className="text-slate-300">{String(task.delivery_time ?? task.deliveryTime ?? '-')}</span>
                  <span className="text-slate-300">{getTaskTotalItems(task, linkedOrder)}</span>
                  <span className="text-slate-300">{formatCompletedTime(completedAt)}</span>
                  <button type="button" onClick={() => setViewingTask(task)} className="rounded-xl border border-[#C8A96B]/30 px-3 py-2 text-xs font-semibold text-[#C8A96B] transition hover:bg-[#C8A96B]/10">
                    View
                  </button>
                </div>
              );
            })}
            {completedToday.length === 0 && <p className="border-t border-[#334155] px-5 py-8 text-center text-sm text-slate-500">No completed handovers today.</p>}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#334155] bg-[#111111] shadow-panel">
        <button
          type="button"
          onClick={() => setHistoryOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            <History size={18} className="text-[#C8A96B]" />
            <div>
              <p className="text-sm font-semibold text-white">View History</p>
              <p className="mt-1 text-xs text-slate-500">Search archived kitchen handovers</p>
            </div>
          </div>
          {historyOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
        </button>

        {historyOpen && (
          <div className="border-t border-[#334155] p-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="relative">
                <Search size={15} className="absolute left-3 top-3.5 text-slate-500" />
                <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search order no" className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#C8A96B]/50" />
              </label>
              <input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none focus:border-[#C8A96B]/50" />
              <input value={historyCustomer} onChange={(event) => setHistoryCustomer(event.target.value)} placeholder="Customer name" className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#C8A96B]/50" />
            </div>

            <div className="mt-4 space-y-2">
              {paginatedHistory.map((task, index) => {
                const linkedOrder = findLinkedOrder(task);
                const completedAt = getCompletedTimestamp(task);
                return (
                  <div key={`history-${getTaskId(task) || getTaskOrderNo(task)}-${index}`} className="grid gap-2 rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:items-center">
                    <div>
                      <p className="font-semibold text-white">{getTaskOrderNo(task)}</p>
                      <p className="mt-1 text-xs text-slate-500">{linkedOrder?.customerName || 'Customer unavailable'}</p>
                    </div>
                    <span className="text-slate-300">{String(task.delivery_date ?? task.deliveryDate ?? '-')}</span>
                    <span className="text-slate-300">{String(task.delivery_time ?? task.deliveryTime ?? '-')}</span>
                    <span className="text-slate-300">{formatCompletedTime(completedAt)}</span>
                    <button type="button" onClick={() => setViewingTask(task)} className="rounded-lg border border-[#C8A96B]/30 px-3 py-2 text-xs font-semibold text-[#C8A96B]">View</button>
                  </div>
                );
              })}
              {paginatedHistory.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No completed orders match these filters.</p>}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">Page {historyPage} of {historyPageCount} - {filteredHistory.length} records</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setHistoryPage((page) => Math.max(page - 1, 1))} disabled={historyPage === 1} className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Previous</button>
                <button type="button" onClick={() => setHistoryPage((page) => Math.min(page + 1, historyPageCount))} disabled={historyPage >= historyPageCount} className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Next</button>
              </div>
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
