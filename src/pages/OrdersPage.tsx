import React, { useEffect, useMemo, useState } from 'react';
import type { Customer, Order, Product } from '../data/mockData';
import AddOrderModal from './AddOrderModal';
import EditOrderModal from './EditOrderModal';
import InvoiceModal from '../components/InvoiceModal';
import LuxuryInvoicePreviewModal from '../components/LuxuryInvoicePreviewModal';
import Toast from '../components/Toast';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';
import { isActiveOrder } from '../utils/orderLifecycle';
import { formatRM } from '../utils/pricing';
import { generateInvoiceForOrder, loadInvoicesFromSupabase, type InvoiceRecord } from '../services/invoiceService';
import type { OrderOperationalWorkflowResult } from '../services/orderService';

type OrdersPageProps = {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  orderSource: 'Supabase' | 'localStorage';
  orderError?: string;
  onAddOrder: (order: Order) => void | OrderOperationalWorkflowResult | Promise<void | OrderOperationalWorkflowResult>;
  onUpdateOrder: (order: Order) => void | Promise<void>;
  onMarkOrderPaid: (orderId: string | number) => void | Promise<void>;
  onDeleteOrder: (order: Order) => void | Promise<void>;
};

const badgeClass = (status: string) => {
  if (status === 'Paid') return 'bg-emerald-500/10 text-emerald-200';
  if (status === 'Pending') return 'bg-amber-500/10 text-amber-200';
  if (status === 'Overdue') return 'bg-rose-500/10 text-rose-200';
  if (status === 'Ready') return 'bg-emerald-500/10 text-emerald-200';
  if (status === 'Preparing') return 'bg-sky-500/10 text-sky-200';
  if (status === 'Assigned' || status === 'Out for Delivery') return 'bg-indigo-500/10 text-indigo-200';
  return 'bg-white/5 text-cream';
};

type PipelineFilter = 'All' | 'Pending Payment' | 'Confirmed' | 'In Kitchen' | 'Ready' | 'Delivery' | 'Completed';
type OrdersViewMode = 'active' | 'all';
type OrderWithTimestamps = Order & {
  createdAt?: string;
  created_at?: string;
};

type OrderWithRawItems = Order & {
  flavour_quantities?: Order['flavourQuantities'] | string | null;
  items?: { name?: string; product?: string; quantity?: number | string; qty?: number | string }[] | string | null;
};

const getTodayDateString = () => getMalaysiaDateTimeInputs().date;

const getTomorrowDateString = (today: string) => {
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return tomorrow.toISOString().slice(0, 10);
};

const normalizeStatusValue = (value: unknown) => String(value ?? '').trim().toLowerCase();

export const isOrderCompleted = (order: Order) => {
  const completedValues = new Set(['completed', 'complete']);
  const workflowStatus = normalizeStatusValue(order.workflowStatus);
  const deliveryStatus = normalizeStatusValue(order.deliveryStatus);

  return completedValues.has(workflowStatus)
    || completedValues.has(deliveryStatus)
    || deliveryStatus === 'delivered'
    || deliveryStatus === 'collected';
};

const isTerminalOrder = (order: Order) =>
  isOrderCompleted(order) || ['cancelled', 'canceled'].includes(normalizeStatusValue(order.workflowStatus));

const getDeliverySortValue = (order: Order) => {
  if (!order.deliveryDate || !order.deliveryTime) return Number.POSITIVE_INFINITY;
  const parsed = new Date(`${order.deliveryDate} ${order.deliveryTime}`).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const getCreatedSortValue = (order: OrderWithTimestamps) => {
  const rawCreatedAt = order.createdAt || order.created_at || order.statusHistory?.[0]?.timestamp || '';
  const parsed = new Date(rawCreatedAt.replace(' ', 'T')).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const priorityBadgesForOrder = (order: Order, today: string) => {
  if (isOrderCompleted(order)) return ['Completed'];

  const badges: string[] = [];
  if (order.deliveryDate === today) badges.push('Today');
  if (order.paymentStatus !== 'Paid') badges.push('Payment Pending');
  if (order.kitchenStatus !== 'Ready') badges.push('Kitchen Pending');
  return badges;
};

const priorityBadgeClass = (label: string) => {
  if (label === 'Completed') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (label === 'Today') return 'border-gold/30 bg-gold/15 text-softGold';
  if (label === 'Payment Pending') return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  return 'border-sky-500/20 bg-sky-500/10 text-sky-200';
};

const pipelineFilters: PipelineFilter[] = ['All', 'Pending Payment', 'Confirmed', 'In Kitchen', 'Ready', 'Delivery', 'Completed'];

const getPipelineStatus = (order: Order): PipelineFilter => {
  if (isOrderCompleted(order)) return 'Completed';
  if (order.deliveryStatus === 'Assigned' || order.deliveryStatus === 'Out for Delivery' || order.workflowStatus === 'Out For Delivery') return 'Delivery';
  if (order.kitchenStatus === 'Ready' || order.workflowStatus === 'Ready') return 'Ready';
  if (order.kitchenStatus === 'Preparing' || order.workflowStatus === 'Preparing') return 'In Kitchen';
  if (order.paymentStatus === 'Paid' || order.workflowStatus === 'Paid') return 'Confirmed';
  return 'Pending Payment';
};

const matchesPipelineFilter = (order: Order, filter: PipelineFilter) =>
  filter === 'All' || getPipelineStatus(order) === filter;

const getOrderNo = (order: Order) => order.orderNo || order.id;

export default function OrdersPage({ orders, products, customers, orderSource, orderError = '', onAddOrder, onUpdateOrder, onMarkOrderPaid, onDeleteOrder }: OrdersPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [previewInvoiceOrderId, setPreviewInvoiceOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoiceLoadingOrderId, setInvoiceLoadingOrderId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('All');
  const [viewMode, setViewMode] = useState<OrdersViewMode>('active');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [moreActionsOrderId, setMoreActionsOrderId] = useState<string | null>(null);

  const workflowStages = ['New Order', 'Pending Payment', 'Paid', 'Preparing', 'Ready', 'Out For Delivery', 'Completed', 'Cancelled'] as const;

  const reloadInvoices = async () => {
    try {
      const data = await loadInvoicesFromSupabase();
      setInvoices(data as InvoiceRecord[]);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    }
  };

  useEffect(() => {
    reloadInvoices();
  }, []);

  const workflowNextStatus = (status: Order['workflowStatus']) => {
    switch (status) {
      case 'New Order':
        return 'Pending Payment';
      case 'Pending Payment':
        return 'Paid';
      case 'Paid':
        return 'Preparing';
      case 'Preparing':
        return 'Ready';
      case 'Ready':
        return 'Out For Delivery';
      case 'Out For Delivery':
        return 'Completed';
      default:
        return status;
    }
  };

  const workflowBadgeClass = (status: string) => {
    if (status === 'New Order' || status === 'Pending Payment') return 'bg-amber-500/10 text-amber-200';
    if (status === 'Paid') return 'bg-emerald-500/10 text-emerald-200';
    if (status === 'Preparing') return 'bg-sky-500/10 text-sky-200';
    if (status === 'Ready') return 'bg-emerald-500/10 text-emerald-200';
    if (status === 'Out For Delivery') return 'bg-indigo-500/10 text-indigo-200';
    if (status === 'Completed') return 'bg-emerald-500/10 text-emerald-200';
    if (status === 'Cancelled') return 'bg-rose-500/10 text-rose-200';
    return 'bg-white/5 text-cream';
  };

  const todayDate = useMemo(() => getTodayDateString(), []);
  const tomorrowDate = useMemo(() => getTomorrowDateString(todayDate), [todayDate]);
  const activeOrders = useMemo(() => orders.filter(isActiveOrder), [orders]);

  const searchAndProductFilteredOrders = useMemo(() => {
    return activeOrders.filter((order) => {
      const matchesSearch = [order.id, order.orderNo, order.customerName, order.phone, order.product, order.address]
        .join(' ').toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesProduct = productFilter === 'All' || order.product === productFilter;
      return matchesSearch && matchesProduct;
    });
  }, [activeOrders, searchTerm, productFilter]);

  const baseFilteredOrders = useMemo(
    () => searchAndProductFilteredOrders.filter((order) => matchesPipelineFilter(order, pipelineFilter)),
    [searchAndProductFilteredOrders, pipelineFilter]
  );

  const pipelineCounts = useMemo(() => {
    return pipelineFilters.reduce<Record<PipelineFilter, number>>((counts, filter) => {
      counts[filter] = filter === 'All'
        ? searchAndProductFilteredOrders.length
        : searchAndProductFilteredOrders.filter((order) => getPipelineStatus(order) === filter).length;
      return counts;
    }, {
      All: 0,
      'Pending Payment': 0,
      Confirmed: 0,
      'In Kitchen': 0,
      Ready: 0,
      Delivery: 0,
      Completed: 0
    });
  }, [searchAndProductFilteredOrders]);

  const filteredOrders = useMemo(() => {
    return [...baseFilteredOrders]
      .sort((first, second) => {
        const dateComparison = String(second.deliveryDate || '').localeCompare(String(first.deliveryDate || ''));
        if (dateComparison !== 0) return dateComparison;
        const timeComparison = String(second.deliveryTime || '').localeCompare(String(first.deliveryTime || ''));
        if (timeComparison !== 0) return timeComparison;
        return getCreatedSortValue(second as OrderWithTimestamps) - getCreatedSortValue(first as OrderWithTimestamps);
      });
  }, [baseFilteredOrders]);

  const orderStats = useMemo(() => {
    const operationalOrders = activeOrders.filter((order) => !isTerminalOrder(order));
    const todayOrders = operationalOrders.filter((order) => order.deliveryDate === todayDate);
    const upcomingOrders = operationalOrders.filter((order) => order.deliveryDate > todayDate);
    const overdueOrders = operationalOrders.filter((order) => Boolean(order.deliveryDate) && order.deliveryDate < todayDate);

    return {
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0),
      needPayment: operationalOrders.filter((order) => order.paymentStatus !== 'Paid').length,
      needKitchen: operationalOrders.filter((order) => order.kitchenStatus !== 'Ready' && order.kitchenStatus !== 'Completed').length,
      needDelivery: operationalOrders.filter((order) => order.kitchenStatus === 'Ready' && order.deliveryStatus !== 'Delivered').length,
      overdueOrders: overdueOrders.length,
      upcomingOrders: upcomingOrders.length,
    };
  }, [activeOrders, todayDate]);

  const activeDisplayOrders = useMemo(() => {
    return searchAndProductFilteredOrders
      .filter((order) => !isTerminalOrder(order))
      .sort((first, second) => {
        const firstDelivery = getDeliverySortValue(first);
        const secondDelivery = getDeliverySortValue(second);
        if (firstDelivery !== secondDelivery) {
          if (!Number.isFinite(firstDelivery)) return 1;
          if (!Number.isFinite(secondDelivery)) return -1;
          return firstDelivery - secondDelivery;
        }
        return getCreatedSortValue(second as OrderWithTimestamps) - getCreatedSortValue(first as OrderWithTimestamps);
      });
  }, [searchAndProductFilteredOrders]);

  const activeOrderGroups = useMemo(() => ({
    overdue: activeDisplayOrders.filter((order) => Boolean(order.deliveryDate) && order.deliveryDate < todayDate),
    today: activeDisplayOrders.filter((order) => order.deliveryDate === todayDate),
    tomorrow: activeDisplayOrders.filter((order) => order.deliveryDate === tomorrowDate),
    upcoming: activeDisplayOrders.filter((order) => order.deliveryDate > tomorrowDate),
    unscheduled: activeDisplayOrders.filter((order) => !order.deliveryDate),
  }), [activeDisplayOrders, todayDate, tomorrowDate]);

  const completedDisplayOrders = useMemo(
    () => searchAndProductFilteredOrders
      .filter(isOrderCompleted)
      .sort((first, second) => {
        const dateComparison = String(second.deliveryDate || '').localeCompare(String(first.deliveryDate || ''));
        return dateComparison || getCreatedSortValue(second as OrderWithTimestamps) - getCreatedSortValue(first as OrderWithTimestamps);
      }),
    [searchAndProductFilteredOrders]
  );

  const handleMarkPaid = async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    try {
      await onMarkOrderPaid(order.supabaseId || order.id);
      await reloadInvoices();
      setToast({ message: `${order.orderNo || order.id} marked as paid.`, type: 'success' });
    } catch (error) {
      console.error('Mark paid error:', error);
      const message = error instanceof Error ? error.message : 'Failed to mark order paid.';
      setToast({ message, type: 'error' });
    }
  };

  const handleSendKitchen = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    onUpdateOrder({
      ...order,
      kitchenStatus: 'Preparing',
      workflowStatus: order.workflowStatus === 'Paid' ? 'Preparing' : order.workflowStatus
    });
  };

  const handleAssignDriver = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    onUpdateOrder({ ...order, deliveryStatus: 'Assigned' });
  };

  const getTimestamp = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const advanceWorkflow = async (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
      const nextStatus = workflowNextStatus(order.workflowStatus);
      if (nextStatus === order.workflowStatus) return;
      if (nextStatus === 'Paid') {
        await handleMarkPaid(orderId);
        return;
      }
      const updatedOrder: Order = {
        ...order,
        workflowStatus: nextStatus,
        statusHistory: [...order.statusHistory, { status: nextStatus, timestamp: getTimestamp() }]
      };

      if (nextStatus === 'Preparing') {
        updatedOrder.kitchenStatus = 'Preparing';
      }
      if (nextStatus === 'Ready') {
        updatedOrder.kitchenStatus = 'Ready';
      }
      if (nextStatus === 'Out For Delivery') {
        updatedOrder.deliveryStatus = 'Out for Delivery';
      }
      if (nextStatus === 'Completed') {
        updatedOrder.deliveryStatus = 'Delivered';
      }

      await onUpdateOrder(updatedOrder);
  };

  const cancelWorkflow = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    onUpdateOrder({
      ...order,
      workflowStatus: 'Cancelled',
      statusHistory: [...order.statusHistory, { status: 'Cancelled', timestamp: getTimestamp() }]
    });
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!window.confirm(`Delete order ${order.id}?`)) return;
    try {
      await onDeleteOrder(order);
      await reloadInvoices();
      setToast({ message: `${getOrderNo(order)} deleted successfully.`, type: 'success' });
    } catch (error) {
      console.error('Delete order error:', error);
      setToast({ message: 'Failed to delete order.', type: 'error' });
    }
  };

  const handleSaveEditedOrder = async (updatedOrder: Order) => {
    try {
      await onUpdateOrder(updatedOrder);
      setEditingOrderId(null);
      setToast({ message: 'Order updated successfully', type: 'success' });
    } catch (error) {
      console.error('Failed to update order:', error);
      setToast({ message: 'Failed to update order', type: 'error' });
      throw error;
    }
  };

  const getOrderNumericId = (order: Order) => {
    const numeric = Number(order.supabaseId || order.id);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const getInvoiceForOrderCard = (order: Order) => {
    const orderId = getOrderNumericId(order);
    if (!orderId) return null;
    return invoices.find((invoice) => String(invoice.order_id) === String(orderId)) || null;
  };

  const handleGenerateInvoice = async (order: Order, regenerate = false) => {
    setInvoiceLoadingOrderId(order.id);
    try {
      const invoice = await generateInvoiceForOrder(order, { regenerate });
      await reloadInvoices();
      setPreviewInvoiceOrderId(order.id);
      setToast({ message: regenerate ? 'Invoice regenerated' : 'Invoice generated', type: 'success' });
      return invoice;
    } catch (error) {
      console.error('Invoice generation error:', error);
      setToast({ message: 'Failed to generate invoice', type: 'error' });
      return null;
    } finally {
      setInvoiceLoadingOrderId('');
    }
  };

  const handleDownloadInvoice = (order: Order) => {
    setPreviewInvoiceOrderId(order.id);
    window.setTimeout(() => window.print(), 200);
  };

  const normalizeMalaysiaPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('60')) return digits;
    if (digits.startsWith('0')) return `6${digits}`;
    return digits;
  };

  const parseOrderItems = (value: OrderWithRawItems['flavour_quantities'] | OrderWithRawItems['items']) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/"/g, '')
        .split(',')
        .map((item: string) => item.trim())
        .filter(Boolean)
        .map((name: string) => ({ name }));
    }
  };

  const formatOrderItemsList = (order: Order) => {
    const rawOrder = order as OrderWithRawItems;
    const structuredItems = [
      ...parseOrderItems(order.flavourQuantities),
      ...parseOrderItems(rawOrder.flavour_quantities),
      ...parseOrderItems(rawOrder.items)
    ];

    const itemLines = structuredItems
      .map((item) => {
        const name = String(item.name || item.product || '').trim();
        if (!name) return '';
        const quantity = Number(item.quantity ?? item.qty ?? 0);
        const displayQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        return `- ${name} x ${displayQuantity}`;
      })
      .filter(Boolean);

    if (itemLines.length) return itemLines.join('\n');

    const flavours = Array.isArray(order.flavours) ? order.flavours.filter(Boolean) : [];
    if (flavours.length) {
      const quantityPerFlavour = flavours.length > 1 && order.quantity > 0
        ? Math.floor(order.quantity / flavours.length)
        : order.quantity;
      return flavours.map((flavour) => `- ${flavour} x ${quantityPerFlavour || 1}`).join('\n');
    }

    return `- ${order.product} x ${order.quantity || 1}`;
  };

  const formatDeliveryAddress = (order: Order) => {
    const address = String(order.address || '').trim();
    if (!address) return 'To be confirmed';
    if (/self\s*collect|pickup|pick\s*up|collection/i.test(address)) return 'Self Collect';
    return address;
  };

  const getShortAddress = (order: Order) => {
    const address = formatDeliveryAddress(order);
    return address.length > 76 ? `${address.slice(0, 76)}...` : address;
  };

  const getProductSummary = (order: Order) => {
    const flavours = Array.isArray(order.flavours) ? order.flavours.filter(Boolean) : [];
    if (!flavours.length) return `${order.product} x ${order.quantity || 1}`;
    const visibleFlavours = flavours.slice(0, 2).join(', ');
    const extraCount = flavours.length > 2 ? ` +${flavours.length - 2}` : '';
    return `${order.product} x ${order.quantity || 1} - ${visibleFlavours}${extraCount}`;
  };

  const renderOrderCard = (order: Order, compact = false) => {
    const invoice = getInvoiceForOrderCard(order);
    const invoiceGenerated = Boolean(invoice);
    const invoiceBusy = invoiceLoadingOrderId === order.id;
    const pipelineStatus = getPipelineStatus(order);
    const moreActionsOpen = moreActionsOrderId === order.id;

    return (
      <article
        key={order.id}
        className="flex min-h-full flex-col rounded-[22px] border border-[#334155] bg-[#111111] p-4 text-sm text-slate-300 shadow-panel transition hover:border-[#C8A96B]/40 hover:bg-[#141414]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">{getOrderNo(order)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{order.customerName || 'Customer'} - {order.phone || 'No phone'}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${workflowBadgeClass(order.workflowStatus)}`}>
            {pipelineStatus}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Order Value</p>
            <p className="mt-1 text-xl font-semibold text-[#C8A96B]">{formatRM(order.totalAmount)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass(order.paymentStatus)}`}>{order.paymentStatus}</span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass(order.kitchenStatus)}`}>{order.kitchenStatus}</span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass(order.deliveryStatus)}`}>{order.deliveryStatus}</span>
          </div>
        </div>

        <div className="mt-4 rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
          <p className="truncate font-semibold text-white">{getProductSummary(order)}</p>
          <p className="mt-2 text-xs text-slate-400">{order.deliveryDate || 'No date'} / {order.deliveryTime || 'No time'}</p>
          <p className="mt-2 truncate text-xs text-slate-500">{getShortAddress(order)}</p>
        </div>

        {!compact && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {priorityBadgesForOrder(order, todayDate).map((badge) => (
              <span key={badge} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityBadgeClass(badge)}`}>
                {badge}
              </span>
            ))}
            {invoiceGenerated && <span className="inline-flex rounded-full border border-[#C8A96B]/25 bg-[#C8A96B]/10 px-2.5 py-1 text-[11px] font-semibold text-[#C8A96B]">Invoice Generated</span>}
          </div>
        )}

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#334155] pt-4 sm:grid-cols-4">
          {!invoiceGenerated ? (
            <button onClick={() => handleGenerateInvoice(order)} disabled={invoiceBusy} className="rounded-xl bg-[#C8A96B]/15 px-3 py-2 text-xs font-semibold text-[#E4C98E] transition hover:bg-[#C8A96B]/25 disabled:opacity-50">
              {invoiceBusy ? 'Generating' : 'Invoice'}
            </button>
          ) : (
            <button onClick={() => setPreviewInvoiceOrderId(order.id)} className="rounded-xl bg-[#C8A96B]/15 px-3 py-2 text-xs font-semibold text-[#E4C98E] transition hover:bg-[#C8A96B]/25">Invoice</button>
          )}
          <button onClick={() => setSelectedOrderId(order.id)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Workflow</button>
          <button onClick={() => handleSendInvoiceWhatsApp(order, invoice)} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
          <button
            type="button"
            onClick={() => setMoreActionsOrderId((current) => current === order.id ? null : order.id)}
            className="rounded-xl border border-[#334155] bg-[#0F172A] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/40 hover:text-white"
            aria-expanded={moreActionsOpen}
          >
            {moreActionsOpen ? 'Hide Actions' : 'More Actions'}
          </button>
        </div>

        {moreActionsOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-[14px] border border-[#334155] bg-[#0F172A] p-2 sm:grid-cols-5">
            <button onClick={() => handleMarkPaid(order.id)} disabled={order.paymentStatus === 'Paid'} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50">Mark Paid</button>
            <button onClick={() => handleSendKitchen(order.id)} className="rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20">Send Kitchen</button>
            <button onClick={() => handleAssignDriver(order.id)} className="rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20">Assign Driver</button>
            <button onClick={() => setEditingOrderId(order.id)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Edit</button>
            <button onClick={() => handleDeleteOrder(order)} className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20">Delete</button>
          </div>
        )}
      </article>
    );
  };

  const buildOrderWhatsAppMessage = (order: Order) => {
    const orderNo = order.orderNo || order.id;
    return `Hi ${order.customerName}, thank you for your order with Layer By Layer Bakery 😊

Here are your order details:

Order No: ${orderNo}

Items:
${formatOrderItemsList(order)}

Delivery / Collection:
Date: ${order.deliveryDate || 'To be confirmed'}
Time: ${order.deliveryTime || 'To be confirmed'}
Address: ${formatDeliveryAddress(order)}

Total Amount: ${formatRM(order.totalAmount)}

Payment Details:
Layer By Layer Bakery
Maybank
5145 8954 8255

Kindly send us the payment receipt once payment has been made.
Thank you 😊`;
  };

  const handleSendInvoiceWhatsApp = (order: Order, _invoice: InvoiceRecord | null) => {
    const phone = normalizeMalaysiaPhone(order.phone);
    if (!phone) {
      setToast({ message: 'Phone number missing', type: 'error' });
      return;
    }
    const message = buildOrderWhatsAppMessage(order);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#C8A96B]">Daily Operations</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Orders Command Center</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage daily bakery orders, payment, kitchen and delivery flow.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-[#334155] bg-[#0F172A] p-1">
              <button
                type="button"
                onClick={() => {
                  setViewMode('active');
                  setPipelineFilter('All');
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  viewMode === 'active' ? 'bg-[#C8A96B] text-[#111111]' : 'text-slate-400 hover:text-white'
                }`}
              >
                Active Orders
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  viewMode === 'all' ? 'bg-[#C8A96B] text-[#111111]' : 'text-slate-400 hover:text-white'
                }`}
              >
                View All Orders
              </button>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="rounded-xl bg-[#C8A96B] px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#d6b77d]">
              Add New Order
            </button>
            <span className="rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E]">Source: {orderSource}</span>
          </div>
        </div>
      </section>

      {orderError && (
        <section className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 p-4 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-rose-200">Supabase orders error</p>
          <p className="mt-3 text-sm leading-6 text-rose-100">{orderError}</p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {[
          ['Today Orders', orderStats.todayOrders, 'Due today', 'text-white'],
          ['Today Revenue', formatRM(orderStats.todayRevenue), 'Today order value', 'text-[#E4C98E]'],
          ['Need Payment', orderStats.needPayment, 'Payment follow-up', 'text-amber-200'],
          ['Need Kitchen', orderStats.needKitchen, 'Production not ready', 'text-sky-200'],
          ['Need Delivery', orderStats.needDelivery, 'Ready for handover', 'text-emerald-200'],
          ['Overdue Orders', orderStats.overdueOrders, 'Past due and open', 'text-rose-200'],
          ['Upcoming Orders', orderStats.upcomingOrders, 'Due after today', 'text-indigo-200'],
        ].map(([label, value, note, valueClass]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel transition hover:border-[#C8A96B]/40">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[1.5fr_0.7fr]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">Search Orders</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Customer, phone, product, order ID"
              className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#C8A96B]/50"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">Product</label>
            <select
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-4 text-sm text-white outline-none transition focus:border-[#C8A96B]/50"
            >
              <option>All</option>
              <option>Mini Tart</option>
              <option>Croissant Egg Tart</option>
            </select>
          </div>
        </div>
      </section>

      {viewMode === 'all' && (
        <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-2.5 shadow-panel">
          <div className="flex flex-wrap gap-2">
            {pipelineFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPipelineFilter(filter)}
                className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                  pipelineFilter === filter
                    ? 'border-[#C8A96B]/70 bg-[#C8A96B] text-[#111111]'
                    : 'border-[#334155] bg-[#0F172A] text-slate-300 hover:border-[#C8A96B]/40 hover:text-white'
                }`}
              >
                {filter} <span className={pipelineFilter === filter ? 'text-[#111111]/70' : 'text-[#C8A96B]'}>{pipelineCounts[filter]}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {viewMode === 'active' ? (
        <>
          {[
            {
              key: 'overdue',
              title: 'Overdue Orders',
              note: 'Past delivery date and still requires action.',
              orders: activeOrderGroups.overdue,
              empty: 'No overdue orders.',
              accent: 'text-rose-300',
            },
            {
              key: 'today',
              title: "Today's Orders",
              note: 'Orders that must be handled today.',
              orders: activeOrderGroups.today,
              empty: 'No active orders for today.',
              accent: 'text-[#E4C98E]',
            },
            {
              key: 'tomorrow',
              title: 'Tomorrow',
              note: 'Prepare payment, kitchen and delivery handoff early.',
              orders: activeOrderGroups.tomorrow,
              empty: 'No orders scheduled for tomorrow.',
              accent: 'text-sky-300',
            },
            {
              key: 'upcoming',
              title: 'Upcoming Orders',
              note: 'Future orders after tomorrow.',
              orders: activeOrderGroups.upcoming,
              empty: 'No upcoming orders.',
              accent: 'text-indigo-300',
            },
            ...(activeOrderGroups.unscheduled.length > 0 ? [{
              key: 'unscheduled',
              title: 'Needs Scheduling',
              note: 'Open orders missing a delivery date.',
              orders: activeOrderGroups.unscheduled,
              empty: '',
              accent: 'text-amber-300',
            }] : []),
          ].map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-end justify-between gap-3 border-b border-[#334155] pb-2">
                <div>
                  <h4 className={`text-lg font-semibold ${group.accent}`}>{group.title}</h4>
                  <p className="mt-1 text-xs text-slate-500">{group.note}</p>
                </div>
                <span className="rounded-full border border-[#334155] bg-[#111111] px-3 py-1 text-xs font-semibold text-slate-300">
                  {group.orders.length}
                </span>
              </div>
              {group.orders.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {group.orders.map((order) => renderOrderCard(order))}
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#111111] px-5 py-6 text-center text-sm text-slate-500">
                  {group.empty}
                </div>
              )}
            </section>
          ))}

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <button
              type="button"
              onClick={() => setCompletedOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]"
              aria-expanded={completedOpen}
            >
              <div>
                <p className="font-semibold text-white">Completed Orders ({completedDisplayOrders.length})</p>
                <p className="mt-1 text-xs text-slate-500">Recent completed orders stay hidden until needed.</p>
              </div>
              <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-semibold text-[#6EE7B7]">
                {completedOpen ? 'Collapse' : 'Expand'}
              </span>
            </button>
            {completedOpen && (
              <div className="grid gap-3 border-t border-[#334155] p-3.5 lg:grid-cols-2 2xl:grid-cols-3">
                {completedDisplayOrders.length > 0 ? completedDisplayOrders.slice(0, 12).map((order) => renderOrderCard(order, true)) : (
                  <div className="rounded-[18px] border border-dashed border-[#334155] bg-[#0F172A] p-8 text-center text-sm text-slate-500 lg:col-span-2 2xl:col-span-3">
                    No completed orders.
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredOrders.map((order) => renderOrderCard(order))}
          {filteredOrders.length === 0 && (
            <div className="rounded-[18px] border border-dashed border-[#334155] bg-[#111111] p-7 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C8A96B]">No Orders Found</p>
              <h4 className="mt-3 text-xl font-semibold text-white">No orders match this history view.</h4>
              <p className="mt-2">Adjust the search, product or pipeline filter.</p>
            </div>
          )}
        </section>
      )}

      <AddOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddOrder={onAddOrder}
        products={products}
        customers={customers}
        existingOrders={orders}
      />
      {editingOrderId && orders.find((order) => order.id === editingOrderId) && (
        <EditOrderModal
          order={orders.find((order) => order.id === editingOrderId)!}
          products={products}
          onClose={() => setEditingOrderId(null)}
          onSave={handleSaveEditedOrder}
        />
      )}
      {selectedOrderId && (
        <div className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">Workflow Progress</h3>
              <p className="mt-2 text-sm text-slate-400">Track selected order status, history and timestamps.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => advanceWorkflow(selectedOrderId)}
                disabled={orders.find((order) => order.id === selectedOrderId)?.workflowStatus === 'Completed' || orders.find((order) => order.id === selectedOrderId)?.workflowStatus === 'Cancelled'}
                className="rounded-3xl bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Advance Workflow
              </button>
              <button
                type="button"
                onClick={() => cancelWorkflow(selectedOrderId)}
                disabled={orders.find((order) => order.id === selectedOrderId)?.workflowStatus === 'Completed' || orders.find((order) => order.id === selectedOrderId)?.workflowStatus === 'Cancelled'}
                className="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel Order
              </button>
            </div>
          </div>
          {(() => {
            const selectedOrder = orders.find((order) => order.id === selectedOrderId);
            if (!selectedOrder) return null;
            const currentIndex = workflowStages.indexOf(selectedOrder.workflowStatus);
            return (
              <div className="space-y-6">
                <div className="rounded-[28px] bg-[#0f0f0f] p-5">
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-400">
                    {workflowStages.map((stage, index) => (
                      <div key={stage} className="flex-1 min-w-[130px]">
                        <div className={`rounded-full px-3 py-2 text-center text-xs font-semibold ${index <= currentIndex ? 'bg-gold text-charcoal' : 'bg-white/5 text-slate-400'}`}>
                          {stage}
                        </div>
                        {index < workflowStages.length - 1 && (
                          <div className={`mx-auto mt-2 h-1 w-full ${index < currentIndex ? 'bg-gold' : 'bg-white/10'}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-softGold">Current Status</p>
                    <div className={`mt-4 inline-flex rounded-full px-4 py-2 text-sm font-semibold ${workflowBadgeClass(selectedOrder.workflowStatus)}`}>
                      {selectedOrder.workflowStatus}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-softGold">Workflow History</p>
                    <div className="mt-4 space-y-3">
                      {selectedOrder.statusHistory.map((entry) => (
                        <div key={`${entry.status}-${entry.timestamp}`} className="rounded-3xl border border-white/10 bg-[#121212] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-white">{entry.status}</span>
                            <span className="text-xs text-slate-400">{entry.timestamp}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {invoiceOrderId && orders.find((order) => order.id === invoiceOrderId) && (
        <InvoiceModal
          order={orders.find((order) => order.id === invoiceOrderId)!}
          onClose={() => setInvoiceOrderId(null)}
          onMarkPaid={() => handleMarkPaid(invoiceOrderId)}
        />
      )}
      {previewInvoiceOrderId && (() => {
        const order = orders.find((item) => item.id === previewInvoiceOrderId);
        const invoice = order ? getInvoiceForOrderCard(order) : null;
        if (!order || !invoice) return null;
        return (
          <LuxuryInvoicePreviewModal
            order={order}
            invoice={invoice}
            onClose={() => setPreviewInvoiceOrderId(null)}
            onDownloadPdf={() => window.print()}
            onRegenerate={async () => {
              await handleGenerateInvoice(order, true);
            }}
            onSendWhatsApp={() => handleSendInvoiceWhatsApp(order, invoice)}
          />
        );
      })()}
    </div>
  );
}
