import React, { useEffect, useMemo, useState } from 'react';
import type { Customer, DeliveryTask, KitchenTask, Order } from '../data/mockData';
import { loadAutomationLogsFromSupabase, type AutomationLog } from '../services/automationLogService';
import { loadEventsFromSupabase, type EventRecord, type EventStatus } from '../services/eventService';
import { formatRM, toSafeNumber } from '../utils/pricing';

type DashboardPageProps = {
  orders: Order[];
  customers: Customer[];
  kitchenTasks?: KitchenTask[];
  deliveryTasks?: DeliveryTask[];
  summary: {
    totalOrders: number;
    pendingPayment: number;
    pendingDeliveries: number;
    todaysRevenue: number;
    monthlyRevenue: number;
    totalCustomers: number;
    bestSellingProduct: string;
    preparing: number;
    readyForDelivery: number;
    outForDelivery: number;
    completed: number;
  };
};

type ChartPoint = {
  date: string;
  label: string;
  revenue: number;
  orders: number;
};

type FeedItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
};

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const todayKey = () => dateKey(new Date());

const compactDay = (date: Date) => new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short' }).format(date);

const getCreatedDate = (order: Order) => {
  const timestamp = order.statusHistory?.[0]?.timestamp || order.deliveryDate || '';
  const parsed = new Date(timestamp.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? order.deliveryDate || '' : dateKey(parsed);
};

const getActivityTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ');
  return date.toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const safeAmount = (order: Order) => toSafeNumber(order.totalAmount);

function KpiCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel transition hover:border-gold/30">
      <p className="text-xs uppercase tracking-[0.22em] text-softGold">{label}</p>
      <p className="mt-4 text-3xl font-semibold leading-none text-white">{value}</p>
      <p className="mt-3 text-sm leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel md:p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.24em] text-softGold">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-softGold">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function statusClass(status: string) {
  if (status === 'Paid' || status === 'Ready' || status === 'Delivered' || status === 'Completed') {
    return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
  }
  if (status === 'Preparing' || status === 'Assigned' || status === 'Confirmed' || status === 'Production') {
    return 'border-blue-300/30 bg-blue-300/10 text-blue-100';
  }
  if (status === 'Quoted' || status === 'Pending') {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  }
  return 'border-white/10 bg-white/5 text-slate-300';
}

export default function DashboardPage({ orders, customers, kitchenTasks = [], deliveryTasks = [], summary }: DashboardPageProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<AutomationLog[]>([]);
  const [dataNote, setDataNote] = useState('Supabase orders loaded by app. Events and activity are loading.');

  useEffect(() => {
    let mounted = true;
    Promise.all([loadEventsFromSupabase(), loadAutomationLogsFromSupabase()])
      .then(([supabaseEvents, logs]) => {
        if (!mounted) return;
        setEvents(supabaseEvents);
        setActivityLogs(logs);
        setDataNote('Supabase connected: orders, events and activity feed are live.');
      })
      .catch((error) => {
        console.error('Executive dashboard Supabase load error:', error);
        if (!mounted) return;
        setEvents([]);
        setDataNote('Supabase events/activity tables unavailable. Event metrics remain empty.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const analytics = useMemo(() => {
    const today = todayKey();
    const todayOrders = orders.filter((order) => getCreatedDate(order) === today || order.deliveryDate === today);
    const todaysRevenue = todayOrders.reduce((sum, order) => sum + safeAmount(order), 0);
    const kitchenPending = kitchenTasks.length > 0
      ? kitchenTasks.filter((task) => task.kitchenStatus !== 'Ready').length
      : orders.filter((order) => order.kitchenStatus !== 'Ready').length;
    const deliveryPending = deliveryTasks.length > 0
      ? deliveryTasks.filter((task) => task.deliveryStatus !== 'Delivered').length
      : orders.filter((order) => order.deliveryStatus !== 'Delivered').length;
    const upcomingEvents = events.filter((event) => event.status !== 'Completed' && event.eventDate >= today).length;
    const newCustomers = customers.filter((customer) => customer.firstOrderDate === today).length;

    const kitchenSummary = {
      New: kitchenTasks.length > 0 ? kitchenTasks.filter((task) => task.kitchenStatus === 'New').length : orders.filter((order) => order.kitchenStatus === 'New').length,
      Preparing: kitchenTasks.length > 0 ? kitchenTasks.filter((task) => task.kitchenStatus === 'Preparing').length : orders.filter((order) => order.kitchenStatus === 'Preparing').length,
      Ready: kitchenTasks.length > 0 ? kitchenTasks.filter((task) => task.kitchenStatus === 'Ready').length : orders.filter((order) => order.kitchenStatus === 'Ready').length
    };

    const deliverySummary = {
      Pending: deliveryTasks.length > 0 ? deliveryTasks.filter((task) => task.deliveryStatus === 'Pending').length : orders.filter((order) => order.deliveryStatus === 'Pending').length,
      Assigned: deliveryTasks.length > 0 ? deliveryTasks.filter((task) => task.deliveryStatus === 'Assigned' || task.deliveryStatus === 'Out for Delivery').length : orders.filter((order) => order.deliveryStatus === 'Assigned' || order.deliveryStatus === 'Out for Delivery').length,
      Delivered: deliveryTasks.length > 0 ? deliveryTasks.filter((task) => task.deliveryStatus === 'Delivered').length : orders.filter((order) => order.deliveryStatus === 'Delivered').length
    };

    const eventSummary = ['Lead', 'Quoted', 'Confirmed', 'Production', 'Completed'].reduce<Record<EventStatus, number>>((acc, status) => {
      acc[status as EventStatus] = events.filter((event) => event.status === status).length;
      return acc;
    }, { Lead: 0, Quoted: 0, Confirmed: 0, Production: 0, Completed: 0 });

    const chart: ChartPoint[] = Array.from({ length: 30 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - index));
      const key = dateKey(date);
      const dayOrders = orders.filter((order) => order.deliveryDate === key || getCreatedDate(order) === key);
      return {
        date: key,
        label: compactDay(date),
        revenue: dayOrders.reduce((sum, order) => sum + safeAmount(order), 0),
        orders: dayOrders.length
      };
    });

    const recentFromLogs: FeedItem[] = activityLogs.slice(0, 8).map((log) => ({
      id: log.id,
      title: log.event_name,
      detail: log.description || 'System activity recorded.',
      time: getActivityTime(log.created_at)
    }));

    const fallbackFeed: FeedItem[] = [
      ...orders.slice(0, 3).map((order) => ({
        id: `order-${order.id}`,
        title: 'Order Created',
        detail: `${order.orderNo || order.id} for ${order.customerName}`,
        time: order.statusHistory?.[0]?.timestamp || order.deliveryDate
      })),
      ...orders.filter((order) => order.kitchenStatus === 'Ready').slice(0, 2).map((order) => ({
        id: `kitchen-${order.id}`,
        title: 'Kitchen Ready',
        detail: `${order.product} ready for ${order.customerName}`,
        time: order.deliveryDate
      })),
      ...deliveryTasks.filter((task) => task.driverName).slice(0, 2).map((task) => ({
        id: `driver-${task.orderId}`,
        title: 'Driver Assigned',
        detail: `${task.driverName} assigned to ${task.customerName}`,
        time: task.deliveryDate
      })),
      ...events.filter((event) => event.status === 'Confirmed').slice(0, 2).map((event) => ({
        id: `event-${event.id}`,
        title: 'Event Confirmed',
        detail: `${event.companyName} confirmed ${formatRM(event.grandTotal)}`,
        time: event.createdAt
      }))
    ].slice(0, 8);

    const maxRevenue = Math.max(...chart.map((point) => point.revenue), 1);

    return {
      today,
      todayOrders,
      todaysRevenue,
      kitchenPending,
      deliveryPending,
      upcomingEvents,
      newCustomers,
      kitchenSummary,
      deliverySummary,
      eventSummary,
      chart,
      maxRevenue,
      feed: recentFromLogs.length > 0 ? recentFromLogs : fallbackFeed
    };
  }, [orders, customers, kitchenTasks, deliveryTasks, events, activityLogs]);

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-gold/15 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-softGold">Executive Dashboard</p>
            <h3 className="mt-3 text-3xl font-semibold text-white md:text-4xl">CEO / Operations Command Center</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Today&apos;s sales, production, delivery, event pipeline and activity in one decision-ready view.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-300">
            {dataNote}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Today's Orders" value={analytics.todayOrders.length} note={`Date ${analytics.today}`} />
        <KpiCard label="Today's Revenue" value={formatRM(analytics.todaysRevenue || summary.todaysRevenue)} note="Orders created or delivered today" />
        <KpiCard label="Kitchen Pending" value={analytics.kitchenPending} note="New or preparing tasks" />
        <KpiCard label="Delivery Pending" value={analytics.deliveryPending} note="Not delivered yet" />
        <KpiCard label="Upcoming Events" value={analytics.upcomingEvents} note="Open event pipeline" />
        <KpiCard label="New Customers" value={analytics.newCustomers} note="First order today" />
      </section>

      <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <Panel eyebrow="Today's Orders" title="Order Snapshot">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-softGold">
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-4 font-medium">Order No</th>
                  <th className="py-3 pr-4 font-medium">Customer</th>
                  <th className="py-3 pr-4 font-medium">Product</th>
                  <th className="py-3 pr-4 font-medium">Amount</th>
                  <th className="py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {analytics.todayOrders.slice(0, 8).map((order) => (
                  <tr key={order.id} className="border-b border-white/5 text-slate-300">
                    <td className="py-4 pr-4 font-semibold text-white">{order.orderNo || order.id}</td>
                    <td className="py-4 pr-4">{order.customerName}</td>
                    <td className="py-4 pr-4">{order.product}</td>
                    <td className="py-4 pr-4 font-semibold text-softGold">{formatRM(order.totalAmount)}</td>
                    <td className="py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(order.workflowStatus)}`}>{order.workflowStatus}</span>
                    </td>
                  </tr>
                ))}
                {analytics.todayOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">No orders for today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel eyebrow="Recent Activity" title="Live Operations Feed">
          <div className="space-y-3">
            {analytics.feed.map((item) => (
              <div key={item.id} className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-5 text-slate-400">{item.detail}</p>
                  </div>
                  <p className="shrink-0 text-xs text-softGold">{item.time}</p>
                </div>
              </div>
            ))}
            {analytics.feed.length === 0 && <p className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5 text-sm text-slate-500">No recent activity yet.</p>}
          </div>
        </Panel>
      </div>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel eyebrow="Kitchen Summary" title="Production State">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <SummaryPill label="New" value={analytics.kitchenSummary.New} />
            <SummaryPill label="Preparing" value={analytics.kitchenSummary.Preparing} />
            <SummaryPill label="Ready" value={analytics.kitchenSummary.Ready} />
          </div>
        </Panel>

        <Panel eyebrow="Delivery Summary" title="Driver Workflow">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <SummaryPill label="Pending" value={analytics.deliverySummary.Pending} />
            <SummaryPill label="Assigned" value={analytics.deliverySummary.Assigned} />
            <SummaryPill label="Delivered" value={analytics.deliverySummary.Delivered} />
          </div>
        </Panel>

        <Panel eyebrow="Event Summary" title="CRM Pipeline">
          <div className="grid gap-3 sm:grid-cols-5 xl:grid-cols-1">
            {(['Lead', 'Quoted', 'Confirmed', 'Production', 'Completed'] as EventStatus[]).map((status) => (
              <SummaryPill key={status} label={status} value={analytics.eventSummary[status]} />
            ))}
          </div>
        </Panel>
      </section>

      <Panel eyebrow="Revenue Chart" title="Last 30 Days Revenue">
        <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}>
          {analytics.chart.map((point) => {
            const percent = Math.max((point.revenue / analytics.maxRevenue) * 100, point.revenue > 0 ? 8 : 2);
            return (
              <div key={point.date} className="flex min-w-0 flex-col items-center gap-2">
                <div className="flex h-44 w-full items-end rounded-2xl bg-white/[0.03] p-1">
                  <div className="w-full rounded-t-xl bg-gradient-to-t from-gold to-softGold" style={{ height: `${percent}%` }} />
                </div>
                <p className="hidden text-[10px] text-slate-500 sm:block">{point.label}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-softGold">30D Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatRM(analytics.chart.reduce((sum, point) => sum + point.revenue, 0))}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-softGold">30D Orders</p>
            <p className="mt-2 text-2xl font-semibold text-white">{analytics.chart.reduce((sum, point) => sum + point.orders, 0)}</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-softGold">Best Day</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatRM(Math.max(...analytics.chart.map((point) => point.revenue), 0))}</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
