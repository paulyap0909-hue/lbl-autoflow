import React, { useEffect, useMemo, useState } from 'react';
import InvoiceTemplate from '../components/InvoiceTemplate';
import { supabase } from '../lib/supabase';
import { formatRM, toSafeNumber } from '../utils/pricing';

type InvoiceRecord = Record<string, unknown>;
type OrderRecord = Record<string, unknown>;

const getInvoiceNo = (invoice: InvoiceRecord) => String(invoice.invoice_no ?? invoice.invoiceNo ?? invoice.invoiceNumber ?? 'Untitled Invoice');
const getOrderNo = (invoice: InvoiceRecord) => String(invoice.order_no ?? invoice.orderNo ?? invoice.order_id ?? invoice.orderId ?? '');
const getCustomerName = (invoice: InvoiceRecord) => String(invoice.customer_name ?? invoice.customerName ?? 'Customer');
const getPhone = (invoice: InvoiceRecord) => String(invoice.phone ?? '');
const getAmount = (invoice: InvoiceRecord) => toSafeNumber(invoice.amount ?? invoice.total ?? invoice.totalAmount);
const getStatus = (invoice: InvoiceRecord) => String(invoice.status ?? invoice.payment_status ?? invoice.paymentStatus ?? 'Pending');

const statusClass = (status: string) => {
  if (status === 'Paid') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'Overdue') return 'border-rose-500/20 bg-rose-500/10 text-rose-200';
  return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
};

const loadInvoicesWithOrders = async (): Promise<InvoiceRecord[]> => {
  const { data, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (invoiceError) {
    console.error('Failed to load invoices:', invoiceError);
    throw invoiceError;
  }

  const invoiceRows = (data ?? []) as InvoiceRecord[];
  const orderIds = Array.from(
    new Set(
      invoiceRows
        .map((invoice) => invoice.order_id)
        .filter((orderId): orderId is string => typeof orderId === 'string' && orderId.length > 0)
    )
  );

  let ordersById = new Map<string, OrderRecord>();
  if (orderIds.length > 0) {
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .in('id', orderIds);

    if (orderError) {
      console.error('Failed to load invoice orders:', orderError);
    } else {
      ordersById = new Map((orderData ?? []).map((order) => [String(order.id), order as OrderRecord]));
    }
  }

  return invoiceRows.map((invoice) => {
    const matchingOrder = ordersById.get(String(invoice.order_id ?? '')) ?? {};
    return {
      ...matchingOrder,
      ...invoice,
      order_no: matchingOrder.order_no ?? invoice.order_id,
      customer_name: matchingOrder.customer_name,
      phone: matchingOrder.phone,
      address: matchingOrder.address,
      delivery_date: matchingOrder.delivery_date,
      delivery_time: matchingOrder.delivery_time,
      subtotal: matchingOrder.subtotal,
      delivery_fee: matchingOrder.delivery_fee,
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

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const reloadInvoices = async (selectedInvoiceId?: unknown) => {
    setIsLoading(true);
    setError('');
    try {
      const mergedInvoices = await loadInvoicesWithOrders();
      setInvoices(mergedInvoices);
      if (selectedInvoiceId) {
        const nextIndex = mergedInvoices.findIndex((invoice) => invoice.id === selectedInvoiceId);
        setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
      } else {
        setCurrentIndex(0);
      }
      return mergedInvoices;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : JSON.stringify(loadError);
      setError(message);
      setInvoices([]);
      throw loadError;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadInvoices().catch(() => undefined);
  }, []);

  const filteredInvoices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter((invoice) =>
      [getInvoiceNo(invoice), getOrderNo(invoice), getCustomerName(invoice), getPhone(invoice)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [invoices, searchTerm]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [searchTerm]);

  const selectedInvoice = filteredInvoices[currentIndex] ?? null;
  const stats = useMemo(() => {
    const paid = invoices.filter((invoice) => getStatus(invoice) === 'Paid').length;
    const overdue = invoices.filter((invoice) => getStatus(invoice) === 'Overdue').length;
    const pending = invoices.filter((invoice) => {
      const status = getStatus(invoice);
      return status !== 'Paid' && status !== 'Overdue';
    }).length;
    return { total: invoices.length, paid, pending, overdue };
  }, [invoices]);

  const goPrevious = () => setCurrentIndex((index) => Math.max(0, index - 1));
  const goNext = () => setCurrentIndex((index) => Math.min(filteredInvoices.length - 1, index + 1));

  const handleMarkSelectedInvoicePaid = async () => {
    if (!selectedInvoice?.id) {
      throw new Error('No invoice selected.');
    }

    console.log('Mark paid clicked', selectedInvoice);
    setError('');

    const { data: updatedInvoice, error: invoiceError } = await supabase
      .from('invoices')
      .update({ status: 'Paid' })
      .eq('id', selectedInvoice.id)
      .select()
      .single();

    console.log('Invoice update result', updatedInvoice);

    if (invoiceError) {
      console.error('Invoice paid update error:', invoiceError);
      setError(invoiceError.message);
      throw new Error(invoiceError.message);
    }

    if (selectedInvoice.order_id) {
      const { data: updatedOrder, error: orderError } = await supabase
        .from('orders')
        .update({
          payment_status: 'Paid',
          order_status: 'Paid'
        })
        .eq('id', selectedInvoice.order_id)
        .select()
        .maybeSingle();

      console.log('Order payment update result', updatedOrder);

      if (orderError) {
        console.error('Invoice paid update error:', orderError);
        setError(orderError.message);
        throw new Error(orderError.message);
      }
    }

    const refreshedInvoices = await reloadInvoices(selectedInvoice.id);
    console.log('Invoices reloaded after payment update', refreshedInvoices);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full bg-gold px-4 py-2 text-sm font-semibold text-charcoal">LBL INVOICE</div>
            <h3 className="text-3xl font-semibold text-cream">Invoice Management</h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">Browse, search and preview invoices loaded directly from Supabase.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={goPrevious}
              disabled={currentIndex <= 0}
              className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous Invoice
            </button>
            <div className="rounded-3xl border border-gold/20 bg-gold/10 px-5 py-3 text-sm font-semibold text-softGold">
              Invoice {filteredInvoices.length ? currentIndex + 1 : 0} / {filteredInvoices.length}
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex >= filteredInvoices.length - 1}
              className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next Invoice
            </button>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-[28px] border border-rose-500/20 bg-rose-500/10 p-5 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-rose-200">Supabase invoice error</p>
          <p className="mt-3 text-sm leading-6 text-rose-100">{error}</p>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ['Total Invoices', stats.total],
          ['Paid', stats.paid],
          ['Pending', stats.pending],
          ['Overdue', stats.overdue]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.24em] text-softGold">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <aside className="rounded-[32px] border border-white/10 bg-[#141414] p-4 shadow-panel xl:w-[300px]">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.28em] text-softGold">Invoice Sidebar</p>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search invoice, order, customer, phone"
              className="mt-4 w-full rounded-[22px] border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white outline-none focus:border-gold/60"
            />
          </div>

          <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
            {isLoading && <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5 text-sm text-slate-400">Loading invoices...</div>}
            {!isLoading && filteredInvoices.length === 0 && (
              <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5 text-sm text-slate-400">No invoices found</div>
            )}
            {filteredInvoices.map((invoice, index) => {
              const status = getStatus(invoice);
              const active = index === currentIndex;
              return (
                <button
                  key={`${getInvoiceNo(invoice)}-${index}`}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={`w-full rounded-[24px] border p-4 text-left transition ${
                    active ? 'border-gold bg-gold/10' : 'border-white/10 bg-[#0f0f0f] hover:border-gold/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{getInvoiceNo(invoice)}</p>
                      <p className="mt-1 text-sm text-slate-400">{getCustomerName(invoice)}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(status)}`}>{status}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-slate-500">{getOrderNo(invoice) || 'No order'}</span>
                    <span className="font-semibold text-softGold">{formatRM(getAmount(invoice))}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          {selectedInvoice ? (
            <InvoiceTemplate invoice={selectedInvoice} onMarkPaid={handleMarkSelectedInvoicePaid} />
          ) : (
            <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-10 text-center shadow-panel">
              <p className="text-xs uppercase tracking-[0.32em] text-softGold">Invoice</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">No invoice data available</h3>
              <p className="mt-3 text-sm text-slate-400">Invoices will appear here after they are created in Supabase.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
