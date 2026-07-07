import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import Toast from '../components/Toast';
import {
  createQuotationInSupabase,
  loadQuotationsFromSupabase,
  updateQuotationStatusInSupabase,
  type Quotation,
  type QuotationItem,
  type QuotationStatus
} from '../services/quotationService';
import {
  createLeadActivityInSupabase,
  loadSalesLeadsFromSupabase,
  type SalesLead
} from '../services/salesLeadService';
import { formatRM } from '../utils/pricing';

type ConversionProductType = 'Mini Tart' | 'Croissant Egg Tart' | 'Custom Item';
type ConversionDeliveryType = 'Delivery' | 'Self Collect';

type ConversionDraft = {
  customerName: string;
  contactPerson: string;
  phone: string;
  productType: ConversionProductType;
  deliveryType: ConversionDeliveryType;
  deliveryDate: string;
  deliveryTime: string;
  address: string;
  notes: string;
  flavourQuantities: Record<string, number>;
};

const statuses: QuotationStatus[] = ['Draft', 'Sent', 'Viewed', 'Negotiating', 'Accepted', 'Rejected'];
const products = [
  { name: 'Mini Tart', price: 2.5 },
  { name: 'Croissant Tart', price: 11.8 },
  { name: 'Custom Item', price: 0 }
];
const conversionProductTypes: ConversionProductType[] = ['Mini Tart', 'Croissant Egg Tart', 'Custom Item'];
const miniTartFlavours = [
  'Matcha Red Bean',
  'Chocolate Noir',
  'Honey Brûlée',
  'Lime Cheese',
  'Biscoff',
  'Black Sesame'
] as const;

const conversionInputClass =
  'mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0f0f0f] px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-gold/50';

const getQuotationProductType = (quotation: Quotation): ConversionProductType => {
  const names = quotation.items.map((item) => item.productName.toLowerCase());
  if (names.some((name) => name.includes('mini tart'))) return 'Mini Tart';
  if (names.some((name) => name.includes('croissant'))) return 'Croissant Egg Tart';
  return 'Custom Item';
};

const getQuotationQuantity = (quotation: Quotation, productType: ConversionProductType) => {
  if (productType === 'Custom Item') {
    return quotation.items.reduce((sum, item) => sum + Math.max(Number(item.quantity) || 0, 0), 0);
  }

  return quotation.items.reduce((sum, item) => {
    const name = item.productName.toLowerCase();
    const matches = productType === 'Mini Tart'
      ? name.includes('mini tart')
      : name.includes('croissant');
    return matches ? sum + Math.max(Number(item.quantity) || 0, 0) : sum;
  }, 0);
};

const buildConversionDraft = (quotation: Quotation, lead?: SalesLead): ConversionDraft => ({
  customerName: lead?.companyName || quotation.leadName || '',
  contactPerson: lead?.contactPerson || '',
  phone: lead?.phone || '',
  productType: getQuotationProductType(quotation),
  deliveryType: 'Delivery',
  deliveryDate: '',
  deliveryTime: '',
  address: '',
  notes: '',
  flavourQuantities: Object.fromEntries(miniTartFlavours.map((flavour) => [flavour, 0]))
});

const currentUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('lbl_currentUser') || '{}') as { email?: string };
    return user.email || 'Unknown user';
  } catch {
    return 'Unknown user';
  }
};

const blankItem = (): QuotationItem => ({
  productName: 'Mini Tart',
  quantity: 1,
  unitPrice: 2.5,
  lineTotal: 2.5
});

const statusTone = (status: QuotationStatus) => {
  if (status === 'Accepted') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'Rejected') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'Sent' || status === 'Viewed') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  if (status === 'Negotiating') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-white/10 bg-white/5 text-slate-300';
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[character] || character));

function printQuotation(quotation: Quotation) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  const itemRows = quotation.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.productName)}</td>
      <td class="number">${item.quantity}</td>
      <td class="number">${formatRM(item.unitPrice)}</td>
      <td class="number">${formatRM(item.lineTotal)}</td>
    </tr>
  `).join('');
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(quotation.quoteNo)}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #171717; background: #f7f3ed; font-family: Arial, sans-serif; }
          .sheet { min-height: 260mm; padding: 28px; background: #fffdf9; border-top: 5px solid #b89b72; }
          header { display: flex; justify-content: space-between; gap: 30px; border-bottom: 1px solid #b89b72; padding-bottom: 24px; }
          h1 { margin: 0; font-family: Georgia, serif; font-size: 34px; }
          .brand { text-align: right; }
          .brand strong { font-family: Georgia, serif; font-size: 22px; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 30px 0; }
          .label { color: #8a7457; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; background: #171717; color: white; padding: 12px; font-size: 11px; }
          td { padding: 13px 12px; border-bottom: 1px solid #e6ded3; }
          .number { text-align: right; }
          .totals { width: 330px; margin: 28px 0 0 auto; }
          .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
          .total { border-top: 2px solid #b89b72; margin-top: 8px; padding-top: 14px !important; font-size: 22px; font-weight: bold; }
          footer { margin-top: 70px; border-top: 1px solid #b89b72; padding-top: 18px; color: #6f6559; font-size: 11px; text-align: center; }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header>
            <div><div class="label">Quotation</div><h1>${escapeHtml(quotation.quoteNo)}</h1></div>
            <div class="brand"><strong>Layer By Layer Bakery</strong><br>Premium Desserts & Event Catering<br>019-4937139</div>
          </header>
          <section class="meta">
            <div><div class="label">Prepared For</div><h3>${escapeHtml(quotation.leadName || 'Sales Lead')}</h3></div>
            <div><div class="label">Status</div><h3>${escapeHtml(quotation.status)}</h3></div>
          </section>
          <table>
            <thead><tr><th>Description</th><th class="number">Qty</th><th class="number">Unit Price</th><th class="number">Amount</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <section class="totals">
            <div><span>Subtotal</span><strong>${formatRM(quotation.subtotal)}</strong></div>
            <div><span>Discount</span><strong>-${formatRM(quotation.discount)}</strong></div>
            <div><span>Delivery Fee</span><strong>${formatRM(quotation.deliveryFee)}</strong></div>
            <div class="total"><span>Total</span><span>${formatRM(quotation.totalAmount)}</span></div>
          </section>
          <footer>EVENT CATERING • CORPORATE GIFTING • WEDDING DESSERT • PRIVATE EVENTS</footer>
        </main>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function ConversionReadinessModal({
  quotation,
  draft,
  errors,
  productQuantity,
  flavourQuantityTotal,
  orderTotal,
  totalsMatch,
  onChange,
  onClose,
  onSubmit
}: {
  quotation: Quotation;
  draft: ConversionDraft;
  errors: string[];
  productQuantity: number;
  flavourQuantityTotal: number;
  orderTotal: number;
  totalsMatch: boolean;
  onChange: (changes: Partial<ConversionDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isCustomItem = draft.productType === 'Custom Item';
  const canSubmit = errors.length === 0 && !isCustomItem;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 backdrop-blur-sm md:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-quotation-title"
        className="mx-auto w-full max-w-5xl overflow-hidden rounded-[20px] border border-gold/25 bg-[#111111] shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 md:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-softGold">Phase 8A Readiness Check</p>
            <h2 id="convert-quotation-title" className="mt-1.5 text-xl font-semibold text-white">
              Convert Quotation to Order
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Validate operational details for {quotation.quoteNo}. No records will be created yet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-gold/30 hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[1.35fr_0.65fr] md:p-5">
          <div className="space-y-4">
            <section className="rounded-[16px] border border-white/10 bg-[#151515] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-softGold">Customer & Order</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-400">
                  Customer / Company Name
                  <input
                    value={draft.customerName}
                    onChange={(event) => onChange({ customerName: event.target.value })}
                    className={conversionInputClass}
                    placeholder="Company or customer name"
                  />
                </label>
                <label className="text-xs font-medium text-slate-400">
                  Contact Person
                  <input
                    value={draft.contactPerson}
                    onChange={(event) => onChange({ contactPerson: event.target.value })}
                    className={conversionInputClass}
                    placeholder="Contact person"
                  />
                </label>
                <label className="text-xs font-medium text-slate-400">
                  Phone
                  <input
                    value={draft.phone}
                    onChange={(event) => onChange({ phone: event.target.value })}
                    className={conversionInputClass}
                    placeholder="0123456789"
                  />
                </label>
                <label className="text-xs font-medium text-slate-400">
                  Product Type
                  <select
                    value={draft.productType}
                    onChange={(event) => onChange({ productType: event.target.value as ConversionProductType })}
                    className={conversionInputClass}
                  >
                    {conversionProductTypes.map((productType) => (
                      <option key={productType} value={productType}>{productType}</option>
                    ))}
                  </select>
                </label>
              </div>
              {isCustomItem && (
                <div className="mt-3 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  Custom Item cannot be converted in Phase 8A. Map it to a supported order product before Phase 8B.
                </div>
              )}
            </section>

            <section className="rounded-[16px] border border-white/10 bg-[#151515] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-softGold">Delivery / Collection</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#0f0f0f] p-1">
                {(['Delivery', 'Self Collect'] as ConversionDeliveryType[]).map((deliveryType) => (
                  <button
                    key={deliveryType}
                    type="button"
                    onClick={() => onChange({
                      deliveryType,
                      address: deliveryType === 'Self Collect' ? '' : draft.address
                    })}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
                      draft.deliveryType === deliveryType
                        ? 'bg-gold text-charcoal'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {deliveryType}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-400">
                  Delivery Date
                  <input
                    type="date"
                    value={draft.deliveryDate}
                    onChange={(event) => onChange({ deliveryDate: event.target.value })}
                    className={conversionInputClass}
                  />
                </label>
                <label className="text-xs font-medium text-slate-400">
                  Delivery Time
                  <input
                    type="time"
                    value={draft.deliveryTime}
                    onChange={(event) => onChange({ deliveryTime: event.target.value })}
                    className={conversionInputClass}
                  />
                </label>
              </div>
              {draft.deliveryType === 'Delivery' && (
                <label className="mt-3 block text-xs font-medium text-slate-400">
                  Address
                  <textarea
                    value={draft.address}
                    onChange={(event) => onChange({ address: event.target.value })}
                    className="mt-2 min-h-20 w-full resize-y rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-gold/50"
                    placeholder="Full delivery address"
                  />
                </label>
              )}
              <label className="mt-3 block text-xs font-medium text-slate-400">
                Order Notes
                <textarea
                  value={draft.notes}
                  onChange={(event) => onChange({ notes: event.target.value })}
                  className="mt-2 min-h-20 w-full resize-y rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-gold/50"
                  placeholder="Packaging, event or collection notes"
                />
              </label>
            </section>

            {draft.productType === 'Mini Tart' && (
              <section className="rounded-[16px] border border-white/10 bg-[#151515] p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-softGold">Mini Tart Flavour Quantities</p>
                    <p className="mt-1 text-xs text-slate-500">Enter the exact quantity required for each flavour.</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    flavourQuantityTotal === productQuantity
                      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                      : 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                  }`}>
                    {flavourQuantityTotal} / {productQuantity} pcs
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {miniTartFlavours.map((flavour) => (
                    <label key={flavour} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2">
                      <span className="min-w-0 text-xs font-medium text-white">{flavour}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.flavourQuantities[flavour] || 0}
                        onChange={(event) => onChange({
                          flavourQuantities: {
                            ...draft.flavourQuantities,
                            [flavour]: Math.max(Math.floor(Number(event.target.value) || 0), 0)
                          }
                        })}
                        className="h-9 w-20 rounded-lg border border-white/10 bg-[#151515] px-2 text-right text-sm font-semibold text-white outline-none focus:border-gold/50"
                      />
                    </label>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className="rounded-[16px] border border-gold/20 bg-gold/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-softGold">Conversion Preview</p>
              <div className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3 text-slate-400"><span>Quotation total</span><strong className="text-white">{formatRM(quotation.totalAmount)}</strong></div>
                <div className="flex justify-between gap-3 text-slate-400"><span>Order total</span><strong className="text-white">{formatRM(orderTotal)}</strong></div>
                <div className="flex justify-between gap-3 text-slate-400"><span>Product quantity</span><strong className="text-white">{productQuantity}</strong></div>
                <div className="flex justify-between gap-3 text-slate-400"><span>Flavour quantity</span><strong className="text-white">{flavourQuantityTotal}</strong></div>
                <div className="flex justify-between gap-3 text-slate-400"><span>Delivery fee</span><strong className="text-white">{formatRM(quotation.deliveryFee)}</strong></div>
                <div className="flex justify-between gap-3 text-slate-400"><span>Discount</span><strong className="text-white">-{formatRM(quotation.discount)}</strong></div>
              </div>
              <div className={`mt-4 flex gap-2 rounded-xl border p-3 text-xs leading-5 ${
                totalsMatch
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                  : 'border-rose-400/25 bg-rose-400/10 text-rose-200'
              }`}>
                {totalsMatch
                  ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
                {totalsMatch
                  ? 'Quotation and order totals match.'
                  : 'Totals do not match. Review quotation pricing before Phase 8B.'}
              </div>
            </section>

            <section className="rounded-[16px] border border-white/10 bg-[#151515] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-softGold">Readiness</p>
              {errors.length === 0 && !isCustomItem ? (
                <div className="mt-3 flex gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-200">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  Required conversion data is complete.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {errors.map((error) => (
                    <p key={error} className="flex gap-2 text-xs leading-5 text-amber-200">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-white/10 px-4 py-4 sm:flex-row sm:justify-end md:px-5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="min-h-10 rounded-xl bg-gold px-5 text-sm font-semibold text-charcoal transition hover:bg-softGold disabled:cursor-not-allowed disabled:opacity-35"
          >
            Ready for Phase 8B
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function QuotationPage() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [leadId, setLeadId] = useState('');
  const [items, setItems] = useState<QuotationItem[]>([blankItem()]);
  const [discount, setDiscount] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [saving, setSaving] = useState(false);
  const [conversionQuotation, setConversionQuotation] = useState<Quotation | null>(null);
  const [conversionDraft, setConversionDraft] = useState<ConversionDraft | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const reload = async () => {
    const [leadData, quotationData] = await Promise.all([
      loadSalesLeadsFromSupabase(),
      loadQuotationsFromSupabase()
    ]);
    const visibleLeads = leadData.filter((lead) => lead.status !== 'Archived');
    const requestedLeadId = localStorage.getItem('lbl_selected_sales_lead_id') || '';
    setLeads(visibleLeads);
    if (requestedLeadId && visibleLeads.some((lead) => String(lead.id) === requestedLeadId)) {
      setLeadId(requestedLeadId);
      localStorage.removeItem('lbl_selected_sales_lead_id');
    }
    setQuotations(quotationData);
    setSelectedId((current) => current || quotationData[0]?.id || null);
  };

  useEffect(() => {
    reload().catch((error) => {
      console.error('Quotation page load error:', error);
      setToast({ message: 'Failed to load quotation data.', type: 'error' });
    });
  }, []);

  const selectedQuotation = quotations.find((quotation) => quotation.id === selectedId) || null;
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalAmount = Math.max(subtotal - discount + deliveryFee, 0);
  const conversionProductQuantity = conversionQuotation && conversionDraft
    ? getQuotationQuantity(conversionQuotation, conversionDraft.productType)
    : 0;
  const conversionFlavourQuantityTotal = conversionDraft
    ? Object.values(conversionDraft.flavourQuantities).reduce((sum, quantity) => sum + Math.max(Number(quantity) || 0, 0), 0)
    : 0;
  const conversionOrderTotal = conversionQuotation
    ? Math.max(conversionQuotation.subtotal - conversionQuotation.discount + conversionQuotation.deliveryFee, 0)
    : 0;
  const conversionTotalsMatch = conversionQuotation
    ? Math.abs(conversionQuotation.totalAmount - conversionOrderTotal) < 0.01
    : false;
  const conversionErrors = useMemo(() => {
    if (!conversionDraft || !conversionQuotation) return [];
    const errors: string[] = [];
    if (!conversionDraft.customerName.trim()) errors.push('Customer / company name is required.');
    if (!conversionDraft.phone.trim()) errors.push('Phone is required.');
    if (!conversionDraft.deliveryDate) errors.push('Delivery date is required.');
    if (!conversionDraft.deliveryTime) errors.push('Delivery time is required.');
    if (conversionDraft.deliveryType === 'Delivery' && !conversionDraft.address.trim()) {
      errors.push('Delivery address is required.');
    }
    if (conversionDraft.productType === 'Custom Item') {
      errors.push('Custom Item conversion is not supported yet.');
    }
    if (conversionProductQuantity <= 0) {
      errors.push('Selected product type has no matching quotation quantity.');
    }
    if (
      conversionDraft.productType === 'Mini Tart' &&
      conversionFlavourQuantityTotal !== conversionProductQuantity
    ) {
      errors.push(`Mini Tart flavour total must equal quotation quantity (${conversionProductQuantity}).`);
    }
    if (!conversionTotalsMatch) errors.push('Quotation and order totals must match.');
    return errors;
  }, [
    conversionDraft,
    conversionFlavourQuantityTotal,
    conversionProductQuantity,
    conversionQuotation,
    conversionTotalsMatch
  ]);
  const kpis = useMemo(() => {
    const sent = quotations.filter((quotation) => quotation.status !== 'Draft').length;
    const accepted = quotations.filter((quotation) => quotation.status === 'Accepted').length;
    const rejected = quotations.filter((quotation) => quotation.status === 'Rejected').length;
    return {
      sent,
      accepted,
      rejected,
      conversion: sent > 0 ? (accepted / sent) * 100 : 0
    };
  }, [quotations]);

  const updateItem = (index: number, changes: Partial<QuotationItem>) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...changes };
      return { ...next, lineTotal: next.quantity * next.unitPrice };
    }));
  };

  const createQuotation = async () => {
    if (!leadId) {
      setToast({ message: 'Select a sales lead.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const created = await createQuotationInSupabase({
        leadId,
        status: 'Draft',
        subtotal,
        discount,
        deliveryFee,
        totalAmount,
        items: items.map((item) => ({ ...item, lineTotal: item.quantity * item.unitPrice }))
      }, currentUser());
      await createLeadActivityInSupabase({
        leadId,
        activityType: 'Quotation Created',
        description: `${created.quoteNo} created for ${formatRM(created.totalAmount)}`,
        performedBy: currentUser()
      });
      await reload();
      setSelectedId(created.id || null);
      setItems([blankItem()]);
      setDiscount(0);
      setDeliveryFee(0);
      setToast({ message: 'Quotation created successfully.', type: 'success' });
    } catch (error) {
      console.error('Quotation create error:', error);
      setToast({ message: 'Failed to create quotation.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (quotation: Quotation, status: QuotationStatus) => {
    try {
      await updateQuotationStatusInSupabase(quotation, status, currentUser());
      await createLeadActivityInSupabase({
        leadId: quotation.leadId,
        activityType: `Quotation ${status}`,
        description: `${quotation.quoteNo} changed to ${status}`,
        performedBy: currentUser()
      });
      await reload();
      setToast({ message: `Quotation marked ${status}.`, type: 'success' });
    } catch (error) {
      console.error('Quotation status error:', error);
      setToast({ message: 'Failed to update quotation.', type: 'error' });
    }
  };

  const openConversionReadiness = (quotation: Quotation) => {
    if (quotation.status !== 'Accepted') {
      setToast({ message: 'Quotation must be Accepted before conversion preparation.', type: 'error' });
      return;
    }
    const lead = leads.find((item) => String(item.id) === String(quotation.leadId));
    setConversionQuotation(quotation);
    setConversionDraft(buildConversionDraft(quotation, lead));
  };

  const closeConversionReadiness = () => {
    setConversionQuotation(null);
    setConversionDraft(null);
  };

  const validateConversionReadiness = () => {
    if (!conversionQuotation || !conversionDraft || conversionErrors.length > 0) return;
    closeConversionReadiness();
    setToast({
      message: 'Conversion data validated. Ready for order creation workflow.',
      type: 'success'
    });
  };

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {conversionQuotation && conversionDraft && (
        <ConversionReadinessModal
          quotation={conversionQuotation}
          draft={conversionDraft}
          errors={conversionErrors}
          productQuantity={conversionProductQuantity}
          flavourQuantityTotal={conversionFlavourQuantityTotal}
          orderTotal={conversionOrderTotal}
          totalsMatch={conversionTotalsMatch}
          onChange={(changes) => setConversionDraft((current) => current ? { ...current, ...changes } : current)}
          onClose={closeConversionReadiness}
          onSubmit={validateConversionReadiness}
        />
      )}

      <section className="rounded-[20px] border border-gold/20 bg-[#141414] p-4 shadow-panel md:p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-softGold">Sales CRM</p>
        <h3 className="mt-1.5 text-2xl font-semibold text-white">Quotation Management</h3>
        <p className="mt-2 text-sm text-slate-400">Build, track and convert professional corporate quotations.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Quotations Sent', kpis.sent],
          ['Accepted Quotations', kpis.accepted],
          ['Rejected Quotations', kpis.rejected],
          ['Conversion Rate', `${kpis.conversion.toFixed(1)}%`]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/10 bg-[#141414] p-3.5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.18em] text-softGold">{label}</p>
            <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 2xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-[18px] border border-white/10 bg-[#141414] p-4 shadow-panel">
            <p className="text-xs uppercase tracking-[0.22em] text-softGold">Quotation History</p>
            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {quotations.map((quotation) => (
                <button key={quotation.id} onClick={() => setSelectedId(quotation.id || null)} className={`w-full rounded-xl border p-3.5 text-left transition ${selectedId === quotation.id ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-[#0f0f0f] hover:border-gold/30'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold text-white">{quotation.quoteNo}</p><p className="mt-1 text-sm text-slate-400">{quotation.leadName}</p></div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusTone(quotation.status)}`}>{quotation.status}</span>
                  </div>
                  <p className="mt-3 font-semibold text-softGold">{formatRM(quotation.totalAmount)}</p>
                </button>
              ))}
              {quotations.length === 0 && <p className="text-sm text-slate-400">No quotations yet.</p>}
            </div>
          </div>

          {selectedQuotation && (
            <div className="rounded-[18px] border border-white/10 bg-[#141414] p-4 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-[0.2em] text-softGold">Selected Quote</p><h4 className="mt-2 text-xl font-semibold text-white">{selectedQuotation.quoteNo}</h4></div>
                <button onClick={() => printQuotation(selectedQuotation)} className="rounded-2xl bg-gold px-4 py-2 text-sm font-semibold text-charcoal">Generate PDF</button>
              </div>
              <select value={selectedQuotation.status} onChange={(event) => changeStatus(selectedQuotation, event.target.value as QuotationStatus)} className="mt-5 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white">
                {statuses.map((status) => <option key={status}>{status}</option>)}
              </select>
              {selectedQuotation.status === 'Accepted' ? (
                <button
                  type="button"
                  onClick={() => openConversionReadiness(selectedQuotation)}
                  className="mt-3 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Convert to Order
                </button>
              ) : (
                <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-5 text-slate-400">
                  Mark this quotation Accepted to prepare it for order conversion.
                </p>
              )}
              <div className="mt-5 space-y-3">
                {selectedQuotation.history.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-3">
                    <div className="flex justify-between gap-3"><span className="text-sm font-semibold text-white">{item.action}</span><span className="text-xs text-softGold">{item.createdAt?.slice(0, 10)}</span></div>
                    <p className="mt-1 text-xs text-slate-400">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[18px] border border-white/10 bg-[#141414] p-4 shadow-panel">
          <p className="text-xs uppercase tracking-[0.22em] text-softGold">Generate Quotation</p>
          <h4 className="mt-2 text-2xl font-semibold text-white">Create client proposal</h4>

          <label className="mt-4 block text-xs uppercase tracking-[0.18em] text-slate-500">
            Sales Lead
            <select value={leadId} onChange={(event) => setLeadId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white">
              <option value="">Select lead</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.companyName}</option>)}
            </select>
          </label>

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 md:grid-cols-[1.4fr_0.6fr_0.8fr_auto]">
                <select value={item.productName} onChange={(event) => {
                  const product = products.find((entry) => entry.name === event.target.value) || products[2];
                  updateItem(index, { productName: product.name, unitPrice: product.price });
                }} className="h-11 rounded-xl border border-white/10 bg-[#141414] px-3 text-sm text-white">
                  {products.map((product) => <option key={product.name}>{product.name}</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Math.max(Number(event.target.value), 1) })} className="h-11 rounded-xl border border-white/10 bg-[#141414] px-3 text-sm text-white" />
                <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: Math.max(Number(event.target.value), 0) })} className="h-11 rounded-xl border border-white/10 bg-[#141414] px-3 text-sm text-white" />
                <button onClick={() => setItems((current) => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current)} className="h-11 rounded-xl border border-rose-500/30 px-3 text-sm text-rose-200">Remove</button>
              </div>
            ))}
          </div>
          <button onClick={() => setItems((current) => [...current, blankItem()])} className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-softGold">Add Item</button>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Discount<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(Math.max(Number(event.target.value), 0))} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white" /></label>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Delivery Fee<input type="number" min="0" step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(Math.max(Number(event.target.value), 0))} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white" /></label>
          </div>

          <div className="mt-4 rounded-[16px] border border-gold/20 bg-gold/[0.06] p-4">
            <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span>{formatRM(subtotal)}</span></div>
            <div className="mt-2 flex justify-between text-sm text-slate-400"><span>Discount</span><span>-{formatRM(discount)}</span></div>
            <div className="mt-2 flex justify-between text-sm text-slate-400"><span>Delivery</span><span>{formatRM(deliveryFee)}</span></div>
            <div className="mt-4 flex justify-between border-t border-gold/20 pt-4 text-xl font-semibold text-white"><span>Total</span><span>{formatRM(totalAmount)}</span></div>
          </div>

          <button onClick={createQuotation} disabled={saving || !leadId || items.length === 0} className="mt-4 w-full rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Generating...' : 'Generate Quotation'}
          </button>
        </div>
      </section>
    </div>
  );
}
