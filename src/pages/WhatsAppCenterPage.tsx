import React, { useEffect, useMemo, useState } from 'react';
import Toast from '../components/Toast';
import type { Customer, DeliveryTask, KitchenTask, Order } from '../data/mockData';
import { loadInvoicesFromSupabase } from '../services/invoiceService';
import { formatRM, toSafeNumber } from '../utils/pricing';

type WhatsAppCenterPageProps = {
  orders: Order[];
  customers: Customer[];
  deliveryTasks: DeliveryTask[];
  kitchenTasks?: KitchenTask[];
};

type InvoiceRecord = Record<string, unknown>;

type TemplateKey =
  | 'Order Confirmation'
  | 'Payment Reminder'
  | 'Invoice Message'
  | 'Kitchen Ready'
  | 'Out for Delivery'
  | 'Delivered Feedback'
  | 'Winback Message';

type FollowUpItem = {
  id: string;
  group: 'Pending Payment Orders' | 'Ready for Delivery Orders' | 'Out for Delivery Orders' | 'Completed Orders' | 'Inactive Customers';
  customerName: string;
  phone: string;
  orderNo: string;
  status: string;
  amount: number;
  template: TemplateKey;
  message: string;
};

const templateKeys: TemplateKey[] = [
  'Order Confirmation',
  'Payment Reminder',
  'Invoice Message',
  'Kitchen Ready',
  'Out for Delivery',
  'Delivered Feedback',
  'Winback Message'
];

const defaultTemplates: Record<TemplateKey, string> = {
  'Order Confirmation': 'Hi {customerName}, thank you for your LBL order.',
  'Payment Reminder': 'Hi {customerName}, just a gentle reminder for your payment of RM{amount}.',
  'Invoice Message': 'Hi {customerName}, here is your LBL invoice for order {orderNo}. Amount: RM{amount}.',
  'Kitchen Ready': 'Hi {customerName}, your LBL order is ready.',
  'Out for Delivery': 'Hi {customerName}, your order is on the way.',
  'Delivered Feedback': 'Hi {customerName}, thank you for supporting Layer By Layer. Hope you enjoyed it.',
  'Winback Message': 'Hi {customerName}, we miss you. Would you like to order LBL again this week?'
};

const placeholders = ['{customerName}', '{orderNo}', '{amount}', '{deliveryDate}', '{deliveryTime}', '{product}', '{address}', '{invoiceNo}', '{status}'];

const normalizeMalaysiaPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return `6${digits}`;
  return digits;
};

const replaceToken = (value: string, token: string, replacement: string) => value.split(token).join(replacement);

const daysAgo = (dateValue?: string) => {
  if (!dateValue) return 999;
  const parsed = new Date(`${dateValue}T00:00:00`).getTime();
  if (Number.isNaN(parsed)) return 999;
  return Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000));
};

const getInvoiceField = (invoice: InvoiceRecord | undefined, fields: string[]) => {
  if (!invoice) return '';
  const value = fields.map((field) => invoice[field]).find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return value === undefined || value === null ? '' : String(value);
};

const getInvoiceForOrder = (invoices: InvoiceRecord[], order: Order | null) => {
  if (!order) return undefined;
  const orderNo = order.orderNo || order.id;
  return invoices.find((invoice) => {
    const invoiceOrderNo = getInvoiceField(invoice, ['order_no', 'orderNo', 'order_id', 'orderId']);
    return invoiceOrderNo === orderNo || invoiceOrderNo === order.id || invoiceOrderNo === order.supabaseId;
  });
};

const invoiceNoForOrder = (invoices: InvoiceRecord[], order: Order | null) => {
  const invoice = getInvoiceForOrder(invoices, order);
  return getInvoiceField(invoice, ['invoice_no', 'invoiceNo', 'invoice_number', 'invoiceNumber']) || 'Not generated yet';
};

const statusTone = (status: string) => {
  if (status === 'Paid' || status === 'Ready' || status === 'Delivered' || status === 'Completed') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
  if (status === 'Out for Delivery' || status === 'Assigned' || status === 'Preparing') return 'border-blue-300/30 bg-blue-300/10 text-blue-100';
  if (status === 'Pending' || status === 'Overdue') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-white/10 bg-white/5 text-slate-300';
};

export default function WhatsAppCenterPage({ orders, customers, deliveryTasks, kitchenTasks = [] }: WhatsAppCenterPageProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('Order Confirmation');
  const [selectedRecord, setSelectedRecord] = useState('order:' + (orders[0]?.id || ''));
  const [templates, setTemplates] = useState<Record<TemplateKey, string>>(defaultTemplates);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    loadInvoicesFromSupabase()
      .then((data) => setInvoices(data as InvoiceRecord[]))
      .catch((error) => {
        console.error('WhatsApp CRM invoice load error:', error);
        setInvoices([]);
      });
  }, []);

  useEffect(() => {
    if (selectedRecord === 'order:' && orders[0]) setSelectedRecord(`order:${orders[0].id}`);
  }, [orders, selectedRecord]);

  const selectedOrder = useMemo(() => {
    if (!selectedRecord.startsWith('order:')) return null;
    const id = selectedRecord.slice('order:'.length);
    return orders.find((order) => order.id === id) || orders[0] || null;
  }, [orders, selectedRecord]);

  const selectedCustomer = useMemo(() => {
    if (selectedRecord.startsWith('customer:')) {
      const key = selectedRecord.slice('customer:'.length);
      return customers.find((customer) => (customer.id || customer.phone || customer.name) === key) || null;
    }
    return customers.find((customer) => customer.phone === selectedOrder?.phone) || null;
  }, [customers, selectedOrder?.phone, selectedRecord]);

  const renderMessage = (template: string, order: Order | null, customer: Customer | null) => {
    const invoiceNo = invoiceNoForOrder(invoices, order);
    const amount = order ? toSafeNumber(order.totalAmount) : toSafeNumber(customer?.totalSpend);
    const status = order?.paymentStatus || order?.deliveryStatus || customer?.customerStatus || 'Active';
    const values: Array<[string, string]> = [
      ['{customerName}', order?.customerName || customer?.name || 'Customer'],
      ['{orderNo}', order?.orderNo || order?.id || '-'],
      ['{amount}', amount.toFixed(2)],
      ['{deliveryDate}', order?.deliveryDate || customer?.lastOrderDate || '-'],
      ['{deliveryTime}', order?.deliveryTime || '-'],
      ['{product}', order?.product || customer?.favouriteProduct || 'LBL treats'],
      ['{address}', order?.address || customer?.address || '-'],
      ['{invoiceNo}', invoiceNo],
      ['{status}', status]
    ];

    return values.reduce((message, [token, replacement]) => replaceToken(message, token, replacement), template);
  };

  const previewMessage = renderMessage(templates[selectedTemplate], selectedOrder, selectedCustomer);
  const previewPhone = normalizeMalaysiaPhone(selectedOrder?.phone || selectedCustomer?.phone || selectedCustomer?.whatsapp || '');

  const openWhatsApp = (phone: string, message: string) => {
    const normalized = normalizeMalaysiaPhone(phone);
    if (!normalized) {
      setToast({ message: 'Phone number missing.', type: 'error' });
      return;
    }
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const copyMessage = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setToast({ message: 'Message copied.', type: 'success' });
    } catch (error) {
      console.error('Copy WhatsApp message error:', error);
      setToast({ message: 'Unable to copy message.', type: 'error' });
    }
  };

  const followUps = useMemo(() => {
    const buildOrderItem = (group: FollowUpItem['group'], order: Order, template: TemplateKey, status: string): FollowUpItem => ({
      id: `${group}-${order.id}`,
      group,
      customerName: order.customerName || 'Customer',
      phone: order.phone || '',
      orderNo: order.orderNo || order.id || '-',
      status,
      amount: toSafeNumber(order.totalAmount),
      template,
      message: renderMessage(templates[template], order, customers.find((customer) => customer.phone === order.phone) || null)
    });

    const inactiveCustomers: FollowUpItem[] = customers
      .filter((customer) => daysAgo(customer.lastOrderDate || customer.firstOrderDate) >= 30)
      .map((customer) => ({
        id: `inactive-${customer.id || customer.phone || customer.name}`,
        group: 'Inactive Customers',
        customerName: customer.name || 'Customer',
        phone: customer.whatsapp || customer.phone || '',
        orderNo: '-',
        status: 'Inactive 30+ days',
        amount: toSafeNumber(customer.totalSpend),
        template: 'Winback Message',
        message: renderMessage(templates['Winback Message'], null, customer)
      }));

    return [
      ...orders.filter((order) => order.paymentStatus !== 'Paid').map((order) => buildOrderItem('Pending Payment Orders', order, 'Payment Reminder', order.paymentStatus)),
      ...orders.filter((order) => order.kitchenStatus === 'Ready' && order.deliveryStatus !== 'Delivered').map((order) => buildOrderItem('Ready for Delivery Orders', order, 'Kitchen Ready', order.kitchenStatus)),
      ...orders.filter((order) => order.deliveryStatus === 'Out for Delivery').map((order) => buildOrderItem('Out for Delivery Orders', order, 'Out for Delivery', order.deliveryStatus)),
      ...orders.filter((order) => order.deliveryStatus === 'Delivered').map((order) => buildOrderItem('Completed Orders', order, 'Delivered Feedback', order.deliveryStatus)),
      ...inactiveCustomers
    ];
  }, [customers, invoices, orders, templates]);

  const groupedFollowUps: Array<[FollowUpItem['group'], FollowUpItem[]]> = [
    ['Pending Payment Orders', followUps.filter((item) => item.group === 'Pending Payment Orders')],
    ['Ready for Delivery Orders', followUps.filter((item) => item.group === 'Ready for Delivery Orders')],
    ['Out for Delivery Orders', followUps.filter((item) => item.group === 'Out for Delivery Orders')],
    ['Completed Orders', followUps.filter((item) => item.group === 'Completed Orders')],
    ['Inactive Customers', followUps.filter((item) => item.group === 'Inactive Customers')]
  ];

  const selectedLabel = selectedOrder
    ? `${selectedOrder.orderNo || selectedOrder.id} - ${selectedOrder.customerName}`
    : selectedCustomer
      ? selectedCustomer.name
      : 'No order selected';

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">WhatsApp CRM Automation</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">Customer Message Center</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Generate WhatsApp Web messages from real order, customer, invoice, kitchen and delivery data. Official WhatsApp API is not connected yet.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-5">
            <Stat label="Orders" value={orders.length} />
            <Stat label="Customers" value={customers.length} />
            <Stat label="Invoices" value={invoices.length} />
            <Stat label="Kitchen" value={kitchenTasks.length} />
            <Stat label="Delivery" value={deliveryTasks.length} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">Message Generator</p>
          <h4 className="mt-2 text-xl font-semibold text-white">Generate from live CRM data</h4>
          <div className="mt-5 grid gap-4">
            <label className="text-sm text-slate-300">
              Message Type
              <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value as TemplateKey)} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-white outline-none focus:border-gold/50">
                {templateKeys.map((key) => <option key={key}>{key}</option>)}
              </select>
            </label>

            <label className="text-sm text-slate-300">
              Order / Customer
              <select value={selectedRecord} onChange={(event) => setSelectedRecord(event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-white outline-none focus:border-gold/50">
                {orders.length > 0 && <optgroup label="Orders">
                  {orders.map((order) => (
                    <option key={order.id} value={`order:${order.id}`}>{order.orderNo || order.id} - {order.customerName} - {formatRM(order.totalAmount)}</option>
                  ))}
                </optgroup>}
                {customers.length > 0 && <optgroup label="Customers">
                  {customers.map((customer) => {
                    const key = customer.id || customer.phone || customer.name;
                    return <option key={key} value={`customer:${key}`}>{customer.name} - {customer.phone || 'No phone'}</option>;
                  })}
                </optgroup>}
                {orders.length === 0 && customers.length === 0 && <option value="">No order or customer available</option>}
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="Selected" value={selectedLabel} />
            <Info label="Formatted Phone" value={previewPhone || 'Missing'} />
            <Info label="Invoice" value={invoiceNoForOrder(invoices, selectedOrder)} />
            <Info label="Status" value={selectedOrder?.workflowStatus || selectedCustomer?.customerStatus || 'Customer'} />
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">Message Preview</p>
          <textarea value={previewMessage} readOnly className="mt-4 min-h-[280px] w-full rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5 text-sm leading-7 text-slate-100 outline-none" />
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => copyMessage(previewMessage)} disabled={!previewMessage} className="rounded-3xl bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold disabled:opacity-50">Copy Message</button>
            <button onClick={() => openWhatsApp(selectedOrder?.phone || selectedCustomer?.phone || selectedCustomer?.whatsapp || '', previewMessage)} disabled={!previewPhone} className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50">Open WhatsApp</button>
          </div>
        </section>
      </div>

      <section className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">Follow Up Lists</p>
          <h4 className="mt-2 text-xl font-semibold text-white">Suggested WhatsApp actions</h4>
        </div>

        {groupedFollowUps.map(([title, items]) => (
          <div key={title} className="rounded-[32px] border border-white/10 bg-[#141414] p-5 shadow-panel">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h5 className="font-semibold text-white">{title}</h5>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{items.length}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {items.length === 0 && <p className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5 text-sm text-slate-400">No follow-ups in this category.</p>}
              {items.map((item) => {
                const phone = normalizeMalaysiaPhone(item.phone);
                return (
                  <article key={item.id} className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4 text-sm text-slate-300 transition hover:border-gold/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{item.customerName}</p>
                        <p className="mt-1 text-slate-400">{item.phone || 'No phone'}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Info label="Order No" value={item.orderNo} />
                      <Info label="Template" value={item.template} />
                    </div>
                    <p className="mt-4 rounded-2xl bg-white/5 p-3 text-sm leading-6 text-slate-300">{item.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => copyMessage(item.message)} className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Copy Message</button>
                      <button onClick={() => openWhatsApp(item.phone, item.message)} disabled={!phone} className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50">Open WhatsApp</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.24em] text-softGold">Auto Templates</p>
          <h4 className="mt-2 text-xl font-semibold text-white">Editable WhatsApp templates</h4>
          <p className="mt-2 text-sm text-slate-400">Available placeholders: {placeholders.join(' ')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {templateKeys.map((key) => (
            <label key={key} className="rounded-[24px] border border-white/10 bg-[#0f0f0f] p-4 text-sm text-slate-300">
              <span className="font-semibold text-white">{key}</span>
              <textarea value={templates[key]} onChange={(event) => setTemplates((current) => ({ ...current, [key]: event.target.value }))} className="mt-3 min-h-[120px] w-full rounded-2xl border border-white/10 bg-[#141414] p-4 text-sm leading-6 text-slate-100 outline-none focus:border-gold/50" />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-softGold">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111111] p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-softGold">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
