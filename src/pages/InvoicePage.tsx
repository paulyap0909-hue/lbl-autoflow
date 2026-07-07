import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  MessageCircle,
  Printer,
  RefreshCw,
  Search
} from 'lucide-react';
import InvoiceTemplate from '../components/InvoiceTemplate';
import { supabase } from '../lib/supabase';
import { isOrderRecordAvailable } from '../utils/orderLifecycle';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';
import { formatRM, toSafeNumber } from '../utils/pricing';

type InvoiceRecord = Record<string, unknown>;
type OrderRecord = Record<string, unknown>;
type InvoiceFilter = 'All' | 'Pending' | 'Paid' | 'This Month';

type InvoicePageProps = {
  onMarkOrderPaid: (orderId: string | number) => void | Promise<void>;
};

const normalizeStatus = (value: unknown) => String(value ?? '').trim().toLowerCase();

const getInvoiceNo = (invoice: InvoiceRecord) =>
  String(invoice.invoice_no ?? invoice.invoiceNo ?? invoice.invoiceNumber ?? 'Missing Invoice No');

const getOrderNo = (invoice: InvoiceRecord) =>
  String(invoice.order_no ?? invoice.orderNo ?? invoice.order_id ?? invoice.orderId ?? '-');

const getCustomerName = (invoice: InvoiceRecord) =>
  String(invoice.customer_name ?? invoice.customerName ?? 'Customer');

const getPhone = (invoice: InvoiceRecord) => String(invoice.phone ?? '-');

const getAmount = (invoice: InvoiceRecord) =>
  toSafeNumber(invoice.grand_total ?? invoice.amount ?? invoice.total_amount ?? invoice.total);

const getStatus = (invoice: InvoiceRecord) => {
  const status = normalizeStatus(invoice.status ?? invoice.payment_status ?? invoice.paymentStatus);
  if (status === 'paid' || status === 'completed') return 'Paid';
  if (status === 'overdue') return 'Overdue';
  if (status === 'draft') return 'Draft';
  if (status === 'generated' || status === 'unsent') return 'Unsent';
  if (status === 'archived' || status === 'archive') return 'Archived';
  return 'Pending';
};

const getInvoiceDateValue = (invoice: InvoiceRecord) =>
  String(invoice.invoice_date ?? invoice.created_at ?? invoice.createdAt ?? '');

const getPaidDateValue = (invoice: InvoiceRecord) =>
  String(invoice.paid_at ?? invoice.paidAt ?? invoice.updated_at ?? invoice.updatedAt ?? '');

const getPaymentMethod = (invoice: InvoiceRecord) => {
  const explicit = invoice.payment_method ?? invoice.paymentMethod;
  if (explicit) return String(explicit);

  const remark = String(invoice.remark ?? '');
  const match = remark.match(/Payment Method:\s*([^\n\r]+)/i);
  return match?.[1]?.trim() || 'Not recorded';
};

const formatDate = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const isCurrentMonth = (value: string, malaysiaDate: string) =>
  Boolean(value && value.slice(0, 7) === malaysiaDate.slice(0, 7));

const isExcludedStatus = (value: unknown) => {
  const status = normalizeStatus(value);
  return ['cancelled', 'canceled', 'deleted', 'void', 'archived deleted', 'archived_deleted'].includes(status);
};

const isEligibleOrder = (order: OrderRecord) =>
  isOrderRecordAvailable(order) &&
  ![
    order.status,
    order.order_status,
    order.workflow_status,
    order.fulfillment_status
  ].some(isExcludedStatus);

const isEligibleInvoice = (invoice: InvoiceRecord) =>
  ![
    invoice.status,
    invoice.invoice_status,
    invoice.record_status
  ].some(isExcludedStatus) &&
  isOrderRecordAvailable(invoice);

const statusClass = (status: string) => {
  if (status === 'Paid') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'Overdue') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'Draft' || status === 'Unsent') return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  if (status === 'Archived') return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  return 'border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E]';
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadBlob = (content: BlobPart, type: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const loadInvoiceWorkspace = async () => {
  const [invoiceResult, orderResult] = await Promise.all([
    supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    supabase.from('orders').select('*')
  ]);

  if (invoiceResult.error) throw invoiceResult.error;
  if (orderResult.error) throw orderResult.error;

  const orders = (orderResult.data ?? []) as OrderRecord[];
  const eligibleOrders = orders.filter(isEligibleOrder);
  const ordersById = new Map(eligibleOrders.map((order) => [String(order.id), order]));

  return ((invoiceResult.data ?? []) as InvoiceRecord[])
    .filter(isEligibleInvoice)
    .flatMap((invoice): InvoiceRecord[] => {
      const orderId = invoice.order_id ?? invoice.orderId;
      const linkedOrder = orderId === null || orderId === undefined
        ? null
        : ordersById.get(String(orderId));

      // An invoice with a broken or deleted linked order must not affect billing totals.
      if (orderId !== null && orderId !== undefined && !linkedOrder) return [];

      return [{
        ...(linkedOrder ?? {}),
        ...invoice,
        invoice_id: invoice.id,
        order_no: linkedOrder?.order_no ?? invoice.order_no ?? invoice.order_id,
        customer_name: invoice.customer_name ?? linkedOrder?.customer_name,
        phone: invoice.phone ?? linkedOrder?.phone,
        payment_method: invoice.payment_method ?? linkedOrder?.payment_method,
        remark: invoice.remark ?? linkedOrder?.remark
      }];
    });
};

export default function InvoicePage({ onMarkOrderPaid }: InvoicePageProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [filter, setFilter] = useState<InvoiceFilter>('All');
  const [search, setSearch] = useState('');
  const [fullInvoiceOpen, setFullInvoiceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [error, setError] = useState('');

  const malaysiaDate = getMalaysiaDateTimeInputs().date;

  const reloadInvoices = async (preferredId?: unknown) => {
    setIsLoading(true);
    setError('');
    try {
      const rows = await loadInvoiceWorkspace();
      setInvoices(rows);
      setSelectedInvoice((current) => {
        const targetId = preferredId ?? current?.invoice_id ?? current?.id;
        return rows.find((invoice) => (invoice.invoice_id ?? invoice.id) === targetId) ?? rows[0] ?? null;
      });
    } catch (loadError) {
      console.error('Invoice Center load error:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load invoices from Supabase.');
      setInvoices([]);
      setSelectedInvoice(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reloadInvoices();
  }, []);

  useEffect(() => {
    setFullInvoiceOpen(false);
  }, [selectedInvoice?.invoice_id, selectedInvoice?.id]);

  useEffect(() => {
    setVisibleCount(40);
  }, [filter, search]);

  const pendingInvoices = useMemo(
    () => invoices.filter((invoice) => !['Paid', 'Archived'].includes(getStatus(invoice))),
    [invoices]
  );

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => getStatus(invoice) === 'Paid'),
    [invoices]
  );

  const historyRecords = useMemo(
    () => invoices.filter((invoice) => ['Paid', 'Archived'].includes(getStatus(invoice))),
    [invoices]
  );
  const historyInvoices = historyRecords.slice(0, 30);

  const kpis = useMemo(() => ({
    pendingPayment: pendingInvoices.reduce((sum, invoice) => sum + getAmount(invoice), 0),
    paidThisMonth: paidInvoices
      .filter((invoice) => isCurrentMonth(getPaidDateValue(invoice) || getInvoiceDateValue(invoice), malaysiaDate))
      .reduce((sum, invoice) => sum + getAmount(invoice), 0),
    totalInvoices: invoices.length
  }), [invoices.length, malaysiaDate, paidInvoices, pendingInvoices]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices
      .filter((invoice) => {
        const status = getStatus(invoice);
        if (status === 'Archived') return false;
        if (filter === 'Pending' && status === 'Paid') return false;
        if (filter === 'Paid' && status !== 'Paid') return false;
        if (filter === 'This Month' && !isCurrentMonth(getInvoiceDateValue(invoice), malaysiaDate)) return false;
        if (!query) return true;
        return [getInvoiceNo(invoice), getCustomerName(invoice), getPhone(invoice)]
          .some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const aDate = new Date(getInvoiceDateValue(a)).getTime() || 0;
        const bDate = new Date(getInvoiceDateValue(b)).getTime() || 0;
        return bDate - aDate;
      });
  }, [filter, invoices, malaysiaDate, search]);

  const displayedInvoices = filteredInvoices.slice(0, visibleCount);

  const printSelectedInvoice = () => {
    if (!selectedInvoice) return;
    setFullInvoiceOpen(true);
    window.setTimeout(() => window.print(), 150);
  };

  const handleMarkPaid = async () => {
    if (!selectedInvoice) return;
    const orderId = selectedInvoice.order_id ?? selectedInvoice.orderId;
    if (orderId === null || orderId === undefined || String(orderId).trim() === '') {
      setError('This invoice is missing its linked order.');
      return;
    }

    setIsMarkingPaid(true);
    setError('');
    try {
      await onMarkOrderPaid(String(orderId));
      await reloadInvoices(selectedInvoice.invoice_id ?? selectedInvoice.id);
    } catch (markError) {
      console.error('Invoice Mark Paid error:', markError);
      setError(markError instanceof Error ? markError.message : 'Failed to mark invoice as paid.');
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleWhatsApp = () => {
    if (!selectedInvoice) return;
    const digits = getPhone(selectedInvoice).replace(/\D/g, '');
    const phone = digits.startsWith('60') ? digits : digits.startsWith('0') ? `60${digits.slice(1)}` : '';
    if (!phone) {
      setError('A valid customer phone number is required for WhatsApp.');
      return;
    }

    const message = `Hi ${getCustomerName(selectedInvoice)}, thank you for your order with Layer By Layer Bakery.\n\nInvoice No: ${getInvoiceNo(selectedInvoice)}\nAmount: ${formatRM(getAmount(selectedInvoice))}\n\nPlease let us know once payment has been made. Thank you.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const exportRows = invoices.map((invoice) => ({
    'Invoice No': getInvoiceNo(invoice),
    'Invoice Date': getInvoiceDateValue(invoice).slice(0, 10),
    Customer: getCustomerName(invoice),
    Phone: getPhone(invoice),
    'Order No': getOrderNo(invoice),
    Amount: getAmount(invoice).toFixed(2),
    'Payment Status': getStatus(invoice),
    'Payment Method': getPaymentMethod(invoice),
    'Paid At': getPaidDateValue(invoice)
  }));

  const handleExportCsv = () => {
    const headers = Object.keys(exportRows[0] ?? {
      'Invoice No': '',
      'Invoice Date': '',
      Customer: '',
      Phone: '',
      'Order No': '',
      Amount: '',
      'Payment Status': '',
      'Payment Method': '',
      'Paid At': ''
    });
    const lines = [
      headers.map(csvCell).join(','),
      ...exportRows.map((row) => headers.map((header) => csvCell(row[header as keyof typeof row])).join(','))
    ];
    downloadBlob(`\uFEFF${lines.join('\r\n')}`, 'text/csv;charset=utf-8', `LBL-invoices-${malaysiaDate}.csv`);
  };

  const handleExportExcel = () => {
    const headers = Object.keys(exportRows[0] ?? {
      'Invoice No': '',
      'Invoice Date': '',
      Customer: '',
      Phone: '',
      'Order No': '',
      Amount: '',
      'Payment Status': '',
      'Payment Method': '',
      'Paid At': ''
    });
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const table = `
      <html><head><meta charset="UTF-8"></head><body><table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${exportRows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header as keyof typeof row])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></body></html>`;
    downloadBlob(table, 'application/vnd.ms-excel;charset=utf-8', `LBL-invoices-${malaysiaDate}.xls`);
  };

  return (
    <div className="space-y-4 bg-[#0F172A]">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #invoice-print-document,
          #invoice-print-document * {
            visibility: visible !important;
          }
          #invoice-print-document {
            position: absolute;
            inset: 0;
            width: 100%;
          }
        }
      `}</style>
      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#C8A96B]">Billing Operations</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Invoices</h1>
            <p className="mt-1 text-sm text-slate-400">Find invoices, collect payment and prepare accounting records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void reloadInvoices(selectedInvoice?.invoice_id ?? selectedInvoice?.id)}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#C8A96B]/50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <span className="rounded-lg border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3 py-2 text-xs font-semibold text-[#E4C98E]">Source: Supabase</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ['Pending Payment', formatRM(kpis.pendingPayment), 'Outstanding invoice amount'],
          ['Paid This Month', formatRM(kpis.paidThisMonth), 'Paid billing this month'],
          ['Total Invoices', String(kpis.totalInvoices), 'Active invoice records']
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </section>

      <section className="grid min-h-[560px] gap-4 xl:grid-cols-[35fr_65fr]">
        <aside className="min-w-0 rounded-[18px] border border-[#334155] bg-[#111111] p-3 shadow-panel">
          <div className="border-b border-[#334155] pb-3">
            <h2 className="text-sm font-semibold text-white">Invoice List</h2>
            <label className="relative mt-3 block">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice / customer / phone"
                className="h-9 w-full rounded-lg border border-[#334155] bg-[#0F172A] pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-[#C8A96B]/50"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['All', 'Pending', 'Paid', 'This Month'] as InvoiceFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`h-8 rounded-lg px-3 text-xs font-semibold transition ${
                    filter === option
                      ? 'bg-[#C8A96B] text-[#111111]'
                      : 'border border-[#334155] bg-[#0F172A] text-slate-300 hover:border-[#C8A96B]/40'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 max-h-[650px] space-y-1.5 overflow-y-auto pr-1">
            {isLoading && <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4 text-sm text-slate-400">Loading invoices...</div>}
            {!isLoading && displayedInvoices.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#334155] bg-[#0F172A] p-6 text-center text-sm text-slate-500">
                No invoices found.
              </div>
            )}
            {!isLoading && displayedInvoices.map((invoice) => {
              const selected = (invoice.invoice_id ?? invoice.id) === (selectedInvoice?.invoice_id ?? selectedInvoice?.id);
              const status = getStatus(invoice);
              return (
                <button
                  key={String(invoice.invoice_id ?? invoice.id ?? getInvoiceNo(invoice))}
                  type="button"
                  onClick={() => setSelectedInvoice(invoice)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selected
                      ? 'border-[#C8A96B] bg-[#C8A96B]/10'
                      : 'border-[#334155] bg-[#0F172A] hover:border-[#C8A96B]/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{getInvoiceNo(invoice)}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{getCustomerName(invoice)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(status)}`}>
                      {status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#E4C98E]">{formatRM(getAmount(invoice))}</p>
                </button>
              );
            })}
          </div>

          {filteredInvoices.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 40)}
              className="mt-3 w-full rounded-lg border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3 py-2 text-xs font-semibold text-[#E4C98E]"
            >
              Load More
            </button>
          )}
        </aside>

        <main className="min-w-0 rounded-[18px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
          {selectedInvoice ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 border-b border-[#334155] pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#C8A96B]">Invoice Details</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{getInvoiceNo(selectedInvoice)}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFullInvoiceOpen((open) => !open)}
                  className="h-8 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs font-semibold text-slate-300 transition hover:border-[#C8A96B]/50"
                >
                  {fullInvoiceOpen ? 'Hide Full Invoice' : 'Show Full Invoice'}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Invoice Number', getInvoiceNo(selectedInvoice)],
                  ['Customer', getCustomerName(selectedInvoice)],
                  ['Phone', getPhone(selectedInvoice)],
                  ['Amount', formatRM(getAmount(selectedInvoice))],
                  ['Payment Status', getStatus(selectedInvoice)],
                  ['Payment Method', getPaymentMethod(selectedInvoice)],
                  ['Linked Order', getOrderNo(selectedInvoice)]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#334155] bg-[#0F172A] p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <p className="mt-1.5 truncate text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 border-y border-[#334155] py-3">
                <button type="button" onClick={printSelectedInvoice} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#C8A96B] px-3 text-xs font-semibold text-[#111111]">
                  <Download size={14} /> Download PDF
                </button>
                <button type="button" onClick={printSelectedInvoice} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs font-semibold text-slate-200">
                  <Printer size={14} /> Print
                </button>
                <button type="button" onClick={handleWhatsApp} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200">
                  <MessageCircle size={14} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => void handleMarkPaid()}
                  disabled={getStatus(selectedInvoice) === 'Paid' || isMarkingPaid}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  {getStatus(selectedInvoice) === 'Paid' ? 'Paid' : isMarkingPaid ? 'Updating...' : 'Mark Paid'}
                </button>
              </div>

              {!fullInvoiceOpen && (
                <div className="rounded-xl border border-dashed border-[#334155] bg-[#0F172A] px-5 py-8 text-center">
                  <p className="text-sm font-semibold text-white">Invoice ready for payment follow-up</p>
                  <p className="mt-1 text-xs text-slate-500">Use Show Full Invoice only when you need the complete document.</p>
                </div>
              )}

              {fullInvoiceOpen && (
                <div id="invoice-print-document">
                  <InvoiceTemplate
                    invoice={selectedInvoice}
                    onMarkPaid={handleMarkPaid}
                    previewMode="full"
                    showChrome={false}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-center">
              <div>
                <p className="text-sm font-semibold text-white">No invoice selected</p>
                <p className="mt-2 text-xs text-slate-500">Choose an invoice from the list to view payment details.</p>
              </div>
            </div>
          )}
        </main>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.03]"
          aria-expanded={historyOpen}
        >
          <div>
            <p className="text-sm font-semibold text-white">Invoice History</p>
            <p className="mt-0.5 text-xs text-slate-500">Paid and historical billing records</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">{historyRecords.length}</span>
            {historyOpen ? <ChevronUp size={17} className="text-[#C8A96B]" /> : <ChevronDown size={17} className="text-[#C8A96B]" />}
          </div>
        </button>
        {historyOpen && (
          <div className="border-t border-[#334155] p-3">
            {historyInvoices.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-500">No paid invoice history yet.</p>
            ) : (
              <div className="space-y-1.5">
                {historyInvoices.map((invoice) => (
                  <button
                    key={`history-${String(invoice.invoice_id ?? invoice.id ?? getInvoiceNo(invoice))}`}
                    type="button"
                    onClick={() => setSelectedInvoice(invoice)}
                    className="grid w-full gap-2 rounded-lg border border-[#334155] bg-[#0F172A] px-3 py-2 text-left text-xs transition hover:border-[#C8A96B]/40 sm:grid-cols-[1.2fr_1.3fr_0.8fr_0.8fr] sm:items-center"
                  >
                    <span className="font-semibold text-white">{getInvoiceNo(invoice)}</span>
                    <span className="truncate text-slate-300">{getCustomerName(invoice)}</span>
                    <span className="font-semibold text-emerald-200">{formatRM(getAmount(invoice))}</span>
                    <span className="text-slate-500">{formatDate(getPaidDateValue(invoice) || getInvoiceDateValue(invoice))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#C8A96B]">Accounting Export</p>
            <h2 className="mt-1 text-base font-semibold text-white">Export invoice records</h2>
            <p className="mt-1 text-xs text-slate-500">{invoices.length} valid invoices ready for accounting.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleExportExcel} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#C8A96B] px-3 text-xs font-semibold text-[#111111]">
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button type="button" onClick={handleExportCsv} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs font-semibold text-slate-200">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
