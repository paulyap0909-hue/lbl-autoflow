import React, { useMemo, useState } from 'react';
import type { Order, Product } from '../data/mockData';
import AddOrderModal from './AddOrderModal';
import InvoiceModal from '../components/InvoiceModal';
import { formatRM } from '../utils/pricing';

type OrdersPageProps = {
  orders: Order[];
  products: Product[];
  orderSource: 'Supabase' | 'localStorage';
  orderError?: string;
  onAddOrder: (order: Order) => void | Promise<void>;
  onUpdateOrder: (order: Order) => void | Promise<void>;
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

export default function OrdersPage({ orders, products, orderSource, orderError = '', onAddOrder, onUpdateOrder, onDeleteOrder }: OrdersPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');

  const workflowStages = ['New Order', 'Pending Payment', 'Paid', 'Preparing', 'Ready', 'Out For Delivery', 'Completed', 'Cancelled'] as const;

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

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch = [order.id, order.customerName, order.phone, order.product, order.address]
        .join(' ').toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || order.workflowStatus === statusFilter || order.paymentStatus === statusFilter || order.deliveryStatus === statusFilter || order.kitchenStatus === statusFilter;
      const matchesProduct = productFilter === 'All' || order.product === productFilter;
      return matchesSearch && matchesStatus && matchesProduct;
    });
  }, [orders, searchTerm, statusFilter, productFilter]);

  const handleMarkPaid = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    onUpdateOrder({
      ...order,
      paymentStatus: 'Paid',
      workflowStatus: order.workflowStatus === 'Pending Payment' || order.workflowStatus === 'New Order' ? 'Paid' : order.workflowStatus
    });
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

  const advanceWorkflow = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
      const nextStatus = workflowNextStatus(order.workflowStatus);
      if (nextStatus === order.workflowStatus) return;
      const updatedOrder: Order = {
        ...order,
        workflowStatus: nextStatus,
        statusHistory: [...order.statusHistory, { status: nextStatus, timestamp: getTimestamp() }]
      };

      if (nextStatus === 'Paid') {
        updatedOrder.paymentStatus = 'Paid';
      }
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

  const totalSales = useMemo(() => orders.reduce((sum, order) => sum + order.totalAmount, 0), [orders]);

  return (
    <div className="space-y-8">
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

      <div className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr] xl:grid-cols-[1.2fr_1fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-[#0f0f0f] p-4">
            <label className="block text-sm text-slate-400">Search orders</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by customer, product, order ID"
              className="mt-3 w-full rounded-3xl border border-white/10 bg-[#141414] px-4 py-3 text-white outline-none"
            />
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0f0f0f] p-4">
            <label className="block text-sm text-slate-400">Status filter</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-3 w-full rounded-3xl border border-white/10 bg-[#141414] px-4 py-3 text-white outline-none"
            >
              <option>All</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Overdue</option>
              <option>New Order</option>
              <option>Pending Payment</option>
              <option>Paid</option>
              <option>Preparing</option>
              <option>Ready</option>
              <option>Out For Delivery</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0f0f0f] p-4">
            <label className="block text-sm text-slate-400">Product filter</label>
            <select
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="mt-3 w-full rounded-3xl border border-white/10 bg-[#141414] px-4 py-3 text-white outline-none"
            >
              <option>All</option>
              <option>Mini Tart</option>
              <option>Croissant Egg Tart</option>
            </select>
          </div>
        </div>
      </div>


      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[#141414] shadow-panel">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-300">
          <thead className="bg-[#121212] text-slate-400">
            <tr>
              <th className="p-4">Order ID</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Product</th>
              <th className="p-4">Flavours</th>
              <th className="p-4">Qty</th>
              <th className="p-4">Delivery</th>
              <th className="p-4">Address</th>
              <th className="p-4">Total</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Kitchen</th>
              <th className="p-4">Delivery</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id} className="border-t border-white/10 bg-[#0f0f0f] hover:bg-white/5">
                <td className="p-4 font-medium text-white">{order.id}</td>
                <td className="p-4">{order.customerName}</td>
                <td className="p-4">{order.phone}</td>
                <td className="p-4">{order.product}</td>
                <td className="p-4">{order.flavours.join(', ')}</td>
                <td className="p-4">{order.quantity}</td>
                <td className="p-4">{order.deliveryDate} • {order.deliveryTime}</td>
                <td className="p-4">{order.address}</td>
                <td className="p-4">{formatRM(order.totalAmount)}</td>
                <td className="p-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.paymentStatus)}`}>{order.paymentStatus}</span></td>
                <td className="p-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.kitchenStatus)}`}>{order.kitchenStatus}</span></td>
                <td className="p-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(order.deliveryStatus)}`}>{order.deliveryStatus}</span></td>
                <td className="p-4 space-y-2">
                  <button onClick={() => setInvoiceOrderId(order.id)} className="w-full rounded-3xl bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10">View Invoice</button>
                  <button className="w-full rounded-3xl bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10" onClick={() => setSelectedOrderId(order.id)}>
                    Track Workflow
                  </button>
                  <button onClick={() => handleMarkPaid(order.id)} className="w-full rounded-3xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 transition hover:bg-emerald-500/20">Mark as Paid</button>
                  <button onClick={() => handleSendKitchen(order.id)} className="w-full rounded-3xl bg-sky-500/10 px-3 py-2 text-xs text-sky-200 transition hover:bg-sky-500/20">Send to Kitchen</button>
                  <button onClick={() => handleAssignDriver(order.id)} className="w-full rounded-3xl bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200 transition hover:bg-indigo-500/20">Assign Driver</button>
                  <button onClick={() => handleDeleteOrder(order)} className="w-full rounded-3xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-500/20">Delete Order</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddOrder={onAddOrder}
        products={products}
      />
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
          onMarkPaid={() => {
            handleMarkPaid(invoiceOrderId);
          }}
        />
      )}
    </div>
  );
}
