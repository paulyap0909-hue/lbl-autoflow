import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CreditCard, Eye, FileText, MessageCircle, MinusCircle, Phone, PlusCircle, Search, WalletCards, X } from 'lucide-react';
import type { Customer, Order } from '../data/mockData';
import { formatRM, toSafeNumber } from '../utils/pricing';
import { isOrderRecordAvailable } from '../utils/orderLifecycle';
import Toast from '../components/Toast';
import InvoiceTemplate from '../components/InvoiceTemplate';
import { loadCustomersFromSupabase } from '../services/customerService';
import { loadWalletTransactions, recordWalletTransaction, type CustomerWalletTransaction, type WalletPaymentMethod } from '../services/customerWalletService';

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

type CustomerTier = Customer['status'];
type DirectoryStatus = 'New' | 'Repeat' | 'Active' | 'Inactive' | 'Archived';
type StatusFilter = 'All' | DirectoryStatus;
type SortOption = 'Last Order' | 'Total Spend' | 'Order Count';

type CrmCustomer = Customer & {
  crmKey: string;
  customerTier: CustomerTier;
  averageOrderValue: number;
  firstOrderDate: string;
  liveOrderCount: number;
  liveSpend: number;
  timeline: TimelineItem[];
  relatedOrders: Order[];
  directoryStatus: DirectoryStatus;
  walletBalance: number;
};

type CustomerWithRawFields = Customer & {
  id?: string | number;
  customer_status?: string;
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

const PAGE_SIZE = 20;
const tierOptions: ('All' | CustomerTier)[] = ['All', 'Bronze', 'Silver', 'Gold', 'VIP'];
const statusOptions: StatusFilter[] = ['All', 'New', 'Repeat', 'Active', 'Inactive', 'Archived'];
const sortOptions: SortOption[] = ['Last Order', 'Total Spend', 'Order Count'];
const walletPaymentMethods: WalletPaymentMethod[] = ['Cash', 'QR', 'Bank Transfer', 'Card'];

const tierClass = (tier: CustomerTier) => {
  if (tier === 'VIP') return 'border-[#C8A96B]/45 bg-[#C8A96B]/15 text-[#E4C98E]';
  if (tier === 'Gold') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (tier === 'Silver') return 'border-slate-300/20 bg-slate-300/10 text-slate-200';
  return 'border-white/10 bg-white/5 text-slate-300';
};

const directoryStatusClass = (status: DirectoryStatus) => {
  if (status === 'Archived' || status === 'Inactive') return 'border-rose-500/25 bg-rose-500/10 text-rose-200';
  if (status === 'Repeat') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  if (status === 'New') return 'border-sky-500/25 bg-sky-500/10 text-sky-200';
  return 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E]';
};

const getTier = (spend: number): CustomerTier => {
  if (spend >= 1500) return 'VIP';
  if (spend >= 800) return 'Gold';
  if (spend >= 300) return 'Silver';
  return 'Bronze';
};

const isArchivedCustomer = (customer: CustomerWithRawFields) =>
  customer.customerStatus === 'Archived'
  || customer.customer_status === 'Archived'
  || customer.status === ('Archived' as Customer['status']);

const mostFrequent = (values: string[], fallback = '') => {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    if (value) acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
};

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const getOrderCustomerId = (order: OrderWithCustomerFields) => {
  const customerId = order.customerId ?? order.customer_id;
  return customerId === undefined || customerId === null || String(customerId).trim() === '' ? '' : String(customerId);
};

const getOrderCustomerKey = (order: OrderWithCustomerFields) => {
  const customerId = getOrderCustomerId(order);
  if (customerId) return `id:${customerId}`;
  const phone = normalizePhone(order.phone || '');
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

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getDaysSince = (dateValue: string) => {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(`${getTodayKey()}T00:00:00`).getTime();
  if (!Number.isFinite(date)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((today - date) / 86400000));
};

const getRelativeLastOrder = (dateValue: string) => {
  const days = getDaysSince(dateValue);
  if (!Number.isFinite(days)) return 'No orders yet';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const getDirectoryStatus = (customer: {
  totalOrders: number;
  lastOrderDate: string;
  archived: boolean;
}): DirectoryStatus => {
  if (customer.archived) return 'Archived';
  if (customer.totalOrders === 1) return 'New';
  if (getDaysSince(customer.lastOrderDate) > 30) return 'Inactive';
  if (customer.totalOrders >= 2) return 'Repeat';
  return 'Active';
};

const getNextAction = (customer: Pick<CrmCustomer, 'customerTier' | 'totalOrders' | 'lastOrderDate' | 'directoryStatus'>) => {
  if (customer.directoryStatus === 'Archived') return 'No action';
  if (getDaysSince(customer.lastOrderDate) > 30) return 'Inactive follow-up';
  if (customer.customerTier === 'VIP') return 'VIP care';
  if (customer.totalOrders >= 1) return 'Thank & invite reorder';
  return 'No action';
};

export default function CustomersPage({ customers, orders = [], source }: CustomersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | CustomerTier>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Last Order');
  const [page, setPage] = useState(1);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [invoiceCustomerKey, setInvoiceCustomerKey] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [liveCustomers, setLiveCustomers] = useState(customers);
  const [walletModal, setWalletModal] = useState<{ customerKey: string; type: 'top_up' | 'deduct' } | null>(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletMethod, setWalletMethod] = useState<WalletPaymentMethod>('Cash');
  const [walletRemark, setWalletRemark] = useState('');
  const [walletDate, setWalletDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [linkedOrderId, setLinkedOrderId] = useState('');
  const [walletTransactions, setWalletTransactions] = useState<CustomerWalletTransaction[]>([]);
  const [walletBusy, setWalletBusy] = useState(false);

  useEffect(() => setLiveCustomers(customers), [customers]);

  const crmCustomers = useMemo<CrmCustomer[]>(() => {
    const customerById = new Map<string, Customer>();
    const customerByPhone = new Map<string, Customer>();

    liveCustomers.forEach((customer) => {
      const id = customer.id === undefined || customer.id === null ? '' : String(customer.id);
      const phone = normalizePhone(customer.phone || '');
      if (id) customerById.set(id, customer);
      if (phone) customerByPhone.set(phone, customer);
    });

    const groupedOrders = orders
      .filter((order) => isOrderRecordAvailable(order) && order.workflowStatus !== 'Cancelled')
      .reduce<Map<string, OrderWithCustomerFields[]>>((acc, order) => {
        const normalizedOrder = order as OrderWithCustomerFields;
        const directKey = getOrderCustomerKey(normalizedOrder);
        const matchedProfile = !getOrderCustomerId(normalizedOrder)
          ? customerByPhone.get(normalizePhone(normalizedOrder.phone || ''))
          : undefined;
        const key = matchedProfile?.id ? `id:${matchedProfile.id}` : directKey;
        const current = acc.get(key) || [];
        current.push(normalizedOrder);
        acc.set(key, current);
        return acc;
      }, new Map());

    liveCustomers.forEach((customer) => {
      const customerId = customer.id ? String(customer.id) : '';
      const phone = normalizePhone(customer.phone || '');
      const key = customerId ? `id:${customerId}` : phone ? `phone:${phone}` : `name:${customer.name.trim().toLowerCase()}`;
      if (!groupedOrders.has(key)) groupedOrders.set(key, []);
    });

    return Array.from(groupedOrders.entries())
      .map(([crmKey, relatedOrders]) => {
        const sortedOrders = [...relatedOrders].sort((a, b) => getOrderTimelineDate(b).localeCompare(getOrderTimelineDate(a)));
        const firstOrder = sortedOrders[0];
        const keyCustomerId = crmKey.startsWith('id:') ? crmKey.slice(3) : '';
        const customerId = firstOrder ? getOrderCustomerId(firstOrder) : keyCustomerId;
        const phone = firstOrder?.phone?.trim() || (crmKey.startsWith('phone:') ? crmKey.slice(6) : '');
        const profileCustomer = customerId
          ? customerById.get(customerId)
          : customerByPhone.get(normalizePhone(phone));
        const rawCustomer = (profileCustomer || {}) as CustomerWithRawFields;
        const totalSpend = sortedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
        const totalOrders = sortedOrders.length;
        const orderDates = sortedOrders.map(getOrderTimelineDate).filter(Boolean).sort();
        const firstOrderDate = orderDates[0] || '';
        const lastOrderDate = orderDates[orderDates.length - 1] || '';
        const customerTier = getTier(totalSpend);
        const archived = isArchivedCustomer(rawCustomer);
        const directoryStatus = getDirectoryStatus({ totalOrders, lastOrderDate, archived });

        return {
          id: profileCustomer?.id,
          crmKey,
          name: profileCustomer?.name || firstOrder?.customerName || 'Customer',
          phone: profileCustomer?.phone || phone,
          whatsapp: profileCustomer?.whatsapp || profileCustomer?.phone || phone,
          email: profileCustomer?.email || '',
          address: profileCustomer?.address || firstOrder?.address || '',
          notes: profileCustomer?.notes || '',
          customerTier,
          totalOrders,
          totalSpend,
          averageOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
          firstOrderDate,
          lastOrderDate,
          favouriteProduct: mostFrequent(sortedOrders.map((order) => order.product), ''),
          favouriteFlavour: mostFrequent(sortedOrders.flatMap(getOrderFlavours), ''),
          status: customerTier,
          customerStatus: archived ? ('Archived' as const) : ('Active' as const),
          liveOrderCount: totalOrders,
          liveSpend: totalSpend,
          directoryStatus,
          walletBalance: toSafeNumber(profileCustomer?.walletBalance),
          timeline: sortedOrders.slice(0, 8).map<TimelineItem>((order) => ({
            id: order.id,
            orderNo: order.orderNo || order.id,
            date: getOrderTimelineDate(order),
            product: order.product,
            flavour: getOrderFlavours(order).join(', '),
            total: getOrderAmount(order),
            paymentStatus: order.paymentStatus,
            deliveryStatus: order.deliveryStatus
          })),
          relatedOrders: sortedOrders
        };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [liveCustomers, orders]);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return crmCustomers
      .filter((customer) => {
        const matchesSearch = !query || `${customer.name} ${customer.phone}`.toLowerCase().includes(query);
        const matchesTier = tierFilter === 'All' || customer.customerTier === tierFilter;
        const matchesStatus = statusFilter === 'All' || customer.directoryStatus === statusFilter;
        return matchesSearch && matchesTier && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'Total Spend') return b.totalSpend - a.totalSpend;
        if (sortBy === 'Order Count') return b.totalOrders - a.totalOrders;
        return (b.lastOrderDate || '').localeCompare(a.lastOrderDate || '');
      });
  }, [crmCustomers, searchTerm, sortBy, statusFilter, tierFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortBy, statusFilter, tierFilter]);

  const selectedCustomer = crmCustomers.find((customer) => customer.crmKey === selectedCustomerKey) || null;
  const invoiceCustomer = crmCustomers.find((customer) => customer.crmKey === invoiceCustomerKey) || null;
  const invoiceOrders = invoiceCustomer?.relatedOrders ?? [];
  const selectedInvoiceOrder = invoiceOrders.find((order) => (order.supabaseId || order.id) === invoiceOrderId) || invoiceOrders[0] || null;
  const totalSpend = crmCustomers.reduce((sum, customer) => sum + customer.totalSpend, 0);
  const repeatCustomers = crmCustomers.filter((customer) => customer.totalOrders >= 2).length;
  const totalWalletBalance = crmCustomers.reduce((sum, customer) => sum + customer.walletBalance, 0);
  const customersWithBalance = crmCustomers.filter((customer) => customer.walletBalance > 0).length;
  const totalOrders = crmCustomers.reduce((sum, customer) => sum + customer.totalOrders, 0);
  const averageOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openWhatsApp = (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setToast({ message: 'Customer phone number is unavailable.', type: 'error' });
      return;
    }
    window.open(`https://wa.me/${normalized}`, '_blank', 'noopener,noreferrer');
  };

  const callCustomer = (phone: string) => {
    if (!phone) {
      setToast({ message: 'Customer phone number is unavailable.', type: 'error' });
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const openCustomerInvoices = (customer: CrmCustomer) => {
    setInvoiceCustomerKey(customer.crmKey);
    setInvoiceOrderId(customer.relatedOrders[0] ? (customer.relatedOrders[0].supabaseId || customer.relatedOrders[0].id) : null);
  };

  const selectedAddresses = selectedCustomer
    ? Array.from(new Set([
        selectedCustomer.address,
        ...selectedCustomer.relatedOrders.map((order) => order.address)
      ].filter(Boolean)))
    : [];

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setWalletTransactions([]);
      return;
    }
    loadWalletTransactions(selectedCustomer.id)
      .then(setWalletTransactions)
      .catch((error) => {
        console.error('Failed to load wallet transactions:', error);
        setWalletTransactions([]);
      });
  }, [selectedCustomer?.id, selectedCustomer?.walletBalance]);

  const openWalletModal = (customer: CrmCustomer, type: 'top_up' | 'deduct') => {
    if (!customer.id) {
      setToast({ message: 'Customer ID missing. Refresh customers before changing wallet balance.', type: 'error' });
      return;
    }
    setWalletModal({ customerKey: customer.crmKey, type });
    setWalletAmount('');
    setWalletMethod('Cash');
    setWalletRemark('');
    setLinkedOrderId('');
    setWalletDate(new Date().toISOString().slice(0, 10));
  };

  const submitWalletTransaction = async () => {
    if (!walletModal) return;
    const customer = crmCustomers.find((item) => item.crmKey === walletModal.customerKey);
    const amount = toSafeNumber(walletAmount);
    if (!customer?.id || amount <= 0) {
      setToast({ message: 'Enter a valid wallet amount.', type: 'error' });
      return;
    }
    if (walletModal.type === 'deduct' && amount > customer.walletBalance) {
      setToast({ message: 'Insufficient wallet balance', type: 'error' });
      return;
    }

    setWalletBusy(true);
    try {
      await recordWalletTransaction({
        customerId: customer.id,
        transactionType: walletModal.type,
        amount,
        paymentMethod: walletModal.type === 'top_up' ? walletMethod : undefined,
        linkedOrderId: linkedOrderId || undefined,
        remark: [walletRemark.trim(), walletDate ? `Transaction date: ${walletDate}` : ''].filter(Boolean).join(' | ')
      });
      const refreshed = await loadCustomersFromSupabase();
      setLiveCustomers(refreshed);
      const transactions = await loadWalletTransactions(customer.id);
      setWalletTransactions(transactions);
      setWalletModal(null);
      setToast({ message: walletModal.type === 'top_up' ? 'Wallet top up recorded.' : 'Wallet deduction recorded.', type: 'success' });
    } catch (error) {
      console.error('Customer wallet transaction failed:', error);
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || 'Wallet transaction failed.');
      setToast({ message: message.includes('Insufficient') ? 'Insufficient wallet balance' : message, type: 'error' });
    } finally {
      setWalletBusy(false);
    }
  };

  const walletModalCustomer = walletModal
    ? crmCustomers.find((customer) => customer.crmKey === walletModal.customerKey) || null
    : null;

  return (
    <div className="space-y-4">
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#C8A96B]">Customer Finance Operations</p>
            <h1 className="mt-1.5 text-2xl font-semibold text-white">Customer Wallet CRM</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage customer records, lifetime spend, order history and prepaid wallet balances.</p>
          </div>
          <div className="rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E]">
            Source: {source}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Total Customers', crmCustomers.length],
          ['Total Customer Spend', formatRM(totalSpend)],
          ['Total Wallet Balance', formatRM(totalWalletBalance)],
          ['Customers With Balance', customersWithBalance],
          ['Average Order Value', formatRM(averageOrderValue)],
          ['Repeat Customers', repeatCustomers],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
        <div className="border-b border-[#334155] p-3.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Customer Directory</p>
              <p className="mt-1 text-sm text-slate-400">{filteredCustomers.length} customers in this view</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_150px_160px]">
              <label className="relative">
                <Search size={15} className="absolute left-3 top-3 text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search name or phone"
                  className="h-10 w-full rounded-xl border border-[#334155] bg-[#0F172A] pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#C8A96B]/50"
                />
              </label>
              <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value as 'All' | CustomerTier)} className="h-10 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none">
                {tierOptions.map((tier) => <option key={tier} value={tier}>{tier === 'All' ? 'All tiers' : tier}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none">
                {statusOptions.map((status) => <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>)}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="h-10 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none">
                {sortOptions.map((option) => <option key={option} value={option}>Sort: {option}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div role="table" aria-label="Customer directory">
          <div role="row" className="hidden grid-cols-[minmax(160px,1.25fr)_120px_110px_110px_60px_100px_75px_minmax(270px,1.7fr)] gap-3 border-b border-[#334155] bg-[#0F172A] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 xl:grid">
            <span>Customer</span><span>Phone</span><span>Total Spend</span><span>Wallet Balance</span><span>Orders</span><span>Last Order</span><span>Tier</span><span>Action</span>
          </div>

          {paginatedCustomers.length > 0 ? paginatedCustomers.map((customer) => (
            <div
              key={customer.crmKey}
              role="row"
              className="grid w-full gap-3 border-b border-[#263348] px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.025] sm:grid-cols-2 sm:items-center xl:grid-cols-[minmax(160px,1.25fr)_120px_110px_110px_60px_100px_75px_minmax(270px,1.7fr)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{customer.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500 xl:hidden">{customer.phone || 'No phone'}</span>
              </span>
              <span className="hidden truncate text-xs text-slate-300 xl:block">{customer.phone || '-'}</span>
              <span className="text-sm font-semibold text-white">{formatRM(customer.totalSpend)}</span>
              <span className="text-sm font-semibold text-[#E4C98E]">{formatRM(customer.walletBalance)}</span>
              <span className="hidden text-sm text-slate-300 xl:block">{customer.totalOrders}</span>
              <span className="hidden text-xs text-slate-300 xl:block">{getRelativeLastOrder(customer.lastOrderDate)}</span>
              <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tierClass(customer.customerTier)}`}>{customer.customerTier}</span>
              <span className="col-span-2 flex flex-wrap gap-1.5 xl:col-span-1">
                <button type="button" onClick={() => setSelectedCustomerKey(customer.crmKey)} className="inline-flex items-center gap-1 rounded-lg border border-[#334155] px-2.5 py-2 text-[11px] font-semibold text-slate-200"><Eye size={13} /> Profile</button>
                <button type="button" onClick={() => openCustomerInvoices(customer)} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[11px] font-semibold text-sky-200"><FileText size={13} /> Invoices</button>
                <button type="button" onClick={() => openWalletModal(customer, 'top_up')} className="inline-flex items-center gap-1 rounded-lg border border-[#C8A96B]/35 bg-[#C8A96B]/10 px-2.5 py-2 text-[11px] font-semibold text-[#E4C98E]"><PlusCircle size={13} /> Top Up</button>
                <button type="button" onClick={() => openWalletModal(customer, 'deduct')} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/5 px-2.5 py-2 text-[11px] font-semibold text-rose-200"><MinusCircle size={13} /> Deduct</button>
                <button type="button" onClick={() => openWhatsApp(customer.whatsapp || customer.phone)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-[11px] font-semibold text-emerald-200"><MessageCircle size={13} /> WhatsApp</button>
              </span>
            </div>
          )) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-white">No customers match this view.</p>
              <p className="mt-1 text-xs text-slate-500">Adjust the action, search, tier or status filters.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#334155] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Showing {filteredCustomers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredCustomers.length)} of {filteredCustomers.length}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous customer page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-slate-300 disabled:opacity-35">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-20 text-center text-xs font-semibold text-white">Page {currentPage} / {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next customer page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-slate-300 disabled:opacity-35">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {selectedCustomer ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <button type="button" className="flex-1 cursor-default" aria-label="Close customer profile" onClick={() => setSelectedCustomerKey(null)} />
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-[#334155] bg-[#0B1120] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#334155] bg-[#0B1120]/95 px-5 py-4 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#C8A96B]">Customer Profile</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-white">{selectedCustomer.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedCustomer.phone || 'No phone'}</p>
              </div>
              <button type="button" onClick={() => setSelectedCustomerKey(null)} aria-label="Close drawer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#334155] text-slate-300 hover:text-white">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tierClass(selectedCustomer.customerTier)}`}>{selectedCustomer.customerTier}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${directoryStatusClass(selectedCustomer.directoryStatus)}`}>{selectedCustomer.directoryStatus}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ['Total Spend', formatRM(selectedCustomer.totalSpend)],
                  ['Wallet Balance', formatRM(selectedCustomer.walletBalance)],
                  ['Order Count', selectedCustomer.totalOrders],
                  ['Average Order', formatRM(selectedCustomer.averageOrderValue)]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[14px] border border-[#334155] bg-[#111827] p-3">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-slate-500">{label}</p>
                    <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <section className="rounded-[16px] border border-[#334155] bg-[#111827] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C8A96B]">Contact & Activity</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><p className="text-[10px] uppercase text-slate-500">Last Order Date</p><p className="mt-1 text-sm font-semibold text-white">{selectedCustomer.lastOrderDate || '-'}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-500">Next Action</p><p className="mt-1 text-sm font-semibold text-[#E4C98E]">{getNextAction(selectedCustomer)}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-500">Email</p><p className="mt-1 break-all text-sm text-white">{selectedCustomer.email || '-'}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-500">First Order</p><p className="mt-1 text-sm text-white">{selectedCustomer.firstOrderDate || '-'}</p></div>
                </div>
              </section>

              <section className="rounded-[16px] border border-[#334155] bg-[#111827] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C8A96B]">Addresses</p>
                <div className="mt-3 space-y-2">
                  {selectedAddresses.length > 0 ? selectedAddresses.map((address) => (
                    <p key={address} className="rounded-xl bg-[#0F172A] px-3 py-2 text-sm leading-5 text-slate-300">{address}</p>
                  )) : <p className="text-sm text-slate-500">No address recorded.</p>}
                </div>
              </section>

              <section className="rounded-[16px] border border-[#334155] bg-[#111827] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C8A96B]">Recent Orders</p>
                    <p className="mt-1 text-xs text-slate-500">Open, print or send invoice details directly from each customer order.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCustomerInvoices(selectedCustomer)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[11px] font-semibold text-sky-200"
                  >
                    <FileText size={13} /> All Invoices
                  </button>
                </div>
                <div className="mt-3 divide-y divide-[#334155]">
                  {selectedCustomer.relatedOrders.length > 0 ? selectedCustomer.relatedOrders.slice(0, 8).map((order) => {
                    const key = order.supabaseId || order.id;
                    const orderDate = getOrderTimelineDate(order as OrderWithCustomerFields);
                    const flavours = getOrderFlavours(order as OrderWithCustomerFields).join(', ');
                    return (
                      <div key={key} className="py-3">
                        <div className="grid grid-cols-[1fr_auto] gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{order.orderNo || order.id}</p>
                            <p className="mt-1 truncate text-xs text-slate-400">{order.product}{flavours ? ` - ${flavours}` : ''}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{orderDate || '-'} · {order.paymentStatus} · {order.deliveryStatus}</p>
                          </div>
                          <p className="text-sm font-semibold text-[#E4C98E]">{formatRM(getOrderAmount(order as OrderWithCustomerFields))}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setInvoiceCustomerKey(selectedCustomer.crmKey); setInvoiceOrderId(key); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[11px] font-semibold text-sky-200"
                          >
                            <Eye size={13} /> View Invoice
                          </button>
                          <button
                            type="button"
                            onClick={() => { setInvoiceCustomerKey(selectedCustomer.crmKey); setInvoiceOrderId(key); setToast({ message: 'Invoice opened. Use the print button inside the invoice preview.', type: 'info' }); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#C8A96B]/35 bg-[#C8A96B]/10 px-2.5 py-2 text-[11px] font-semibold text-[#E4C98E]"
                          >
                            <FileText size={13} /> Print Invoice
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsApp(selectedCustomer.whatsapp || selectedCustomer.phone)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-[11px] font-semibold text-emerald-200"
                          >
                            <MessageCircle size={13} /> WhatsApp Invoice
                          </button>
                        </div>
                      </div>
                    );
                  }) : <p className="py-4 text-sm text-slate-500">No recent orders.</p>}
                </div>
              </section>

              <section className="rounded-[16px] border border-[#334155] bg-[#111827] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C8A96B]">Wallet Transactions</p>
                    <p className="mt-1 text-xs text-slate-500">Top ups, deductions, refunds and adjustments are permanent records.</p>
                  </div>
                  <WalletCards size={18} className="text-[#C8A96B]" />
                </div>
                <div className="mt-3 divide-y divide-[#334155]">
                  {walletTransactions.length > 0 ? walletTransactions.map((transaction) => (
                    <div key={transaction.id} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold capitalize text-white">{transaction.transactionType.replace('_', ' ')}</p>
                        <p className="mt-1 text-xs text-slate-400">{new Date(transaction.createdAt).toLocaleString('en-MY')} · Balance after {formatRM(transaction.balanceAfter)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{[transaction.paymentMethod, transaction.remark, transaction.linkedOrderId ? `Order ${transaction.linkedOrderId}` : ''].filter(Boolean).join(' · ') || 'No remark'}</p>
                      </div>
                      <p className={`text-sm font-semibold ${transaction.transactionType === 'deduct' ? 'text-rose-200' : 'text-emerald-200'}`}>
                        {transaction.transactionType === 'deduct' ? '-' : '+'}{formatRM(Math.abs(transaction.amount))}
                      </p>
                    </div>
                  )) : <p className="py-4 text-sm text-slate-500">No wallet transactions yet.</p>}
                </div>
              </section>

              <section className="rounded-[16px] border border-[#334155] bg-[#111827] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C8A96B]">Notes</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{selectedCustomer.notes || 'No customer notes recorded.'}</p>
              </section>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <button type="button" onClick={() => openCustomerInvoices(selectedCustomer)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200"><FileText size={16} /> Invoices</button>
                <button type="button" onClick={() => openWalletModal(selectedCustomer, 'top_up')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C8A96B]/10 px-4 py-3 text-sm font-semibold text-[#E4C98E]"><PlusCircle size={16} /> Top Up</button>
                <button type="button" onClick={() => openWalletModal(selectedCustomer, 'deduct')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200"><MinusCircle size={16} /> Deduct</button>
                <button type="button" onClick={() => openWhatsApp(selectedCustomer.whatsapp || selectedCustomer.phone)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button type="button" onClick={() => callCustomer(selectedCustomer.phone)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#334155] px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5">
                  <Phone size={16} /> Call
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {invoiceCustomer ? (
        <div className="fixed inset-0 z-[55] flex justify-end bg-black/70 backdrop-blur-sm">
          <button type="button" className="flex-1 cursor-default" aria-label="Close customer invoices" onClick={() => setInvoiceCustomerKey(null)} />
          <aside className="h-full w-full max-w-5xl overflow-y-auto border-l border-[#334155] bg-[#0B1120] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#334155] bg-[#0B1120]/95 px-5 py-4 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#C8A96B]">Customer Invoices</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-white">{invoiceCustomer.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{invoiceOrders.length} order{invoiceOrders.length === 1 ? '' : 's'} available for invoice lookup and printing.</p>
              </div>
              <button type="button" onClick={() => setInvoiceCustomerKey(null)} aria-label="Close invoice drawer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#334155] text-slate-300 hover:text-white">
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-[360px_1fr]">
              <section className="rounded-[18px] border border-[#334155] bg-[#111827] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#C8A96B]">Order Invoice List</p>
                <p className="mt-1 text-xs text-slate-500">Select any customer order to preview or print its invoice.</p>
                <div className="mt-4 space-y-2">
                  {invoiceOrders.length > 0 ? invoiceOrders.map((order) => {
                    const key = order.supabaseId || order.id;
                    const isActive = selectedInvoiceOrder && (selectedInvoiceOrder.supabaseId || selectedInvoiceOrder.id) === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setInvoiceOrderId(key)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${isActive ? 'border-[#C8A96B]/50 bg-[#C8A96B]/10' : 'border-[#334155] bg-[#0F172A] hover:border-[#C8A96B]/30'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{order.orderNo || order.id}</p>
                            <p className="mt-1 truncate text-xs text-slate-400">{getOrderTimelineDate(order as OrderWithCustomerFields) || '-'}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{order.product} x {order.quantity}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-[#E4C98E]">{formatRM(getOrderAmount(order as OrderWithCustomerFields))}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{order.paymentStatus}</p>
                          </div>
                        </div>
                      </button>
                    );
                  }) : (
                    <div className="rounded-xl border border-dashed border-[#334155] px-3 py-8 text-center text-sm text-slate-500">No orders available for this customer.</div>
                  )}
                </div>
              </section>

              <section className="min-w-0 rounded-[18px] border border-[#334155] bg-[#111827] p-4">
                {selectedInvoiceOrder ? (
                  <InvoiceTemplate order={selectedInvoiceOrder} showChrome />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-dashed border-[#334155] text-sm text-slate-500">Select an order to preview its invoice.</div>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      {walletModal && walletModalCustomer ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[20px] border border-[#334155] bg-[#111111] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#C8A96B]">Customer Wallet</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{walletModal.type === 'top_up' ? 'Top Up Wallet' : 'Deduct Wallet'}</h2>
                <p className="mt-1 text-sm text-slate-400">{walletModalCustomer.name} · Current balance {formatRM(walletModalCustomer.walletBalance)}</p>
              </div>
              <button type="button" onClick={() => setWalletModal(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-slate-300"><X size={16} /></button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm text-slate-300">
                {walletModal.type === 'top_up' ? 'Top Up Amount' : 'Deduct Amount'}
                <input type="number" min="0.01" step="0.01" value={walletAmount} onChange={(event) => setWalletAmount(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-white outline-none focus:border-[#C8A96B]/60" placeholder="0.00" autoFocus />
              </label>
              {walletModal.type === 'top_up' ? (
                <label className="block text-sm text-slate-300">Payment Method
                  <select value={walletMethod} onChange={(event) => setWalletMethod(event.target.value as WalletPaymentMethod)} className="mt-2 h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-white">
                    {walletPaymentMethods.map((method) => <option key={method}>{method}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block text-sm text-slate-300">Linked Order (optional)
                  <select value={linkedOrderId} onChange={(event) => setLinkedOrderId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-white">
                    <option value="">No linked order</option>
                    {walletModalCustomer.relatedOrders.map((order) => <option key={order.supabaseId || order.id} value={order.supabaseId || ''}>{order.orderNo || order.id}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-sm text-slate-300">Date
                <input type="date" value={walletDate} onChange={(event) => setWalletDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-white" />
              </label>
              <label className="block text-sm text-slate-300">Remark
                <textarea rows={3} value={walletRemark} onChange={(event) => setWalletRemark(event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-[#334155] bg-[#0F172A] px-3 py-3 text-white" placeholder="Optional transaction note" />
              </label>
            </div>

            {walletModal.type === 'deduct' && toSafeNumber(walletAmount) > walletModalCustomer.walletBalance ? (
              <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">Insufficient wallet balance</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setWalletModal(null)} className="rounded-xl border border-[#334155] px-4 py-2.5 text-sm font-semibold text-slate-200">Cancel</button>
              <button type="button" onClick={submitWalletTransaction} disabled={walletBusy || toSafeNumber(walletAmount) <= 0 || (walletModal.type === 'deduct' && toSafeNumber(walletAmount) > walletModalCustomer.walletBalance)} className="inline-flex items-center gap-2 rounded-xl bg-[#C8A96B] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-45">
                <CreditCard size={15} /> {walletBusy ? 'Saving...' : walletModal.type === 'top_up' ? 'Confirm Top Up' : 'Confirm Deduction'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
