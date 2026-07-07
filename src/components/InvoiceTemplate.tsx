import React, { useState } from 'react';
import { BadgeCheck, Building2, Download, Mail, MapPin, Phone, Printer, Send } from 'lucide-react';
import type { Order } from '../data/mockData';
import Toast from './Toast';
import { formatRM, toSafeNumber } from '../utils/pricing';

type InvoiceTemplateProps = {
  invoice?: Record<string, unknown> | null;
  order?: Partial<Order> | Record<string, unknown> | null;
  onMarkPaid?: () => void | Promise<void>;
  previewMode?: 'compact' | 'full';
  showChrome?: boolean;
};

type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

const COMPANY = {
  name: 'Layer By Layer Bakery',
  address: '11-2, Jalan Cecawi 6/19B, Kota Damansara, 47810 Petaling Jaya, Selangor',
  phone: '019-4937139',
  email: 'layerbylayermy@gmail.com',
  ssm: 'RA0128892-A',
  bankName: 'Maybank',
  bankAccount: '5145 8954 8255',
  bankHolder: 'Layer By Layer Bakery'
};

const formatCurrency = formatRM;

const textOf = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== 'null' && text !== 'undefined') return text;
  }
  return '';
};

const dateOf = (...values: unknown[]) => {
  const raw = textOf(...values);
  if (!raw) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

const getStatusColor = (status: string) => {
  const normalised = status.toLowerCase();
  if (normalised.includes('paid')) return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  if (normalised.includes('pending')) return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
  if (normalised.includes('overdue')) return 'border-rose-500/25 bg-rose-500/10 text-rose-200';
  return 'border-white/10 bg-white/5 text-slate-300';
};

const splitEvenly = (quantity: number, count: number) => {
  if (!count) return [];
  const base = Math.floor(quantity / count);
  const remainder = quantity % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
};

const buildItems = (
  rawItems: unknown,
  rawFlavours: unknown,
  fallbackProduct: string,
  quantity: number,
  unitPrice: number
): InvoiceItem[] => {
  if (Array.isArray(rawItems) && rawItems.length) {
    return rawItems.map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const description = textOf(
        record.description,
        record.name,
        record.flavour,
        record.flavor,
        record.product_name,
        record.product,
        fallbackProduct
      );
      return {
        description,
        quantity: Math.max(1, toSafeNumber(record.quantity ?? record.qty ?? 1)),
        unitPrice: toSafeNumber(record.unitPrice ?? record.unit_price ?? record.price ?? unitPrice)
      };
    });
  }

  if (Array.isArray(rawFlavours) && rawFlavours.length) {
    const amounts = splitEvenly(Math.max(1, quantity), rawFlavours.length);
    return rawFlavours.map((flavour, index) => ({
      description: textOf(flavour, fallbackProduct),
      quantity: Math.max(1, amounts[index] ?? 1),
      unitPrice
    }));
  }

  return [{ description: fallbackProduct, quantity: Math.max(1, quantity), unitPrice }];
};

export default function InvoiceTemplate({ invoice, order, onMarkPaid, previewMode = 'full', showChrome = true }: InvoiceTemplateProps) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const safeInvoice = (invoice ?? {}) as Record<string, unknown>;
  const safeOrder = (order ?? {}) as Record<string, unknown>;

  const paymentStatus = textOf(
    safeInvoice.paymentStatus,
    safeInvoice.payment_status,
    safeInvoice.status,
    safeOrder.paymentStatus,
    safeOrder.payment_status,
    'Pending'
  );

  const orderStatus = textOf(
    safeInvoice.orderStatus,
    safeInvoice.order_status,
    safeInvoice.kitchenStatus,
    safeInvoice.kitchen_status,
    safeOrder.orderStatus,
    safeOrder.order_status,
    safeOrder.kitchenStatus,
    safeOrder.kitchen_status,
    safeOrder.status,
    'New'
  );

  const orderRef = textOf(
    safeInvoice.orderNo,
    safeInvoice.order_no,
    safeOrder.orderNo,
    safeOrder.order_no,
    safeInvoice.orderId,
    safeInvoice.order_id,
    safeOrder.orderId,
    safeOrder.order_id,
    safeOrder.id
  );

  const invoiceNumber = textOf(
    safeInvoice.invoiceNumber,
    safeInvoice.invoice_no,
    safeInvoice.invoiceNo,
    orderRef ? orderRef.replace(/^LBL-/, 'INV-') : ''
  );

  const customerName = textOf(safeInvoice.customerName, safeInvoice.customer_name, safeOrder.customerName, safeOrder.customer_name, 'Customer');
  const phone = textOf(safeInvoice.phone, safeOrder.phone, '-');
  const email = textOf(safeInvoice.email, safeOrder.email, '-');
  const address = textOf(safeInvoice.address, safeOrder.address, '-');
  const deliveryDate = textOf(safeInvoice.deliveryDate, safeInvoice.delivery_date, safeOrder.deliveryDate, safeOrder.delivery_date);
  const deliveryTime = textOf(safeInvoice.deliveryTime, safeInvoice.delivery_time, safeOrder.deliveryTime, safeOrder.delivery_time);
  const invoiceDate = dateOf(safeInvoice.invoiceDate, safeInvoice.invoice_date, safeInvoice.created_at, safeOrder.created_at, deliveryDate);

  const subtotal = toSafeNumber(safeInvoice.subtotal ?? safeOrder.subtotal);
  const deliveryFee = toSafeNumber(safeInvoice.deliveryFee ?? safeInvoice.delivery_fee ?? safeOrder.deliveryFee ?? safeOrder.delivery_fee);
  const totalAmount = toSafeNumber(safeInvoice.totalAmount ?? safeInvoice.total ?? safeInvoice.amount ?? safeOrder.totalAmount ?? safeOrder.total);
  const discountAmount = toSafeNumber(safeInvoice.discountAmount ?? safeInvoice.discount_amount ?? safeOrder.discountAmount ?? safeOrder.discount_amount);
  const product = textOf(safeInvoice.product, safeOrder.product, 'Bakery Order');
  const quantity = Math.max(1, toSafeNumber(safeInvoice.quantity ?? safeOrder.quantity ?? 1));
  const rawUnitPrice = toSafeNumber(safeInvoice.finalUnitPrice ?? safeInvoice.final_unit_price ?? safeInvoice.unitPrice ?? safeInvoice.unit_price ?? safeOrder.finalUnitPrice ?? safeOrder.final_unit_price ?? safeOrder.unitPrice ?? safeOrder.unit_price);
  const fallbackUnitPrice = rawUnitPrice || (subtotal ? subtotal / quantity : totalAmount ? Math.max(totalAmount - deliveryFee, 0) / quantity : 0);

  const rawItems = safeInvoice.items ?? safeInvoice.order_items ?? safeOrder.items ?? safeOrder.order_items;
  const rawFlavours = safeInvoice.flavours ?? safeOrder.flavours;
  const items = buildItems(rawItems, rawFlavours, product, quantity, fallbackUnitPrice);

  const calculatedSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const displaySubtotal = subtotal || calculatedSubtotal;
  const displayDiscount = discountAmount;
  const displayTotal = totalAmount || Math.max(displaySubtotal - displayDiscount, 0) + deliveryFee;
  const hasInvoiceData = Boolean(invoiceNumber || orderRef || customerName);

  const preparePrint = () => {
    document.body.classList.add('printing-lbl-invoice');
    const cleanup = () => {
      document.body.classList.remove('printing-lbl-invoice');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(cleanup, 1200);
  };

  const handleDownloadPdf = () => {
    preparePrint();
    window.print();
    setToast({ message: 'PDF export ready. Choose “Save as PDF” in the print dialog.', type: 'success' });
  };

  const handlePrint = () => {
    preparePrint();
    window.print();
    setToast({ message: 'Print dialog opened.', type: 'success' });
  };

  const handleMarkPaid = async () => {
    try {
      await onMarkPaid?.();
      setToast({ message: 'Invoice marked as paid. Order status updated.', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invoice paid update failed.';
      setToast({ message, type: 'error' });
    }
  };

  const handleSendWhatsApp = () => {
    setToast({ message: 'WhatsApp message prepared. Future integration will send the invoice.', type: 'info' });
  };

  if (!hasInvoiceData) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-8 text-center shadow-panel">
        <p className="text-xs uppercase tracking-[0.32em] text-softGold">Invoice</p>
        <h3 className="mt-3 text-2xl font-semibold text-white">No invoice selected</h3>
        <p className="mt-3 text-sm text-slate-400">Select an order to generate an invoice preview.</p>
      </div>
    );
  }

  if (previewMode === 'compact') {
    return (
      <div className="relative space-y-4">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-softGold">Quick Actions</p>
              <h4 className="mt-1 text-base font-semibold text-white">Invoice Toolbar</h4>
            </div>
            <InvoiceActions
              paymentStatus={paymentStatus}
              onDownload={handleDownloadPdf}
              onPrint={handlePrint}
              onWhatsApp={handleSendWhatsApp}
              onMarkPaid={handleMarkPaid}
            />
          </div>
        </div>
        <div className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-softGold">Compact Invoice Preview</p>
              <h3 className="mt-2 truncate text-xl font-semibold text-white">{invoiceNumber}</h3>
              <p className="mt-1 truncate text-sm text-slate-400">{customerName}</p>
              <p className="mt-1 truncate text-xs text-slate-500">Order Ref: {orderRef || '-'}</p>
            </div>
            <div className="shrink-0 rounded-[18px] border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-4 py-3 text-left md:text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#E4C98E]">Amount</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatCurrency(displayTotal)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative lbl-invoice-template">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showChrome && (
        <div className="lbl-invoice-screen-toolbar sticky top-0 z-40 mb-4 rounded-[20px] border border-[#334155] bg-[#111111]/95 p-4 backdrop-blur-sm shadow-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-softGold">Invoice Actions</p>
              <h4 className="mt-1 text-base font-semibold text-white">Professional A4 Invoice</h4>
            </div>
            <InvoiceActions
              paymentStatus={paymentStatus}
              onDownload={handleDownloadPdf}
              onPrint={handlePrint}
              onWhatsApp={handleSendWhatsApp}
              onMarkPaid={handleMarkPaid}
            />
          </div>
        </div>
      )}

      <article className="lbl-invoice-a4 lbl-print-scope">
        <header className="invoice-head">
          <section className="company-block">
            <h1>{COMPANY.name.toUpperCase()}</h1>
            <div className="gold-rule" />
            <InfoLine icon={<MapPin size={15} />} text={COMPANY.address} />
            <InfoLine icon={<Phone size={15} />} text={COMPANY.phone} />
            <InfoLine icon={<Mail size={15} />} text={COMPANY.email} />
            <InfoLine icon={<BadgeCheck size={15} />} text={`SSM Registration No: ${COMPANY.ssm}`} />
          </section>
          <section className="brand-mark" aria-label="Layer By Layer logo">
            <div className="monogram">LBL</div>
            <p>Layer By Layer</p>
          </section>
        </header>

        <section className="invoice-title-row">
          <div>
            <h2>INVOICE</h2>
            <div className="title-rule" />
          </div>
          <dl className="invoice-meta">
            <div>
              <dt>Invoice No.</dt>
              <dd>{invoiceNumber}</dd>
            </div>
            <div>
              <dt>Invoice Date</dt>
              <dd>{invoiceDate}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>MYR</dd>
            </div>
            {orderRef && (
              <div>
                <dt>Order Ref.</dt>
                <dd>{orderRef}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="bill-row">
          <div className="bill-card">
            <p className="section-label">Bill To</p>
            <h3>{customerName}</h3>
            <InfoLine icon={<Phone size={15} />} text={phone} compact />
            <InfoLine icon={<Mail size={15} />} text={email} compact />
            {address && address !== '-' ? <InfoLine icon={<MapPin size={15} />} text={address} compact /> : null}
          </div>
          <div className="fulfillment-card">
            <p className="section-label">Fulfilment</p>
            <div className="mini-grid">
              <span>Date</span><strong>{deliveryDate || '-'}</strong>
              <span>Time</span><strong>{deliveryTime || '-'}</strong>
              <span>Payment</span><strong>{paymentStatus}</strong>
              <span>Status</span><strong>{orderStatus}</strong>
            </div>
          </div>
        </section>

        <section className="invoice-items">
          <div className="items-header">
            <span>No.</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit Price (RM)</span>
            <span>Amount (RM)</span>
          </div>
          {items.map((item, index) => (
            <div className="items-row" key={`${item.description}-${index}`}>
              <span>{index + 1}</span>
              <span>{item.description}</span>
              <span>{item.quantity} pcs</span>
              <span>{item.unitPrice.toFixed(2)}</span>
              <span>{(item.quantity * item.unitPrice).toFixed(2)}</span>
            </div>
          ))}
        </section>

        <section className="invoice-bottom">
          <div className="notes-block">
            <p className="section-label">Notes</p>
            <div className="small-rule" />
            <p>Thank you for your order.</p>
            <p>All mini tarts are freshly baked and are best consumed on the same day.</p>
            <p>{COMPANY.name}</p>
            <p className="script-line">Every Layer Tells A Story.</p>
          </div>

          <div className="totals-block">
            <div className="totals-line"><span>Subtotal</span><strong>{formatCurrency(displaySubtotal)}</strong></div>
            <div className="totals-line"><span>Delivery Fee</span><strong>{formatCurrency(deliveryFee)}</strong></div>
            <div className="totals-line"><span>Discount</span><strong>{formatCurrency(displayDiscount)}</strong></div>
            <div className="totals-main"><span>Total</span><strong>{formatCurrency(displayTotal)}</strong></div>
            <div className="payment-box">
              <div className="bank-icon"><Building2 size={24} /></div>
              <div>
                <p className="section-label">Payment Information</p>
                <p>{COMPANY.bankName}</p>
                <h4>{COMPANY.bankAccount}</h4>
                <p>{COMPANY.bankHolder}</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="invoice-footer">
          <p>Event Catering <span>•</span> Corporate Gifting <span>•</span> Wedding Dessert <span>•</span> Private Events</p>
          <strong>Thank you for supporting our small business.</strong>
          <span className="footer-heart">♥</span>
        </footer>
      </article>
    </div>
  );
}

function InfoLine({ icon, text, compact = false }: { icon: React.ReactNode; text: string; compact?: boolean }) {
  return (
    <div className={`info-line ${compact ? 'compact' : ''}`}>
      <span>{icon}</span>
      <p>{text}</p>
    </div>
  );
}

function InvoiceActions({
  paymentStatus,
  onDownload,
  onPrint,
  onWhatsApp,
  onMarkPaid
}: {
  paymentStatus: string;
  onDownload: () => void;
  onPrint: () => void;
  onWhatsApp: () => void;
  onMarkPaid: () => void | Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={onDownload} className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-charcoal transition hover:bg-[#b9985f]">
        <Download size={13} className="mr-1 inline" /> Download PDF
      </button>
      <button onClick={onPrint} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white transition hover:bg-white/10">
        <Printer size={13} className="mr-1 inline" /> Print
      </button>
      <button onClick={() => void onMarkPaid()} disabled={paymentStatus.toLowerCase().includes('paid')} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60">
        {paymentStatus.toLowerCase().includes('paid') ? 'Paid' : 'Mark as Paid'}
      </button>
      <button onClick={onWhatsApp} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white transition hover:bg-white/10">
        <Send size={13} className="mr-1 inline" /> WhatsApp
      </button>
    </div>
  );
}
