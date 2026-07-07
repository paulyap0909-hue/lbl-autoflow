import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Building2,
  CalendarRange,
  CreditCard,
  FileDown,
  FileText,
  Package,
  RefreshCw,
  TrendingUp,
  Truck,
  UsersRound
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { loadReportsDataFromSupabase, type ReportRow, type ReportsData } from '../services/reportService';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';

type RangePreset = 'Today' | 'Week' | 'Month' | 'Year' | 'Custom';

const EMPTY_DATA: ReportsData = {
  orders: [],
  invoices: [],
  deliveryTasks: [],
  salesLeads: [],
  quotations: [],
  warnings: [],
  loadedAt: ''
};

const valueOf = (row: ReportRow, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
};

const textOf = (row: ReportRow, ...keys: string[]) => String(valueOf(row, ...keys) ?? '').trim();

const numberOf = (row: ReportRow, ...keys: string[]) => {
  const parsed = Number(valueOf(row, ...keys));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

const money = (value: number) =>
  new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);

const dateKey = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? getMalaysiaDateTimeInputs(parsed).date : '';
};

const addDays = (key: string, days: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const getDateRange = (preset: RangePreset, customStart: string, customEnd: string) => {
  const today = getMalaysiaDateTimeInputs().date;
  if (preset === 'Today') return { start: today, end: today };
  if (preset === 'Week') {
    const [year, month, day] = today.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { start: addDays(today, -(weekday === 0 ? 6 : weekday - 1)), end: today };
  }
  if (preset === 'Month') return { start: `${today.slice(0, 7)}-01`, end: today };
  if (preset === 'Year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return {
    start: customStart || today,
    end: customEnd || customStart || today
  };
};

const isInRange = (key: string, start: string, end: string) => Boolean(key && key >= start && key <= end);

const isDeleted = (row: ReportRow) =>
  Boolean(valueOf(row, 'deleted_at', 'deletedAt')) ||
  ['true', '1'].includes(normalize(valueOf(row, 'is_deleted', 'isDeleted')));

const isCancelled = (row: ReportRow) =>
  ['cancelled', 'canceled', 'void'].some((status) =>
    [textOf(row, 'order_status', 'status', 'workflow_status')].some((value) => normalize(value) === status)
  );

const isPaid = (row: ReportRow) =>
  ['paid', 'completed'].includes(normalize(valueOf(row, 'payment_status', 'status')));

const orderAmount = (row: ReportRow) =>
  numberOf(row, 'total_amount', 'total') ||
  numberOf(row, 'final_subtotal') + numberOf(row, 'delivery_fee');

const invoiceAmount = (row: ReportRow) =>
  numberOf(row, 'grand_total', 'amount') ||
  numberOf(row, 'subtotal') + numberOf(row, 'delivery_fee') - numberOf(row, 'discount_amount');

const orderReportDate = (row: ReportRow) =>
  dateKey(valueOf(row, 'created_at', 'order_date', 'delivery_date'));

const invoiceReportDate = (row: ReportRow) =>
  dateKey(valueOf(row, 'invoice_date', 'created_at', 'updated_at'));

const deliveryReportDate = (row: ReportRow) =>
  dateKey(valueOf(row, 'delivery_date', 'created_at'));

const leadReportDate = (row: ReportRow) =>
  dateKey(valueOf(row, 'created_at', 'updated_at'));

const quotationReportDate = (row: ReportRow) =>
  dateKey(valueOf(row, 'created_at', 'updated_at'));

const escapeXml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const downloadBlob = (content: string, type: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const sheetXml = (name: string, rows: Array<Array<string | number>>) => `
  <Worksheet ss:Name="${escapeXml(name.slice(0, 31))}">
    <Table>
      ${rows.map((row) => `<Row>${row.map((cell) => {
        const numeric = typeof cell === 'number' && Number.isFinite(cell);
        return `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${escapeXml(cell)}</Data></Cell>`;
      }).join('')}</Row>`).join('')}
    </Table>
  </Worksheet>`;

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof TrendingUp;
  tone: string;
}) {
  return (
    <article className="rounded-xl border border-[#334155] bg-[#111111] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-[#94A3B8]">{note}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
          <Icon size={17} />
        </span>
      </div>
    </article>
  );
}

function ReportTable({
  title,
  note,
  headers,
  rows,
  empty
}: {
  title: string;
  note: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#334155] bg-[#111111]">
      <div className="border-b border-[#334155] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs text-[#64748B]">{note}</p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-[#0F172A] text-[10px] uppercase tracking-[0.1em] text-[#64748B]">
              <tr>{headers.map((header) => <th key={header} className="px-4 py-2.5 font-semibold">{header}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#263348]">
              {rows.slice(0, 12).map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`} className="text-[#CBD5E1]">
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className={`px-4 py-2.5 ${cellIndex === 0 ? 'font-semibold text-white' : ''}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-[#64748B]">{empty}</div>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const today = getMalaysiaDateTimeInputs().date;
  const [preset, setPreset] = useState<RangePreset>('Month');
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [data, setData] = useState<ReportsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const nextData = await loadReportsDataFromSupabase();
      setData(nextData);
      if (!nextData.orders.length && nextData.warnings.some((warning) => warning.startsWith('orders'))) {
        setError('Orders could not be loaded. Financial totals are unavailable.');
      }
    } catch (loadError) {
      console.error('Reports Center load error:', loadError);
      setError('Reports could not be loaded from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const report = useMemo(() => {
    const range = getDateRange(preset, customStart, customEnd);
    const activeOrders = data.orders.filter((order) => !isDeleted(order) && !isCancelled(order));
    const filteredOrders = activeOrders.filter((order) => isInRange(orderReportDate(order), range.start, range.end));
    const activeOrderIds = new Set(activeOrders.flatMap((order) => [
      textOf(order, 'id'),
      textOf(order, 'order_no')
    ]).filter(Boolean));
    const usableInvoices = data.invoices.filter((invoice) => {
      const orderId = textOf(invoice, 'order_id');
      return !orderId || activeOrderIds.has(orderId);
    });
    const filteredInvoices = usableInvoices.filter((invoice) =>
      isInRange(invoiceReportDate(invoice), range.start, range.end)
    );
    const paidInvoices = filteredInvoices.filter(isPaid);
    const paidOrders = filteredOrders.filter(isPaid);
    const revenueRows = filteredInvoices.length ? paidInvoices : paidOrders;
    const paidRevenue = revenueRows.reduce(
      (sum, row) => sum + (filteredInvoices.length ? invoiceAmount(row) : orderAmount(row)),
      0
    );
    const invoicesAsOfPeriodEnd = usableInvoices.filter((invoice) => {
      const key = invoiceReportDate(invoice);
      return Boolean(key && key <= range.end);
    });
    const invoicedOrderIds = new Set(invoicesAsOfPeriodEnd.map((invoice) => textOf(invoice, 'order_id')).filter(Boolean));
    const unpaidInvoices = invoicesAsOfPeriodEnd.filter((invoice) => {
      const status = normalize(valueOf(invoice, 'status', 'payment_status'));
      return !['paid', 'completed', 'cancelled', 'canceled', 'void', 'refunded'].includes(status);
    });
    const unpaidOrdersWithoutInvoice = activeOrders.filter((order) =>
      Boolean(orderReportDate(order) && orderReportDate(order) <= range.end) &&
      !isPaid(order) &&
      !invoicedOrderIds.has(textOf(order, 'id')) &&
      !invoicedOrderIds.has(textOf(order, 'order_no'))
    );
    const outstanding = [
      ...unpaidInvoices.map((invoice) => {
        const order = activeOrders.find((candidate) =>
          [textOf(candidate, 'id'), textOf(candidate, 'order_no')].includes(textOf(invoice, 'order_id'))
        );
        return {
          reference: textOf(invoice, 'invoice_no') || textOf(order || {}, 'order_no') || 'Unnumbered',
          customer: textOf(order || {}, 'customer_name') || 'Customer unavailable',
          phone: textOf(order || {}, 'phone'),
          date: invoiceReportDate(invoice),
          status: textOf(invoice, 'status') || 'Pending',
          amount: invoiceAmount(invoice)
        };
      }),
      ...unpaidOrdersWithoutInvoice.map((order) => ({
        reference: textOf(order, 'order_no') || 'Pending Order No',
        customer: textOf(order, 'customer_name') || 'Customer',
        phone: textOf(order, 'phone'),
        date: orderReportDate(order),
        status: textOf(order, 'payment_status') || 'Pending',
        amount: orderAmount(order)
      }))
    ].sort((a, b) => a.date.localeCompare(b.date));
    const outstandingAmount = outstanding.reduce((sum, item) => sum + item.amount, 0);

    const trend = new Map<string, { revenue: number; orders: number }>();
    filteredOrders.forEach((order) => {
      const key = orderReportDate(order);
      if (!key) return;
      const current = trend.get(key) || { revenue: 0, orders: 0 };
      current.orders += 1;
      trend.set(key, current);
    });
    revenueRows.forEach((row) => {
      const key = filteredInvoices.length ? invoiceReportDate(row) : orderReportDate(row);
      if (!key) return;
      const current = trend.get(key) || { revenue: 0, orders: 0 };
      current.revenue += filteredInvoices.length ? invoiceAmount(row) : orderAmount(row);
      trend.set(key, current);
    });
    const revenueTrend = Array.from(trend.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date: date.slice(5), fullDate: date, ...values }));

    const paymentMap = new Map<string, { count: number; amount: number }>();
    (filteredInvoices.length ? filteredInvoices : filteredOrders).forEach((row) => {
      const rawStatus = normalize(valueOf(row, 'status', 'payment_status'));
      const status = ['paid', 'completed'].includes(rawStatus)
        ? 'Paid'
        : rawStatus === 'overdue'
          ? 'Overdue'
          : rawStatus === 'draft'
            ? 'Draft'
            : 'Pending';
      const current = paymentMap.get(status) || { count: 0, amount: 0 };
      current.count += 1;
      current.amount += filteredInvoices.length ? invoiceAmount(row) : orderAmount(row);
      paymentMap.set(status, current);
    });
    const paymentBreakdown = Array.from(paymentMap.entries())
      .map(([status, values]) => ({ status, ...values }))
      .sort((a, b) => b.amount - a.amount);

    const productMap = new Map<string, { orders: number; quantity: number; sales: number }>();
    filteredOrders.forEach((order) => {
      const product = textOf(order, 'product') || 'Unspecified product';
      const current = productMap.get(product) || { orders: 0, quantity: 0, sales: 0 };
      current.orders += 1;
      current.quantity += numberOf(order, 'quantity');
      current.sales += orderAmount(order);
      productMap.set(product, current);
    });
    const products = Array.from(productMap.entries())
      .map(([product, values]) => ({ product, ...values }))
      .sort((a, b) => b.sales - a.sales);

    const customerMap = new Map<string, {
      customer: string;
      phone: string;
      orders: number;
      spend: number;
      paid: number;
      lastOrder: string;
    }>();
    filteredOrders.forEach((order) => {
      const phone = textOf(order, 'phone').replace(/\D/g, '');
      const name = textOf(order, 'customer_name') || 'Unnamed customer';
      const key = textOf(order, 'customer_id') || phone || normalize(name);
      const current = customerMap.get(key) || { customer: name, phone, orders: 0, spend: 0, paid: 0, lastOrder: '' };
      current.orders += 1;
      current.spend += orderAmount(order);
      current.paid += isPaid(order) ? orderAmount(order) : 0;
      current.lastOrder = [current.lastOrder, orderReportDate(order)].sort().slice(-1)[0] || '';
      customerMap.set(key, current);
    });
    const customers = Array.from(customerMap.values()).sort((a, b) => b.spend - a.spend);

    const deliveries = data.deliveryTasks
      .filter((task) => isInRange(deliveryReportDate(task), range.start, range.end))
      .map((task) => ({
        orderNo: textOf(task, 'order_no', 'order_id') || 'Unlinked',
        customer: textOf(task, 'customer_name') || 'Customer',
        date: deliveryReportDate(task),
        time: textOf(task, 'delivery_time') || '-',
        method: textOf(task, 'driver_type') || (textOf(task, 'driver_name') ? 'Delivery' : 'Unassigned'),
        status: textOf(task, 'status') || 'Pending'
      }))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    const leads = data.salesLeads.filter((lead) => isInRange(leadReportDate(lead), range.start, range.end));
    const quotations = data.quotations.filter((quote) => isInRange(quotationReportDate(quote), range.start, range.end));
    const leadStatusMap = new Map<string, { count: number; pipeline: number; revenue: number }>();
    leads.forEach((lead) => {
      const status = textOf(lead, 'status') || 'New';
      const current = leadStatusMap.get(status) || { count: 0, pipeline: 0, revenue: 0 };
      current.count += 1;
      current.pipeline += numberOf(lead, 'potential_value', 'estimate');
      current.revenue += numberOf(lead, 'actual_revenue');
      leadStatusMap.set(status, current);
    });
    const corporate = Array.from(leadStatusMap.entries())
      .map(([status, values]) => ({ status, ...values }))
      .sort((a, b) => b.count - a.count);

    return {
      range,
      filteredOrders,
      filteredInvoices,
      paidRevenue,
      outstanding,
      outstandingAmount,
      revenueTrend,
      paymentBreakdown,
      products,
      customers,
      deliveries,
      corporate,
      quotations,
      averageOrderValue: filteredOrders.length ? filteredOrders.reduce((sum, order) => sum + orderAmount(order), 0) / filteredOrders.length : 0
    };
  }, [customEnd, customStart, data, preset]);

  const exportRows = useMemo(() => ({
    summary: [
      ['LBL AutoFlow Reports Center'],
      ['Period', `${report.range.start} to ${report.range.end}`],
      ['Paid Revenue', report.paidRevenue],
      ['Orders', report.filteredOrders.length],
      ['Average Order Value', report.averageOrderValue],
      ['Outstanding Payments', report.outstandingAmount],
      ['Customers', report.customers.length],
      ['Invoices', report.filteredInvoices.length]
    ] as Array<Array<string | number>>,
    trend: [['Date', 'Paid Revenue', 'Orders'], ...report.revenueTrend.map((item) => [item.fullDate, item.revenue, item.orders])] as Array<Array<string | number>>,
    orders: [
      ['Order No', 'Date', 'Customer', 'Phone', 'Product', 'Quantity', 'Payment Status', 'Fulfillment', 'Order Status', 'Total Amount'],
      ...report.filteredOrders.map((order) => [
        textOf(order, 'order_no', 'orderNo') || textOf(order, 'id') || 'Unnumbered',
        orderReportDate(order) || '-',
        textOf(order, 'customer_name', 'customerName') || 'Customer',
        textOf(order, 'phone') || '-',
        textOf(order, 'product') || 'Unspecified product',
        numberOf(order, 'quantity'),
        textOf(order, 'payment_status', 'paymentStatus') || '-',
        textOf(order, 'fulfillment_type', 'fulfillmentType', 'delivery_type', 'deliveryType') || (textOf(order, 'address') ? 'Delivery' : 'Self Collect'),
        textOf(order, 'workflow_status', 'workflowStatus', 'order_status', 'status') || '-',
        orderAmount(order)
      ])
    ] as Array<Array<string | number>>,
    payments: [['Status', 'Count', 'Amount'], ...report.paymentBreakdown.map((item) => [item.status, item.count, item.amount])] as Array<Array<string | number>>,
    products: [['Product', 'Orders', 'Quantity', 'Sales Value'], ...report.products.map((item) => [item.product, item.orders, item.quantity, item.sales])] as Array<Array<string | number>>,
    customers: [['Customer', 'Phone', 'Orders', 'Order Value', 'Paid Value', 'Last Order'], ...report.customers.map((item) => [item.customer, item.phone, item.orders, item.spend, item.paid, item.lastOrder])] as Array<Array<string | number>>,
    outstanding: [['Reference', 'Customer', 'Phone', 'Date', 'Status', 'Amount'], ...report.outstanding.map((item) => [item.reference, item.customer, item.phone, item.date, item.status, item.amount])] as Array<Array<string | number>>,
    delivery: [['Order Ref', 'Customer', 'Date', 'Time', 'Method', 'Status'], ...report.deliveries.map((item) => [item.orderNo, item.customer, item.date, item.time, item.method, item.status])] as Array<Array<string | number>>,
    corporate: [['Status', 'Leads', 'Pipeline Value', 'Actual Revenue'], ...report.corporate.map((item) => [item.status, item.count, item.pipeline, item.revenue])] as Array<Array<string | number>>
  }), [report]);

  const exportExcel = () => {
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
      <?mso-application progid="Excel.Sheet"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        ${sheetXml('Executive Summary', exportRows.summary)}
        ${sheetXml('Revenue Trend', exportRows.trend)}
        ${sheetXml('Order Details', exportRows.orders)}
        ${sheetXml('Payment Breakdown', exportRows.payments)}
        ${sheetXml('Product Sales', exportRows.products)}
        ${sheetXml('Customers', exportRows.customers)}
        ${sheetXml('Outstanding', exportRows.outstanding)}
        ${sheetXml('Delivery', exportRows.delivery)}
        ${sheetXml('Corporate Sales', exportRows.corporate)}
      </Workbook>`;
    downloadBlob(`\uFEFF${workbook}`, 'application/vnd.ms-excel;charset=utf-8', `LBL-Reports-${report.range.start}-${report.range.end}.xls`);
  };

  const exportPdf = () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      setError('Allow pop-ups to export the PDF report.');
      return;
    }
    popup.opener = null;
    const table = (title: string, rows: Array<Array<string | number>>) => `
      <section><h2>${escapeHtml(title)}</h2><table>${rows.map((row, index) =>
        `<tr>${row.map((cell) => `<${index === 0 ? 'th' : 'td'}>${escapeHtml(cell)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`
      ).join('')}</table></section>`;
    popup.document.write(`<!doctype html><html><head><title>LBL Reports ${report.range.start} - ${report.range.end}</title>
      <style>
        @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#171717;font-size:10px}
        header{border-bottom:2px solid #C8A96B;padding-bottom:10px;margin-bottom:16px}h1{font-size:20px;margin:0}
        h2{font-size:12px;margin:18px 0 6px}p{color:#555}table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #ddd;padding:5px;text-align:left}th{background:#111;color:#fff}
        section{break-inside:avoid}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .metric{border:1px solid #ddd;padding:8px}.metric strong{display:block;font-size:14px;margin-top:3px}
      </style></head><body>
      <header><h1>Layer By Layer Bakery - Reports Center</h1><p>${report.range.start} to ${report.range.end} | Source: Supabase</p></header>
      <div class="summary">
        <div class="metric">Paid Revenue<strong>${escapeHtml(money(report.paidRevenue))}</strong></div>
        <div class="metric">Orders<strong>${report.filteredOrders.length}</strong></div>
        <div class="metric">Outstanding<strong>${escapeHtml(money(report.outstandingAmount))}</strong></div>
        <div class="metric">Average Order<strong>${escapeHtml(money(report.averageOrderValue))}</strong></div>
        <div class="metric">Customers<strong>${report.customers.length}</strong></div>
        <div class="metric">Invoices<strong>${report.filteredInvoices.length}</strong></div>
      </div>
      ${table('Order Details Report', exportRows.orders)}
      ${table('Payment Breakdown', exportRows.payments)}
      ${table('Product Sales Report', exportRows.products)}
      ${table('Customer Report', exportRows.customers)}
      ${table('Outstanding Payments', exportRows.outstanding)}
      ${table('Delivery Report', exportRows.delivery)}
      ${table('Corporate Sales Report', exportRows.corporate)}
      <script>window.onload=()=>{window.print();}</script></body></html>`);
    popup.document.close();
  };

  const metrics = [
    { label: 'Paid Revenue', value: money(report.paidRevenue), note: 'Paid invoices; paid orders fallback', icon: TrendingUp, tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    { label: 'Orders', value: String(report.filteredOrders.length), note: 'Non-deleted, non-cancelled', icon: FileText, tone: 'border-sky-400/25 bg-sky-400/10 text-sky-300' },
    { label: 'Average Order', value: money(report.averageOrderValue), note: 'Order value in selected period', icon: Banknote, tone: 'border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]' },
    { label: 'Outstanding', value: money(report.outstandingAmount), note: `${report.outstanding.length} unpaid records`, icon: AlertCircle, tone: 'border-rose-400/25 bg-rose-400/10 text-rose-300' },
    { label: 'Customers', value: String(report.customers.length), note: 'Unique customers from orders', icon: UsersRound, tone: 'border-violet-400/25 bg-violet-400/10 text-violet-300' },
    { label: 'Invoices', value: String(report.filteredInvoices.length), note: 'Invoice records in period', icon: CreditCard, tone: 'border-amber-400/25 bg-amber-400/10 text-amber-300' }
  ];

  return (
    <div className="space-y-4 text-[#F8FAFC]">
      <section className="rounded-xl border border-[#334155] bg-[#111111] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Financial Intelligence</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Reports Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#94A3B8]">
              Accountant-ready sales, payment, customer, delivery and corporate performance reports from live records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reload} disabled={loading} className="flex h-10 items-center gap-2 rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs font-semibold text-[#CBD5E1] disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button type="button" onClick={exportExcel} disabled={loading || Boolean(error)} className="flex h-10 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 disabled:opacity-40">
              <FileDown size={14} /> Export Excel
            </button>
            <button type="button" onClick={exportPdf} disabled={loading || Boolean(error)} className="flex h-10 items-center gap-2 rounded-lg bg-[#C8A96B] px-3 text-xs font-semibold text-[#111111] disabled:opacity-40">
              <FileText size={14} /> Export PDF
            </button>
            <span className="flex h-10 items-center rounded-lg border border-[#334155] bg-[#0F172A] px-3 text-xs text-[#94A3B8]">Source: Supabase</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#334155] bg-[#111111] p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(['Today', 'Week', 'Month', 'Year', 'Custom'] as RangePreset[]).map((item) => (
              <button key={item} type="button" onClick={() => setPreset(item)} className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${preset === item ? 'border-[#C8A96B]/40 bg-[#C8A96B]/15 text-[#E4C98E]' : 'border-[#334155] bg-[#0F172A] text-[#94A3B8]'}`}>
                {item}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
            <CalendarRange size={15} className="text-[#C8A96B]" />
            {preset === 'Custom' ? (
              <>
                <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="h-9 rounded-lg border border-[#334155] bg-[#0F172A] px-2 text-white" />
                <span>to</span>
                <input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} className="h-9 rounded-lg border border-[#334155] bg-[#0F172A] px-2 text-white" />
              </>
            ) : (
              <span>{report.range.start} to {report.range.end}</span>
            )}
          </div>
        </div>
      </section>

      {(error || data.warnings.length > 0) && (
        <div className={`rounded-xl border p-3 text-sm ${error ? 'border-rose-400/25 bg-rose-400/10 text-rose-100' : 'border-amber-400/25 bg-amber-400/10 text-amber-100'}`}>
          <p className="font-semibold">{error || 'Partial report data loaded.'}</p>
          {!error && <p className="mt-1 text-xs opacity-75">{data.warnings.join(' ')}</p>}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((item) => <MetricCard key={item.label} {...item} />)}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.55fr_0.75fr]">
        <article className="rounded-xl border border-[#334155] bg-[#111111] p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Revenue Trend</p>
            <h2 className="mt-1 text-sm font-semibold text-white">Paid sales over selected period</h2>
          </div>
          <div className="mt-4 h-64">
            {report.revenueTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.revenueTrend}>
                  <CartesianGrid stroke="#263348" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={10} />
                  <YAxis stroke="#64748B" fontSize={10} tickFormatter={(value) => `RM${value}`} />
                  <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 8 }} formatter={(value) => money(Number(value))} />
                  <Line type="monotone" dataKey="revenue" stroke="#C8A96B" strokeWidth={2.5} dot={{ r: 3, fill: '#C8A96B' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#334155] text-sm text-[#64748B]">No paid revenue in this period.</div>
            )}
          </div>
        </article>

        <article className="rounded-xl border border-[#334155] bg-[#111111] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Payment Breakdown</p>
          <h2 className="mt-1 text-sm font-semibold text-white">Invoice status distribution</h2>
          <div className="mt-4 space-y-2">
            {report.paymentBreakdown.map((item) => {
              const denominator = report.paymentBreakdown.reduce((sum, current) => sum + current.amount, 0);
              const width = denominator > 0 ? Math.max((item.amount / denominator) * 100, 4) : 0;
              return (
                <div key={item.status} className="rounded-lg border border-[#263348] bg-[#0F172A] p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-white">{item.status}</span>
                    <span className="text-[#94A3B8]">{item.count} · {money(item.amount)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#263348]">
                    <div className="h-full rounded-full bg-[#C8A96B]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            {!report.paymentBreakdown.length && <p className="py-10 text-center text-sm text-[#64748B]">No payment records.</p>}
          </div>
        </article>
      </section>

      <ReportTable
        title="Order Details Report"
        note="Every non-deleted and non-cancelled order in the selected period, including completed orders."
        headers={['Order No', 'Date', 'Customer', 'Phone', 'Product', 'Qty', 'Payment', 'Fulfillment', 'Status', 'Total']}
        rows={exportRows.orders.slice(1).map((row) => [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], money(Number(row[9]))])}
        empty="No orders in this period."
      />

      <section className="grid gap-3 xl:grid-cols-2">
        <ReportTable title="Product Sales Report" note="Order volume and sales value by product." headers={['Product', 'Orders', 'Qty', 'Sales Value']} rows={report.products.map((item) => [item.product, item.orders, item.quantity, money(item.sales)])} empty="No product sales in this period." />
        <ReportTable title="Customer Report" note="Customer value is calculated directly from orders." headers={['Customer', 'Phone', 'Orders', 'Order Value', 'Paid Value', 'Last Order']} rows={report.customers.map((item) => [item.customer, item.phone || '-', item.orders, money(item.spend), money(item.paid), item.lastOrder || '-'])} empty="No customer orders in this period." />
        <ReportTable title="Outstanding Payments" note={`Unpaid invoices and uninvoiced orders as of ${report.range.end}.`} headers={['Reference', 'Customer', 'Phone', 'Date', 'Status', 'Amount']} rows={report.outstanding.map((item) => [item.reference, item.customer, item.phone || '-', item.date || '-', item.status, money(item.amount)])} empty="No outstanding payments as of this date." />
        <ReportTable title="Delivery Report" note="Delivery and self-collection task status." headers={['Order Ref', 'Customer', 'Date', 'Time', 'Method', 'Status']} rows={report.deliveries.map((item) => [item.orderNo, item.customer, item.date || '-', item.time, item.method, item.status])} empty="No delivery tasks in this period." />
        <div className="xl:col-span-2">
          <ReportTable title="Corporate Sales Report" note={`${report.quotations.length} quotations created in the selected period.`} headers={['Lead Status', 'Leads', 'Pipeline Value', 'Actual Revenue']} rows={report.corporate.map((item) => [item.status, item.count, money(item.pipeline), money(item.revenue)])} empty="No corporate sales records in this period." />
        </div>
      </section>

      <footer className="flex flex-col gap-1 rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3 text-xs text-[#64748B] sm:flex-row sm:items-center sm:justify-between">
        <span>All calculations use live Supabase records and exclude deleted or cancelled orders.</span>
        <span>{data.loadedAt ? `Last refreshed ${new Date(data.loadedAt).toLocaleString('en-MY')}` : 'Waiting for data'}</span>
      </footer>
    </div>
  );
}
