import React, { useEffect, useMemo, useState } from 'react';
import type { Customer, Order } from '../data/mockData';
import { formatRM, toSafeNumber } from '../utils/pricing';
import Toast from '../components/Toast';

type CustomersPageProps = {
  customers: Customer[];
  orders?: Order[];
  source: 'Supabase' | 'localStorage';
};

type TimelineItem = {
  id: string;
  orderNo: string;
  date: string;
  product: string;
  flavour: string;
  total: number;
  paymentStatus: Order['paymentStatus'];
  deliveryStatus: Order['deliveryStatus'];
};

type CrmCustomer = Customer & {
  crmKey: string;
  customerTier: Customer['status'];
  averageOrderValue: number;
  firstOrderDate: string;
  liveOrderCount: number;
  liveSpend: number;
  timeline: TimelineItem[];
  relatedOrders: Order[];
};

type CustomerStatusFilter = 'All' | 'Active' | 'Archived';
type CustomerTier = Customer['status'];

type CustomerWithRawFields = Customer & {
  id?: string | number;
  customer_tier?: CustomerTier;
  customerTier?: CustomerTier;
  customer_status?: CustomerStatusFilter;
};

type OrderWithCustomerFields = Order & {
  customer_id?: string | number | null;
  customerId?: string | number | null;
  total_amount?: number | string | null;
  total?: number | string | null;
  final_subtotal?: number | string | null;
  finalSubtotal?: number | string | null;
  delivery_fee?: number | string | null;
  deliveryFee?: number | string | null;
  flavour_quantities?: Order['flavourQuantities'] | string | null;
  created_at?: string | null;
};

const tierOptions: ('All' | CustomerTier)[] = ['All', 'Bronze', 'Silver', 'Gold', 'VIP'];
const statusOptions: CustomerStatusFilter[] = ['All', 'Active', 'Archived'];

const tierClass = (tier: CustomerTier) => {
  if (tier === 'VIP') return 'border-gold/40 bg-gold/15 text-softGold';
  if (tier === 'Gold') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (tier === 'Silver') return 'border-slate-300/20 bg-slate-300/10 text-slate-200';
  return 'border-white/10 bg-white/5 text-cream';
};

const statusClass = (status: Customer['customerStatus']) =>
  status === 'Archived'
    ? 'border-rose-500/20 bg-rose-500/10 text-rose-200'
    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';

const getTier = (spend: number): CustomerTier => {
  if (spend >= 1000) return 'VIP';
  if (spend >= 800) return 'Gold';
  if (spend >= 300) return 'Silver';
  return 'Bronze';
};

const getCustomerStatus = (customer: CustomerWithRawFields): 'Active' | 'Archived' => {
  if (customer.customerStatus === 'Archived' || customer.customer_status === 'Archived' || customer.status === ('Archived' as Customer['status'])) return 'Archived';
  return 'Active';
};

const mostFrequent = (values: string[], fallback = '') => {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
};

const cleanPhoneForLink = (phone: string) => phone.replace(/\D/g, '');

const getOrderCustomerId = (order: OrderWithCustomerFields) => {
  const customerId = order.customerId ?? order.customer_id;
  return customerId === undefined || customerId === null || String(customerId).trim() === '' ? '' : String(customerId);
};

const getOrderCustomerKey = (order: OrderWithCustomerFields) => {
  const customerId = getOrderCustomerId(order);
  if (customerId) return `id:${customerId}`;

  const phone = order.phone?.trim();
  if (phone) return `phone:${phone}`;

  return `name:${(order.customerName || 'Customer').trim().toLowerCase()}`;
};

const getOrderAmount = (order: OrderWithCustomerFields) => {
  const directTotal = toSafeNumber(order.total_amount ?? order.totalAmount ?? order.total);
  if (directTotal > 0) return directTotal;

  const finalSubtotal = toSafeNumber(order.final_subtotal ?? order.finalSubtotal);
  const deliveryFee = toSafeNumber(order.delivery_fee ?? order.deliveryFee);
  return finalSubtotal > 0 ? finalSubtotal + deliveryFee : 0;
};

const normalizeFlavourQuantities = (value: OrderWithCustomerFields['flavour_quantities'] | Order['flavourQuantities']) => {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return [];
        }
      })()
    : value;

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      return String(record.name ?? record.flavour ?? record.flavor ?? record.product ?? '').trim();
    })
    .filter(Boolean);
};

const getOrderFlavours = (order: OrderWithCustomerFields) => {
  const quantityFlavours = normalizeFlavourQuantities(order.flavourQuantities ?? order.flavour_quantities);
  if (quantityFlavours.length) return quantityFlavours;
  return Array.isArray(order.flavours) ? order.flavours.filter(Boolean) : [];
};

const getOrderTimelineDate = (order: OrderWithCustomerFields) =>
  order.deliveryDate || order.created_at?.slice(0, 10) || '';

export default function CustomersPage({ customers, orders = [], source }: CustomersPageProps) {
  const [customerRows, setCustomerRows] = useState<Customer[]>(customers);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | CustomerTier>('All');
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>('All');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    setCustomerRows(customers);
  }, [customers]);

  const crmCustomers = useMemo<CrmCustomer[]>(() => {
    const customerById = new Map<string, Customer>();
    const customerByPhone = new Map<string, Customer>();
    const sourceCustomers = customerRows.length > 0 || customers.length === 0 ? customerRows : customers;

    sourceCustomers.forEach((customer) => {
      const id = customer.id === undefined || customer.id === null ? '' : String(customer.id);
      const phone = customer.phone.trim();
      if (id) customerById.set(id, customer);
      if (phone) customerByPhone.set(phone, customer);
    });

    const groupedOrders = orders.reduce<Map<string, OrderWithCustomerFields[]>>((acc, order) => {
      const normalizedOrder = order as OrderWithCustomerFields;
      const key = getOrderCustomerKey(normalizedOrder);
      const current = acc.get(key) || [];
      current.push(normalizedOrder);
      acc.set(key, current);
      return acc;
    }, new Map());

    return Array.from(groupedOrders.entries())
      .map(([crmKey, relatedOrders]) => {
        const sortedOrders = [...relatedOrders].sort((a, b) => getOrderTimelineDate(b).localeCompare(getOrderTimelineDate(a)));
        const firstOrder = sortedOrders[0];
        const customerId = getOrderCustomerId(firstOrder);
        const phone = firstOrder.phone?.trim() || '';
        const profileCustomer = customerId ? customerById.get(customerId) : customerByPhone.get(phone);
        const rawCustomer = (profileCustomer || {}) as CustomerWithRawFields;

        const totalSpend = sortedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
        const totalOrders = sortedOrders.length;
        const liveSpend = totalSpend;
        const liveOrderCount = totalOrders;
        const orderDates = sortedOrders.map(getOrderTimelineDate).filter(Boolean).sort();
        const firstOrderDate = orderDates[0] || '';
        const lastOrderDate = orderDates.slice(-1)[0] || '';
        const favouriteProduct = mostFrequent(sortedOrders.map((order) => order.product), '');
        const favouriteFlavour = mostFrequent(sortedOrders.flatMap(getOrderFlavours), '');
        const averageOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
        const customerTier = getTier(totalSpend);
        const customerStatus = getCustomerStatus(rawCustomer);
        const timeline = sortedOrders.slice(0, 12).map<TimelineItem>((order) => ({
          id: order.id,
          orderNo: order.orderNo || order.id,
          date: getOrderTimelineDate(order),
          product: order.product,
          flavour: getOrderFlavours(order).join(', '),
          total: getOrderAmount(order),
          paymentStatus: order.paymentStatus,
          deliveryStatus: order.deliveryStatus
        }));

        return {
          id: profileCustomer?.id,
          crmKey,
          name: profileCustomer?.name || firstOrder.customerName || 'Customer',
          phone: profileCustomer?.phone || phone,
          whatsapp: profileCustomer?.whatsapp || profileCustomer?.phone || phone,
          email: profileCustomer?.email || '',
          address: profileCustomer?.address || firstOrder.address || '',
          notes: profileCustomer?.notes || '',
          customerTier,
          totalOrders,
          totalSpend,
          averageOrderValue,
          firstOrderDate,
          lastOrderDate,
          favouriteProduct,
          favouriteFlavour,
          status: customerTier,
          customerStatus,
          liveOrderCount,
          liveSpend,
          timeline,
          relatedOrders: sortedOrders
        };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [customerRows, customers, orders]);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return crmCustomers.filter((customer) => {
      const matchesTier = tierFilter === 'All' || customer.customerTier === tierFilter;
      const matchesStatus = statusFilter === 'All' || customer.customerStatus === statusFilter;
      const haystack = [
        customer.name,
        customer.phone,
        customer.favouriteProduct,
        customer.favouriteFlavour,
        ...customer.relatedOrders.map((order) => order.product)
      ].join(' ').toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [crmCustomers, searchTerm, statusFilter, tierFilter]);

  const selectedCustomer = crmCustomers.find((customer) => customer.crmKey === selectedCustomerKey) || null;
  const totalSpend = crmCustomers.reduce((sum, customer) => sum + customer.totalSpend, 0);
  const totalOrders = crmCustomers.reduce((sum, customer) => sum + customer.totalOrders, 0);
  const averageOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
  const vipCustomers = crmCustomers.filter((customer) => customer.totalSpend >= 1000).length;
  const repeatCustomers = crmCustomers.filter((customer) => customer.totalOrders > 1).length;

  const openWhatsApp = (phone: string) => {
    const digits = cleanPhoneForLink(phone);
    if (digits) window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
  };

  const callCustomer = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">Customer CRM</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Bakery Customer Relationship System</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">Profiles, loyalty, purchase analytics, notes and timelines synced from order history.</p>
          </div>
          <div className="rounded-3xl border border-gold/20 bg-gold/10 px-5 py-3 text-sm text-softGold">Source: {source}</div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Total Customers', crmCustomers.length],
          ['Total Spend', formatRM(totalSpend)],
          ['VIP Customers', vipCustomers],
          ['Repeat Customers', repeatCustomers],
          ['Average Order Value', formatRM(averageOrderValue)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[24px] border border-white/10 bg-[#141414] p-5 shadow-panel transition hover:border-gold/30">
            <p className="text-xs uppercase tracking-[0.22em] text-softGold">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[24px] border border-white/10 bg-[#141414] p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Search CRM</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, phone, or product"
              className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-gold/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Tier</label>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value as 'All' | CustomerTier)}
              className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition focus:border-gold/40"
            >
              {tierOptions.map((tier) => <option key={tier}>{tier}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as CustomerStatusFilter)}
              className="h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition focus:border-gold/40"
            >
              {statusOptions.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {filteredCustomers.length === 0 && (
          <div className="rounded-[24px] border border-white/10 bg-[#141414] p-8 text-center text-sm text-slate-400 lg:col-span-2 2xl:col-span-3">
            No customers match this search.
          </div>
        )}

        {filteredCustomers.map((customer) => (
          <article
            key={customer.crmKey}
            className="flex min-h-full flex-col rounded-[24px] border border-white/10 bg-[#141414] p-5 text-sm text-slate-300 shadow-panel transition hover:border-gold/30"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="min-w-0">
                <h4 className="truncate text-xl font-semibold text-white">{customer.name}</h4>
                <p className="mt-1 text-slate-400">{customer.phone}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tierClass(customer.customerTier)}`}>{customer.customerTier}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(customer.customerStatus)}`}>{customer.customerStatus}</span>
              </div>
            </div>

            <div className="grid gap-3 py-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Orders</p>
                <p className="mt-2 text-lg font-semibold text-white">{customer.totalOrders}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Spend</p>
                <p className="mt-2 text-lg font-semibold text-white">{formatRM(customer.totalSpend)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">AOV</p>
                <p className="mt-2 text-lg font-semibold text-white">{formatRM(customer.averageOrderValue)}</p>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-[#0f0f0f] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Favourite</p>
              <p className="mt-2 font-semibold text-white">{customer.favouriteProduct || '-'}</p>
              <p className="mt-1 text-slate-400">{customer.favouriteFlavour || '-'}</p>
            </div>

            <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last Order Date</p>
              <p className="mt-2 font-semibold text-white">{customer.lastOrderDate || '-'}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => openWhatsApp(customer.whatsapp || customer.phone)} className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20">WhatsApp</button>
              <button onClick={() => callCustomer(customer.phone)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Call</button>
              <button onClick={() => setSelectedCustomerKey(customer.crmKey)} className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold transition hover:bg-gold/20">View Profile</button>
            </div>
          </article>
        ))}
      </section>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <button className="flex-1 cursor-default" aria-label="Close customer drawer" onClick={() => setSelectedCustomerKey(null)} />
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0d0d0d] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-softGold">Customer Profile</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selectedCustomer.name}</h3>
                <p className="mt-2 text-sm text-slate-400">{selectedCustomer.phone}</p>
              </div>
              <button onClick={() => setSelectedCustomerKey(null)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ['WhatsApp', selectedCustomer.whatsapp || selectedCustomer.phone],
                ['Email', selectedCustomer.email || '-'],
                ['Address', selectedCustomer.address || '-'],
                ['Notes', selectedCustomer.notes || '-'],
                ['First Order', selectedCustomer.firstOrderDate || '-'],
                ['Last Order', selectedCustomer.lastOrderDate || '-'],
                ['Favourite Product', selectedCustomer.favouriteProduct || '-'],
                ['Favourite Flavour', selectedCustomer.favouriteFlavour || '-'],
                ['Customer Tier', selectedCustomer.customerTier],
                ['Status', selectedCustomer.customerStatus || 'Active']
              ].map(([label, value]) => (
                <div key={label} className="rounded-[20px] border border-white/10 bg-[#141414] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[20px] border border-white/10 bg-[#141414] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total Orders</p>
                <p className="mt-2 text-2xl font-semibold text-white">{selectedCustomer.totalOrders}</p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-[#141414] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total Spend</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatRM(selectedCustomer.totalSpend)}</p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-[#141414] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Average Order</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatRM(selectedCustomer.averageOrderValue)}</p>
              </div>
            </div>

            <section className="mt-6 rounded-[24px] border border-white/10 bg-[#141414] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-softGold">Customer Timeline</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">Recent Orders</h4>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{selectedCustomer.timeline.length} orders</span>
              </div>

              <div className="mt-5 space-y-3">
                {selectedCustomer.timeline.length === 0 && <p className="text-sm text-slate-400">No recent order history available for this customer.</p>}
                {selectedCustomer.timeline.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-gold/10 px-3 py-1 text-xs font-semibold text-softGold">{item.orderNo}</span>
                      <span className="text-xs text-slate-500">{item.date}</span>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <p><span className="text-slate-500">Product</span><br /><span className="font-semibold text-white">{item.product}</span></p>
                      <p><span className="text-slate-500">Flavour</span><br /><span className="font-semibold text-white">{item.flavour}</span></p>
                      <p><span className="text-slate-500">Total</span><br /><span className="font-semibold text-white">{formatRM(item.total)}</span></p>
                      <p><span className="text-slate-500">Payment</span><br /><span className="font-semibold text-white">{item.paymentStatus}</span></p>
                      <p><span className="text-slate-500">Delivery</span><br /><span className="font-semibold text-white">{item.deliveryStatus}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
