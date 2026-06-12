import React, { useEffect, useMemo, useState } from 'react';
import type { DeliveryTask, Order } from '../data/mockData';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabase';
import { createAutomationLog } from '../services/automationLogService';
import { loadDeliveryTasksFromSupabase, type DeliveryDriverDetails } from '../services/deliveryService';

type DeliveryPageProps = {
  deliveryTasks: DeliveryTask[];
  orders: Order[];
  onUpdateDeliveryStatus: (orderId: string, newStatus: 'Assigned' | 'Out for Delivery' | 'Delivered', driverName?: string, driverDetails?: DeliveryDriverDetails) => void | Promise<void>;
};

type DeliveryStatus = 'Pending' | 'Assigned' | 'Out for Delivery' | 'Delivered';
type DeliveryActionStatus = Exclude<DeliveryStatus, 'Pending'>;
type DeliveryTab = 'All' | DeliveryStatus;
type DeliveryTaskRecord = Partial<DeliveryTask> & Record<string, unknown>;
type DriverType = 'Internal Driver' | 'Grab' | 'Lalamove' | 'Self Collect';
type DriverProfile = {
  id: string;
  name: string;
  phone: string;
  type: DriverType;
  vehicle: string;
};

const driverProfiles: DriverProfile[] = [
  { id: 'ibrahim', name: 'Ibrahim', phone: '60123450001', type: 'Internal Driver', vehicle: 'Motorbike' },
  { id: 'siti', name: 'Siti', phone: '60123450002', type: 'Internal Driver', vehicle: 'Car' },
  { id: 'ali', name: 'Ali', phone: '60123450003', type: 'Internal Driver', vehicle: 'Motorbike' },
  { id: 'grab', name: 'Grab', phone: '', type: 'Grab', vehicle: 'E-hailing' },
  { id: 'lalamove', name: 'Lalamove', phone: '', type: 'Lalamove', vehicle: 'Courier' },
  { id: 'self-collect', name: 'SELF COLLECT', phone: '', type: 'Self Collect', vehicle: 'Customer Pickup' }
];
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
const getTaskKey = (task: DeliveryTaskRecord, index = 0) => `${getTaskId(task) || getTaskOrderNo(task)}-${index}`;
const getTaskDriverName = (task: DeliveryTaskRecord) => readText(task.driver_name ?? task.driverName, '');
const getTaskDriverType = (task: DeliveryTaskRecord): DriverType | '' => {
  const value = readText(task.driver_type ?? task.driverType, '');
  if (value === 'Internal Driver' || value === 'Grab' || value === 'Lalamove' || value === 'Self Collect') return value;
  return '';
};
const getTaskReadyTime = (task: DeliveryTaskRecord, order?: Order) => {
  const explicitReadyTime = readText(task.ready_time ?? task.readyTime ?? task.required_ready_time ?? task.requiredReadyTime, '');
  if (explicitReadyTime) return explicitReadyTime;

  const deliveryDate = readText(task.delivery_date ?? task.deliveryDate ?? order?.deliveryDate, '');
  const deliveryTime = readText(task.delivery_time ?? task.deliveryTime ?? order?.deliveryTime, '');
  if (!deliveryDate || !deliveryTime) return '-';

  const parsed = new Date(`${deliveryDate} ${deliveryTime}`);
  if (Number.isNaN(parsed.getTime())) return '-';
  parsed.setMinutes(parsed.getMinutes() - 30);
  return parsed.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
};
const isSelfCollectTask = (task: DeliveryTaskRecord) => {
  const name = getTaskDriverName(task).toLowerCase();
  const type = getTaskDriverType(task);
  const address = readText(task.address, '').toLowerCase();
  return type === 'Self Collect' || name.includes('self collect') || address.includes('self collect');
};
const getDriverDisplayName = (task: DeliveryTaskRecord) => {
  if (isSelfCollectTask(task)) return 'SELF COLLECT';
  return getTaskDriverName(task) || 'Unassigned';
};
const getSelectedDriverProfile = (id: string) => driverProfiles.find((driver) => driver.id === id);
const getOrderProducts = (task: DeliveryTaskRecord, order?: Order) => {
  const product = readText(task.product ?? order?.product, 'Bakery order');
  const rawFlavours = task.flavours ?? order?.flavours;
  const flavours = Array.isArray(rawFlavours) ? rawFlavours.map(String).filter(Boolean) : [];
  const quantity = readText(task.quantity ?? order?.quantity, '');
  if (flavours.length === 0) return quantity ? `${product} x ${quantity}` : product;
  return flavours.map((flavour) => `${flavour}${quantity ? ` x ${quantity}` : ''}`);
};
const getInvoiceNo = (task: DeliveryTaskRecord) => readText(task.invoice_no ?? task.invoiceNo ?? task.invoiceNumber, '-');
const getTaskNotes = (task: DeliveryTaskRecord, order?: Order) => readText(task.notes ?? task.remark ?? order?.remark, 'No delivery notes.');

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
  const [hasLoadedSupabase, setHasLoadedSupabase] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [expandedTaskKey, setExpandedTaskKey] = useState('');

  const reloadDeliveryTasks = async () => {
    setIsLoading(true);
    try {
      const tasks = await loadDeliveryTasksFromSupabase();
      setSupabaseTasks(tasks as DeliveryTaskRecord[]);
      setHasLoadedSupabase(true);
    } catch (error) {
      console.error('Delivery tasks error:', error);
      setToast({ message: 'Unable to load delivery tasks from Supabase.', type: 'error' });
      setSupabaseTasks([]);
      setHasLoadedSupabase(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadDeliveryTasks();
  }, []);

  const today = useMemo(() => todayKey(), []);

  const displayedTasks = useMemo(() => {
    const sourceTasks = hasLoadedSupabase ? supabaseTasks : (deliveryTasks as DeliveryTaskRecord[]);

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
  }, [deliveryTasks, hasLoadedSupabase, supabaseTasks]);

  const kpis = useMemo(() => ({
    total: displayedTasks.length,
    pending: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Pending').length,
    assigned: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Assigned').length,
    outForDelivery: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Out for Delivery').length,
    delivered: displayedTasks.filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) === 'Delivered').length,
    todayDeliveries: displayedTasks.filter((task) => readText(task.delivery_date ?? task.deliveryDate, '') === today).length,
    selfCollect: displayedTasks.filter((task) => isSelfCollectTask(task)).length,
    overdue: displayedTasks.filter((task) => getUrgencyBadges(task, today).includes('Overdue')).length
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

  const updateFallbackDeliveryTask = async (task: DeliveryTaskRecord, status: DeliveryActionStatus, driverProfile?: DriverProfile) => {
    const taskId = getTaskId(task);
    const orderId = readText(task.order_id, '');
    const orderNo = readText(task.order_no ?? task.orderId, '');
    const patch: Record<string, string> = { status };

    if (driverProfile) {
      patch.driver_name = driverProfile.name;
      patch.driver_phone = driverProfile.phone;
      patch.driver_type = driverProfile.type;
    }

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

  const updateDeliveryTaskStatus = async (task: DeliveryTaskRecord, status: DeliveryActionStatus, driverProfile?: DriverProfile) => {
    const taskKey = getTaskId(task) || getTaskOrderNo(task);
    const linkedOrder = findLinkedOrder(task);

    if (!taskKey) {
      setToast({ message: 'Delivery task is missing order details. Please refresh and try again.', type: 'error' });
      return;
    }

    if (status === 'Assigned' && !driverProfile) {
      setToast({ message: 'Please select a driver.', type: 'error' });
      return;
    }

    setUpdatingTaskId(taskKey);
    try {
      if (linkedOrder) {
        await onUpdateDeliveryStatus(linkedOrder.id, status, driverProfile?.name, driverProfile ? { driverPhone: driverProfile.phone, driverType: driverProfile.type } : undefined);
      } else {
        await updateFallbackDeliveryTask(task, status, driverProfile);
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
    <div className="space-y-4 bg-[#0F172A]">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#C8A96B]">Delivery Operations</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Delivery Command Center</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Assign drivers, track transit, and complete customer handoffs without horizontal scrolling.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reloadDeliveryTasks}
              disabled={isLoading}
              className="rounded-xl bg-[#C8A96B] px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#d6b77d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Refreshing...' : 'Refresh Deliveries'}
            </button>
            <span className="rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E]">
              Source: {hasLoadedSupabase ? 'Supabase' : 'Fallback'}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Today Deliveries', kpis.todayDeliveries],
          ['Pending', kpis.pending],
          ['In Transit', kpis.outForDelivery],
          ['Delivered', kpis.delivered],
          ['Self Collect', kpis.selfCollect],
          ['Overdue', kpis.overdue]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel transition hover:border-[#C8A96B]/40">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
        <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Delivery Timeline</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {[
            ['Today Jobs', kpis.todayDeliveries],
            ['Assigned', kpis.assigned],
            ['In Transit', kpis.outForDelivery],
            ['Delivered', kpis.delivered]
          ].map(([label, value], index) => (
            <div key={label} className="relative rounded-[14px] border border-[#334155] bg-[#0F172A] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
                <span className="rounded-full bg-[#C8A96B]/15 px-3 py-1 text-sm font-semibold text-[#E4C98E]">{value}</span>
              </div>
              {index < 3 && <div className="pointer-events-none absolute -right-2 top-1/2 hidden h-px w-4 bg-[#C8A96B]/40 md:block" />}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {isLoading && (
          <div className="rounded-[18px] border border-white/10 bg-[#141414] p-6 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
            Loading delivery tasks...
          </div>
        )}

        {!isLoading && visibleTasks.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-[#334155] bg-[#111111] p-7 text-center lg:col-span-2 2xl:col-span-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Delivery Queue</p>
            <h4 className="mt-3 text-xl font-semibold text-white">No delivery tasks in this view</h4>
            <p className="mt-2 text-sm text-slate-500">Switch pipeline filters or refresh when new orders are ready.</p>
          </div>
        )}

        {!isLoading && visibleTasks.map((task, index) => {
          const orderNo = getTaskOrderNo(task);
          const linkedOrder = findLinkedOrder(task);
          const customerName = readText(task.customer_name ?? task.customerName ?? linkedOrder?.customerName, '-');
          const phone = readText(task.phone ?? linkedOrder?.phone, '-');
          const address = readText(task.address ?? linkedOrder?.address, '-');
          const deliveryDate = readText(task.delivery_date ?? task.deliveryDate ?? linkedOrder?.deliveryDate, '-');
          const deliveryTime = readText(task.delivery_time ?? task.deliveryTime ?? linkedOrder?.deliveryTime, '-');
          const readyTime = getTaskReadyTime(task, linkedOrder);
          const status = normalizeDeliveryStatus(task.status ?? task.deliveryStatus);
          const taskKey = getTaskId(task) || orderNo;
          const cardKey = getTaskKey(task, index);
          const isUpdating = updatingTaskId === taskKey;
          const urgencyBadges = getUrgencyBadges(task, today);
          const driverName = getDriverDisplayName(task);
          const expanded = expandedTaskKey === cardKey;
          const selectedProfile = getSelectedDriverProfile(selectedDriver[taskKey] || '');
          const products = getOrderProducts(task, linkedOrder);

          return (
            <article
              key={cardKey}
              className="flex min-h-full flex-col rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 text-sm text-slate-300 shadow-panel transition hover:border-[#C8A96B]/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#C8A96B]/30 bg-[#C8A96B]/10 text-xs font-bold text-[#E4C98E]">LBL</div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#C8A96B]">Order Number</p>
                    <h4 className="mt-1 truncate text-lg font-semibold text-white">{orderNo}</h4>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                  {status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {urgencyBadges.map((badge) => (
                  <span key={badge} className={`rounded-full border px-3 py-1 text-xs font-semibold ${getUrgencyBadgeClass(badge)}`}>
                    {badge}
                  </span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-[14px] border border-[#334155] bg-[#0F172A] p-2.5 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Date</p>
                  <p className="mt-1 truncate font-semibold text-white">{deliveryDate}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Ready Time</p>
                  <p className="mt-1 truncate font-semibold text-[#E4C98E]">{readyTime}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Delivery Time</p>
                  <p className="mt-1 truncate font-semibold text-[#E4C98E]">{deliveryTime}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Driver</p>
                  <p className={`mt-1 truncate font-semibold ${driverName === 'SELF COLLECT' ? 'text-[#E4C98E]' : 'text-white'}`}>{driverName}</p>
                </div>
              </div>

              {expanded && (
                <div className="mt-3 space-y-3 border-t border-[#334155] pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Customer</p>
                      <p className="mt-2 font-semibold text-white">{customerName}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Phone</p>
                      <p className="mt-2 font-semibold text-white">{phone}</p>
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Delivery Address</p>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{isSelfCollectTask(task) ? 'SELF COLLECT' : address}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Invoice Number</p>
                      <p className="mt-2 font-semibold text-white">{getInvoiceNo(task)}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Order Notes</p>
                      <p className="mt-2 text-sm text-slate-300">{getTaskNotes(task, linkedOrder)}</p>
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Products</p>
                    <div className="mt-2 space-y-2">
                      {Array.isArray(products) ? products.map((item) => (
                        <p key={item} className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white">{item}</p>
                      )) : <p className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white">{products}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button onClick={() => openWhatsApp(phone)} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
                    <button onClick={() => openMaps(address)} className="rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20">Google Maps</button>
                    <button onClick={() => copyText('Phone', phone)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Copy Phone</button>
                    <button onClick={() => copyText('Address', address)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Copy Address</button>
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-3 border-t border-[#334155] pt-4">
                <button
                  type="button"
                  onClick={() => setExpandedTaskKey((current) => current === cardKey ? '' : cardKey)}
                  className="rounded-xl border border-[#334155] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/40 hover:text-white"
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>

                {status === 'Pending' && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      value={selectedDriver[taskKey] || ''}
                      onChange={(event) => setSelectedDriver((prev) => ({ ...prev, [taskKey]: event.target.value }))}
                      className="rounded-xl border border-[#334155] bg-[#0F172A] px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="">Select delivery method</option>
                      {driverProfiles.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} - {driver.type}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateDeliveryTaskStatus(task, 'Assigned', selectedProfile)}
                      disabled={isUpdating}
                      className="rounded-xl bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Assign Driver
                    </button>
                  </div>
                )}

                {status === 'Assigned' && (
                  <button
                    type="button"
                    onClick={() => updateDeliveryTaskStatus(task, isSelfCollectTask(task) ? 'Delivered' : 'Out for Delivery')}
                    disabled={isUpdating}
                    className="w-full rounded-xl bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSelfCollectTask(task) ? 'Mark Collected' : 'Out for Delivery'}
                  </button>
                )}

                {status === 'Out for Delivery' && (
                  <button
                    type="button"
                    onClick={() => updateDeliveryTaskStatus(task, 'Delivered')}
                    disabled={isUpdating}
                    className="w-full rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mark Delivered
                  </button>
                )}

                {status === 'Delivered' && (
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 opacity-70"
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
