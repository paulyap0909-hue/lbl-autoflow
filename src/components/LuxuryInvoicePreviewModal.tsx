import React from 'react';
import type { Order } from '../data/mockData';
import type { InvoiceRecord } from '../services/invoiceService';
import { formatRM, toSafeNumber } from '../utils/pricing';

type LuxuryInvoicePreviewModalProps = {
  order: Order;
  invoice: InvoiceRecord;
  onClose: () => void;
  onDownloadPdf: () => void;
  onRegenerate: () => void | Promise<void>;
  onSendWhatsApp: () => void;
};

const formatDate = (value?: string | null) => {
  if (!value) return new Date().toLocaleDateString('en-MY');
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};

const buildItems = (order: Order) => {
  const unitPrice = toSafeNumber(order.finalUnitPrice ?? order.unitPrice);
  if (order.flavourQuantities?.length) {
    return order.flavourQuantities.map((item) => ({
      description: item.name.includes('Mini Tart') || item.name.includes('Croissant') ? item.name : `${item.name} Mini Tart`,
      qty: item.quantity,
      unitPrice,
      amount: item.quantity * unitPrice
    }));
  }

  return [{
    description: order.product,
    qty: order.quantity,
    unitPrice,
    amount: order.quantity * unitPrice
  }];
};

export default function LuxuryInvoicePreviewModal({ order, invoice, onClose, onDownloadPdf, onRegenerate, onSendWhatsApp }: LuxuryInvoicePreviewModalProps) {
  const items = buildItems(order);
  const subtotal = toSafeNumber(invoice.subtotal ?? order.finalSubtotal ?? order.originalSubtotal ?? order.totalAmount);
  const deliveryFee = toSafeNumber(invoice.delivery_fee ?? order.deliveryFee);
  const discountAmount = toSafeNumber(invoice.discount_amount ?? order.discountAmount);
  const grandTotal = toSafeNumber(invoice.grand_total ?? invoice.amount ?? order.totalAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-40px)] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#111111] shadow-2xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#111111]/95 p-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-softGold">Invoice Preview</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{invoice.invoice_no}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onDownloadPdf} className="rounded-2xl bg-gold px-4 py-2 text-sm font-semibold text-charcoal">Download PDF</button>
            <button onClick={onRegenerate} className="rounded-2xl border border-gold/30 px-4 py-2 text-sm text-softGold">Regenerate Invoice</button>
            <button onClick={onSendWhatsApp} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">Send WhatsApp</button>
            <button onClick={onClose} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200">Close</button>
          </div>
        </div>

        <div className="p-4">
          <div className="mx-auto min-h-[1122px] max-w-[794px] bg-[#fbf6e9] p-12 text-[#16120c] shadow-2xl print:shadow-none">
            <header className="flex items-start justify-between gap-8 border-b border-[#c9a45d] pb-8">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-[#9a7637]">Invoice</p>
                <h1 className="mt-4 text-4xl font-semibold tracking-wide">Layer By Layer Bakery</h1>
                <div className="mt-5 space-y-1 text-sm leading-6 text-[#4b4033]">
                  <p>SSM Registration No: RA0128892-A</p>
                  <p>11-2, Jalan Cecawi 6/19B, Kota Damansara,</p>
                  <p>47810 Petaling Jaya, Selangor</p>
                  <p>Phone: 019-4937139</p>
                  <p>Email: layerbylayermy@gmail.com</p>
                </div>
              </div>
              <div className="text-right">
                <div className="ml-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#c9a45d] text-2xl font-semibold tracking-widest text-[#9a7637]">
                  LBL
                </div>
                <p className="mt-5 text-sm font-semibold">{invoice.invoice_no}</p>
                <p className="mt-1 text-sm text-[#6d5c49]">{formatDate(invoice.invoice_date)}</p>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-8 border-b border-[#d8c49a] py-8">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#9a7637]">Bill To</p>
                <p className="mt-3 text-lg font-semibold">{order.customerName}</p>
                <p className="mt-1 text-sm text-[#4b4033]">{order.phone}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#9a7637]">Order</p>
                <p className="mt-3 text-sm text-[#4b4033]">Order No: {order.orderNo || order.id}</p>
                <p className="mt-1 text-sm text-[#4b4033]">Delivery: {order.deliveryDate || '-'} {order.deliveryTime || ''}</p>
              </div>
            </section>

            <section className="py-8">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#c9a45d] text-xs uppercase tracking-[0.18em] text-[#9a7637]">
                    <th className="py-3">Description</th>
                    <th className="py-3 text-center">Qty</th>
                    <th className="py-3 text-right">Unit Price</th>
                    <th className="py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.description}-${index}`} className="border-b border-[#eadfca]">
                      <td className="py-4 font-medium">{item.description}</td>
                      <td className="py-4 text-center">{item.qty}</td>
                      <td className="py-4 text-right">{formatRM(item.unitPrice)}</td>
                      <td className="py-4 text-right">{formatRM(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="grid grid-cols-[1fr_280px] gap-10 border-t border-[#d8c49a] pt-8">
              <div className="text-sm leading-6 text-[#4b4033]">
                <p className="font-semibold text-[#16120c]">Payment Info</p>
                <p className="mt-2">Maybank</p>
                <p>5145 8954 8255</p>
                <p>Layer By Layer Bakery</p>
                <p className="mt-8 font-semibold text-[#16120c]">Notes</p>
                <p className="mt-2">Thank you for your order.</p>
                <p>All mini tarts are freshly baked and are best consumed on the same day.</p>
                <p>Every Layer Tells A Story.</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatRM(subtotal)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>{formatRM(discountAmount)}</span></div>
                <div className="flex justify-between"><span>Delivery Fee</span><span>{formatRM(deliveryFee)}</span></div>
                <div className="mt-4 border-t border-[#c9a45d] pt-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[#9a7637]">Total</p>
                  <p className="mt-2 text-4xl font-semibold">{formatRM(grandTotal)}</p>
                </div>
              </div>
            </section>

            <footer className="mt-16 border-t border-[#c9a45d] pt-6 text-center text-xs font-semibold tracking-[0.22em] text-[#9a7637]">
              EVENT CATERING • CORPORATE GIFTING • WEDDING DESSERT • PRIVATE EVENTS
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
