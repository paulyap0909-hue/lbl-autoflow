import React, { useEffect, useMemo, useState } from 'react';
import Toast from '../components/Toast';
import type { Product } from '../data/mockData';
import {
  insertEventTimeline,
  loadEventsFromSupabase,
  runEventAutomation,
  updateEventInSupabase,
  updateEventStatusInSupabase,
  type EventChecklistItem,
  type EventProductLine,
  type EventRecord,
  type EventStatus
} from '../services/eventService';
import { formatRM, getProductUnitPrice, toSafeNumber } from '../utils/pricing';

type EventPageProps = {
  products: Product[];
};

const stages: EventStatus[] = ['Lead', 'Quoted', 'Confirmed', 'Production', 'Completed'];

const statusTone: Record<EventStatus, string> = {
  Lead: 'border-slate-500/40 bg-slate-500/10 text-slate-200',
  Quoted: 'border-amber-300/40 bg-amber-300/10 text-amber-100',
  Confirmed: 'border-blue-300/40 bg-blue-300/10 text-blue-100',
  Production: 'border-purple-300/40 bg-purple-300/10 text-purple-100',
  Completed: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
};

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ');
  return date.toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const calculateTotals = (items: EventProductLine[], deliveryFee: number, discount: number) => {
  const subtotal = items.reduce((sum, item) => sum + toSafeNumber(item.qty) * toSafeNumber(item.unitPrice), 0);
  return {
    subtotal,
    grandTotal: Math.max(subtotal + toSafeNumber(deliveryFee) - toSafeNumber(discount), 0)
  };
};

export default function EventPage({ products }: EventPageProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [productQty, setProductQty] = useState(12);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loadError, setLoadError] = useState('');

  const closeEventDrawer = () => {
  setSelectedId('');
};

  useEffect(() => {
    let mounted = true;
    loadEventsFromSupabase()
      .then((data) => {
        if (!mounted) return;
        setEvents(data);
        setLoadError('');
      })
      .catch((error) => {
        console.error('Event CRM load error:', error);
        if (!mounted) return;
        setEvents([]);
        setLoadError(error instanceof Error ? error.message : 'Unable to load events from Supabase.');
      });
    return () => {
      mounted = false;
    };
  }, []);



  const selectedEvent = events.find((event) => event.id === selectedId);

  const grouped = useMemo(() => {
    return stages.reduce<Record<EventStatus, EventRecord[]>>((acc, stage) => {
      acc[stage] = events
        .filter((event) => event.status === stage)
        .sort((a, b) => `${a.eventDate} ${a.eventTime}`.localeCompare(`${b.eventDate} ${b.eventTime}`));
      return acc;
    }, { Lead: [], Quoted: [], Confirmed: [], Production: [], Completed: [] });
  }, [events]);

  const metrics = useMemo(() => {
    const activeEvents = events.filter((event) => event.status !== 'Completed');
    const pipelineValue = activeEvents.reduce((sum, event) => sum + event.grandTotal, 0);
    const confirmedRevenue = events
      .filter((event) => event.status === 'Confirmed' || event.status === 'Production' || event.status === 'Completed')
      .reduce((sum, event) => sum + event.grandTotal, 0);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = activeEvents.filter((event) => event.eventDate >= today).length;

    return [
      { label: 'Active Events', value: activeEvents.length.toString(), note: 'Open pipeline' },
      { label: 'Pipeline Value', value: formatRM(pipelineValue), note: 'Lead to production' },
      { label: 'Confirmed Revenue', value: formatRM(confirmedRevenue), note: 'Committed value' },
      { label: 'Upcoming Events', value: upcoming.toString(), note: 'Scheduled ahead' }
    ];
  }, [events]);

  const forecast = useMemo(() => {
    return events
      .filter((event) => event.status !== 'Completed')
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .slice(0, 6);
  }, [events]);

  const maxForecastValue = Math.max(...forecast.map((event) => event.grandTotal), 1);

  const persistEvent = async (event: EventRecord, successMessage: string) => {
    try {
      await updateEventInSupabase(event);
      setEvents((prev) => prev.map((item) => (item.id === event.id ? event : item)));
      setToast({ message: successMessage, type: 'success' });
    } catch (error) {
      console.error('Event CRM save error:', error);
      setToast({ message: 'Event update failed in Supabase.', type: 'error' });
    }
  };

  const addTimelineLocal = (event: EventRecord, label: string, message: string): EventRecord => ({
    ...event,
    timeline: [
      { id: `${event.id}-${Date.now()}`, label, message, createdAt: new Date().toISOString() },
      ...event.timeline
    ]
  });

  const moveStage = async (event: EventRecord, status: EventStatus) => {
    const updated = addTimelineLocal({ ...event, status }, status, `Event moved to ${status}.`);

    try {
      await updateEventStatusInSupabase(event, status);
      await insertEventTimeline(event.id, status, `Event moved to ${status}.`);
      const automationMessage = status === 'Confirmed' || status === 'Production' || status === 'Completed'
        ? await runEventAutomation(updated, status)
        : '';
      setEvents((prev) => prev.map((item) => (item.id === event.id ? updated : item)));
      setSelectedId(event.id);
      setToast({ message: automationMessage || `Moved to ${status}.`, type: 'success' });
    } catch (error) {
      console.error('Event automation error:', error);
      setToast({ message: 'Stage change failed in Supabase.', type: 'error' });
    }
  };

  const addProduct = () => {
    if (!selectedEvent) return;
    const product = products.find((item) => item.id === selectedProductId);
    if (!product) {
      setToast({ message: 'Select a product first.', type: 'error' });
      return;
    }
    const line: EventProductLine = {
      id: `${selectedEvent.id}-${product.id}-${Date.now()}`,
      productId: product.id,
      name: product.name,
      qty: Math.max(productQty, 1),
      unitPrice: getProductUnitPrice(product)
    };
    const nextProducts = [...selectedEvent.products, line];
    const totals = calculateTotals(nextProducts, selectedEvent.deliveryFee, selectedEvent.discount);
    const updated = addTimelineLocal({ ...selectedEvent, products: nextProducts, ...totals }, 'Product Added', `${product.name} added to event package.`);
    persistEvent(updated, 'Product added.');
  };

  const removeProduct = (event: EventRecord, lineId: string) => {
    const nextProducts = event.products.filter((line) => line.id !== lineId);
    const totals = calculateTotals(nextProducts, event.deliveryFee, event.discount);
    const updated = addTimelineLocal({ ...event, products: nextProducts, ...totals }, 'Product Removed', 'Product package updated.');
    persistEvent(updated, 'Product removed.');
  };

  const updateFinancial = (event: EventRecord, field: 'deliveryFee' | 'discount' | 'deposit' | 'paid', value: string) => {
    const numericValue = toSafeNumber(value);
    const draft = { ...event, [field]: numericValue };
    const totals = calculateTotals(draft.products, draft.deliveryFee, draft.discount);
    const updated = { ...draft, ...totals };
    setEvents((prev) => prev.map((item) => (item.id === event.id ? updated : item)));
  };

  const saveFinancial = (event: EventRecord) => {
    persistEvent(addTimelineLocal(event, 'Financial Updated', 'Subtotal, delivery fee, discount or payment updated.'), 'Financials saved.');
  };

  const toggleChecklist = (event: EventRecord, item: EventChecklistItem) => {
    const checklist = event.checklist.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry));
    const updated = addTimelineLocal({ ...event, checklist }, 'Checklist Updated', `${item.title} marked ${item.done ? 'pending' : 'done'}.`);
    persistEvent(updated, 'Checklist updated.');
  };

  const runDeliveryAutomation = async (event: EventRecord) => {
    try {
      const message = await runEventAutomation(event, 'Delivery');
      const updated = addTimelineLocal(event, 'Delivery Board', message);
      setEvents((prev) => prev.map((item) => (item.id === event.id ? updated : item)));
      await insertEventTimeline(event.id, 'Delivery Board', message);
      setToast({ message, type: 'success' });
    } catch (error) {
      console.error('Event delivery automation error:', error);
      setToast({ message: 'Delivery automation failed.', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {loadError && (
        <section className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-200">Supabase Events Error</p>
          <p className="mt-2 text-sm text-rose-100">{loadError}</p>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.2em] text-softGold">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
            <p className="mt-2 text-sm text-slate-400">{metric.note}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5 shadow-panel">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-softGold">Event CRM Pipeline</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Bakery events from lead to customer CRM</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Supabase source: Supabase. Click any card to manage customer details, products, checklist, timeline and automation.
            </p>
          </div>
          <div className="grid min-w-full gap-3 md:grid-cols-3 xl:min-w-[520px]">
            {forecast.map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-3">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>{formatDate(event.eventDate)}</span>
                  <span className="text-softGold">{formatRM(event.grandTotal)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max((event.grandTotal / maxForecastValue) * 100, 6)}%` }} />
                </div>
                <p className="mt-2 truncate text-xs text-white">{event.companyName}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {stages.map((stage) => (
          <div key={stage} className="min-w-0 rounded-[28px] border border-white/10 bg-[#101010] p-4 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{stage}</p>
                <p className="text-xs text-slate-500">{grouped[stage].length} events</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs ${statusTone[stage]}`}>{stage}</span>
            </div>

            <div className="space-y-3">
              {grouped[stage].length === 0 && (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-[#141414] p-5 text-sm text-slate-500">
                  No events.
                </div>
              )}
              {grouped[stage].map((event) => (
                <button
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  className={`w-full rounded-[24px] border bg-[#141414] p-4 text-left shadow-panel transition hover:border-gold/30 hover:shadow-lg ${selectedId === event.id ? 'border-gold/50' : 'border-white/10'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">{event.companyName}</p>
                      <p className="mt-1 text-xs text-slate-500">{event.guestCount} guests</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-softGold">{formatRM(event.grandTotal)}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{formatDate(event.eventDate)}</span>
                    <span className={`rounded-full border px-2 py-1 ${statusTone[event.status]}`}>{event.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm">
          <button className="hidden flex-1 cursor-default lg:block" onClick={() => setSelectedId('')} aria-label="Close event detail drawer" />
          <aside className="h-full w-full overflow-y-auto border-l border-gold/20 bg-[#0b0b0b] p-5 shadow-2xl lg:max-w-[760px]">
            <div className="sticky top-0 z-10 -mx-5 -mt-5 border-b border-white/10 bg-[#0b0b0b]/95 p-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-softGold">Event Detail</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{selectedEvent.companyName}</h2>
                  <p className="mt-1 text-sm text-slate-400">{selectedEvent.eventType} · {formatDate(selectedEvent.eventDate)} · {selectedEvent.guestCount} guests</p>
                </div>
                <button onClick={() => setSelectedId('')} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-gold/40 hover:text-softGold">Close</button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {stages.map((stage) => (
                  <button key={stage} onClick={() => moveStage(selectedEvent, stage)} className={`rounded-full border px-4 py-2 text-sm transition ${selectedEvent.status === stage ? 'border-gold bg-gold text-charcoal' : 'border-white/10 text-slate-300 hover:border-gold/40 hover:text-softGold'}`}>
                    {stage}
                  </button>
                ))}
                <button onClick={() => runDeliveryAutomation(selectedEvent)} className="rounded-full border border-gold/40 px-4 py-2 text-sm text-softGold transition hover:bg-gold hover:text-charcoal">Send Delivery</button>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5">
                <h3 className="text-lg font-semibold text-white">Customer</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Info label="Contact Person" value={selectedEvent.contactPerson} />
                  <Info label="Phone" value={selectedEvent.phone || 'Missing'} />
                  <Info label="Email" value={selectedEvent.email || 'Not set'} />
                  <Info label="Customer Link" value={selectedEvent.customerId ? 'Linked to CRM' : 'Not linked'} />
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5">
                <h3 className="text-lg font-semibold text-white">Event</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Info label="Event Type" value={selectedEvent.eventType} />
                  <Info label="Status" value={selectedEvent.status} />
                  <Info label="Date / Time" value={`${formatDate(selectedEvent.eventDate)} · ${selectedEvent.eventTime}`} />
                  <Info label="Location" value={selectedEvent.location || 'Not set'} />
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Products</h3>
                    <p className="mt-1 text-sm text-slate-400">Build event packages from the product database.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                    <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-gold/50">
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                    <input type="number" min={1} value={productQty} onChange={(event) => setProductQty(toSafeNumber(event.target.value))} className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none focus:border-gold/50" />
                    <button onClick={addProduct} className="rounded-2xl bg-gold px-4 py-2 text-sm font-semibold text-charcoal transition hover:bg-softGold">Add</button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {selectedEvent.products.map((line) => (
                    <div key={line.id} className="grid gap-3 rounded-2xl border border-white/10 bg-[#0f0f0f] p-3 text-sm md:grid-cols-[1fr_90px_120px_120px_auto] md:items-center">
                      <p className="font-medium text-white">{line.name}</p>
                      <p className="text-slate-400">Qty {line.qty}</p>
                      <p className="text-slate-400">{formatRM(line.unitPrice)}</p>
                      <p className="font-semibold text-softGold">{formatRM(line.qty * line.unitPrice)}</p>
                      <button onClick={() => removeProduct(selectedEvent, line.id)} className="rounded-full border border-red-400/30 px-3 py-1 text-xs text-red-200 transition hover:bg-red-500/10">Remove</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-white">Financial</h3>
                  <button onClick={() => saveFinancial(selectedEvent)} className="rounded-2xl border border-gold/40 px-4 py-2 text-sm text-softGold transition hover:bg-gold hover:text-charcoal">Save Financials</button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <MoneyInput label="Delivery Fee" value={selectedEvent.deliveryFee} onChange={(value) => updateFinancial(selectedEvent, 'deliveryFee', value)} />
                  <MoneyInput label="Discount" value={selectedEvent.discount} onChange={(value) => updateFinancial(selectedEvent, 'discount', value)} />
                  <MoneyInput label="Deposit" value={selectedEvent.deposit} onChange={(value) => updateFinancial(selectedEvent, 'deposit', value)} />
                  <MoneyInput label="Paid" value={selectedEvent.paid} onChange={(value) => updateFinancial(selectedEvent, 'paid', value)} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Info label="Subtotal" value={formatRM(selectedEvent.subtotal)} />
                  <Info label="Grand Total" value={formatRM(selectedEvent.grandTotal)} />
                  <Info label="Balance" value={formatRM(Math.max(selectedEvent.grandTotal - selectedEvent.paid, 0))} />
                  <Info label="Payment" value={`${Math.min(Math.round((selectedEvent.paid / Math.max(selectedEvent.grandTotal, 1)) * 100), 100)}% paid`} />
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5">
                <h3 className="text-lg font-semibold text-white">Checklist</h3>
                <div className="mt-4 grid gap-2">
                  {selectedEvent.checklist.map((item) => (
                    <button key={item.id} onClick={() => toggleChecklist(selectedEvent, item)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-left text-sm transition hover:border-gold/30">
                      <span className={item.done ? 'text-white' : 'text-slate-400'}>{item.title}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs ${item.done ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : 'border-white/10 text-slate-500'}`}>{item.done ? 'Done' : 'Pending'}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#141414] p-5">
                <h3 className="text-lg font-semibold text-white">Timeline</h3>
                <div className="mt-4 space-y-3">
                  {selectedEvent.timeline.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-white">{log.label}</p>
                        <p className="text-xs text-softGold">{formatDateTime(log.createdAt)}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{log.message}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-softGold">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-3">
      <span className="text-xs uppercase tracking-[0.18em] text-softGold">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full bg-transparent text-sm font-semibold text-white outline-none"
      />
    </label>
  );
}
