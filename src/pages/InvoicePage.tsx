import React, { useEffect, useMemo, useState } from 'react';
import { Archive as ArchiveIcon, ChevronDown, ChevronUp, Filter, Search } from 'lucide-react';
import InvoiceTemplate from '../components/InvoiceTemplate';
import { supabase } from '../lib/supabase';
import { formatRM, toSafeNumber } from '../utils/pricing';

type InvoiceRecord = Record<string, unknown>;
type OrderRecord = Record<string, unknown>;
type InvoiceTab = 'Need Action' | 'Pending' | 'Overdue' | 'Paid Today' | 'Archive';
type InvoicePageProps = {
  onMarkOrderPaid: (orderId: string | number) => void | Promise<void>;
};

const ACTIVE_PAGE_SIZE = 20;
const ARCHIVE_PAGE_SIZE = 20;
const tabs: InvoiceTab[] = ['Need Action', 'Pending', 'Overdue', 'Paid Today', 'Archive'];
const actionStatuses = ['Pending', 'pending', 'Overdue', 'overdue', 'Draft', 'draft', 'Unsent', 'unsent', 'generated'];

const getInvoiceNo = (invoice: InvoiceRecord) => String(invoice.invoice_no ?? invoice.invoiceNo ?? invoice.invoiceNumber ?? 'Untitled Invoice');
const getOrderNo = (invoice: InvoiceRecord) => String(invoice.order_no ?? invoice.orderNo ?? invoice.order_id ?? invoice.orderId ?? '');
const getCustomerName = (invoice: InvoiceRecord) => String(invoice.customer_name ?? invoice.customerName ?? 'Customer');
const getPhone = (invoice: InvoiceRecord) => String(invoice.phone ?? '');
const getAmount = (invoice: InvoiceRecord) => toSafeNumber(invoice.grand_total ?? invoice.amount ?? invoice.total ?? invoice.totalAmount);
const getStatus = (invoice: InvoiceRecord) => {
  const raw = String(invoice.status ?? invoice.payment_status ?? invoice.paymentStatus ?? 'Pending').trim();
  const normalized = raw.toLowerCase();
  if (normalized === 'paid' || normalized === 'completed') return 'Paid';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'unsent' || normalized === 'generated') return 'Unsent';
  return 'Pending';
};
const getInvoiceDate = (invoice: InvoiceRecord) => String(invoice.paid_at ?? invoice.updated_at ?? invoice.invoice_date ?? invoice.created_at ?? '');
const getDateKey = (invoice: InvoiceRecord) => getInvoiceDate(invoice).slice(0, 10);
const todayKey = () => new Date().toISOString().slice(0, 10);

const statusClass = (status: string) => {
  if (status === 'Paid') return 'border-[#10B981]/30 bg-[#10B981]/10 text-[#6EE7B7]';
  if (status === 'Overdue') return 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FCA5A5]';
  if (status === 'Draft' || status === 'Unsent') return 'border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#93C5FD]';
  return 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E]';
};

const formatInvoiceDate = (invoice: InvoiceRecord) => {
  const raw = getInvoiceDate(invoice);
  if (!raw) return '-';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const enrichInvoicesWithOrders = async (invoiceRows: InvoiceRecord[]): Promise<InvoiceRecord[]> => {
  const orderIds = Array.from(new Set(invoiceRows.map((invoice) => invoice.order_id).filter((value) => value !== null && value !== undefined)));
  let ordersById = new Map<string, OrderRecord>();

  if (orderIds.length > 0) {
    const { data: orderData, error: orderError } = await supabase.from('orders').select('*').in('id', orderIds);
    if (orderError) {
      console.error('Failed to load invoice orders:', orderError);
    } else {
      ordersById = new Map((orderData ?? []).map((order) => [String(order.id), order as OrderRecord]));
    }
  }

  return invoiceRows.map((invoice): InvoiceRecord => {
    const matchingOrder = ordersById.get(String(invoice.order_id ?? '')) ?? {};
    return {
      ...matchingOrder,
      ...invoice,
      order_no: matchingOrder.order_no ?? invoice.order_id,
      customer_name: invoice.customer_name ?? matchingOrder.customer_name,
      phone: invoice.phone ?? matchingOrder.phone,
      address: invoice.address ?? matchingOrder.address,
      delivery_date: matchingOrder.delivery_date,
      delivery_time: matchingOrder.delivery_time,
      subtotal: invoice.subtotal ?? matchingOrder.subtotal,
      delivery_fee: invoice.delivery_fee ?? matchingOrder.delivery_fee,
      total: invoice.amount ?? matchingOrder.total,
      payment_status: invoice.status ?? matchingOrder.payment_status,
      paymentStatus: invoice.status ?? matchingOrder.payment_status,
      order_status: matchingOrder.order_status,
      product: matchingOrder.product,
      flavours: matchingOrder.flavours,
      quantity: matchingOrder.quantity
    };
  });
};

const loadActiveInvoices = async (limit: number) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .in('status', actionStatuses)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return enrichInvoicesWithOrders((data ?? []) as InvoiceRecord[]);
};

const loadPaidTodayInvoices = async () => {
  const today = todayKey();
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .in('status', ['Paid', 'paid', 'Completed', 'completed'])
    .gte('updated_at', `${today}T00:00:00`)
    .lt('updated_at', `${today}T23:59:59.999`)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return enrichInvoicesWithOrders((data ?? []) as InvoiceRecord[]);
};

const loadArchiveInvoices = async ({
  page,
  search,
  dateFrom,
  dateTo,
  status
}: {
  page: number;
  search: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}) => {
  const offset = (page - 1) * ARCHIVE_PAGE_SIZE;
  let orderIds: Array<string | number> = [];
  const query = search.trim();

  if (query) {
    const { data: matchingOrders } = await supabase
      .from('orders')
      .select('id')
      .or(`customer_name.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(200);
    orderIds = (matchingOrders ?? []).map((order) => order.id);
  }

  let archiveQuery = supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + ARCHIVE_PAGE_SIZE - 1);

  if (query) {
    const escaped = query.replace(/,/g, '');
    archiveQuery = orderIds.length
      ? archiveQuery.or(`invoice_no.ilike.%${escaped}%,order_id.in.(${orderIds.join(',')})`)
      : archiveQuery.ilike('invoice_no', `%${escaped}%`);
  }
  if (dateFrom) archiveQuery = archiveQuery.gte('updated_at', `${dateFrom}T00:00:00`);
  if (dateTo) archiveQuery = archiveQuery.lte('updated_at', `${dateTo}T23:59:59.999`);
  if (status === 'Unsent') {
    archiveQuery = archiveQuery.in('status', ['Unsent', 'unsent', 'generated']);
  } else if (status !== 'All') {
    archiveQuery = archiveQuery.ilike('status', status);
  }

  const { data, error, count } = await archiveQuery;
  if (error) throw error;
  return {
    rows: await enrichInvoicesWithOrders((data ?? []) as InvoiceRecord[]),
    count: count ?? 0
  };
};

export default function InvoicePage({ onMarkOrderPaid }: InvoicePageProps) {
  const [activeInvoices, setActiveInvoices] = useState<InvoiceRecord[]>([]);
  const [paidTodayInvoices, setPaidTodayInvoices] = useState<InvoiceRecord[]>([]);
  const [archiveInvoices, setArchiveInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [activeTab, setActiveTab] = useState<InvoiceTab>('Need Action');
  const [activeLimit, setActiveLimit] = useState(ACTIVE_PAGE_SIZE);
  const [paidOpen, setPaidOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [fullInvoiceOpen, setFullInvoiceOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveDateFrom, setArchiveDateFrom] = useState('');
  const [archiveDateTo, setArchiveDateTo] = useState('');
  const [archiveStatus, setArchiveStatus] = useState('All');
  const [archivePage, setArchivePage] = useState(1);
  const [archiveCount, setArchiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [error, setError] = useState('');

  const reloadPrimaryInvoices = async (preferredId?: unknown) => {
    setIsLoading(true);
    setError('');
    try {
      const [activeRows, paidRows] = await Promise.all([
        loadActiveInvoices(activeLimit + 1),
        loadPaidTodayInvoices()
      ]);
      setActiveInvoices(activeRows);
      setPaidTodayInvoices(paidRows);
      const combined = [...activeRows, ...paidRows];
      const preferred = combined.find((invoice) => invoice.id === preferredId);
      setSelectedInvoice((current) => preferred ?? combined.find((invoice) => invoice.id === current?.id) ?? combined[0] ?? null);
    } catch (loadError) {
      console.error('Invoice Management load error:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load invoices from Supabase.');
      setActiveInvoices([]);
      setPaidTodayInvoices([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadPrimaryInvoices().catch(() => undefined);
  }, [activeLimit]);

  useEffect(() => {
    if (activeTab !== 'Archive') return;
    let mounted = true;
    setArchiveLoading(true);
    loadArchiveInvoices({
      page: archivePage,
      search: archiveSearch,
      dateFrom: archiveDateFrom,
      dateTo: archiveDateTo,
      status: archiveStatus
    })
      .then(({ rows, count }) => {
        if (!mounted) return;
        setArchiveInvoices(rows);
        setArchiveCount(count);
        setSelectedInvoice((current) => rows.find((invoice) => invoice.id === current?.id) ?? rows[0] ?? current);
        setError('');
      })
      .catch((loadError) => {
        console.error('Invoice archive load error:', loadError);
        if (!mounted) return;
        setArchiveInvoices([]);
        setArchiveCount(0);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load invoice archive.');
      })
      .finally(() => {
        if (mounted) setArchiveLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeTab, archiveDateFrom, archiveDateTo, archivePage, archiveSearch, archiveStatus]);

  useEffect(() => {
    setArchivePage(1);
  }, [archiveDateFrom, archiveDateTo, archiveSearch, archiveStatus]);

  useEffect(() => {
    setFullInvoiceOpen(false);
  }, [selectedInvoice?.id]);

  const needActionInvoices = activeInvoices.filter((invoice) => ['Pending', 'Overdue', 'Draft', 'Unsent'].includes(getStatus(invoice)));
  const currentList = activeTab === 'Archive'
    ? archiveInvoices
    : activeTab === 'Paid Today'
      ? paidTodayInvoices
      : activeTab === 'Need Action'
        ? needActionInvoices
        : activeInvoices.filter((invoice) => getStatus(invoice) === activeTab);
  const activeHasMore = activeInvoices.length > activeLimit;
  const displayedCurrentList = currentList.slice(0, activeTab === 'Archive' ? ARCHIVE_PAGE_SIZE : activeLimit);
  const archivePageCount = Math.max(Math.ceil(archiveCount / ARCHIVE_PAGE_SIZE), 1);

  const stats = useMemo(() => ({
    needAction: needActionInvoices.length,
    pending: activeInvoices.filter((invoice) => getStatus(invoice) === 'Pending').length,
    overdue: activeInvoices.filter((invoice) => getStatus(invoice) === 'Overdue').length,
    paidToday: paidTodayInvoices.length
  }), [activeInvoices, needActionInvoices.length, paidTodayInvoices.length]);

  const knownInvoices = useMemo(() => {
    const invoiceMap = new Map<string, InvoiceRecord>();
    [...activeInvoices, ...paidTodayInvoices, ...archiveInvoices].forEach((invoice) => {
      invoiceMap.set(String(invoice.id ?? getInvoiceNo(invoice)), invoice);
    });
    return Array.from(invoiceMap.values());
  }, [activeInvoices, archiveInvoices, paidTodayInvoices]);

  const kpis = useMemo(() => {
    const totalAmount = knownInvoices.reduce((sum, invoice) => sum + getAmount(invoice), 0);
    const pendingInvoices = knownInvoices.filter((invoice) => getStatus(invoice) !== 'Paid');
    const paidInvoices = knownInvoices.filter((invoice) => getStatus(invoice) === 'Paid');
    const pendingAmount = pendingInvoices.reduce((sum, invoice) => sum + getAmount(invoice), 0);
    const paidAmount = paidInvoices.reduce((sum, invoice) => sum + getAmount(invoice), 0);
    return {
      totalInvoices: knownInvoices.length,
      pendingAmount,
      paidAmount,
      unpaidInvoices: pendingInvoices.length,
      paidInvoices: paidInvoices.length,
      averageInvoiceValue: knownInvoices.length ? totalAmount / knownInvoices.length : 0
    };
  }, [knownInvoices]);

  const handleMarkSelectedInvoicePaid = async () => {
    if (!selectedInvoice?.id) throw new Error('No invoice selected.');
    if (!selectedInvoice.order_id) throw new Error('Invoice is missing linked order.');
    setError('');
    await onMarkOrderPaid(String(selectedInvoice.order_id));

    await reloadPrimaryInvoices(selectedInvoice.id);
  };

  return (
    <div className="space-y-4 bg-[#0F172A]">
      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#C8A96B]">Billing Operations</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Invoice Command Center</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Manage invoice status, payment follow-up and billing records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => reloadPrimaryInvoices(selectedInvoice?.id)} disabled={isLoading} className="rounded-xl bg-[#C8A96B] px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#d6b77d] disabled:opacity-50">
              {isLoading ? 'Refreshing...' : 'Refresh Invoices'}
            </button>
            <span className="rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E]">Source: Supabase</span>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-[18px] border border-[#EF4444]/30 bg-[#EF4444]/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#FCA5A5]">Supabase invoice fallback</p>
          <p className="mt-2 text-sm text-[#FECACA]">{error}</p>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {([
          ['Need Action', stats.needAction, 'Review invoices requiring staff action.'],
          ['Pending Payment', stats.pending, 'Follow up unpaid customer invoices.'],
          ['Overdue', stats.overdue, 'Prioritize payment reminder today.'],
          ['Paid Today', stats.paidToday, 'Confirm paid records and receipts.'],
          ['Archived', archiveCount, 'Search older billing history.']
        ] as const).map(([label, count, hint]) => {
          const targetTab: InvoiceTab = label === 'Archived' ? 'Archive' : label === 'Pending Payment' ? 'Pending' : label;
          return (
            <button key={label} type="button" onClick={() => setActiveTab(targetTab)} className={`rounded-[16px] border p-3.5 text-left shadow-panel transition ${activeTab === targetTab ? 'border-[#C8A96B]/70 bg-[#C8A96B]/10' : 'border-[#334155] bg-[#111111] hover:border-[#C8A96B]/40'}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
                <span className="rounded-full bg-[#C8A96B]/15 px-3 py-1 text-sm font-semibold text-[#E4C98E]">{count}</span>
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-400">{hint}</p>
            </button>
          );
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          ['Total Invoices', kpis.totalInvoices],
          ['Pending Amount', formatRM(kpis.pendingAmount)],
          ['Paid Amount', formatRM(kpis.paidAmount)],
          ['Unpaid Invoices', kpis.unpaidInvoices],
          ['Paid Invoices', kpis.paidInvoices],
          ['Average Invoice Value', formatRM(kpis.averageInvoiceValue)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel transition hover:border-[#C8A96B]/40">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      {activeTab === 'Archive' && (
        <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4">
          <div className="mb-3 flex items-center gap-2 text-[#C8A96B]"><Filter size={16} /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Archive Filters</span></div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr]">
            <label className="relative">
              <Search size={15} className="absolute left-3 top-3.5 text-slate-500" />
              <input value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="Invoice no, customer or phone" className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#C8A96B]/50" />
            </label>
            <input type="date" value={archiveDateFrom} onChange={(event) => setArchiveDateFrom(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none" />
            <input type="date" value={archiveDateTo} onChange={(event) => setArchiveDateTo(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none" />
            <select value={archiveStatus} onChange={(event) => setArchiveStatus(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none">
              <option>All</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Overdue</option>
              <option>Draft</option>
              <option>Unsent</option>
            </select>
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Compact Invoice Queue</p>
              <p className="mt-1 text-xs text-slate-500">{activeTab === 'Archive' ? '20 records per page' : 'Invoices requiring attention'}</p>
            </div>
            {activeTab === 'Archive' && <ArchiveIcon size={18} className="text-[#C8A96B]" />}
          </div>

          <div className="max-h-[780px] space-y-2 overflow-y-auto pr-1">
            {(isLoading || archiveLoading) && <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-5 text-sm text-slate-400">Loading invoices...</div>}
            {!isLoading && !archiveLoading && displayedCurrentList.length === 0 && <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] p-5 text-center text-sm text-slate-400">No invoices in this view.</div>}
            {!isLoading && !archiveLoading && displayedCurrentList.map((invoice) => {
              const status = getStatus(invoice);
              const active = invoice.id === selectedInvoice?.id;
              return (
                <button key={String(invoice.id ?? getInvoiceNo(invoice))} type="button" onClick={() => setSelectedInvoice(invoice)} className={`w-full rounded-[16px] border p-3 text-left transition ${active ? 'border-[#C8A96B] bg-[#C8A96B]/10' : 'border-[#334155] bg-[#0F172A] hover:border-[#C8A96B]/40'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{getInvoiceNo(invoice)}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{getCustomerName(invoice)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(status)}`}>{status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="truncate text-slate-500">{getOrderNo(invoice) || 'No order'}</span>
                    <span className="font-semibold text-[#C8A96B]">{formatRM(getAmount(invoice))}</span>
                  </div>
                  <p className="mt-2 truncate text-[11px] text-slate-500">{formatInvoiceDate(invoice)}</p>
                </button>
              );
            })}
          </div>

          {activeTab !== 'Archive' && activeHasMore && (
            <button type="button" onClick={() => setActiveLimit((limit) => limit + ACTIVE_PAGE_SIZE)} className="mt-3 w-full rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-4 py-3 text-xs font-semibold text-[#C8A96B]">View More Active Invoices</button>
          )}
          {activeTab === 'Archive' && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#334155] pt-4">
              <span className="text-xs text-slate-500">Page {archivePage} / {archivePageCount}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setArchivePage((page) => Math.max(page - 1, 1))} disabled={archivePage === 1} className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Prev</button>
                <button type="button" onClick={() => setArchivePage((page) => Math.min(page + 1, archivePageCount))} disabled={archivePage >= archivePageCount} className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 space-y-4">
          {selectedInvoice ? (
            <>
              <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#C8A96B]">Selected Invoice Summary</p>
                    <h4 className="mt-2 text-xl font-semibold text-white">{getInvoiceNo(selectedInvoice)}</h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(getStatus(selectedInvoice))}`}>{getStatus(selectedInvoice)}</span>
                    <button
                      type="button"
                      onClick={() => setFullInvoiceOpen((current) => !current)}
                      className="rounded-full border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-4 py-2 text-xs font-semibold text-[#E4C98E] transition hover:border-[#C8A96B]/60 hover:bg-[#C8A96B]/20"
                    >
                      {fullInvoiceOpen ? 'Collapse Invoice' : 'Show Full Invoice'}
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['Invoice Status', getStatus(selectedInvoice)],
                    ['Payment Status', String(selectedInvoice.payment_status ?? selectedInvoice.paymentStatus ?? selectedInvoice.status ?? 'Pending')],
                    ['Order Status', String(selectedInvoice.order_status ?? selectedInvoice.orderStatus ?? '-')],
                    ['Amount', formatRM(getAmount(selectedInvoice))],
                    ['Customer', getCustomerName(selectedInvoice)],
                    ['Delivery Date', String(selectedInvoice.delivery_date ?? selectedInvoice.deliveryDate ?? '-')]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                      <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
              <InvoiceTemplate invoice={selectedInvoice} onMarkPaid={handleMarkSelectedInvoicePaid} previewMode={fullInvoiceOpen ? 'full' : 'compact'} />
            </>
          ) : (
            <div className="rounded-[18px] border border-[#334155] bg-[#111111] p-7 text-center shadow-panel">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C8A96B]">Invoice Preview</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">No invoice selected</h3>
              <p className="mt-3 text-sm text-slate-400">Choose an invoice from the active list, paid list, or archive.</p>
            </div>
          )}
        </main>
      </div>

      <section className="overflow-hidden rounded-[20px] border border-[#334155] bg-[#111111] shadow-panel">
        <button type="button" onClick={() => setPaidOpen((current) => !current)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]" aria-expanded={paidOpen}>
          <div>
            <p className="font-semibold text-white">Paid Invoices Today</p>
            <p className="mt-1 text-xs text-slate-500">Uses paid_at when available, otherwise updated_at</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-semibold text-[#6EE7B7]">{paidTodayInvoices.length}</span>
            {paidOpen ? <ChevronUp size={18} className="text-[#C8A96B]" /> : <ChevronDown size={18} className="text-[#C8A96B]" />}
          </div>
        </button>

        {paidOpen && (
          <div className="border-t border-[#334155]">
            <div className="hidden grid-cols-[1.2fr_1.2fr_0.8fr_1fr_auto] gap-4 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-slate-500 md:grid">
              <span>Invoice No</span><span>Customer Name</span><span>Amount</span><span>Paid / Updated</span><span>Action</span>
            </div>
            {paidTodayInvoices.map((invoice) => (
              <div key={`paid-${String(invoice.id ?? getInvoiceNo(invoice))}`} className="grid gap-3 border-t border-[#334155] px-5 py-4 text-sm md:grid-cols-[1.2fr_1.2fr_0.8fr_1fr_auto] md:items-center">
                <span className="font-semibold text-white">{getInvoiceNo(invoice)}</span>
                <span className="text-slate-300">{getCustomerName(invoice)}</span>
                <span className="font-semibold text-[#6EE7B7]">{formatRM(getAmount(invoice))}</span>
                <span className="text-slate-400">{formatInvoiceDate(invoice)}</span>
                <button type="button" onClick={() => setSelectedInvoice(invoice)} className="rounded-lg border border-[#C8A96B]/30 px-3 py-2 text-xs font-semibold text-[#C8A96B]">View</button>
              </div>
            ))}
            {!isLoading && paidTodayInvoices.length === 0 && <p className="border-t border-[#334155] px-5 py-8 text-center text-sm text-slate-500">No paid invoices today.</p>}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#334155] bg-[#111111] shadow-panel">
        <button
          type="button"
          onClick={() => {
            setArchiveOpen((current) => !current);
            setActiveTab('Archive');
          }}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
          aria-expanded={archiveOpen}
        >
          <div>
            <p className="font-semibold text-white">Archived / Paid History</p>
            <p className="mt-1 text-xs text-slate-500">Search older billing records only when needed.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3 py-1 text-xs font-semibold text-[#E4C98E]">{archiveCount}</span>
            {archiveOpen ? <ChevronUp size={18} className="text-[#C8A96B]" /> : <ChevronDown size={18} className="text-[#C8A96B]" />}
          </div>
        </button>

        {archiveOpen && (
          <div className="border-t border-[#334155] p-4">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr]">
              <label className="relative">
                <Search size={15} className="absolute left-3 top-3.5 text-slate-500" />
                <input value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder="Invoice no, customer or phone" className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#C8A96B]/50" />
              </label>
              <input type="date" value={archiveDateFrom} onChange={(event) => setArchiveDateFrom(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none" />
              <input type="date" value={archiveDateTo} onChange={(event) => setArchiveDateTo(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none" />
              <select value={archiveStatus} onChange={(event) => setArchiveStatus(event.target.value)} className="h-11 rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm text-white outline-none">
                <option>All</option>
                <option>Paid</option>
                <option>Pending</option>
                <option>Overdue</option>
                <option>Draft</option>
                <option>Unsent</option>
              </select>
            </div>

            <div className="mt-4 space-y-2">
              {archiveLoading && <div className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-5 text-sm text-slate-400">Loading archive...</div>}
              {!archiveLoading && archiveInvoices.length === 0 && <div className="rounded-[16px] border border-dashed border-[#334155] bg-[#0F172A] p-6 text-center text-sm text-slate-500">No archived invoices in this filter.</div>}
              {!archiveLoading && archiveInvoices.map((invoice) => (
                <button key={`archive-${String(invoice.id ?? getInvoiceNo(invoice))}`} type="button" onClick={() => setSelectedInvoice(invoice)} className="grid w-full gap-3 rounded-[14px] border border-[#334155] bg-[#0F172A] p-3 text-left text-sm transition hover:border-[#C8A96B]/40 md:grid-cols-[1.1fr_1.2fr_0.8fr_1fr_auto] md:items-center">
                  <span className="truncate font-semibold text-white">{getInvoiceNo(invoice)}</span>
                  <span className="truncate text-slate-300">{getCustomerName(invoice)}</span>
                  <span className="font-semibold text-[#E4C98E]">{formatRM(getAmount(invoice))}</span>
                  <span className="text-xs text-slate-500">{formatInvoiceDate(invoice)}</span>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(getStatus(invoice))}`}>{getStatus(invoice)}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#334155] pt-4">
              <span className="text-xs text-slate-500">Page {archivePage} / {archivePageCount}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setArchivePage((page) => Math.max(page - 1, 1))} disabled={archivePage === 1} className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Prev</button>
                <button type="button" onClick={() => setArchivePage((page) => Math.min(page + 1, archivePageCount))} disabled={archivePage >= archivePageCount} className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
