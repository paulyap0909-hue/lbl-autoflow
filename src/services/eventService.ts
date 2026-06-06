import { supabase } from '../lib/supabase';
import { toSafeNumber } from '../utils/pricing';
import { createAutomationLog } from './automationLogService';

export type EventStatus = 'Lead' | 'Quoted' | 'Confirmed' | 'Production' | 'Completed';
export type EventType = 'Corporate Event' | 'Tea Break' | 'Wedding' | 'Launching' | 'Open Day' | 'Farewell' | 'Exhibition';

export type EventProductLine = {
  id: string;
  productId?: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export type EventChecklistItem = {
  id: string;
  title: string;
  done: boolean;
};

export type EventTimelineLog = {
  id: string;
  label: string;
  message: string;
  createdAt: string;
};

export type EventRecord = {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  eventType: EventType;
  eventDate: string;
  eventTime: string;
  guestCount: number;
  location: string;
  status: EventStatus;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  deposit: number;
  paid: number;
  products: EventProductLine[];
  checklist: EventChecklistItem[];
  timeline: EventTimelineLog[];
  customerId?: string;
  orderNo?: string;
  createdAt: string;
};

type EventRow = {
  id?: string | null;
  company_name?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  guest_count?: number | string | null;
  location?: string | null;
  status?: string | null;
  subtotal?: number | string | null;
  delivery_fee?: number | string | null;
  discount?: number | string | null;
  grand_total?: number | string | null;
  deposit?: number | string | null;
  paid?: number | string | null;
  customer_id?: string | null;
  order_no?: string | null;
  created_at?: string | null;
};

type ProductRow = {
  id?: string | null;
  event_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  name?: string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
};

type ChecklistRow = {
  id?: string | null;
  event_id?: string | null;
  title?: string | null;
  done?: boolean | null;
};

type TimelineRow = {
  id?: string | null;
  event_id?: string | null;
  label?: string | null;
  message?: string | null;
  created_at?: string | null;
};

const normalizeStatus = (status?: string | null): EventStatus => {
  if (status === 'Quoted' || status === 'Confirmed' || status === 'Production' || status === 'Completed') return status;
  return 'Lead';
};

const normalizeType = (type?: string | null): EventType => {
  const known: EventType[] = ['Corporate Event', 'Tea Break', 'Wedding', 'Launching', 'Open Day', 'Farewell', 'Exhibition'];
  return known.includes(type as EventType) ? (type as EventType) : 'Corporate Event';
};

const timestamp = () => new Date().toISOString();

const recalc = (products: EventProductLine[], deliveryFee: number, discount: number) => {
  const subtotal = products.reduce((sum, product) => sum + product.qty * product.unitPrice, 0);
  const grandTotal = Math.max(subtotal + toSafeNumber(deliveryFee) - toSafeNumber(discount), 0);
  return { subtotal, grandTotal };
};

export const eventToRow = (event: EventRecord) => ({
  company_name: event.companyName,
  contact_person: event.contactPerson,
  phone: event.phone,
  email: event.email || '',
  event_type: event.eventType,
  event_date: event.eventDate,
  event_time: event.eventTime,
  guest_count: event.guestCount,
  location: event.location,
  status: event.status,
  subtotal: Number(event.subtotal.toFixed(2)),
  delivery_fee: Number(event.deliveryFee.toFixed(2)),
  discount: Number(event.discount.toFixed(2)),
  grand_total: Number(event.grandTotal.toFixed(2)),
  deposit: Number(event.deposit.toFixed(2)),
  paid: Number(event.paid.toFixed(2)),
  customer_id: event.customerId || null,
  order_no: event.orderNo || null,
  created_at: event.createdAt || timestamp()
});

const eventFromRow = (
  row: EventRow,
  products: EventProductLine[],
  checklist: EventChecklistItem[],
  timeline: EventTimelineLog[]
): EventRecord => {
  const deliveryFee = toSafeNumber(row.delivery_fee);
  const discount = toSafeNumber(row.discount);
  const calculated = recalc(products, deliveryFee, discount);
  const subtotal = toSafeNumber(row.subtotal) || calculated.subtotal;
  const grandTotal = toSafeNumber(row.grand_total) || Math.max(subtotal + deliveryFee - discount, 0);

  return {
    id: row.id || `EVT-${Date.now()}`,
    companyName: row.company_name || 'Event Company',
    contactPerson: row.contact_person || 'Contact Person',
    phone: row.phone || '',
    email: row.email || '',
    eventType: normalizeType(row.event_type),
    eventDate: row.event_date || new Date().toISOString().slice(0, 10),
    eventTime: row.event_time || '10:00',
    guestCount: toSafeNumber(row.guest_count),
    location: row.location || '',
    status: normalizeStatus(row.status),
    subtotal,
    deliveryFee,
    discount,
    grandTotal,
    deposit: toSafeNumber(row.deposit),
    paid: toSafeNumber(row.paid),
    products,
    checklist,
    timeline,
    customerId: row.customer_id || undefined,
    orderNo: row.order_no || undefined,
    createdAt: row.created_at || timestamp()
  };
};

export async function loadEventsFromSupabase(): Promise<EventRecord[]> {
  const { data: eventRows, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: true });

  if (error) {
    console.error('Event CRM load error:', error);
    throw error;
  }

  const eventIds = (eventRows ?? []).map((row) => String((row as EventRow).id || '')).filter(Boolean);
  if (eventIds.length === 0) return [];

  const [productResult, checklistResult, timelineResult] = await Promise.all([
    supabase.from('event_products').select('*').in('event_id', eventIds),
    supabase.from('event_checklist').select('*').in('event_id', eventIds),
    supabase.from('event_timeline').select('*').in('event_id', eventIds).order('created_at', { ascending: false })
  ]);

  if (productResult.error) throw productResult.error;
  if (checklistResult.error) throw checklistResult.error;
  if (timelineResult.error) throw timelineResult.error;

  return (eventRows ?? []).map((row) => {
    const eventRow = row as EventRow;
    const eventId = String(eventRow.id || '');
    const lines = (productResult.data ?? [])
      .filter((line) => (line as ProductRow).event_id === eventId)
      .map((line) => {
        const item = line as ProductRow;
        return {
          id: item.id || `${eventId}-${item.product_name || item.name}`,
          productId: item.product_id || undefined,
          name: item.product_name || item.name || 'Product',
          qty: toSafeNumber(item.qty || 1),
          unitPrice: toSafeNumber(item.unit_price)
        };
      });
    const checklist = (checklistResult.data ?? [])
      .filter((item) => (item as ChecklistRow).event_id === eventId)
      .map((item) => {
        const rowItem = item as ChecklistRow;
        return { id: rowItem.id || `${eventId}-${rowItem.title}`, title: rowItem.title || 'Checklist item', done: Boolean(rowItem.done) };
      });
    const timeline = (timelineResult.data ?? [])
      .filter((item) => (item as TimelineRow).event_id === eventId)
      .map((item) => {
        const rowItem = item as TimelineRow;
        return {
          id: rowItem.id || `${eventId}-${rowItem.created_at}`,
          label: rowItem.label || 'Event Update',
          message: rowItem.message || '',
          createdAt: rowItem.created_at || timestamp()
        };
      });
    return eventFromRow(eventRow, lines, checklist, timeline);
  });
}

export async function updateEventInSupabase(event: EventRecord) {
  const { data, error } = await supabase
    .from('events')
    .upsert(eventToRow(event))
    .eq('id', event.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Event CRM save error:', error);
    throw error;
  }

  await saveEventProducts(event.id, event.products);
  await saveEventChecklist(event.id, event.checklist);
  return data;
}

export async function updateEventStatusInSupabase(event: EventRecord, status: EventStatus) {
  const { error } = await supabase.from('events').update({ status }).eq('id', event.id);
  if (error) {
    console.error('Event CRM status error:', error);
    throw error;
  }
}

export async function saveEventProducts(eventId: string, products: EventProductLine[]) {
  await supabase.from('event_products').delete().eq('event_id', eventId);
  if (products.length === 0) return;

  const { error } = await supabase.from('event_products').insert(products.map((product) => ({
    event_id: eventId,
    product_id: product.productId || null,
    product_name: product.name,
    qty: product.qty,
    unit_price: product.unitPrice
  })));

  if (error) {
    console.error('Event products save error:', error);
    throw error;
  }
}

export async function saveEventChecklist(eventId: string, checklist: EventChecklistItem[]) {
  await supabase.from('event_checklist').delete().eq('event_id', eventId);
  if (checklist.length === 0) return;

  const { error } = await supabase.from('event_checklist').insert(checklist.map((item) => ({
    event_id: eventId,
    title: item.title,
    done: item.done
  })));

  if (error) {
    console.error('Event checklist save error:', error);
    throw error;
  }
}

export async function insertEventTimeline(eventId: string, label: string, message: string) {
  const { error } = await supabase.from('event_timeline').insert({
    event_id: eventId,
    label,
    message,
    created_at: timestamp()
  });

  if (error) {
    console.error('Event timeline save error:', error);
    throw error;
  }
}

export async function runEventAutomation(event: EventRecord, stage: EventStatus | 'Delivery') {
  const orderNo = event.orderNo || `EVT-${event.id}`;
  const productSummary = event.products[0]?.name || 'Mini Tart';
  const quantity = event.products.reduce((sum, product) => sum + product.qty, 0) || event.guestCount || 1;

  if (stage === 'Confirmed') {
    const { data: existing } = await supabase.from('orders').select('*').eq('order_no', orderNo).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from('orders').insert({
        order_no: orderNo,
        customer_name: event.contactPerson,
        phone: event.phone,
        address: event.location,
        delivery_date: event.eventDate,
        delivery_time: event.eventTime,
        subtotal: event.subtotal,
        delivery_fee: event.deliveryFee,
        total: event.grandTotal,
        payment_status: event.paid >= event.grandTotal ? 'Paid' : 'Pending',
        order_status: 'Paid',
        kitchen_status: 'New',
        delivery_status: 'Pending',
        product: productSummary,
        flavours: event.products.map((product) => product.name),
        quantity,
        created_at: timestamp()
      });
      if (error) throw error;
    }
    await supabase.from('events').update({ order_no: orderNo }).eq('id', event.id);
    await createAutomationLog('Event Confirmed', `${event.companyName} converted to order ${orderNo}`);
    return 'Confirmed event converted to Orders.';
  }

  if (stage === 'Production') {
    const { data: existing } = await supabase.from('kitchen_tasks').select('*').eq('order_no', orderNo).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from('kitchen_tasks').insert({
        order_no: orderNo,
        product: productSummary,
        flavours: event.products.map((product) => product.name),
        quantity,
        delivery_date: event.eventDate,
        delivery_time: event.eventTime,
        ready_time: event.eventTime,
        status: 'New'
      });
      if (error) throw error;
    }
    await createAutomationLog('Event Production', `${event.companyName} added to Kitchen Queue`);
    return 'Production event sent to Kitchen Queue.';
  }

  if (stage === 'Delivery') {
    const { data: existing } = await supabase.from('delivery_tasks').select('*').eq('order_no', orderNo).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from('delivery_tasks').insert({
        order_no: orderNo,
        customer_name: event.contactPerson,
        phone: event.phone,
        address: event.location,
        delivery_date: event.eventDate,
        delivery_time: event.eventTime,
        driver_name: '',
        status: 'Pending',
        created_at: timestamp()
      });
      if (error) throw error;
    }
    await createAutomationLog('Event Delivery', `${event.companyName} added to Delivery Board`);
    return 'Event delivery created on Delivery Board.';
  }

  if (stage === 'Completed') {
    const { error } = await supabase.from('customers').upsert({
      id: event.customerId || undefined,
      name: event.contactPerson,
      phone: event.phone,
      whatsapp: event.phone,
      email: event.email || '',
      address: event.location,
      notes: `Event CRM: ${event.companyName}`,
      total_orders: 1,
      total_spend: event.grandTotal,
      average_order_value: event.grandTotal,
      first_order_date: event.eventDate,
      last_order_date: event.eventDate,
      favourite_product: productSummary,
      favourite_flavour: event.products[0]?.name || '',
      status: event.grandTotal >= 1500 ? 'VIP' : event.grandTotal >= 800 ? 'Gold' : event.grandTotal >= 300 ? 'Silver' : 'Bronze',
      customer_status: 'Active'
    });
    if (error) throw error;
    await createAutomationLog('Event Completed', `${event.companyName} synced to Customer CRM`);
    return 'Completed event synced to Customer CRM.';
  }

  return 'Automation completed.';
}
