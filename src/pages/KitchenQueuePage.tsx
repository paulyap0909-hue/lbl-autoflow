import React, { useEffect, useMemo, useState } from 'react';
import type { KitchenTask, Order } from '../data/mockData';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabase';
import { createAutomationLog } from '../services/automationLogService';
import { loadKitchenTasksFromSupabase } from '../services/kitchenService';

type KitchenQueuePageProps = {
  kitchenTasks: KitchenTask[];
  orders: Order[];
  onUpdateKitchenStatus: (orderId: string, newStatus: 'Preparing' | 'Ready') => void | Promise<void>;
};

type KitchenTaskRecord = Partial<KitchenTask> & Record<string, unknown>;
type KitchenStatus = 'New' | 'Preparing' | 'Ready';
type KitchenTab = 'All' | 'New' | 'Preparing' | 'Ready' | 'Due Soon';

const tabs: KitchenTab[] = ['All', 'New', 'Preparing', 'Ready', 'Due Soon'];
const statusPriority: Record<KitchenStatus, number> = {
  New: 0,
  Preparing: 1,
  Ready: 2
};

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
  if (value === 'Preparing' || value === 'Ready') return value;
  return 'New';
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

export default function KitchenQueuePage({ kitchenTasks, orders, onUpdateKitchenStatus }: KitchenQueuePageProps) {
  const [supabaseTasks, setSupabaseTasks] = useState<KitchenTaskRecord[]>([]);
  const [activeTab, setActiveTab] = useState<KitchenTab>('All');
  const [isLoading, setIsLoading] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const reloadKitchenTasks = async () => {
    setIsLoading(true);
    try {
      const tasks = await loadKitchenTasksFromSupabase();
      setSupabaseTasks(tasks as KitchenTaskRecord[]);
    } catch (error) {
      console.error('Kitchen status update error:', error);
      setToast({ message: 'Unable to load kitchen tasks from Supabase.', type: 'error' });
      setSupabaseTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadKitchenTasks();
  }, []);

  const productionTasks = useMemo(() => {
    const sourceTasks = supabaseTasks.length > 0 ? supabaseTasks : (kitchenTasks as KitchenTaskRecord[]);

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

        return statusPriority[normalizeStatus(first.status ?? first.kitchenStatus)] - statusPriority[normalizeStatus(second.status ?? second.kitchenStatus)];
      });
  }, [kitchenTasks, supabaseTasks]);

  const kpis = useMemo(() => {
    const newOrders = productionTasks.filter((task) => normalizeStatus(task.status ?? task.kitchenStatus) === 'New').length;
    const preparing = productionTasks.filter((task) => normalizeStatus(task.status ?? task.kitchenStatus) === 'Preparing').length;
    const ready = productionTasks.filter((task) => normalizeStatus(task.status ?? task.kitchenStatus) === 'Ready').length;
    const dueSoon = productionTasks.filter((task) => getUrgency(task) === 'Due Soon').length;
    const overdue = productionTasks.filter((task) => getUrgency(task) === 'Overdue').length;

    return { newOrders, preparing, ready, dueSoon, overdue };
  }, [productionTasks]);

  const tabCounts = useMemo(() => ({
    All: productionTasks.length,
    New: kpis.newOrders,
    Preparing: kpis.preparing,
    Ready: kpis.ready,
    'Due Soon': kpis.dueSoon
  }), [kpis, productionTasks.length]);

  const visibleTasks = useMemo(() => {
    if (activeTab === 'All') return productionTasks;
    if (activeTab === 'Due Soon') return productionTasks.filter((task) => getUrgency(task) === 'Due Soon');
    return productionTasks.filter((task) => normalizeStatus(task.status ?? task.kitchenStatus) === activeTab);
  }, [activeTab, productionTasks]);

  const getStatusBadgeClass = (status: string) => {
    if (status === 'Ready') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
    if (status === 'Preparing') return 'bg-sky-500/10 text-sky-200 border-sky-500/20';
    return 'bg-white/5 text-cream border-white/10';
  };

  const getUrgencyBadgeClass = (urgency: string) => {
    if (urgency === 'Overdue') return 'border-rose-500/25 bg-rose-500/10 text-rose-200';
    return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
  };

  const findLinkedOrder = (task: KitchenTaskRecord) => {
    const orderId = String(task.order_id ?? '');
    const orderNo = String(task.order_no ?? task.orderId ?? '');
    return orders.find((order) =>
      Boolean(orderId && order.supabaseId === orderId) ||
      Boolean(orderNo && (order.id === orderNo || order.orderNo === orderNo))
    );
  };

  const updateKitchenTaskStatus = async (task: KitchenTaskRecord, newStatus: 'Preparing' | 'Ready') => {
    const taskId = getTaskId(task);
    const orderNo = String(task.order_no ?? task.orderId ?? '');
    const linkedOrder = findLinkedOrder(task);

    if (!taskId && !linkedOrder && !orderNo) {
      setToast({ message: 'Kitchen task is missing order details. Please refresh and try again.', type: 'error' });
      return;
    }

    setUpdatingTaskId(taskId || orderNo);
    try {
      if (linkedOrder) {
        await onUpdateKitchenStatus(linkedOrder.id, newStatus);
      } else {
        if (taskId) {
          const { error } = await supabase
            .from('kitchen_tasks')
            .update({ status: newStatus })
            .eq('id', taskId);

          if (error) throw error;
        }

        const orderId = String(task.order_id ?? '');
        if (orderId) {
          const { error } = await supabase
            .from('orders')
            .update({ kitchen_status: newStatus })
            .eq('id', orderId);

          if (error) throw error;
        } else if (orderNo) {
          const { error } = await supabase
            .from('orders')
            .update({ kitchen_status: newStatus })
            .eq('order_no', orderNo);

          if (error) throw error;
        }

        await createAutomationLog('Kitchen Status Updated', `Kitchen task for ${orderNo || taskId} updated to ${newStatus}`);
      }

      await reloadKitchenTasks();
      setToast({ message: `Kitchen task ${orderNo || linkedOrder?.id || taskId} updated to ${newStatus}.`, type: 'success' });
    } catch (error) {
      console.error('Kitchen status update error:', error);
      const message = error instanceof Error ? error.message : 'Kitchen update failed. Please try again.';
      setToast({ message, type: 'error' });
    } finally {
      setUpdatingTaskId('');
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">Smart Production Board</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Kitchen Preparation Queue</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">Prioritize new bakes, due-soon orders, and ready handoffs without horizontal scrolling.</p>
          </div>
          <button
            type="button"
            onClick={reloadKitchenTasks}
            disabled={isLoading}
            className="rounded-3xl border border-gold/20 bg-gold/10 px-5 py-3 text-sm font-semibold text-softGold transition hover:border-gold/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Queue'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['New Orders', kpis.newOrders],
          ['Preparing', kpis.preparing],
          ['Ready', kpis.ready],
          ['Due Soon', kpis.dueSoon],
          ['Overdue', kpis.overdue]
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-gold/15 bg-[#141414] p-5 shadow-panel transition hover:border-gold/35">
            <p className="text-xs uppercase tracking-[0.22em] text-softGold">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
              activeTab === tab
                ? 'border-gold/50 bg-gold text-charcoal'
                : 'border-white/10 bg-[#141414] text-slate-300 hover:border-gold/30 hover:text-white'
            }`}
          >
            {tab} <span className={activeTab === tab ? 'text-charcoal/70' : 'text-softGold'}>{tabCounts[tab]}</span>
          </button>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {isLoading && (
          <div className="rounded-3xl border border-white/10 bg-[#141414] p-8 text-center text-sm text-slate-400 md:col-span-2 2xl:col-span-3">
            Loading kitchen tasks...
          </div>
        )}

        {!isLoading && visibleTasks.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-[#141414] p-8 text-center text-sm text-slate-400 md:col-span-2 2xl:col-span-3">
            No kitchen tasks in this view.
          </div>
        )}

        {!isLoading && visibleTasks.map((task, index) => {
          const taskId = getTaskId(task);
          const orderNo = getTaskOrderNo(task);
          const deliveryDate = String(task.delivery_date ?? task.deliveryDate ?? '-');
          const deliveryTime = String(task.delivery_time ?? task.deliveryTime ?? '-');
          const readyTime = String(task.ready_time ?? task.requiredReadyTime ?? '-');
          const status = normalizeStatus(task.status ?? task.kitchenStatus);
          const urgency = getUrgency(task);
          const updateKey = taskId || orderNo;
          const isUpdating = updatingTaskId === updateKey;
          const linkedOrder = findLinkedOrder(task);

          return (
            <article
              key={`${taskId || orderNo}-${index}`}
              className="flex min-h-full flex-col rounded-3xl border border-white/10 bg-[#141414] p-5 text-sm text-slate-300 shadow-panel transition hover:border-gold/30"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-softGold">Order No</p>
                  <h4 className="mt-2 truncate text-xl font-semibold text-white">{orderNo}</h4>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                  {status}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {urgency && (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getUrgencyBadgeClass(urgency)}`}>
                    {urgency}
                  </span>
                )}
              </div>

              <div className="py-4">
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Kitchen Items</p>
                  <div className="mt-3 space-y-2">
                    {getKitchenFlavourLines(task, linkedOrder).map((item, itemIndex) => (
                      <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                        <span className="text-sm font-semibold text-white">{item.name}</span>
                        <span className="rounded-full bg-gold/15 px-3 py-1 text-sm font-semibold text-softGold">
                          &times; {item.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-3xl border border-white/10 bg-[#0f0f0f] p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Date</p>
                  <p className="mt-2 font-semibold text-white">{deliveryDate}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Delivery</p>
                  <p className="mt-2 font-semibold text-white">{deliveryTime}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Ready</p>
                  <p className="mt-2 font-semibold text-softGold">{readyTime}</p>
                </div>
              </div>

              <div className="mt-auto grid grid-cols-1 gap-2 border-t border-white/10 pt-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => updateKitchenTaskStatus(task, 'Preparing')}
                  disabled={isUpdating || status !== 'New'}
                  className="rounded-2xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Start Preparing
                </button>
                <button
                  type="button"
                  onClick={() => updateKitchenTaskStatus(task, 'Ready')}
                  disabled={isUpdating || status === 'Ready'}
                  className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Mark as Ready
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
