import React, { useMemo, useState } from 'react';
import type { Order, WhatsAppTemplate } from '../data/mockData';
import Toast from '../components/Toast';
import { formatRM } from '../utils/pricing';

type Props = { templates: WhatsAppTemplate[]; orders: Order[] };
type TemplateKey = 'order' | 'payment' | 'invoice' | 'kitchen' | 'driver' | 'delivery' | 'feedback';
type TemplateDef = { key: TemplateKey; name: string; trigger: string; note: string };

const templateDefs: TemplateDef[] = [
  { key: 'order', name: 'Order Confirmation', trigger: 'After new order is created', note: 'Customer order summary' },
  { key: 'payment', name: 'Payment Reminder', trigger: 'When payment status is Pending', note: 'Gentle invoice reminder' },
  { key: 'invoice', name: 'Invoice Message', trigger: 'Triggered from Invoice page', note: 'Invoice and delivery summary' },
  { key: 'kitchen', name: 'Kitchen Notification', trigger: 'When order is paid or sent to kitchen', note: 'Kitchen production details' },
  { key: 'driver', name: 'Driver Notification', trigger: 'When kitchen status is Ready', note: 'Driver delivery details' },
  { key: 'delivery', name: 'Out For Delivery Message', trigger: 'When driver status is Out For Delivery', note: 'Friendly delivery update' },
  { key: 'feedback', name: 'Feedback Request', trigger: 'After order is completed', note: 'Post-order relationship message' }
];

const money = formatRM;
const invoiceNo = (order: Order) => order.orderNo ? `Invoice for ${order.orderNo}` : 'Invoice not generated yet';
const paymentInstruction = 'Please make payment by bank transfer or QR payment and send us the receipt once completed.';
const flavours = (order: Order) => order.flavours.map((flavour) => `- ${flavour}`).join('\n');
const readyTime = (order: Order) => {
  const date = new Date(`${order.deliveryDate} ${order.deliveryTime}`);
  if (Number.isNaN(date.getTime())) return '30 minutes before delivery';
  date.setMinutes(date.getMinutes() - 30);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const statusForTemplate = (key: TemplateKey, order: Order) => {
  if (key === 'payment' && order.paymentStatus !== 'Pending') return 'Not pending';
  if (key === 'driver' && order.kitchenStatus !== 'Ready') return 'Kitchen not ready';
  if (key === 'delivery' && order.deliveryStatus !== 'Out for Delivery') return 'Not out yet';
  if (key === 'feedback' && order.workflowStatus !== 'Completed' && order.deliveryStatus !== 'Delivered') return 'Not completed';
  if (key === 'kitchen' && order.paymentStatus !== 'Paid' && order.kitchenStatus === 'New') return 'Awaiting payment';
  return 'Ready';
};

const buildMessage = (key: TemplateKey, order: Order) => {
  const delivery = `${order.deliveryDate} at ${order.deliveryTime}`;
  switch (key) {
    case 'order':
      return `Hi ${order.customerName}, thank you for your LBL order.\n\nOrder ID: ${order.id}\nProduct: ${order.product}\nFlavours:\n${flavours(order)}\nQuantity: ${order.quantity} pcs\nDelivery: ${delivery}\nTotal: ${money(order.totalAmount)}\n\nWe will update you once your order moves to the next step.`;
    case 'payment':
      return `Hi ${order.customerName}, a gentle reminder that payment for invoice ${invoiceNo(order)} is still pending.\n\nTotal amount: ${money(order.totalAmount)}\n${paymentInstruction}\n\nNo rush, just send us the receipt when payment is done. Thank you.`;
    case 'invoice':
      return `Hi ${order.customerName}, here is your LBL invoice summary.\n\nInvoice: ${invoiceNo(order)}\nTotal: ${money(order.totalAmount)}\nPayment Status: ${order.paymentStatus}\nDelivery: ${delivery}\n\nPlease let us know if any detail needs to be updated.`;
    case 'kitchen':
      return `Kitchen team, please prepare this order.\n\nOrder ID: ${order.id}\nProduct: ${order.product}\nFlavours:\n${flavours(order)}\nQuantity: ${order.quantity} pcs\nRequired ready time: ${readyTime(order)}\nSpecial remark: ${order.remark || 'None'}`;
    case 'driver':
      return `Driver delivery task.\n\nOrder ID: ${order.id}\nCustomer: ${order.customerName}\nPhone: ${order.phone}\nAddress: ${order.address}\nDelivery: ${delivery}\n\nInstruction: Please collect only after kitchen confirms ready, handle carefully, and update once out for delivery.`;
    case 'delivery':
      return `Hi ${order.customerName}, your LBL order ${order.id} is now out for delivery.\n\nEstimated delivery time: ${order.deliveryTime}\nOur driver is on the way. Thank you for your patience.`;
    case 'feedback':
      return `Hi ${order.customerName}, thank you for ordering from LBL.\n\nWe hope you enjoyed your treats. We would love your feedback when convenient.\n\nIf you took any photos, feel free to share them with us too. It would mean a lot.`;
  }
};

export default function WhatsAppTemplatesPage({ templates, orders }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('order');
  const [baseTemplates, setBaseTemplates] = useState<Record<string, string>>(
    Object.fromEntries(templates.map((template) => [template.title, template.content]))
  );
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? orders[0], [orders, selectedOrderId]);
  const selectedDef = templateDefs.find((template) => template.key === selectedTemplate) ?? templateDefs[0];
  const preview = selectedOrder ? buildMessage(selectedTemplate, selectedOrder) : '';

  const copyMessage = async () => {
    if (!preview) return setToast({ message: 'Select an order before copying.', type: 'error' });
    await navigator.clipboard.writeText(preview);
    setToast({ message: 'WhatsApp message copied.', type: 'success' });
  };

  const mockSend = () => {
    if (!selectedOrder) return setToast({ message: 'Select an order before mock sending.', type: 'error' });
    setToast({ message: `Mock WhatsApp sent to ${selectedOrder.customerName}.`, type: 'success' });
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">WhatsApp Automation</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">WhatsApp Message Automation Center</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Generate ready-to-send WhatsApp messages from real order, invoice, kitchen and delivery data. No live API is connected yet.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-300">
            {orders.length} orders loaded from localStorage
          </div>
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
          <h4 className="text-lg font-semibold text-white">Message Setup</h4>
          <p className="mt-2 text-sm text-slate-400">Choose an order and automation trigger.</p>
          <label className="mt-6 block text-sm text-slate-300">
            Select Order
            <select
              value={selectedOrder?.id ?? ''}
              onChange={(event) => setSelectedOrderId(event.target.value)}
              className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{order.id} - {order.customerName} - {money(order.totalAmount)}</option>
              ))}
            </select>
          </label>
          <div className="mt-5 grid gap-3">
            {templateDefs.map((template) => {
              const active = selectedTemplate === template.key;
              const status = selectedOrder ? statusForTemplate(template.key, selectedOrder) : 'No order';
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => setSelectedTemplate(template.key)}
                  className={`rounded-[24px] border p-4 text-left transition ${active ? 'border-gold bg-gold/10' : 'border-white/10 bg-[#0f0f0f] hover:border-gold/40'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{template.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{template.trigger}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs ${status === 'Ready' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}>{status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">{selectedDef.name}</h4>
              <p className="mt-2 text-sm text-slate-400">{selectedDef.note}</p>
            </div>
            {selectedOrder && <span className="rounded-full bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">{selectedOrder.paymentStatus} / {selectedOrder.deliveryStatus}</span>}
          </div>
          {selectedOrder ? (
            <>
              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4"><p className="text-xs uppercase tracking-[0.24em] text-softGold">Customer</p><p className="mt-2 font-semibold text-white">{selectedOrder.customerName}</p></div>
                <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4"><p className="text-xs uppercase tracking-[0.24em] text-softGold">Invoice</p><p className="mt-2 font-semibold text-white">{invoiceNo(selectedOrder)}</p></div>
                <div className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4"><p className="text-xs uppercase tracking-[0.24em] text-softGold">Total</p><p className="mt-2 font-semibold text-white">{money(selectedOrder.totalAmount)}</p></div>
              </div>
              <textarea value={preview} readOnly className="min-h-[360px] w-full rounded-[28px] border border-white/10 bg-[#0f0f0f] p-5 text-sm leading-7 text-slate-100 outline-none" />
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={copyMessage} className="rounded-3xl bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f]">Copy Message</button>
                <button onClick={mockSend} className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/20">Mock Send WhatsApp</button>
              </div>
            </>
          ) : (
            <div className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-8 text-center text-slate-400">No orders found. Create an order first to generate WhatsApp messages.</div>
          )}
        </section>
      </div>
      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="mb-5">
          <h4 className="text-lg font-semibold text-white">Editable Base Templates</h4>
          <p className="mt-2 text-sm text-slate-400">Existing template notes are kept here for future API integration.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {templates.map((template) => (
            <div key={template.title} className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-lg font-semibold text-white">{template.title}</h4>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Editable</span>
              </div>
              <textarea
                value={baseTemplates[template.title]}
                onChange={(event) => setBaseTemplates({ ...baseTemplates, [template.title]: event.target.value })}
                className="min-h-[140px] w-full rounded-3xl border border-white/10 bg-[#141414] p-4 text-sm text-slate-200 outline-none transition focus:border-gold"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
