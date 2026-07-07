import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChefHat,
  CircleDollarSign,
  Clock3,
  FileWarning,
  PhoneCall,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserRoundSearch,
  UsersRound,
  WalletCards
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import type { Customer, DeliveryTask, KitchenTask, Order } from '../data/mockData';
import type { InvoiceRecord } from '../services/invoiceService';
import { loadSalesLeadsFromSupabase, type SalesLead } from '../services/salesLeadService';
import { getOrderIdentityKeys, isActiveOrder } from '../utils/orderLifecycle';
import { toSafeNumber } from '../utils/pricing';

type DashboardPageProps = {
  orders: Order[];
  customers: Customer[];
  kitchenTasks?: KitchenTask[];
  deliveryTasks?: DeliveryTask[];
  invoices?: InvoiceRecord[];
  loading?: boolean;
  onNavigate?: (page: string) => void;
  followUpDueCount?: number;
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

type DashboardOrder = Order & {
  created_at?: string | null;
  createdAt?: string | null;
  delivery_date?: string | null;
  order_status?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  total?: number | string | null;
  payment_status?: string | null;
};

type DashboardKitchenTask = KitchenTask & {
  id?: string | number;
  order_id?: string | number | null;
  order_no?: string | null;
  status?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  ready_time?: string | null;
};

type DashboardDeliveryTask = DeliveryTask & {
  id?: string | number;
  order_id?: string | number | null;
  order_no?: string | null;
  status?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  driver_name?: string | null;
  driver_type?: string | null;
};

const todayKey = () => format(new Date(), 'yyyy-MM-dd');

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value.replace(' ', 'T'));
  return isValid(parsed) ? parsed : null;
};

const dateKeyFromValue = (value?: string | null) => {
  if (!value) return '';
  const parsed = safeDate(value);
  return parsed ? format(parsed, 'yyyy-MM-dd') : value.slice(0, 10);
};

const orderCreatedKey = (order: Order) => {
  const dashboardOrder = order as DashboardOrder;
  const createdAt = dashboardOrder.created_at ?? dashboardOrder.createdAt;
  if (createdAt) return dateKeyFromValue(createdAt);
  const timestamp = order.statusHistory?.[0]?.timestamp;
  if (!timestamp) return '';
  const parsed = new Date(timestamp.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? timestamp.slice(0, 10) : format(parsed, 'yyyy-MM-dd');
};

const getOrderAmount = (order: Order) => {
  const dashboardOrder = order as DashboardOrder;
  return toSafeNumber(dashboardOrder.total_amount ?? order.totalAmount ?? dashboardOrder.total);
};

const getOrderOperationalStatus = (order: Order) => {
  const dashboardOrder = order as DashboardOrder;
  return String(
    dashboardOrder.order_status ??
      dashboardOrder.status ??
      order.workflowStatus ??
      order.deliveryStatus ??
      ''
  )
    .trim()
    .toLowerCase();
};

const getOrderReadyStatus = (order: Order) => {
  const dashboardOrder = order as DashboardOrder;
  return [
    dashboardOrder.status,
    dashboardOrder.order_status,
    order.kitchenStatus,
    order.workflowStatus
  ]
    .map((status) => String(status ?? '').trim().toLowerCase())
    .some((status) => status === 'ready');
};

const formatDashboardRM = (value: unknown) =>
  `RM${toSafeNumber(value).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatShortDate = (value?: string | null) => {
  const parsed = safeDate(value);
  return parsed ? format(parsed, 'dd MMM') : value || 'Date pending';
};

const normalizeKitchenStatus = (value?: string | null) => {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'preparing' || status === 'in kitchen') return 'Preparing';
  if (status === 'ready') return 'Ready';
  if (status === 'completed') return 'Completed';
  return 'New';
};

const normalizeDeliveryStatus = (value?: string | null) => {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'assigned') return 'Assigned';
  if (status === 'out for delivery' || status === 'in transit') return 'Out for Delivery';
  if (status === 'delivered') return 'Delivered';
  return 'Pending';
};

const statusTone = (status: string) => {
  if (['Ready', 'Delivered', 'Won'].includes(status)) {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  }
  if (['Preparing', 'Assigned', 'Out for Delivery', 'Contacted', 'Interested'].includes(status)) {
    return 'border-sky-400/25 bg-sky-400/10 text-sky-300';
  }
  if (status === 'Hot' || status === 'Overdue') {
    return 'border-rose-400/25 bg-rose-400/10 text-rose-300';
  }
  return 'border-amber-400/25 bg-amber-400/10 text-amber-300';
};

const sortableDateTime = (date?: string | null, time?: string | null) => {
  const dateKey = dateKeyFromValue(date) || '9999-12-31';
  return `${dateKey} ${time || '23:59'}`;
};

const getOrderDeliveryKey = (order: Order) => {
  const dashboardOrder = order as DashboardOrder;
  return dateKeyFromValue(dashboardOrder.delivery_date ?? order.deliveryDate);
};

const getPaymentStatus = (order: Order) => {
  const dashboardOrder = order as DashboardOrder;
  return String(dashboardOrder.payment_status ?? order.paymentStatus ?? '').trim().toLowerCase();
};

const getTopLabel = (entries: Array<{ label: string; value: number }>) =>
  entries.reduce<{ label: string; value: number } | null>(
    (best, entry) => (!best || entry.value > best.value ? entry : best),
    null
  );

const getOrderTimestamp = (date?: string | null, time?: string | null) => {
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${date.slice(0, 10)} ${time || '23:59'}`).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const daysSince = (date?: string | null) => {
  const parsed = safeDate(date);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
};

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note: string;
  tone: 'gold' | 'green' | 'blue' | 'amber';
}) {
  const tones = {
    gold: 'border-[#C8A96B]/30 text-[#E4C98E]',
    green: 'border-emerald-400/25 text-emerald-300',
    blue: 'border-sky-400/25 text-sky-300',
    amber: 'border-amber-400/25 text-amber-300'
  };

  return (
    <article className="ds-card group min-h-[104px] rounded-xl border border-[#334155] bg-[#111827] p-4 transition">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-[#0F172A] ${tones[tone]}`}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <p className="text-xl font-semibold text-[#F8FAFC] md:text-2xl">{value}</p>
        <p className="pb-0.5 text-right text-[11px] text-[#64748B]">{note}</p>
      </div>
    </article>
  );
}

function KpiSkeleton() {
  return (
    <div className="ds-card min-h-[104px] animate-pulse rounded-xl border border-[#334155] bg-[#111827] p-4">
      <div className="h-3 w-24 rounded bg-slate-700" />
      <div className="mt-5 h-7 w-28 rounded bg-slate-700" />
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
  actionLabel,
  onAction
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#263348] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">{eyebrow}</p>
          <h2 className="truncate text-sm font-semibold text-[#F8FAFC]">{title}</h2>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#94A3B8] transition hover:text-[#E4C98E]"
      >
        {actionLabel}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center px-5 text-center">
      <Sparkles size={22} className="text-[#C8A96B]" />
      <p className="mt-3 text-sm font-semibold text-[#F8FAFC]">{message}</p>
      <p className="mt-1 text-xs text-[#64748B]">The queue is clear for now.</p>
    </div>
  );
}

function IntelligencePanel({
  icon: Icon,
  eyebrow,
  title,
  items
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  items: Array<{ label: string; value: string | number; hint: string }>;
}) {
  return (
    <section className="ds-card overflow-hidden rounded-xl border border-[#334155] bg-[#111827]">
      <div className="flex items-center gap-3 border-b border-[#263348] px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]">
          <Icon size={16} />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">{eyebrow}</p>
          <h2 className="text-sm font-semibold text-[#F8FAFC]">{title}</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[#263348]">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 p-3">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">{item.label}</p>
            <p className="mt-1.5 truncate text-base font-semibold text-[#F8FAFC]">{item.value}</p>
            <p className="mt-1 truncate text-[10px] text-[#64748B]">{item.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RiskItem({
  label,
  count,
  reason,
  action,
  onClick
}: {
  label: string;
  count: number;
  reason: string;
  action: string;
  onClick?: () => void;
}) {
  const hasRisk = count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 text-left transition hover:bg-white/[0.025]"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
          hasRisk
            ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
            : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
        }`}
      >
        {hasRisk ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-xs font-semibold text-[#E2E8F0]">{label}</span>
          <span className={hasRisk ? 'text-base font-semibold text-rose-300' : 'text-base font-semibold text-emerald-300'}>
            {count}
          </span>
        </span>
        <span className="mt-1 block truncate text-[10px] text-[#64748B]">{reason}</span>
        <span className="mt-1 block truncate text-[10px] font-semibold text-[#C8A96B]">
          {hasRisk ? action : 'No action needed'}
        </span>
      </span>
    </button>
  );
}

export default function DashboardPage({
  orders,
  customers,
  kitchenTasks = [],
  deliveryTasks = [],
  invoices = [],
  loading = false,
  followUpDueCount = 0,
  onNavigate
}: DashboardPageProps) {
  const [salesLeads, setSalesLeads] = useState<SalesLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadLeads = async () => {
      try {
        const leads = await loadSalesLeadsFromSupabase();
        if (mounted) setSalesLeads(leads);
      } catch (error) {
        console.error('Dashboard sales leads load error:', error);
        if (mounted) setSalesLeads([]);
      } finally {
        if (mounted) setLeadsLoading(false);
      }
    };

    void loadLeads();
    window.addEventListener('lbl:sales-crm-updated', loadLeads);
    return () => {
      mounted = false;
      window.removeEventListener('lbl:sales-crm-updated', loadLeads);
    };
  }, []);

  const analytics = useMemo(() => {
    const now = Date.now();
    const today = todayKey();
    const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
    const monthPrefix = today.slice(0, 7);
    const weekStart = format(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd');
    const terminalStatuses = ['completed', 'delivered', 'cancelled', 'canceled'];
    const completedStatuses = ['completed', 'delivered'];
    const dashboardOrders = orders.filter(isActiveOrder);
    const dashboardOrderKeys = new Set(dashboardOrders.flatMap(getOrderIdentityKeys));
    const dashboardInvoices = invoices.filter((invoice) => {
      const orderId = invoice.order_id;
      return orderId !== null && orderId !== undefined && dashboardOrderKeys.has(String(orderId));
    });
    const todayOrders = dashboardOrders.filter((order) => orderCreatedKey(order) === today);
    const productionWeekOrders = dashboardOrders.filter((order) => {
      const key = getOrderDeliveryKey(order) || orderCreatedKey(order);
      return key >= weekStart && key <= today;
    });
    const productionTodayOrders = dashboardOrders.filter(
      (order) => (getOrderDeliveryKey(order) || orderCreatedKey(order)) === today
    );
    const monthOrders = dashboardOrders.filter((order) => orderCreatedKey(order).startsWith(monthPrefix));
    const pendingOrders = dashboardOrders.filter(
      (order) => !terminalStatuses.includes(getOrderOperationalStatus(order))
    ).length;

    const productTotals = new Map<string, number>();
    const flavourTotals = new Map<string, number>();
    productionWeekOrders.forEach((order) => {
      const product = order.product || 'Unknown product';
      productTotals.set(product, (productTotals.get(product) || 0) + toSafeNumber(order.quantity));
      if (order.flavourQuantities?.length) {
        order.flavourQuantities.forEach((item) => {
          flavourTotals.set(item.name, (flavourTotals.get(item.name) || 0) + toSafeNumber(item.quantity));
        });
      } else {
        order.flavours?.forEach((flavour) => {
          flavourTotals.set(flavour, (flavourTotals.get(flavour) || 0) + 1);
        });
      }
    });
    const todayProductTotals = new Map<string, number>();
    productionTodayOrders.forEach((order) => {
      todayProductTotals.set(order.product, (todayProductTotals.get(order.product) || 0) + toSafeNumber(order.quantity));
    });
    const topProductToday = getTopLabel(
      Array.from(todayProductTotals, ([label, value]) => ({ label, value }))
    );
    const topProductWeek = getTopLabel(Array.from(productTotals, ([label, value]) => ({ label, value })));
    const topFlavour = getTopLabel(Array.from(flavourTotals, ([label, value]) => ({ label, value })));

    const tomorrowProductionQuantity = dashboardOrders
      .filter((order) => getOrderDeliveryKey(order) === tomorrow)
      .reduce((sum, order) => sum + toSafeNumber(order.quantity), 0);

    const readyKitchenCount = (kitchenTasks as DashboardKitchenTask[]).filter(
      (task) => normalizeKitchenStatus(task.status ?? task.kitchenStatus) === 'Ready'
    ).length;
    const overdueKitchenCount = (kitchenTasks as DashboardKitchenTask[]).filter((task) => {
      const status = normalizeKitchenStatus(task.status ?? task.kitchenStatus);
      const dueAt = getOrderTimestamp(
        task.delivery_date ?? task.deliveryDate,
        task.ready_time ?? task.requiredReadyTime ?? task.delivery_time ?? task.deliveryTime
      );
      return !['Ready', 'Completed'].includes(status) && dueAt < now;
    }).length;
    const dueSoonKitchenCount = (kitchenTasks as DashboardKitchenTask[]).filter((task) => {
      const status = normalizeKitchenStatus(task.status ?? task.kitchenStatus);
      const dueAt = getOrderTimestamp(
        task.delivery_date ?? task.deliveryDate,
        task.ready_time ?? task.requiredReadyTime ?? task.delivery_time ?? task.deliveryTime
      );
      return !['Ready', 'Completed'].includes(status) && dueAt >= now && dueAt <= now + 2 * 60 * 60 * 1000;
    }).length;

    const overdueDeliveryCount = (deliveryTasks as DashboardDeliveryTask[]).filter((task) => {
      const status = normalizeDeliveryStatus(task.status ?? task.deliveryStatus);
      const dueAt = getOrderTimestamp(
        task.delivery_date ?? task.deliveryDate,
        task.delivery_time ?? task.deliveryTime
      );
      return status !== 'Delivered' && dueAt < now;
    }).length;
    const dueSoonDeliveryCount = (deliveryTasks as DashboardDeliveryTask[]).filter((task) => {
      const status = normalizeDeliveryStatus(task.status ?? task.deliveryStatus);
      const dueAt = getOrderTimestamp(
        task.delivery_date ?? task.deliveryDate,
        task.delivery_time ?? task.deliveryTime
      );
      return status !== 'Delivered' && dueAt >= now && dueAt <= now + 2 * 60 * 60 * 1000;
    }).length;

    const pendingPaymentOrders = dashboardOrders.filter(
      (order) =>
        getPaymentStatus(order) !== 'paid' &&
        !['cancelled', 'canceled'].includes(getOrderOperationalStatus(order))
    );
    const pendingPaymentAmount = pendingPaymentOrders.reduce(
      (sum, order) => sum + getOrderAmount(order),
      0
    );
    const monthToDateSales = monthOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
    const averageOrderValue = dashboardOrders.length
      ? dashboardOrders.reduce((sum, order) => sum + getOrderAmount(order), 0) / dashboardOrders.length
      : 0;

    const repeatCustomers = customers.filter((customer) => toSafeNumber(customer.totalOrders) > 1);
    const customersNeedingFollowUp = customers.filter(
      (customer) =>
        customer.customerStatus !== 'Archived' &&
        Boolean(customer.lastOrderDate) &&
        daysSince(customer.lastOrderDate) > 30
    );
    const inactiveVipCustomers = customers.filter((customer) => {
      const tier = customer.customerTier ?? customer.customer_tier ?? customer.status;
      return tier === 'VIP' && customer.customerStatus !== 'Archived' && daysSince(customer.lastOrderDate) > 30;
    });
    const topCustomer = customers.reduce<Customer | null>(
      (best, customer) => (!best || toSafeNumber(customer.totalSpend) > toSafeNumber(best.totalSpend) ? customer : best),
      null
    );

    const activeLeads = salesLeads.filter((lead) => lead.status !== 'Archived');
    const hotLeads = activeLeads.filter(
      (lead) => lead.leadPriority === 'Hot' || lead.leadScore >= 80
    ).length;
    const warmLeads = activeLeads.filter(
      (lead) =>
        !(lead.leadPriority === 'Hot' || lead.leadScore >= 80) &&
        (lead.leadPriority === 'Warm' || (lead.leadScore >= 50 && lead.leadScore < 80))
    ).length;
    const quotationsPending = activeLeads.filter((lead) => lead.status === 'Quoted').length;
    const wonLeads = activeLeads.filter((lead) => lead.status === 'Won').length;
    const needContactToday = activeLeads.filter(
      (lead) => lead.status === 'New' && !lead.lastContactDate
    ).length;
    const followUpToday = activeLeads.filter(
      (lead) => dateKeyFromValue(lead.nextFollowUpDate) === today
    ).length;
    const overdueLeads = activeLeads.filter((lead) => {
      const followUpDate = dateKeyFromValue(lead.nextFollowUpDate);
      return Boolean(followUpDate && followUpDate < today && !['Won', 'Lost'].includes(lead.status));
    }).length;
    const corporatePipelineValue = activeLeads
      .filter((lead) => !['Won', 'Lost'].includes(lead.status))
      .reduce((sum, lead) => sum + toSafeNumber(lead.potentialValue), 0);

    const activeProduction = (kitchenTasks as DashboardKitchenTask[])
      .filter((task) => normalizeKitchenStatus(task.status ?? task.kitchenStatus) !== 'Completed')
      .sort((a, b) =>
        sortableDateTime(
          a.delivery_date ?? a.deliveryDate,
          a.ready_time ?? a.requiredReadyTime ?? a.delivery_time ?? a.deliveryTime
        ).localeCompare(
          sortableDateTime(
            b.delivery_date ?? b.deliveryDate,
            b.ready_time ?? b.requiredReadyTime ?? b.delivery_time ?? b.deliveryTime
          )
        )
      )
      .slice(0, 6);

    const upcomingDeliveries = (deliveryTasks as DashboardDeliveryTask[])
      .filter((task) => normalizeDeliveryStatus(task.status ?? task.deliveryStatus) !== 'Delivered')
      .sort((a, b) =>
        sortableDateTime(a.delivery_date ?? a.deliveryDate, a.delivery_time ?? a.deliveryTime).localeCompare(
          sortableDateTime(b.delivery_date ?? b.deliveryDate, b.delivery_time ?? b.deliveryTime)
        )
      )
      .slice(0, 6);

    const followUpLeadsAll = salesLeads
      .filter((lead) => !['Won', 'Lost', 'Archived'].includes(lead.status))
      .filter((lead) => {
        const dueKey = dateKeyFromValue(lead.nextFollowUpDate);
        return (dueKey && dueKey <= today) || (!lead.lastContactDate && lead.status === 'New');
      })
      .sort((a, b) => {
        const aDue = dateKeyFromValue(a.nextFollowUpDate) || today;
        const bDue = dateKeyFromValue(b.nextFollowUpDate) || today;
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        return b.leadScore - a.leadScore;
      });
    const followUpLeads = followUpLeadsAll.slice(0, 6);
    const readyDeliveryOrders = dashboardOrders.filter(
      (order) => getOrderReadyStatus(order) && order.deliveryStatus !== 'Delivered'
    );
    const completedOrders = dashboardOrders.filter((order) =>
      completedStatuses.includes(getOrderOperationalStatus(order))
    ).length;

    const linkedOrderKeys = (order: Order) =>
      [order.supabaseId, order.id, order.orderNo].filter(Boolean).map((value) => String(value));
    const kitchenTaskKeys = new Set(
      (kitchenTasks as DashboardKitchenTask[]).flatMap((task) =>
        [task.order_id, task.orderId, task.order_no].filter(Boolean).map((value) => String(value))
      )
    );
    const deliveryTaskKeys = new Set(
      (deliveryTasks as DashboardDeliveryTask[]).flatMap((task) =>
        [task.order_id, task.orderId, task.order_no].filter(Boolean).map((value) => String(value))
      )
    );
    const invoiceOrderKeys = new Set(
      dashboardInvoices.flatMap((invoice) =>
        [invoice.order_id].filter(Boolean).map((value) => String(value))
      )
    );
    const operationalActiveOrders = dashboardOrders.filter(
      (order) => !terminalStatuses.includes(getOrderOperationalStatus(order))
    );
    const ordersWithoutInvoice = dashboardOrders.filter((order) => {
      const keys = linkedOrderKeys(order);
      return keys.length > 0 && !keys.some((key) => invoiceOrderKeys.has(key));
    }).length;
    const ordersWithoutKitchenTask = operationalActiveOrders.filter((order) => {
      const keys = linkedOrderKeys(order);
      return keys.length > 0 && !keys.some((key) => kitchenTaskKeys.has(key));
    }).length;
    const ordersWithoutDeliveryTask = operationalActiveOrders.filter((order) => {
      const keys = linkedOrderKeys(order);
      return keys.length > 0 && !keys.some((key) => deliveryTaskKeys.has(key));
    }).length;

    const sevenDayOutlook = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + index);
      const key = format(date, 'yyyy-MM-dd');
      const dayOrders = dashboardOrders.filter((order) => getOrderDeliveryKey(order) === key);
      const dayDeliveries = (deliveryTasks as DashboardDeliveryTask[]).filter(
        (task) => dateKeyFromValue(task.delivery_date ?? task.deliveryDate) === key
      );
      return {
        key,
        label: format(date, 'EEE'),
        dateLabel: format(date, 'dd MMM'),
        orders: dayOrders.length,
        sales: dayOrders.reduce((sum, order) => sum + getOrderAmount(order), 0),
        quantity: dayOrders.reduce((sum, order) => sum + toSafeNumber(order.quantity), 0),
        deliveries: dayDeliveries.length
      };
    });
    const outlookTotals = sevenDayOutlook.reduce(
      (totals, day) => ({
        orders: totals.orders + day.orders,
        sales: totals.sales + day.sales,
        quantity: totals.quantity + day.quantity,
        deliveries: totals.deliveries + day.deliveries
      }),
      { orders: 0, sales: 0, quantity: 0, deliveries: 0 }
    );
    const outlookMaxSales = Math.max(0, ...sevenDayOutlook.map((day) => day.sales));

    const riskItems = [
      {
        id: 'payment-risk',
        label: 'Pending payments',
        count: pendingPaymentOrders.length,
        reason: `${formatDashboardRM(pendingPaymentAmount)} remains uncollected`,
        action: 'Open Orders and follow up payment',
        page: 'orders'
      },
      {
        id: 'kitchen-risk',
        label: 'Kitchen timing',
        count: overdueKitchenCount + dueSoonKitchenCount,
        reason: `${overdueKitchenCount} overdue / ${dueSoonKitchenCount} due within 2 hours`,
        action: 'Re-prioritize the production queue',
        page: 'kitchen'
      },
      {
        id: 'delivery-risk',
        label: 'Delivery timing',
        count: overdueDeliveryCount + dueSoonDeliveryCount,
        reason: `${overdueDeliveryCount} overdue / ${dueSoonDeliveryCount} due within 2 hours`,
        action: 'Confirm driver and handoff timing',
        page: 'delivery'
      },
      {
        id: 'invoice-risk',
        label: 'Orders without invoice',
        count: ordersWithoutInvoice,
        reason: 'Loaded orders not linked to an invoice record',
        action: 'Review invoice generation',
        page: 'invoices'
      },
      {
        id: 'kitchen-link-risk',
        label: 'Orders without kitchen task',
        count: ordersWithoutKitchenTask,
        reason: 'Active orders missing a production task link',
        action: 'Review Kitchen Queue sync',
        page: 'kitchen'
      },
      {
        id: 'delivery-link-risk',
        label: 'Orders without delivery task',
        count: ordersWithoutDeliveryTask,
        reason: 'Active orders missing a delivery task link',
        action: 'Review Delivery Board sync',
        page: 'delivery'
      }
    ];

    const topOpportunities = [
      { id: 'need-contact', label: 'Need contact today', value: needContactToday, hint: 'Start first corporate outreach', page: 'sales-crm' },
      { id: 'follow-up-today', label: 'Follow up today', value: followUpToday, hint: 'Complete scheduled lead contact', page: 'sales-crm' },
      { id: 'overdue-leads', label: 'Overdue leads', value: overdueLeads, hint: 'Recover missed follow-ups', page: 'sales-crm' },
      { id: 'pending-quotes', label: 'Quoted leads pending response', value: quotationsPending, hint: 'Follow up open proposals', page: 'sales-crm' },
      { id: 'repeat-customers', label: 'Repeat customers', value: repeatCustomers.length, hint: 'Offer the next order occasion', page: 'customers' },
      { id: 'inactive-vip', label: 'Inactive VIP customers', value: inactiveVipCustomers.length, hint: 'Re-engage high-value customers', page: 'customers' }
    ];

    const priorityItems = [
      overdueKitchenCount > 0
        ? {
            id: 'overdue-kitchen',
            label: 'Overdue kitchen jobs',
            value: overdueKitchenCount,
            hint: 'Review production timing now',
            page: 'kitchen',
            tone: 'danger' as const
          }
        : null,
      pendingPaymentOrders.length > 0
        ? {
            id: 'pending-payment',
            label: 'Pending payment orders',
            value: pendingPaymentOrders.length,
            hint: `${formatDashboardRM(pendingPaymentAmount)} awaiting payment`,
            page: 'orders',
            tone: 'warning' as const
          }
        : null,
      followUpDueCount > 0
        ? {
            id: 'lead-follow-ups',
            label: 'Lead follow-ups due',
            value: followUpDueCount,
            hint: 'Complete today’s Lead Center follow-ups',
            page: 'sales-crm',
            tone: 'warning' as const
          }
        : null,
      readyDeliveryOrders.length > 0
        ? {
            id: 'ready-delivery',
            label: 'Ready for delivery',
            value: readyDeliveryOrders.length,
            hint: 'Prepare handoff or driver assignment',
            page: 'delivery',
            tone: 'success' as const
          }
        : null,
      followUpLeadsAll.length > 0
        ? {
            id: 'leads-action',
            label: 'Corporate leads need action',
            value: followUpLeadsAll.length,
            hint: 'Open outreach and follow-up queue',
            page: 'sales-crm',
            tone: 'info' as const
          }
        : null,
      quotationsPending > 0
        ? {
            id: 'quotation-action',
            label: 'Pending quotations',
            value: quotationsPending,
            hint: 'Move open proposals toward a decision',
            page: 'quotations',
            tone: 'warning' as const
          }
        : null,
      inactiveVipCustomers.length > 0
        ? {
            id: 'vip-action',
            label: 'Inactive VIP customers',
            value: inactiveVipCustomers.length,
            hint: 'Create a personal repeat-order offer',
            page: 'customers',
            tone: 'info' as const
          }
        : null
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 6);

    return {
      today,
      todaySales: todayOrders.reduce((sum, order) => sum + getOrderAmount(order), 0),
      totalSales: dashboardOrders.reduce((sum, order) => sum + getOrderAmount(order), 0),
      pendingOrders,
      readyForDelivery: dashboardOrders.filter((order) => getOrderReadyStatus(order)).length,
      businessHealth: {
        monthToDateSales,
        pendingPaymentAmount,
        completedOrders,
        averageOrderValue,
        corporatePipelineValue
      },
      activeProduction,
      upcomingDeliveries,
      followUpLeads,
      productionIntelligence: {
        topProductToday,
        topProductWeek,
        topFlavour,
        tomorrowProductionQuantity,
        readyKitchenCount,
        overdueKitchenCount
      },
      salesIntelligence: {
        monthToDateSales,
        averageOrderValue,
        pendingPaymentAmount
      },
      customerIntelligence: {
        repeatCustomers: repeatCustomers.length,
        customersNeedingFollowUp: customersNeedingFollowUp.length,
        topCustomer
      },
      corporateIntelligence: {
        totalLeads: activeLeads.length,
        hotLeads,
        warmLeads,
        quotationsPending,
        wonLeads
      },
      riskItems,
      sevenDayOutlook,
      outlookTotals,
      outlookMaxSales,
      topOpportunities,
      priorityItems
    };
  }, [customers, deliveryTasks, followUpDueCount, invoices, kitchenTasks, orders, salesLeads]);

  const findOrder = (task: DashboardKitchenTask) =>
    orders.filter(isActiveOrder).find((order) => {
      const taskOrderId = String(task.order_id ?? task.orderId ?? '');
      const taskOrderNo = String(task.order_no ?? '');
      return [order.id, order.supabaseId, order.orderNo]
        .filter(Boolean)
        .map(String)
        .some((value) => value === taskOrderId || value === taskOrderNo);
    });

  const isLoading = loading || leadsLoading;

  return (
    <div className="design-linear-page space-y-5 text-[#F8FAFC]">
      <section className="ds-hero relative overflow-hidden px-5 py-6 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="ds-eyebrow">Bakery Operating System</p>
            <h1 className="ds-page-title mt-3">Good Morning, Paul</h1>
            <p className="ds-page-copy mt-2">
              Here is today&apos;s bakery operations overview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 border-l border-[#334155] pl-4">
              <CalendarDays size={17} className="text-[#C8A96B]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Today</p>
                <p className="mt-0.5 text-sm font-medium text-[#E2E8F0]">{format(new Date(), 'EEEE, dd MMMM')}</p>
              </div>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              Source: Supabase
            </span>
          </div>
        </div>
      </section>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Executive Overview</p>
          <h2 className="mt-1 text-base font-semibold text-[#F8FAFC]">Business Health Snapshot</h2>
        </div>
        <p className="hidden text-xs text-[#64748B] sm:block">Live indicators from loaded operating data</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {isLoading ? (
          Array.from({ length: 6 }, (_, index) => <KpiSkeleton key={index} />)
        ) : (
          <>
            <KpiCard
              icon={Banknote}
              label="Today Sales"
              value={formatDashboardRM(analytics.todaySales)}
              note="New order value"
              tone="green"
            />
            <KpiCard
              icon={TrendingUp}
              label="Month-To-Date"
              value={formatDashboardRM(analytics.businessHealth.monthToDateSales)}
              note="Current month"
              tone="gold"
            />
            <KpiCard
              icon={WalletCards}
              label="Pending Payment"
              value={formatDashboardRM(analytics.businessHealth.pendingPaymentAmount)}
              note="Unpaid value"
              tone="amber"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Completed Orders"
              value={analytics.businessHealth.completedOrders}
              note="All completed"
              tone="blue"
            />
            <KpiCard
              icon={CircleDollarSign}
              label="Average Order"
              value={formatDashboardRM(analytics.businessHealth.averageOrderValue)}
              note="Loaded orders"
              tone="green"
            />
            <KpiCard
              icon={BadgeDollarSign}
              label="Pipeline Value"
              value={formatDashboardRM(analytics.businessHealth.corporatePipelineValue)}
              note="Open corporate value"
              tone="gold"
            />
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_16px_40px_rgba(2,6,23,0.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#263348] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-400/10 text-rose-300">
              <TriangleAlert size={16} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Executive Action Center</p>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">Owner Next Actions</h2>
            </div>
          </div>
          <span className="text-xs text-[#64748B]">Maximum 6 actions</span>
        </div>

        {analytics.priorityItems.length > 0 ? (
          <div className="grid divide-y divide-[#263348] md:grid-cols-2 md:divide-x xl:grid-cols-5 xl:divide-y-0">
            {analytics.priorityItems.map((item) => {
              const toneClass = item.tone === 'danger'
                ? 'text-rose-300'
                : item.tone === 'success'
                  ? 'text-emerald-300'
                  : item.tone === 'info'
                    ? 'text-sky-300'
                    : 'text-amber-300';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate?.(item.page)}
                  className="min-w-0 px-4 py-3 text-left transition hover:bg-white/[0.025]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-semibold text-[#E2E8F0]">{item.label}</p>
                    <span className={`text-lg font-semibold ${toneClass}`}>{item.value}</span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-[#64748B]">{item.hint}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-5 text-center text-sm text-[#94A3B8]">
            No urgent actions. The operating queue is clear.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_16px_40px_rgba(2,6,23,0.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#263348] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-400/10 text-rose-300">
              <FileWarning size={16} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Control Tower</p>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">Operations Risk Monitor</h2>
            </div>
          </div>
          <span className="text-xs text-[#64748B]">Click a risk to investigate</span>
        </div>
        <div className="grid divide-y divide-[#263348] sm:grid-cols-2 sm:divide-x xl:grid-cols-3">
          {analytics.riskItems.map((item) => (
            <RiskItem
              key={item.id}
              label={item.label}
              count={item.count}
              reason={item.reason}
              action={item.action}
              onClick={() => onNavigate?.(item.page)}
            />
          ))}
        </div>
      </section>

      <section className="grid items-stretch gap-4 xl:grid-cols-12">
        <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_16px_40px_rgba(2,6,23,0.16)] xl:col-span-8">
          <div className="flex flex-col gap-3 border-b border-[#263348] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]">
                <CalendarRange size={16} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Forward View</p>
                <h2 className="text-sm font-semibold text-[#F8FAFC]">7-Day Bakery Outlook</h2>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-right">
              <div>
                <p className="text-[9px] uppercase text-[#64748B]">Orders</p>
                <p className="text-sm font-semibold text-[#F8FAFC]">{analytics.outlookTotals.orders}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-[#64748B]">Sales</p>
                <p className="text-sm font-semibold text-[#F8FAFC]">{formatDashboardRM(analytics.outlookTotals.sales)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-[#64748B]">Items</p>
                <p className="text-sm font-semibold text-[#F8FAFC]">{analytics.outlookTotals.quantity}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-[#64748B]">Delivery</p>
                <p className="text-sm font-semibold text-[#F8FAFC]">{analytics.outlookTotals.deliveries}</p>
              </div>
            </div>
          </div>

          {analytics.outlookTotals.orders > 0 ? (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
              <div className="grid grid-cols-7 items-end gap-2">
                {analytics.sevenDayOutlook.map((day) => {
                  const height = day.sales > 0 && analytics.outlookMaxSales > 0
                    ? Math.max(8, Math.round((day.sales / analytics.outlookMaxSales) * 100))
                    : 0;
                  return (
                    <div key={day.key} className="flex min-w-0 flex-col items-center">
                      <div className="flex h-28 w-full items-end rounded-md border border-[#263348] bg-[#0F172A] p-1">
                        <div
                          className="w-full rounded bg-[#5e6ad2] transition-[height]"
                          style={{ height: `${height}%` }}
                          title={`${day.dateLabel}: ${formatDashboardRM(day.sales)}`}
                        />
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-[#CBD5E1]">{day.label}</p>
                      <p className="text-[9px] text-[#64748B]">{day.orders} orders</p>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {analytics.sevenDayOutlook.map((day) => (
                  <div key={day.key} className="rounded-md border border-[#263348] bg-[#0F172A] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold text-[#E2E8F0]">{day.dateLabel}</p>
                      <p className="text-[10px] text-[#C8A96B]">{day.quantity} items</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[#F8FAFC]">{formatDashboardRM(day.sales)}</p>
                    <p className="mt-0.5 text-[9px] text-[#64748B]">{day.deliveries} delivery tasks</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyPanel message="No orders scheduled in the next 7 days" />
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_16px_40px_rgba(2,6,23,0.16)] xl:col-span-4">
          <div className="flex items-center gap-3 border-b border-[#263348] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
              <Target size={16} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Growth Desk</p>
              <h2 className="text-sm font-semibold text-[#F8FAFC]">Top Opportunities</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-[#263348]">
            {analytics.topOpportunities.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.(item.page)}
                className="min-w-0 p-3 text-left transition hover:bg-white/[0.025]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">{item.label}</p>
                  <span className="text-base font-semibold text-[#E4C98E]">{item.value}</span>
                </div>
                <p className="mt-2 truncate text-[10px] text-[#94A3B8]">{item.hint}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-12">
        <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_18px_50px_rgba(2,6,23,0.18)] xl:col-span-5">
          <PanelHeader
            icon={ChefHat}
            eyebrow="Kitchen Pulse"
            title="Today Production"
            actionLabel="Open Kitchen"
            onAction={() => onNavigate?.('kitchen')}
          />
          <div className="divide-y divide-[#263348]">
            {analytics.activeProduction.map((task) => {
              const order = findOrder(task);
              const status = normalizeKitchenStatus(task.status ?? task.kitchenStatus);
              const deliveryDate = task.delivery_date ?? task.deliveryDate;
              const readyTime = task.ready_time ?? task.requiredReadyTime;
              return (
                <button
                  key={String(task.id ?? `${task.orderId}-${task.deliveryTime}`)}
                  type="button"
                  onClick={() => onNavigate?.('kitchen')}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition hover:bg-white/[0.025]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#F8FAFC]">
                        {task.order_no || order?.orderNo || task.orderId}
                      </p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(status)}`}>
                        {status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[#94A3B8]">
                      {order?.customerName || task.product || 'Kitchen order'} · {task.quantity || 0} items
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1.5 text-xs font-semibold text-[#E4C98E]">
                      <Clock3 size={12} />
                      {readyTime || 'Ready time pending'}
                    </p>
                    <p className="mt-1 text-[11px] text-[#64748B]">
                      {formatShortDate(deliveryDate)} · {(task.delivery_time ?? task.deliveryTime) || 'Time pending'}
                    </p>
                  </div>
                </button>
              );
            })}
            {!isLoading && analytics.activeProduction.length === 0 && (
              <EmptyPanel message="No active kitchen jobs" />
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_18px_50px_rgba(2,6,23,0.18)] xl:col-span-4">
          <PanelHeader
            icon={Truck}
            eyebrow="Dispatch Desk"
            title="Today Delivery"
            actionLabel="Open Delivery"
            onAction={() => onNavigate?.('delivery')}
          />
          <div className="divide-y divide-[#263348]">
            {analytics.upcomingDeliveries.map((task) => {
              const status = normalizeDeliveryStatus(task.status ?? task.deliveryStatus);
              const deliveryDate = task.delivery_date ?? task.deliveryDate;
              const deliveryTime = task.delivery_time ?? task.deliveryTime;
              const isSelfCollect = (task.driver_type ?? task.driverType) === 'Self Collect';
              const driver = task.driver_name ?? task.driverName;
              return (
                <button
                  key={String(task.id ?? `${task.orderId}-${deliveryTime}`)}
                  type="button"
                  onClick={() => onNavigate?.('delivery')}
                  className="w-full px-4 py-3 text-left transition hover:bg-white/[0.025]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#F8FAFC]">
                        {task.order_no || task.orderId}
                      </p>
                      <p className="mt-1 truncate text-xs text-[#94A3B8]">{task.customerName || 'Customer pending'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(status)}`}>
                      {status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5 text-[#E4C98E]">
                      <CalendarDays size={12} />
                      {formatShortDate(deliveryDate)} · {deliveryTime || 'Time pending'}
                    </span>
                    <span className="truncate text-right text-[#64748B]">
                      {isSelfCollect ? 'Self Collect' : driver || 'Driver unassigned'}
                    </span>
                  </div>
                </button>
              );
            })}
            {!isLoading && analytics.upcomingDeliveries.length === 0 && (
              <EmptyPanel message="No upcoming deliveries" />
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#111827] shadow-[0_18px_50px_rgba(2,6,23,0.18)] xl:col-span-3">
          <PanelHeader
            icon={UserRoundSearch}
            eyebrow="Sales Follow-Up"
            title="Follow-Up CRM"
            actionLabel="Open Leads"
            onAction={() => onNavigate?.('sales-crm')}
          />
          <div className="divide-y divide-[#263348]">
            {analytics.followUpLeads.map((lead) => {
              const followUpKey = dateKeyFromValue(lead.nextFollowUpDate);
              const followUpState = followUpKey && followUpKey < analytics.today
                ? 'Overdue'
                : followUpKey === analytics.today
                  ? 'Today'
                  : 'New';
              return (
                <button
                  key={String(lead.id ?? lead.companyName)}
                  type="button"
                  onClick={() => onNavigate?.('sales-crm')}
                  className="w-full px-4 py-3 text-left transition hover:bg-white/[0.025]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#F8FAFC]">{lead.companyName || 'Unnamed lead'}</p>
                      <p className="mt-1 truncate text-xs text-[#94A3B8]">
                        {lead.contactPerson || lead.leadType} · {lead.area || 'Area pending'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(followUpState)}`}>
                      {followUpState}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-[#64748B]">
                      {lead.nextFollowUpDate ? formatShortDate(lead.nextFollowUpDate) : 'First contact needed'}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[#E4C98E]">
                      <PhoneCall size={11} />
                      {lead.leadPriority}
                    </span>
                  </div>
                </button>
              );
            })}
            {!isLoading && analytics.followUpLeads.length === 0 && (
              <EmptyPanel message="No leads need action today" />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <IntelligencePanel
          icon={ChefHat}
          eyebrow="Production Intelligence"
          title="Bake Demand & Readiness"
          items={[
            {
              label: 'Top Product Today',
              value: analytics.productionIntelligence.topProductToday?.label || 'No orders',
              hint: `${analytics.productionIntelligence.topProductToday?.value || 0} items`
            },
            {
              label: 'Top Product 7D',
              value: analytics.productionIntelligence.topProductWeek?.label || 'No orders',
              hint: `${analytics.productionIntelligence.topProductWeek?.value || 0} items`
            },
            {
              label: 'Top Flavour 7D',
              value: analytics.productionIntelligence.topFlavour?.label || 'No flavour data',
              hint: `${analytics.productionIntelligence.topFlavour?.value || 0} selected`
            },
            {
              label: 'Tomorrow Quantity',
              value: analytics.productionIntelligence.tomorrowProductionQuantity,
              hint: 'Items due tomorrow'
            },
            {
              label: 'Kitchen Ready',
              value: analytics.productionIntelligence.readyKitchenCount,
              hint: 'Awaiting handoff'
            },
            {
              label: 'Kitchen Overdue',
              value: analytics.productionIntelligence.overdueKitchenCount,
              hint: 'Needs production review'
            }
          ]}
        />

        <IntelligencePanel
          icon={TrendingUp}
          eyebrow="Sales Intelligence"
          title="Revenue & Order Value"
          items={[
            {
              label: 'Today Sales',
              value: formatDashboardRM(analytics.todaySales),
              hint: 'Orders created today'
            },
            {
              label: 'Month To Date',
              value: formatDashboardRM(analytics.salesIntelligence.monthToDateSales),
              hint: 'Current calendar month'
            },
            {
              label: 'Average Order',
              value: formatDashboardRM(analytics.salesIntelligence.averageOrderValue),
              hint: 'Across loaded orders'
            },
            {
              label: 'Pending Payment',
              value: formatDashboardRM(analytics.salesIntelligence.pendingPaymentAmount),
              hint: 'Unpaid order value'
            }
          ]}
        />

        <IntelligencePanel
          icon={UsersRound}
          eyebrow="Customer Intelligence"
          title="Retention & Customer Value"
          items={[
            {
              label: 'Total Customers',
              value: customers.length,
              hint: 'CRM records'
            },
            {
              label: 'Repeat Customers',
              value: analytics.customerIntelligence.repeatCustomers,
              hint: 'More than one order'
            },
            {
              label: 'Need Follow-Up',
              value: analytics.customerIntelligence.customersNeedingFollowUp,
              hint: 'Inactive over 30 days'
            },
            {
              label: 'Top Customer',
              value: analytics.customerIntelligence.topCustomer?.name || 'No customer data',
              hint: formatDashboardRM(analytics.customerIntelligence.topCustomer?.totalSpend || 0)
            }
          ]}
        />

        <IntelligencePanel
          icon={BarChart3}
          eyebrow="Corporate Pipeline"
          title="Lead Quality & Conversion"
          items={[
            {
              label: 'Lead Center',
              value: analytics.corporateIntelligence.totalLeads,
              hint: 'Excluding archived'
            },
            {
              label: 'Hot Leads',
              value: analytics.corporateIntelligence.hotLeads,
              hint: 'Priority or score 80+'
            },
            {
              label: 'Warm Leads',
              value: analytics.corporateIntelligence.warmLeads,
              hint: 'Score 50 to 79'
            },
            {
              label: 'Quotes Pending',
              value: analytics.corporateIntelligence.quotationsPending,
              hint: 'Leads in Quoted stage'
            },
            {
              label: 'Won Leads',
              value: analytics.corporateIntelligence.wonLeads,
              hint: 'Closed opportunities'
            },
            {
              label: 'Pipeline Signal',
              value: analytics.corporateIntelligence.hotLeads > 0 ? 'Active' : 'Build',
              hint: analytics.corporateIntelligence.hotLeads > 0 ? 'Hot leads available' : 'Develop new prospects'
            }
          ]}
        />
      </section>
    </div>
  );
}
