import React, { useEffect, useMemo, useState } from 'react';
import type { Order, Product } from '../data/mockData';
import AddOrderModal from './AddOrderModal';
import EditOrderModal from './EditOrderModal';
import InvoiceModal from '../components/InvoiceModal';
import LuxuryInvoicePreviewModal from '../components/LuxuryInvoicePreviewModal';
import Toast from '../components/Toast';
import { formatRM } from '../utils/pricing';
import { generateInvoiceForOrder, loadInvoicesFromSupabase, type InvoiceRecord } from '../services/invoiceService';

type OrdersPageProps = {
  orders: Order[];
  products: Product[];
  orderSource: 'Supabase' | 'localStorage';
  orderError?: string;
  onAddOrder: (order: Order) => void | Promise<void>;
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

type QuickFilter = 'All' | 'Today' | 'Upcoming' | 'Completed';
type OrderWithTimestamps = Order & {
  createdAt?: string;
  created_at?: string;
};

type OrderWithRawItems = Order & {
  flavour_quantities?: Order['flavourQuantities'] | string | null;
  items?: { name?: string; product?: string; quantity?: number | string; qty?: number | string }[] | string | null;
};

const getTodayDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const isCompletedOrder = (order: Order) =>
  order.paymentStatus === 'Paid' && order.kitchenStatus === 'Ready' && order.deliveryStatus === 'Delivered';

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

const matchesQuickFilter = (order: Order, quickFilter: QuickFilter, today: string) => {
  if (quickFilter === 'Today') return order.deliveryDate === today;
  if (quickFilter === 'Upcoming') return Boolean(order.deliveryDate) && order.deliveryDate > today;
  if (quickFilter === 'Completed') return isCompletedOrder(order);
  return true;
};

const priorityBadgesForOrder = (order: Order, today: string) => {
  if (order.deliveryStatus === 'Delivered') return ['Completed'];

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

export default function OrdersPage({ orders, products, orderSource, orderError = '', onAddOrder, onUpdateOrder, onMarkOrderPaid, onDeleteOrder }: OrdersPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [previewInvoiceOrderId, setPreviewInvoiceOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoiceLoadingOrderId, setInvoiceLoadingOrderId] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('All');

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

  const baseFilteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch = [order.id, order.orderNo, order.customerName, order.phone, order.product, order.address]
        .join(' ').toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || order.workflowStatus === statusFilter || order.paymentStatus === statusFilter || order.deliveryStatus === statusFilter || order.kitchenStatus === statusFilter;
      const matchesProduct = productFilter === 'All' || order.product === productFilter;
      return matchesSearch && matchesStatus && matchesProduct;
    });
  }, [orders, searchTerm, statusFilter, productFilter]);

  const quickFilterCounts = useMemo(() => ({
    All: baseFilteredOrders.length,
    Today: baseFilteredOrders.filter((order) => matchesQuickFilter(order, 'Today', todayDate)).length,
    Upcoming: baseFilteredOrders.filter((order) => matchesQuickFilter(order, 'Upcoming', todayDate)).length,
    Completed: baseFilteredOrders.filter((order) => matchesQuickFilter(order, 'Completed', todayDate)).length,
  }), [baseFilteredOrders, todayDate]);

  const filteredOrders = useMemo(() => {
    return baseFilteredOrders
      .filter((order) => matchesQuickFilter(order, quickFilter, todayDate))
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
  }, [baseFilteredOrders, quickFilter, todayDate]);

  const orderStats = useMemo(() => {
  const totalOrders = orders.length;
  const totalSales = orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
  const pendingPayment = orders.filter((order) => order.paymentStatus !== 'Paid').length;
  const kitchenPending = orders.filter((order) => order.kitchenStatus !== 'Ready').length;
  const deliveryPending = orders.filter((order) => order.deliveryStatus !== 'Delivered').length;
  const completedOrders = orders.filter(
    (order) =>
      order.paymentStatus === 'Paid' &&
      order.kitchenStatus === 'Ready' &&
      order.deliveryStatus === 'Delivered'
  ).length;

  return {
    totalOrders,
    totalSales,
    pendingPayment,
    kitchenPending,
    deliveryPending,
    completedOrders,
  };
}, [orders]);

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

      onUpdateOrder(updatedOrder);
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

  const handleDeleteOrder = (order: Order) => {
    if (!window.confirm(`Delete order ${order.id}?`)) return;
    onDeleteOrder(order);
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

  const totalSales = useMemo(() => orders.reduce((sum, order) => sum + order.totalAmount, 0), [orders]);

  return (
    <div className="space-y-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-white">Orders Management</h3>
          <p className="mt-2 text-sm text-slate-400">View, update and manage every order inside the bakery system.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setIsModalOpen(true)} className="rounded-3xl bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f]">
            Add New Order
          </button>
          <div className="rounded-3xl bg-white/5 px-5 py-3 text-sm text-slate-300">Total Sales {formatRM(totalSales)}</div>
          <div className="rounded-3xl border border-gold/20 bg-gold/10 px-5 py-3 text-sm text-softGold">Source: {orderSource}</div>
        </div>
      </div>

      {orderError && (
        <section className="rounded-[28px] border border-rose-500/20 bg-rose-500/10 p-5 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-rose-200">Supabase orders error</p>
          <p className="mt-3 text-sm leading-6 text-rose-100">{orderError}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Total Orders', orderStats.totalOrders],
          ['Total Sales', formatRM(orderStats.totalSales)],
          ['Pending Payment', orderStats.pendingPayment],
          ['Kitchen Pending', orderStats.kitchenPending],
          ['Delivery Pending', orderStats.deliveryPending],
          ['Completed Orders', orderStats.completedOrders],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-[#141414] p-5 transition hover:border-gold/30 hover:shadow-lg">
            <p className="text-xs uppercase tracking-[0.22em] text-softGold">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[24px] border border-white/10 bg-[#141414] p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Search Order</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Customer, phone, product, order ID"
              className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition focus:border-gold/40"
            >
              <option>All</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Overdue</option>
              <option>New Order</option>
              <option>Pending Payment</option>
              <option>Preparing</option>
              <option>Ready</option>
              <option>Out For Delivery</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Product Filter</label>
            <select
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition focus:border-gold/40"
            >
              <option>All</option>
              <option>Mini Tart</option>
              <option>Croissant Egg Tart</option>
            </select>
          </div>
        </div>
      </section>


      <section className="flex flex-wrap gap-2">
        {(['All', 'Today', 'Upcoming', 'Completed'] as QuickFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setQuickFilter(filter)}
            className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
              quickFilter === filter
                ? 'border-gold/50 bg-gold text-charcoal'
                : 'border-white/10 bg-[#141414] text-slate-300 hover:border-gold/30 hover:text-white'
            }`}
          >
            {filter} <span className={quickFilter === filter ? 'text-charcoal/70' : 'text-softGold'}>{quickFilterCounts[filter]}</span>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {filteredOrders.map((order) => (
          (() => {
            const invoice = getInvoiceForOrderCard(order);
            const invoiceGenerated = Boolean(invoice);
            const invoiceBusy = invoiceLoadingOrderId === order.id;
            return (
          <article
            key={order.id}
            className="flex min-h-full flex-col rounded-[24px] border border-white/10 bg-[#141414] p-5 text-sm text-slate-300 transition hover:border-gold/30 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">{order.orderNo || order.id}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-softGold">Total</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatRM(order.totalAmount)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {priorityBadgesForOrder(order, todayDate).map((badge) => (
                <span key={badge} className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${priorityBadgeClass(badge)}`}>
                  {badge}
                </span>
              ))}
            </div>

            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Customer</p>
                  <p className="mt-2 truncate font-semibold text-white">{order.customerName}</p>
                </div>
                <p className="shrink-0 text-sm text-slate-400">{order.phone}</p>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Product</p>
                  <p className="mt-2 truncate font-semibold text-white">{order.product}</p>
                  <p className="mt-1 truncate text-slate-400">{order.flavours.join(', ')}</p>
                </div>
                <p className="shrink-0 rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-softGold">Qty {order.quantity}</p>
              </div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-[#0f0f0f] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Delivery</p>
                <p className="text-xs font-semibold text-softGold">{order.deliveryDate || 'No date'} / {order.deliveryTime || 'No time'}</p>
              </div>
              <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-slate-300">{order.address}</p>
              <details className="mt-2">
                <summary className="cursor-pointer list-none text-xs font-semibold text-softGold transition hover:text-gold">
                  View Full Address
                </summary>
                <p className="mt-2 rounded-2xl bg-white/5 p-3 leading-6 text-slate-300">{order.address}</p>
              </details>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 pb-5">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.paymentStatus)}`}>{order.paymentStatus}</span>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.kitchenStatus)}`}>{order.kitchenStatus}</span>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.deliveryStatus)}`}>{order.deliveryStatus}</span>
              {invoiceGenerated && <span className="inline-flex rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold text-softGold">Invoice Generated</span>}
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
              <button onClick={() => setInvoiceOrderId(order.id)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Invoice</button>
              {!invoiceGenerated ? (
                <button onClick={() => handleGenerateInvoice(order)} disabled={invoiceBusy} className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/20 disabled:opacity-50">
                  {invoiceBusy ? 'Generating...' : 'Generate Invoice'}
                </button>
              ) : (
                <>
                  <button onClick={() => setPreviewInvoiceOrderId(order.id)} className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/20">Preview Invoice</button>
                  <button onClick={() => handleDownloadInvoice(order)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Download PDF</button>
                  <button onClick={() => handleGenerateInvoice(order, true)} disabled={invoiceBusy} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50">Regenerate Invoice</button>
                  <button onClick={() => handleSendInvoiceWhatsApp(order, invoice)} className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">Send WhatsApp</button>
                </>
              )}
              <button onClick={() => setSelectedOrderId(order.id)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Workflow</button>
              <button onClick={() => setEditingOrderId(order.id)} className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/20">Edit</button>
              <button onClick={() => handleMarkPaid(order.id)} className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">Mark Paid</button>
              <button onClick={() => handleSendKitchen(order.id)} className="rounded-2xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20">Send Kitchen</button>
              <button onClick={() => handleAssignDriver(order.id)} className="rounded-2xl bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20">Assign Driver</button>
              <button onClick={() => handleDeleteOrder(order)} className="rounded-2xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20">Delete</button>
            </div>
          </article>
            );
          })()
        ))}

        {filteredOrders.length === 0 && (
          <div className="rounded-[24px] border border-white/10 bg-[#141414] p-8 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
            No orders match the current filters.
          </div>
        )}
      </section>

      <AddOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddOrder={onAddOrder}
        products={products}
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
