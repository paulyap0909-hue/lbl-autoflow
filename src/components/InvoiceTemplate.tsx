import React, { useRef, useState } from 'react';
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
  const invoiceRef = useRef<HTMLElement | null>(null);
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

  const openCleanPrintWindow = (mode: 'print' | 'pdf') => {
    const invoiceHtml = invoiceRef.current?.outerHTML;
    if (!invoiceHtml) {
      setToast({ message: 'Invoice preview is not ready yet.', type: 'error' });
      return;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=920,height=1200');
    if (!printWindow) {
      setToast({ message: 'Please allow pop-ups to print or download this invoice.', type: 'error' });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${invoiceNumber || orderRef || 'LBL Invoice'}</title>
  <style>${INVOICE_PRINT_DOCUMENT_CSS}</style>
</head>
<body>
  ${invoiceHtml}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`);
    printWindow.document.close();

    setToast({
      message: mode === 'pdf' ? 'PDF export opened. Choose “Save as PDF”.' : 'Clean invoice print opened.',
      type: 'success'
    });
  };

  const handleDownloadPdf = () => {
    openCleanPrintWindow('pdf');
  };

  const handlePrint = () => {
    openCleanPrintWindow('print');
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

      <article ref={invoiceRef} id="lbl-invoice-document" className="lbl-invoice-a4 lbl-print-scope">
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


const INVOICE_PRINT_DOCUMENT_CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 210mm;
    min-height: 297mm;
    background: #ffffff;
    color: #161616;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .lbl-invoice-a4 {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 14mm 16mm 9mm;
    background: #fffdf8;
    color: #161616;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
    font-family: Georgia, 'Times New Roman', serif;
  }
  .invoice-head, .invoice-title-row, .bill-row, .invoice-bottom {
    display: grid;
    grid-template-columns: 1.12fr 0.88fr;
    gap: 16mm;
  }
  .company-block h1 {
    margin: 0;
    max-width: 112mm;
    font-size: 18pt;
    font-weight: 500;
    line-height: 1.15;
    letter-spacing: 0.24em;
    color: #080808;
  }
  .gold-rule { width: 100%; height: 0.35mm; margin: 4mm 0 5mm; background: #b58a4b; }
  .info-line {
    display: grid;
    grid-template-columns: 6mm 1fr;
    gap: 3mm;
    align-items: start;
    margin-top: 2.7mm;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 9.4pt;
    line-height: 1.35;
    color: #171717;
  }
  .info-line.compact { margin-top: 2.4mm; }
  .info-line span { color: #0e0e0e; transform: translateY(0.5mm); }
  .info-line p { margin: 0; }
  .brand-mark { text-align: right; color: #090909; }
  .monogram { font-family: Georgia, 'Times New Roman', serif; font-size: 48pt; font-weight: 600; line-height: 0.9; letter-spacing: -0.18em; }
  .brand-mark p { margin: 4mm 0 0; font-size: 12pt; text-transform: uppercase; letter-spacing: 0.08em; }
  .invoice-title-row { align-items: end; margin-top: 18mm; }
  .invoice-title-row h2 { margin: 0; font-size: 42pt; font-weight: 400; letter-spacing: 0.26em; color: #060606; }
  .title-rule, .small-rule { width: 18mm; height: 0.6mm; margin-top: 4mm; background: #b58a4b; }
  .invoice-meta { margin: 0; padding-left: 8mm; border-left: 0.35mm solid #b58a4b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .invoice-meta div { display: grid; grid-template-columns: 34mm 1fr; gap: 5mm; margin: 0 0 4.2mm; }
  .invoice-meta dt { text-transform: uppercase; letter-spacing: 0.2em; color: #111; font-size: 9.5pt; }
  .invoice-meta dd { margin: 0; color: #111; font-size: 10pt; word-break: break-word; }
  .bill-row { align-items: stretch; margin-top: 12mm; }
  .bill-card, .fulfillment-card, .payment-box { border-radius: 3mm; background: linear-gradient(135deg, rgba(181, 138, 75, 0.12), rgba(255,255,255,0.38)); padding: 6mm; }
  .section-label { margin: 0 0 3mm; color: #a97937; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 8.5pt; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; }
  .bill-card h3 { margin: 0 0 3mm; font-size: 17pt; font-weight: 400; }
  .mini-grid { display: grid; grid-template-columns: 28mm 1fr; row-gap: 2.5mm; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 9.2pt; }
  .mini-grid span { text-transform: uppercase; letter-spacing: 0.14em; color: #8a7a67; }
  .mini-grid strong { font-weight: 600; color: #111; }
  .invoice-items { margin-top: 11mm; border-top: 0.35mm solid #b58a4b; border-bottom: 0.35mm solid #b58a4b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .items-header, .items-row { display: grid; grid-template-columns: 12mm minmax(62mm, 1fr) 22mm 34mm 30mm; gap: 3mm; align-items: center; }
  .items-header { padding: 5mm 2mm; color: #111; font-size: 8.7pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
  .items-row { min-height: 10mm; padding: 2.3mm 2mm; border-top: 0.25mm dotted #dccbb1; color: #1d1d1d; font-size: 10pt; }
  .items-row:first-of-type { border-top: 0.35mm solid #b58a4b; }
  .items-header span:nth-child(n+3), .items-row span:nth-child(n+3) { text-align: right; }
  .invoice-bottom { margin-top: 10mm; align-items: start; }
  .notes-block { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10pt; line-height: 1.45; }
  .notes-block p { margin: 0 0 4mm; }
  .script-line { color: #a97937; font-family: Georgia, 'Times New Roman', serif; font-size: 15pt; font-style: italic; }
  .totals-block { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .totals-line, .totals-main { display: flex; justify-content: space-between; gap: 6mm; padding: 2.5mm 0; border-bottom: 0.35mm solid #b58a4b; text-transform: uppercase; letter-spacing: 0.14em; font-size: 10pt; }
  .totals-main { margin-top: 2mm; align-items: baseline; border-top: 0.35mm solid #b58a4b; border-bottom: 0; font-size: 18pt; }
  .totals-main strong { font-size: 20pt; letter-spacing: 0.04em; }
  .payment-box { display: flex; gap: 5mm; align-items: center; margin-top: 6mm; }
  .bank-icon { display: flex; width: 13mm; height: 13mm; flex: 0 0 auto; align-items: center; justify-content: center; border: 0.35mm solid #111; border-radius: 999px; }
  .payment-box p, .payment-box h4 { margin: 1mm 0; }
  .payment-box h4 { font-size: 13pt; letter-spacing: 0.12em; }
  .invoice-footer { margin-top: 8mm; padding-top: 4mm; border-top: 0.35mm solid #b58a4b; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; page-break-inside: avoid; }
  .invoice-footer p { margin: 0; font-size: 8.5pt; letter-spacing: 0.25em; text-transform: uppercase; }
  .invoice-footer span { margin: 0 4mm; }
  .invoice-footer strong { display: block; margin-top: 3.2mm; color: #a97937; font-family: Georgia, 'Times New Roman', serif; font-size: 13pt; font-style: italic; font-weight: 400; }
  .footer-heart { display: block; margin-top: 2mm !important; color: #a97937; }
  button, .lbl-invoice-screen-toolbar { display: none !important; }
`;

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
