import React, { useEffect, useMemo, useState } from 'react';
import type { DeliveryTask, Order } from '../data/mockData';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabase';
import { createAutomationLog } from '../services/automationLogService';
import { loadDeliveryTasksFromSupabase } from '../services/deliveryService';

type DeliveryPageProps = {
  deliveryTasks: DeliveryTask[];
  orders: Order[];
  onUpdateDeliveryStatus: (orderId: string, newStatus: 'Assigned' | 'Out for Delivery' | 'Delivered', driverName?: string) => void | Promise<void>;
};

type DeliveryStatus = 'Pending' | 'Assigned' | 'Out for Delivery' | 'Delivered';
type DeliveryActionStatus = Exclude<DeliveryStatus, 'Pending'>;
type DeliveryTab = 'All' | DeliveryStatus;
type DeliveryTaskRecord = Partial<DeliveryTask> & Record<string, unknown>;

const drivers = ['Ibrahim', 'Siti', 'Ali', 'Fatima', 'Rajesh'];
const tabs: DeliveryTab[] = ['All', 'Pending', 'Assigned', 'Out for Delivery', 'Delivered'];
const statusPriority: Record<DeliveryStatus, number> = {
  Pending: 0,
  Assigned: 1,
  'Out for Delivery': 2,
  Delivered: 3
};

const readText = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};

const normalizeDeliveryStatus = (value: unknown): DeliveryStatus => {
  if (value === 'Assigned' || value === 'Out for Delivery' || value === 'Delivered') return value;
  return 'Pending';
};

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getTaskDateTime = (task: DeliveryTaskRecord) => {
  const deliveryDate = readText(task.delivery_date ?? task.deliveryDate, '');
  const deliveryTime = readText(task.delivery_time ?? task.deliveryTime, '');
  if (!deliveryDate || !deliveryTime) return Number.POSITIVE_INFINITY;

  const parsed = new Date(`${deliveryDate} ${deliveryTime}`).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const getTaskOrderNo = (task: DeliveryTaskRecord) => readText(task.order_no ?? task.orderId ?? task.order_id, '-');
const getTaskId = (task: DeliveryTaskRecord) => readText(task.id, '');

const getUrgencyBadges = (task: DeliveryTaskRecord, today: string) => {
  const status = normalizeDeliveryStatus(task.status ?? task.deliveryStatus);
  const deliveryDate = readText(task.delivery_date ?? task.deliveryDate, '');
  const deliveryAt = getTaskDateTime(task);
  const badges: string[] = [];

  if (deliveryDate === today) badges.push('Today');
  if (status !== 'Delivered' && Number.isFinite(deliveryAt)) {
    const diffMs = deliveryAt - Date.now();
    if (diffMs < 0) badges.push('Overdue');
    else if (diffMs <= 2 * 60 * 60 * 1000) badges.push('Due Soon');
  }

  return badges;
};

export default function DeliveryPage({ deliveryTasks, orders, onUpdateDeliveryStatus }: DeliveryPageProps) {
  const [supabaseTasks, setSupabaseTasks] = useState<DeliveryTaskRecord[]>([]);
  const [activeTab, setActiveTab] = useState<DeliveryTab>('All');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState('');

  const reloadDeliveryTasks = async () => {
    setIsLoading(true);
    try {
      const tasks = await loadDeliveryTasksFromSupabase();
      setSupabaseTasks(tasks as DeliveryTaskRecord[]);
    } catch (error) {
      console.error('Delivery tasks error:', error);
      setToast({ message: 'Unable to load delivery tasks from Supabase.', type: 'error' });
      setSupabaseTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadDeliveryTasks();
  }, []);

  const today = useMemo(() => todayKey(), []);

  const displayedTasks = useMemo(() => {
    const sourceTasks = supabaseTasks.length > 0 ? supabaseTasks : (deliveryTasks as DeliveryTaskRecord[]);

    return sourceTasks
      .slice()
      .sort((first, second) => {
        const firstDate = getTaskDateTime(first);
        const secondDate = getTaskDateTime(second);

        if (firstDate !== secondDate) {
          if (!Number.isFinite(firstDate)) return 1;
          if (!Number.isFinite(secondDate)) return -1;
          return firstDate - secondDate;
        }

        return statusPriority[normalizeDeliveryStatus(first.status ?? first.deliveryStatus)] - statusPriority[normalizeDeliveryStatus(second.status ?? second.deliveryStatus)];
      });
  }, [deliveryTasks, supabaseTasks]);

  const kpis = useMemo(() => ({
    total: displayedTasks.length,
    pending: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Pending').length,
    assigned: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Assigned').length,
    outForDelivery: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Out for Delivery').length,
    delivered: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Delivered').length,
    todayDeliveries: displayedTasks.filter((task) => readText(task.delivery_date ?? task.deliveryDate, '') === today).length
  }), [displayedTasks, today]);

  const tabCounts = useMemo(() => ({
    All: displayedTasks.length,
    Pending: kpis.pending,
    Assigned: kpis.assigned,
    'Out for Delivery': kpis.outForDelivery,
    Delivered: kpis.delivered
  }), [displayedTasks.length, kpis]);

  const visibleTasks = useMemo(() => {
    if (activeTab === 'All') return displayedTasks;
    return displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === activeTab);
  }, [activeTab, displayedTasks]);

  const getStatusBadgeClass = (status: string) => {
    if (status === 'Delivered') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
    if (status === 'Out for Delivery') return 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200';
    if (status === 'Assigned') return 'border-sky-500/20 bg-sky-500/10 text-sky-200';
    return 'border-white/10 bg-white/5 text-cream';
  };

  const getUrgencyBadgeClass = (badge: string) => {
    if (badge === 'Overdue') return 'border-rose-500/25 bg-rose-500/10 text-rose-200';
    if (badge === 'Due Soon') return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
    return 'border-gold/30 bg-gold/10 text-softGold';
  };

  const findLinkedOrder = (task: DeliveryTaskRecord) => {
    const orderId = readText(task.order_id, '');
    const orderNo = readText(task.order_no ?? task.orderId, '');

    return orders.find((order) =>
      Boolean(orderId && order.supabaseId === orderId) ||
      Boolean(orderNo && (order.id === orderNo || order.orderNo === orderNo))
    );
  };

  const updateFallbackDeliveryTask = async (task: DeliveryTaskRecord, status: DeliveryActionStatus, driverName?: string) => {
    const taskId = getTaskId(task);
    const orderId = readText(task.order_id, '');
    const orderNo = readText(task.order_no ?? task.orderId, '');
    const patch: Record<string, string> = { status };

    if (driverName !== undefined) patch.driver_name = driverName;

    if (taskId) {
      const { error } = await supabase
        .from('delivery_tasks')
        .update(patch)
        .eq('id', taskId);

      if (error) throw error;
    } else if (orderId || orderNo) {
      const { error } = await supabase
        .from('delivery_tasks')
        .update(patch)
        .eq(orderId ? 'order_id' : 'order_no', orderId || orderNo);

      if (error) throw error;
    }

    if (orderId || orderNo) {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_status: status })
        .eq(orderId ? 'id' : 'order_no', orderId || orderNo);

      if (error) throw error;
    }

    await createAutomationLog('Delivery Status Updated', `${orderNo || taskId} delivery status changed to ${status}`);
  };

  const updateDeliveryTaskStatus = async (task: DeliveryTaskRecord, status: DeliveryActionStatus, driverName?: string) => {
    const taskKey = getTaskId(task) || getTaskOrderNo(task);
    const linkedOrder = findLinkedOrder(task);

    if (!taskKey) {
      setToast({ message: 'Delivery task is missing order details. Please refresh and try again.', type: 'error' });
      return;
    }

    if (status === 'Assigned' && !driverName) {
      setToast({ message: 'Please select a driver.', type: 'error' });
      return;
    }

    setUpdatingTaskId(taskKey);
    try {
      if (linkedOrder) {
        await onUpdateDeliveryStatus(linkedOrder.id, status, driverName);
      } else {
        await updateFallbackDeliveryTask(task, status, driverName);
      }

      await reloadDeliveryTasks();
      if (status === 'Assigned') setSelectedDriver((prev) => ({ ...prev, [taskKey]: '' }));
      setToast({ message: `Delivery task ${getTaskOrderNo(task)} updated to ${status}.`, type: 'success' });
    } catch (error) {
      console.error('Delivery update error:', error);
      const message = error instanceof Error ? error.message : 'Delivery update failed. Please try again.';
      setToast({ message, type: 'error' });
    } finally {
      setUpdatingTaskId('');
    }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ message: `${label} copied.`, type: 'success' });
    } catch {
      setToast({ message: `Unable to copy ${label.toLowerCase()}.`, type: 'error' });
    }
  };

  const openWhatsApp = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      setToast({ message: 'Phone number is unavailable.', type: 'error' });
      return;
    }
    window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
  };

  const openMaps = (address: string) => {
    if (!address || address === '-') {
      setToast({ message: 'Address is unavailable.', type: 'error' });
      return;
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">Delivery Operations</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Delivery Board</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">Assign drivers, track delivery status, and open customer contact tools from one scan-friendly board.</p>
          </div>
          <button
            type="button"
            onClick={reloadDeliveryTasks}
            disabled={isLoading}
            className="rounded-3xl border border-gold/20 bg-gold/10 px-5 py-3 text-sm font-semibold text-softGold transition hover:border-gold/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Deliveries'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Total Deliveries', kpis.total],
          ['Pending', kpis.pending],
          ['Assigned', kpis.assigned],
          ['Out for Delivery', kpis.outForDelivery],
          ['Delivered', kpis.delivered],
          ['Today Deliveries', kpis.todayDeliveries]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-[#141414] p-5 shadow-panel transition hover:border-gold/30">
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {isLoading && (
          <div className="rounded-[24px] border border-white/10 bg-[#141414] p-8 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
            Loading delivery tasks...
          </div>
        )}

        {!isLoading && visibleTasks.length === 0 && (
          <div className="rounded-[24px] border border-white/10 bg-[#141414] p-8 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
            No delivery tasks in this view.
          </div>
        )}

        {!isLoading && visibleTasks.map((task, index) => {
          const taskId = getTaskId(task);
          const orderNo = getTaskOrderNo(task);
          const customerName = readText(task.customer_name ?? task.customerName, '-');
          const phone = readText(task.phone, '-');
          const address = readText(task.address, '-');
          const deliveryDate = readText(task.delivery_date ?? task.deliveryDate, '-');
          const deliveryTime = readText(task.delivery_time ?? task.deliveryTime, '-');
          const driverName = readText(task.driver_name ?? task.driverName, 'Unassigned');
          const status = normalizeDeliveryStatus(task.status ?? task.deliveryStatus);
          const taskKey = taskId || orderNo;
          const isUpdating = updatingTaskId === taskKey;
          const urgencyBadges = getUrgencyBadges(task, today);

          return (
            <article
              key={`${taskKey}-${index}`}
              className="flex min-h-full flex-col rounded-[24px] border border-white/10 bg-[#141414] p-5 text-sm text-slate-300 shadow-panel transition hover:border-gold/30"
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
                {urgencyBadges.map((badge) => (
                  <span key={badge} className={`rounded-full border px-3 py-1 text-xs font-semibold ${getUrgencyBadgeClass(badge)}`}>
                    {badge}
                  </span>
                ))}
              </div>

              <div className="grid gap-4 py-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Customer</p>
                  <p className="mt-2 truncate font-semibold text-white">{customerName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone</p>
                  <p className="mt-2 font-semibold text-white">{phone}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Date</p>
                  <p className="mt-2 font-semibold text-white">{deliveryDate}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Time</p>
                  <p className="mt-2 font-semibold text-softGold">{deliveryTime}</p>
                </div>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-[#0f0f0f] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Full Address</p>
                    <p className="mt-2 leading-6 text-slate-300">{address}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText('Address', address)}
                    className="shrink-0 rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Driver Name</p>
                <p className="mt-2 font-semibold text-white">{driverName || 'Unassigned'}</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button onClick={() => copyText('Phone', phone)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Copy Phone</button>
                <button onClick={() => copyText('Address', address)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Copy Address</button>
                <button onClick={() => openWhatsApp(phone)} className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
                <button onClick={() => openMaps(address)} className="rounded-2xl bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20">Maps</button>
              </div>

              <div className="mt-auto border-t border-white/10 pt-4">
                {status === 'Pending' && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      value={selectedDriver[taskKey] || ''}
                      onChange={(event) => setSelectedDriver((prev) => ({ ...prev, [taskKey]: event.target.value }))}
                      className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="">Select driver</option>
                      {drivers.map((driver) => (
                        <option key={driver} value={driver}>
                          {driver}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateDeliveryTaskStatus(task, 'Assigned', selectedDriver[taskKey] || '')}
                      disabled={isUpdating}
                      className="rounded-2xl bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Assign Driver
                    </button>
                  </div>
                )}

                {status === 'Assigned' && (
                  <button
                    type="button"
                    onClick={() => updateDeliveryTaskStatus(task, 'Out for Delivery')}
                    disabled={isUpdating}
                    className="w-full rounded-2xl bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Out for Delivery
                  </button>
                )}

                {status === 'Out for Delivery' && (
                  <button
                    type="button"
                    onClick={() => updateDeliveryTaskStatus(task, 'Delivered')}
                    disabled={isUpdating}
                    className="w-full rounded-2xl bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mark Delivered
                  </button>
                )}

                {status === 'Delivered' && (
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-2xl bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 opacity-70"
                  >
                    Delivered
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
