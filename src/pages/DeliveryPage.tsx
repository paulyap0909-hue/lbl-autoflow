import React, { useEffect, useMemo, useState } from 'react';
import type { DeliveryTask, Order } from '../data/mockData';
import Toast from '../components/Toast';
import { supabase } from '../lib/supabase';
import { createAutomationLog } from '../services/automationLogService';
import { isSelfCollectOrder, loadDeliveryTasksFromSupabase, type DeliveryDriverDetails } from '../services/deliveryService';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';
import { getOrderFulfillmentDate, isActiveOrder } from '../utils/orderLifecycle';

type DeliveryPageProps = {
  deliveryTasks: DeliveryTask[];
  orders: Order[];
  onUpdateDeliveryStatus: (
    orderId: string,
    newStatus: 'Assigned' | 'Out for Delivery' | 'Delivered' | 'Collected',
    driverName?: string,
    driverDetails?: DeliveryDriverDetails
  ) => void | Promise<void>;
};

type DeliveryStatus = 'Pending' | 'Assigned' | 'Out for Delivery' | 'Delivered' | 'Collected';
type DeliveryActionStatus = Exclude<DeliveryStatus, 'Pending'>;
type DeliveryTaskRecord = Partial<DeliveryTask> & Record<string, unknown>;
type DriverType = 'Internal Driver' | 'Grab' | 'Lalamove' | 'Self Collect';
type DeliveryViewMode = 'active' | 'all';

type DriverProfile = {
  id: string;
  name: string;
  phone: string;
  type: DriverType;
};

const driverProfiles: DriverProfile[] = [
  { id: 'ibrahim', name: 'Ibrahim', phone: '60123450001', type: 'Internal Driver' },
  { id: 'siti', name: 'Siti', phone: '60123450002', type: 'Internal Driver' },
  { id: 'ali', name: 'Ali', phone: '60123450003', type: 'Internal Driver' },
  { id: 'grab', name: 'Grab', phone: '', type: 'Grab' },
  { id: 'lalamove', name: 'Lalamove', phone: '', type: 'Lalamove' }
];

const readText = (value: unknown, fallback = '') => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
};

const normalizeStatus = (value: unknown): DeliveryStatus => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'assigned') return 'Assigned';
  if (normalized === 'out for delivery' || normalized === 'out_for_delivery') return 'Out for Delivery';
  if (normalized === 'collected') return 'Collected';
  if (normalized === 'delivered' || normalized === 'completed' || normalized === 'complete') return 'Delivered';
  return 'Pending';
};

const isCompletedOrder = (order?: Order) => {
  if (!order) return false;
  const workflow = String(order.workflowStatus ?? '').toLowerCase();
  const delivery = String(order.deliveryStatus ?? '').toLowerCase();
  return ['completed', 'complete'].includes(workflow)
    || ['delivered', 'completed', 'complete', 'collected'].includes(delivery);
};

const getTaskId = (task: DeliveryTaskRecord) => readText(task.id);
const getTaskOrderNo = (task: DeliveryTaskRecord) => readText(task.order_no ?? task.orderId ?? task.order_id, '-');
const getTaskDate = (task: DeliveryTaskRecord, order?: Order) =>
  readText(
    task.delivery_date ?? task.deliveryDate,
    getOrderFulfillmentDate(order as (Order & Record<string, unknown>) | undefined)
  );
const getTaskTime = (task: DeliveryTaskRecord, order?: Order) =>
  readText(task.delivery_time ?? task.deliveryTime ?? order?.deliveryTime);
const getDriverName = (task: DeliveryTaskRecord) => readText(task.driver_name ?? task.driverName ?? task.driver);
const getDriverType = (task: DeliveryTaskRecord) => readText(task.driver_type ?? task.driverType ?? task.delivery_method ?? task.deliveryMethod);

const isSelfCollectTask = (task: DeliveryTaskRecord, order?: Order) => {
  const address = readText(task.address ?? order?.address).toLowerCase();
  const driver = getDriverName(task).toLowerCase();
  const driverType = getDriverType(task).toLowerCase();
  return driverType === 'self collect'
    || driver.includes('self collect')
    || /self\s*collect|pickup|pick\s*up|collection/.test(address);
};

const getStatus = (task: DeliveryTaskRecord, order?: Order) => {
  if (isCompletedOrder(order)) {
    const rawOrder = order as (Order & Record<string, unknown>) | undefined;
    const delivery = String(rawOrder?.deliveryStatus ?? rawOrder?.delivery_status ?? '').trim().toLowerCase();
    return delivery === 'collected' ? 'Collected' : 'Delivered';
  }
  return normalizeStatus(task.status ?? task.deliveryStatus ?? order?.deliveryStatus);
};

const getSortValue = (task: DeliveryTaskRecord, order?: Order) => {
  const date = getTaskDate(task, order);
  const time = getTaskTime(task, order) || '23:59';
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${date}T${time}`).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

export default function DeliveryPage({ deliveryTasks, orders, onUpdateDeliveryStatus }: DeliveryPageProps) {
  const [supabaseTasks, setSupabaseTasks] = useState<DeliveryTaskRecord[]>([]);
  const [hasLoadedSupabase, setHasLoadedSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<DeliveryViewMode>('active');
  const [upcomingDeliveryOpen, setUpcomingDeliveryOpen] = useState(false);
  const [upcomingSelfCollectOpen, setUpcomingSelfCollectOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const today = useMemo(() => getMalaysiaDateTimeInputs().date, []);

  const findLinkedOrder = (task: DeliveryTaskRecord) => {
    const orderId = readText(task.order_id);
    const orderNo = readText(task.order_no ?? task.orderId);
    return orders.find((order) =>
      Boolean(orderId && String(order.supabaseId) === orderId)
      || Boolean(orderNo && (order.id === orderNo || order.orderNo === orderNo))
    );
  };

  const reloadDeliveryTasks = async () => {
    setIsLoading(true);
    try {
      const tasks = await loadDeliveryTasksFromSupabase();
      setSupabaseTasks(tasks as DeliveryTaskRecord[]);
      setHasLoadedSupabase(true);
    } catch (error) {
      console.error('Delivery tasks error:', error);
      setHasLoadedSupabase(false);
      setToast({ message: 'Unable to load delivery tasks from Supabase.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadDeliveryTasks();
  }, []);

  const displayedTasks = useMemo(() => {
    const taskSource = hasLoadedSupabase
      ? [...supabaseTasks, ...(deliveryTasks as DeliveryTaskRecord[])].filter((task, index, tasks) => {
          const key = getTaskId(task) || getTaskOrderNo(task);
          return tasks.findIndex((candidate) => (getTaskId(candidate) || getTaskOrderNo(candidate)) === key) === index;
        })
      : deliveryTasks as DeliveryTaskRecord[];

    const selfCollectTasks = orders
      .filter((order) => isSelfCollectOrder(order))
      .map((order) => ({
        id: `self-collect-${order.supabaseId || order.orderNo || order.id}`,
        order_id: order.supabaseId,
        order_no: order.orderNo || order.id,
        orderId: order.orderNo || order.id,
        customer_name: order.customerName,
        customerName: order.customerName,
        phone: order.phone,
        address: 'Self Collect',
        delivery_date: order.deliveryDate,
        deliveryDate: order.deliveryDate,
        delivery_time: order.deliveryTime,
        deliveryTime: order.deliveryTime,
        driver_name: 'Self Collect',
        driverName: 'Self Collect',
        driver_type: 'Self Collect',
        driverType: 'Self Collect',
        status: order.deliveryStatus === 'Delivered' ? 'Collected' : order.deliveryStatus,
        deliveryStatus: order.deliveryStatus === 'Delivered' ? 'Collected' : order.deliveryStatus
      } satisfies DeliveryTaskRecord));

    const source = [...taskSource, ...selfCollectTasks].filter((task, index, tasks) => {
      const key = getTaskOrderNo(task);
      return tasks.findIndex((candidate) => getTaskOrderNo(candidate) === key) === index;
    });

    return source
      .slice().sort((first, second) =>
      getSortValue(first, findLinkedOrder(first)) - getSortValue(second, findLinkedOrder(second))
    );
  }, [deliveryTasks, hasLoadedSupabase, orders, supabaseTasks]);

  const activeTasks = useMemo(
    () => displayedTasks.filter((task) => {
      const linkedOrder = findLinkedOrder(task);
      return !['Delivered', 'Collected'].includes(getStatus(task, linkedOrder))
        && (!linkedOrder || isActiveOrder(linkedOrder));
    }),
    [displayedTasks, orders]
  );

  const completedTasks = useMemo(
    () => displayedTasks
      .filter((task) => ['Delivered', 'Collected'].includes(getStatus(task, findLinkedOrder(task))))
      .sort((first, second) => getSortValue(second, findLinkedOrder(second)) - getSortValue(first, findLinkedOrder(first))),
    [displayedTasks, orders]
  );

  const groups = useMemo(() => {
    const overdue = activeTasks.filter((task) => {
      const order = findLinkedOrder(task);
      const date = getTaskDate(task, order);
      return Boolean(date && date < today);
    });
    const todayTasks = activeTasks.filter((task) => getTaskDate(task, findLinkedOrder(task)) === today);
    const todayDelivery = todayTasks.filter((task) => !isSelfCollectTask(task, findLinkedOrder(task)));
    const todaySelfCollect = todayTasks.filter((task) => isSelfCollectTask(task, findLinkedOrder(task)));
    const upcomingTasks = activeTasks.filter((task) => {
      const date = getTaskDate(task, findLinkedOrder(task));
      return Boolean(date && date > today);
    });
    const upcomingDelivery = upcomingTasks.filter((task) => !isSelfCollectTask(task, findLinkedOrder(task)));
    const upcomingSelfCollect = upcomingTasks.filter((task) => isSelfCollectTask(task, findLinkedOrder(task)));

    return { overdue, todayDelivery, todaySelfCollect, upcomingDelivery, upcomingSelfCollect };
  }, [activeTasks, orders, today]);

  const kpis = useMemo(() => ({
    todayJobs: groups.todayDelivery.length + groups.todaySelfCollect.length,
    pendingAssign: activeTasks.filter((task) =>
      !isSelfCollectTask(task, findLinkedOrder(task)) && getStatus(task, findLinkedOrder(task)) === 'Pending'
    ).length,
    outForDelivery: activeTasks.filter((task) => getStatus(task, findLinkedOrder(task)) === 'Out for Delivery').length,
    selfCollect: activeTasks.filter((task) => isSelfCollectTask(task, findLinkedOrder(task))).length,
    overdue: groups.overdue.length
  }), [activeTasks, groups, orders]);

  const updateFallbackDeliveryTask = async (
    task: DeliveryTaskRecord,
    status: DeliveryActionStatus,
    driverProfile?: DriverProfile
  ) => {
    const taskId = getTaskId(task);
    const orderId = readText(task.order_id);
    const orderNo = readText(task.order_no ?? task.orderId);
    const taskPatch: Record<string, string> = {
      status,
      delivery_status: status
    };

    if (driverProfile) {
      taskPatch.driver_name = driverProfile.name;
    }

    let taskQuery = supabase.from('delivery_tasks').update(taskPatch);
    const taskResult = taskId
      ? await taskQuery.eq('id', taskId)
      : await taskQuery.eq(orderId ? 'order_id' : 'order_no', orderId || orderNo);
    if (taskResult.error) throw taskResult.error;

    if (orderId || orderNo) {
      const orderPatch = ['Delivered', 'Collected'].includes(status)
        ? { delivery_status: status, order_status: 'Completed', workflow_status: 'Completed' }
        : { delivery_status: status };
      const { error } = await supabase
        .from('orders')
        .update(orderPatch)
        .eq(orderId ? 'id' : 'order_no', orderId || orderNo);
      if (error) throw error;
    }

    await createAutomationLog('Delivery Status Updated', `${orderNo || taskId} delivery status changed to ${status}`);
  };

  const updateTaskStatus = async (
    task: DeliveryTaskRecord,
    status: DeliveryActionStatus,
    driverProfile?: DriverProfile
  ) => {
    const taskKey = getTaskId(task) || getTaskOrderNo(task);
    const linkedOrder = findLinkedOrder(task);
    if (!taskKey) {
      setToast({ message: 'Delivery task is missing order details.', type: 'error' });
      return;
    }
    if (status === 'Assigned' && !driverProfile) {
      setToast({ message: 'Please select a driver or delivery method.', type: 'error' });
      return;
    }

    setUpdatingTaskId(taskKey);
    try {
      if (linkedOrder) {
        await onUpdateDeliveryStatus(
          linkedOrder.id,
          status,
          driverProfile?.name,
          driverProfile ? { driverPhone: driverProfile.phone, driverType: driverProfile.type } : undefined
        );
      } else {
        await updateFallbackDeliveryTask(task, status, driverProfile);
      }
      await reloadDeliveryTasks();
      setSelectedDriver((current) => ({ ...current, [taskKey]: '' }));
      const actionLabel = status === 'Collected' ? 'Collected' : status;
      setToast({ message: `${getTaskOrderNo(task)} marked as ${actionLabel}.`, type: 'success' });
    } catch (error) {
      console.error('Delivery update error:', error);
      const message = error instanceof Error ? error.message : 'Delivery update failed.';
      setToast({ message, type: 'error' });
    } finally {
      setUpdatingTaskId('');
    }
  };

  const openWhatsApp = (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setToast({ message: 'Phone number is unavailable.', type: 'error' });
      return;
    }
    window.open(`https://wa.me/${normalized}`, '_blank', 'noopener,noreferrer');
  };

  const statusBadgeClass = (status: DeliveryStatus) => {
    if (status === 'Delivered') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
    if (status === 'Collected') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
    if (status === 'Out for Delivery') return 'border-indigo-500/25 bg-indigo-500/10 text-indigo-200';
    if (status === 'Assigned') return 'border-sky-500/25 bg-sky-500/10 text-sky-200';
    return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  };

  const renderDeliveryCard = (task: DeliveryTaskRecord, index: number) => {
    const order = findLinkedOrder(task);
    const orderNo = getTaskOrderNo(task);
    const taskKey = getTaskId(task) || orderNo;
    const customerName = readText(task.customer_name ?? task.customerName ?? order?.customerName, 'Customer');
    const phone = readText(task.phone ?? order?.phone, 'No phone');
    const address = readText(task.address ?? order?.address, 'Address to be confirmed');
    const date = getTaskDate(task, order) || 'No date';
    const time = getTaskTime(task, order) || 'No time';
    const selfCollect = isSelfCollectTask(task, order);
    const status = getStatus(task, order);
    const driverName = selfCollect ? 'Self Collect' : getDriverName(task) || 'Unassigned';
    const selectedProfile = driverProfiles.find((driver) => driver.id === selectedDriver[taskKey]);
    const isUpdating = updatingTaskId === taskKey;

    return (
      <article key={`${taskKey}-${index}`} className="rounded-[18px] border border-[#334155] bg-[#111111] p-4 shadow-panel transition hover:border-[#C8A96B]/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">{orderNo}</p>
            <p className="mt-1 truncate text-sm text-slate-300">{customerName}</p>
            <p className="mt-1 text-xs text-slate-500">{phone}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
            {status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-[14px] border border-[#334155] bg-[#0F172A] p-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Date</p>
            <p className="mt-1 font-semibold text-white">{date}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Time</p>
            <p className="mt-1 font-semibold text-[#E4C98E]">{time}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Type</p>
            <p className="mt-1 font-semibold text-white">{selfCollect ? 'Self Collect' : 'Delivery'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Driver / Method</p>
            <p className="mt-1 truncate font-semibold text-white">{driverName}</p>
          </div>
        </div>

        <div className="mt-3 rounded-[14px] border border-[#334155] bg-[#0F172A] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{selfCollect ? 'Collection' : 'Address'}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-300">{selfCollect ? 'Self Collect' : address}</p>
        </div>

        {!['Delivered', 'Collected'].includes(status) && (
          <div className="mt-4 space-y-2 border-t border-[#334155] pt-3">
            {!selfCollect && status === 'Pending' && (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedDriver[taskKey] || ''}
                  onChange={(event) => setSelectedDriver((current) => ({ ...current, [taskKey]: event.target.value }))}
                  className="rounded-xl border border-[#334155] bg-[#0F172A] px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="">Select driver / method</option>
                  {driverProfiles.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name} - {driver.type}</option>
                  ))}
                </select>
                <button type="button" onClick={() => updateTaskStatus(task, 'Assigned', selectedProfile)} disabled={isUpdating} className="rounded-xl bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-50">
                  Assign Driver
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {selfCollect ? (
                <button type="button" onClick={() => updateTaskStatus(task, 'Collected')} disabled={isUpdating} className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
                  Mark Collected
                </button>
              ) : (
                <>
                  {status === 'Assigned' && (
                    <button type="button" onClick={() => updateTaskStatus(task, 'Out for Delivery')} disabled={isUpdating} className="rounded-xl bg-indigo-500/10 px-3 py-2.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50">
                      Mark Out for Delivery
                    </button>
                  )}
                  {status === 'Out for Delivery' && (
                    <button type="button" onClick={() => updateTaskStatus(task, 'Delivered')} disabled={isUpdating} className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
                      Mark Delivered
                    </button>
                  )}
                </>
              )}
              <button type="button" onClick={() => openWhatsApp(phone)} className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20">
                WhatsApp
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };

  const renderSection = (
    title: string,
    note: string,
    tasks: DeliveryTaskRecord[],
    accent: string,
    emptyMessage: string
  ) => (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 border-b border-[#334155] pb-2">
        <div>
          <h4 className={`text-lg font-semibold ${accent}`}>{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <span className="rounded-full border border-[#334155] bg-[#111111] px-3 py-1 text-xs font-semibold text-slate-300">{tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {tasks.map(renderDeliveryCard)}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#111111] px-5 py-6 text-center text-sm text-slate-500">{emptyMessage}</div>
      )}
    </section>
  );

  return (
    <div className="space-y-4 bg-[#0F172A]">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#C8A96B]">Delivery Operations</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Delivery Command Center V2</h3>
            <p className="mt-2 text-sm text-slate-400">See today&apos;s delivery and self-collection work at a glance.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-[#334155] bg-[#0F172A] p-1">
              <button type="button" onClick={() => setViewMode('active')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${viewMode === 'active' ? 'bg-[#C8A96B] text-[#111111]' : 'text-slate-400'}`}>Active Deliveries</button>
              <button type="button" onClick={() => setViewMode('all')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${viewMode === 'all' ? 'bg-[#C8A96B] text-[#111111]' : 'text-slate-400'}`}>View All</button>
            </div>
            <button type="button" onClick={reloadDeliveryTasks} disabled={isLoading} className="rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E] disabled:opacity-50">
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <span className="rounded-xl border border-[#334155] bg-[#0F172A] px-3.5 py-2.5 text-xs text-slate-400">Source: {hasLoadedSupabase ? 'Supabase' : 'Fallback'}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Today Jobs', kpis.todayJobs, 'Due today'],
          ['Pending Assign', kpis.pendingAssign, 'Needs driver'],
          ['Out for Delivery', kpis.outForDelivery, 'Currently moving'],
          ['Self Collect', kpis.selfCollect, 'Customer pickup'],
          ['Overdue', kpis.overdue, 'Past due and open']
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </section>

      {isLoading && <div className="rounded-[18px] border border-[#334155] bg-[#111111] p-8 text-center text-sm text-slate-400">Loading delivery work...</div>}

      {!isLoading && viewMode === 'active' && (
        <>
          {renderSection('OVERDUE', 'Past delivery date and still not delivered.', groups.overdue, 'text-rose-300', 'No overdue deliveries.')}
          {renderSection('TODAY DELIVERY', 'Today delivery jobs, earliest time first.', groups.todayDelivery, 'text-[#E4C98E]', 'No deliveries scheduled for today.')}
          {renderSection('TODAY SELF COLLECT', 'Customer collections scheduled today.', groups.todaySelfCollect, 'text-sky-300', 'No self collections scheduled for today.')}

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <button type="button" onClick={() => setUpcomingDeliveryOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
              <div>
                <p className="font-semibold text-white">UPCOMING DELIVERY ({groups.upcomingDelivery.length})</p>
                <p className="mt-1 text-xs text-slate-500">Tomorrow and future unfinished delivery jobs.</p>
              </div>
              <span className="text-xs font-semibold text-[#E4C98E]">{upcomingDeliveryOpen ? 'Collapse' : 'Expand'}</span>
            </button>
            {upcomingDeliveryOpen && (
              <div className="border-t border-[#334155] p-3.5">
                {groups.upcomingDelivery.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{groups.upcomingDelivery.map(renderDeliveryCard)}</div>
                ) : <p className="py-5 text-center text-sm text-slate-500">No upcoming deliveries.</p>}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <button type="button" onClick={() => setUpcomingSelfCollectOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
              <div>
                <p className="font-semibold text-white">UPCOMING SELF COLLECT ({groups.upcomingSelfCollect.length})</p>
                <p className="mt-1 text-xs text-slate-500">Tomorrow and future customer collections.</p>
              </div>
              <span className="text-xs font-semibold text-[#E4C98E]">{upcomingSelfCollectOpen ? 'Collapse' : 'Expand'}</span>
            </button>
            {upcomingSelfCollectOpen && (
              <div className="border-t border-[#334155] p-3.5">
                {groups.upcomingSelfCollect.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{groups.upcomingSelfCollect.map(renderDeliveryCard)}</div>
                ) : <p className="py-5 text-center text-sm text-slate-500">No upcoming self collections.</p>}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <button type="button" onClick={() => setCompletedOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
              <div>
                <p className="font-semibold text-white">DELIVERED / COMPLETED ({completedTasks.length})</p>
                <p className="mt-1 text-xs text-slate-500">Completed handoffs stay hidden until needed.</p>
              </div>
              <span className="text-xs font-semibold text-emerald-300">{completedOpen ? 'Collapse' : 'Expand'}</span>
            </button>
            {completedOpen && (
              <div className="border-t border-[#334155] p-3.5">
                {completedTasks.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{completedTasks.map(renderDeliveryCard)}</div>
                ) : <p className="py-5 text-center text-sm text-slate-500">No completed deliveries.</p>}
              </div>
            )}
          </section>
        </>
      )}

      {!isLoading && viewMode === 'all' && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 border-b border-[#334155] pb-2">
            <div>
              <h4 className="text-lg font-semibold text-white">ALL DELIVERIES</h4>
              <p className="mt-1 text-xs text-slate-500">Active and historical delivery records.</p>
            </div>
            <span className="rounded-full border border-[#334155] bg-[#111111] px-3 py-1 text-xs font-semibold text-slate-300">{displayedTasks.length}</span>
          </div>
          {displayedTasks.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{displayedTasks.map(renderDeliveryCard)}</div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#111111] px-5 py-8 text-center text-sm text-slate-500">No delivery records.</div>
          )}
        </section>
      )}
    </div>
  );
}
