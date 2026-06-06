import React, { useState } from 'react';
import type { Order } from '../data/mockData';
import Toast from './Toast';
import { formatRM, toSafeNumber } from '../utils/pricing';

type InvoiceTemplateProps = {
  invoice?: Record<string, unknown> | null;
  order?: Partial<Order> | Record<string, unknown> | null;
  onMarkPaid?: () => void | Promise<void>;
};

const formatCurrency = formatRM;

type InvoiceItem = {
  product: string;
  flavour: string;
  quantity: number;
  unitPrice: number;
};

const getStatusColor = (status: string) => {
  if (status === 'Paid') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
  if (status === 'Pending') return 'bg-amber-500/10 text-amber-200 border-amber-500/20';
  if (status === 'Overdue') return 'bg-rose-500/10 text-rose-200 border-rose-500/20';
  return 'bg-white/5 text-slate-300 border-white/10';
};

export default function InvoiceTemplate({ invoice, order, onMarkPaid }: InvoiceTemplateProps) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const safeInvoice = (invoice ?? {}) as Record<string, unknown>;
  const safeOrder = (order ?? {}) as Record<string, unknown>;

  const paymentStatus =
    String(
      safeInvoice.paymentStatus ??
      safeInvoice.payment_status ??
      safeInvoice.status ??
      safeOrder.paymentStatus ??
      safeOrder.payment_status ??
      'Pending'
    );

  const orderId = String(
    safeInvoice.orderId ??
    safeInvoice.order_id ??
    safeInvoice.orderNo ??
    safeInvoice.order_no ??
    safeOrder.orderId ??
    safeOrder.order_id ??
    safeOrder.orderNo ??
    safeOrder.order_no ??
    safeOrder.id ??
    ''
  );
  const invoiceNumber = String(
    safeInvoice.invoiceNumber ??
    safeInvoice.invoice_no ??
    safeInvoice.invoiceNo ??
    ''
  );
  const customerName = String(safeInvoice.customerName ?? safeInvoice.customer_name ?? safeOrder.customerName ?? safeOrder.customer_name ?? '');
  const phone = String(safeInvoice.phone ?? safeOrder.phone ?? '');
  const address = String(safeInvoice.address ?? safeOrder.address ?? '');
  const deliveryDate = String(safeInvoice.deliveryDate ?? safeInvoice.delivery_date ?? safeOrder.deliveryDate ?? safeOrder.delivery_date ?? '');
  const deliveryTime = String(safeInvoice.deliveryTime ?? safeInvoice.delivery_time ?? safeOrder.deliveryTime ?? safeOrder.delivery_time ?? '');
  const subtotal = toSafeNumber(safeInvoice.subtotal ?? safeOrder.subtotal);
  const deliveryFee = toSafeNumber(safeInvoice.deliveryFee ?? safeInvoice.delivery_fee ?? safeOrder.deliveryFee ?? safeOrder.delivery_fee);
  const totalAmount = toSafeNumber(safeInvoice.totalAmount ?? safeInvoice.total ?? safeInvoice.amount ?? safeOrder.totalAmount ?? safeOrder.total);
  const product = String(safeInvoice.product ?? safeOrder.product ?? 'Bakery order');
  const quantity = toSafeNumber(safeInvoice.quantity ?? safeOrder.quantity ?? 1);
  const unitPrice = toSafeNumber(safeInvoice.unitPrice ?? safeInvoice.unit_price ?? safeOrder.unitPrice ?? safeOrder.unit_price ?? (subtotal || totalAmount - deliveryFee));
  const originalUnitPrice = toSafeNumber(safeInvoice.originalUnitPrice ?? safeInvoice.original_unit_price ?? safeOrder.originalUnitPrice ?? safeOrder.original_unit_price ?? unitPrice);
  const finalUnitPrice = toSafeNumber(safeInvoice.finalUnitPrice ?? safeInvoice.final_unit_price ?? safeOrder.finalUnitPrice ?? safeOrder.final_unit_price ?? unitPrice);
  const originalSubtotal = toSafeNumber(safeInvoice.originalSubtotal ?? safeInvoice.original_subtotal ?? safeOrder.originalSubtotal ?? safeOrder.original_subtotal ?? originalUnitPrice * quantity);
  const discountAmount = toSafeNumber(safeInvoice.discountAmount ?? safeInvoice.discount_amount ?? safeOrder.discountAmount ?? safeOrder.discount_amount);
  const discountReason = String(safeInvoice.discountReason ?? safeInvoice.discount_reason ?? safeOrder.discountReason ?? safeOrder.discount_reason ?? '');
  const finalSubtotal = toSafeNumber(safeInvoice.finalSubtotal ?? safeInvoice.final_subtotal ?? safeOrder.finalSubtotal ?? safeOrder.final_subtotal ?? Math.max(originalSubtotal - discountAmount, 0));
  const kitchenStatus = String(safeInvoice.kitchenStatus ?? safeInvoice.kitchen_status ?? safeOrder.kitchenStatus ?? safeOrder.kitchen_status ?? 'New');
  const rawItems = safeInvoice.items ?? safeInvoice.order_items ?? safeOrder.items ?? safeOrder.order_items;
  const rawFlavours = safeInvoice.flavours ?? safeOrder.flavours;
  const flavours = Array.isArray(rawFlavours) ? rawFlavours.map(String) : [];
  const items: InvoiceItem[] = Array.isArray(rawItems)
    ? rawItems.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          product: String(record.product ?? product),
          flavour: String(record.flavour ?? record.flavor ?? ''),
          quantity: toSafeNumber(record.quantity ?? 1),
          unitPrice: toSafeNumber(record.unitPrice ?? record.unit_price ?? finalUnitPrice)
        };
      })
    : flavours.length
      ? flavours.map((flavour) => ({ product, flavour, quantity: Math.max(1, Math.round(quantity / flavours.length)), unitPrice: finalUnitPrice }))
      : [{ product, flavour: product, quantity: Math.max(1, quantity), unitPrice: finalUnitPrice }];
  const calculatedSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const displaySubtotal = finalSubtotal || subtotal || calculatedSubtotal;
  const displayTotal = totalAmount || displaySubtotal + deliveryFee;
  const hasInvoiceData = Boolean(invoiceNumber || orderId || customerName);

  const invoiceDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const handleDownloadPdf = () => {
    window.print();
    setToast({ message: 'PDF export initiated. Browser print dialog will open.', type: 'success' });
  };

  const handlePrint = () => {
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

  const handleCopyLink = () => {
    const invoiceLink = `${window.location.origin}?invoice=${orderId || invoiceNumber}`;
    navigator.clipboard.writeText(invoiceLink);
    setToast({ message: 'Invoice link copied to clipboard!', type: 'success' });
  };

  const invoiceStatus = paymentStatus === 'Paid' ? 'Paid' : 'Pending';
  const isOverdue = deliveryDate ? new Date(deliveryDate) < new Date() : false;
  const displayStatus = isOverdue && paymentStatus !== 'Paid' ? 'Overdue' : invoiceStatus;

  if (!hasInvoiceData) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-8 text-center shadow-panel">
        <p className="text-xs uppercase tracking-[0.32em] text-softGold">Invoice</p>
        <h3 className="mt-3 text-2xl font-semibold text-white">No invoice selected</h3>
        <p className="mt-3 text-sm text-slate-400">Select an order to generate an invoice preview.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Sticky Action Toolbar */}
      <div className="sticky top-0 z-40 mb-8 rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 backdrop-blur-sm shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-softGold">Quick Actions</p>
            <h4 className="mt-2 text-lg font-semibold text-white">Invoice Toolbar</h4>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadPdf}
              className="rounded-full bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f]"
            >
              Download PDF
            </button>
            <button
              onClick={handlePrint}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white transition hover:bg-white/10"
            >
              Print Invoice
            </button>
            <button
              onClick={handleMarkPaid}
              disabled={paymentStatus === 'Paid'}
              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {paymentStatus === 'Paid' ? 'Paid' : 'Mark as Paid'}
            </button>
            <button
              onClick={handleSendWhatsApp}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white transition hover:bg-white/10"
            >
              Send WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white transition hover:bg-white/10"
            >
              Copy Link
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Summary Section */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/10 bg-[#111111] p-6">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Invoice Status</p>
          <div className={`mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${getStatusColor(displayStatus)}`}>
            {displayStatus}
          </div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-[#111111] p-6">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Payment Status</p>
          <div className={`mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${getStatusColor(paymentStatus)}`}>
            {paymentStatus}
          </div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-[#111111] p-6">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Order Status</p>
          <div className="mt-3 inline-flex rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200">
            {kitchenStatus}
          </div>
        </div>
      </div>
      {/* Main Invoice Document */}
      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-8 text-slate-300 shadow-panel">
        <div className="mb-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex rounded-full bg-gold px-4 py-2 text-sm font-semibold text-charcoal">LBL INVOICE</div>
            <div>
              <h1 className="text-4xl font-semibold text-cream">Layer By Layer</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Premium bakery invoice designed for clients, deliveries and accounting. Elegant black, cream and champagne gold styling ready for print or PDF export.</p>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6 text-sm text-slate-300">
            <p className="uppercase tracking-[0.3em] text-softGold">Invoice Number</p>
            <p className="mt-2 text-xl font-semibold text-white">{invoiceNumber}</p>
            <div className="mt-6 space-y-4">
              <div>
                <p className="uppercase tracking-[0.24em] text-slate-400">Invoice Date</p>
                <p className="mt-1 text-white">{invoiceDate}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.24em] text-slate-400">Order ID</p>
                <p className="mt-1 text-white">{orderId}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-softGold">Bill To</p>
            <p className="mt-4 text-lg font-semibold text-white">{customerName || 'Customer'}</p>
            <p className="mt-2 text-sm text-slate-400">{phone || '-'}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{address || '-'}</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6">
            <div className="grid gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-softGold">Delivery Date</p>
                <p className="mt-2 text-white">{deliveryDate || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-softGold">Delivery Time</p>
                <p className="mt-2 text-white">{deliveryTime || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-softGold">Payment Status</p>
                <p className="mt-2 text-white">{paymentStatus}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[28px] border border-white/10 bg-[#121212]">
          <div className="grid gap-4 bg-[#111111] p-6 text-sm uppercase tracking-[0.3em] text-slate-400 md:grid-cols-[2.5fr_1fr_1fr_1fr]">
            <span>Product Type</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Line Total</span>
          </div>
          <div className="grid gap-4 p-6 text-sm text-slate-300 md:grid-cols-[2.5fr_1fr_1fr_1fr]">
            <div>
              <p className="font-semibold text-white">{product}</p>
              <p className="mt-2 text-sm text-slate-400">Flavour breakdown</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {items.map((item, index) => (
                  <li key={`${item.flavour}-${index}`} className="flex items-center gap-2">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
                    {item.flavour || item.product}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-center text-white">{quantity}</div>
            <div className="flex items-center justify-center text-white">{formatCurrency(finalUnitPrice)}</div>
            <div className="flex items-center justify-center text-white">{formatCurrency(displaySubtotal)}</div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-softGold">Payment Instructions</p>
            <p className="mt-4 text-sm leading-6 text-slate-300">Please settle payment via bank transfer or QR payment. Reference the invoice number when completing the payment.</p>
            <div className="mt-6 rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Bank Transfer / QR Placeholder</p>
              <div className="mt-4 flex items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-[#131313] p-8">
                <div className="h-32 w-32 rounded-[16px] bg-white/5" />
              </div>
              <p className="mt-4 text-sm text-slate-400">Scan this QR code or use the bank transfer details above.</p>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6">
            <div className="space-y-4 text-sm text-slate-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Original Unit Price</span>
                <span>{formatCurrency(originalUnitPrice)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Final Unit Price</span>
                <span>{formatCurrency(finalUnitPrice)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Original Subtotal</span>
                <span>{formatCurrency(originalSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Discount Amount</span>
                <span>{formatCurrency(discountAmount)}</span>
              </div>
              <div className="border-b border-white/10 pb-3">
                <span className="block text-slate-400">Discount Reason</span>
                <span className="mt-1 block text-white">{discountReason || '-'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Final Subtotal</span>
                <span>{formatCurrency(displaySubtotal)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Delivery Fee</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span>Tax</span>
                <span>RM0.00</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xl font-semibold text-white">
                <span>Total Amount</span>
                <span>{formatCurrency(displayTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
