import { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  Check,
  ChefHat,
  CircleDollarSign,
  Clock3,
  FlaskConical,
  Layers3,
  PackageCheck,
  Percent,
  Printer,
  Scale,
  Sparkles,
  SunMedium,
  TrendingUp,
  TriangleAlert
} from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import type { Order } from '../data/mockData';
import { initialIngredientCosts, recipeTemplates } from '../data/recipeTemplates';
import { toSafeNumber } from '../utils/pricing';

type ProductionCenterPageProps = {
  orders: Order[];
};

type ProductionStatus = 'Confirmed' | 'In Kitchen' | 'Ready';
type CutoffPeriod = 'Morning' | 'Afternoon' | 'Evening' | 'Unscheduled';

type ProductionLine = {
  flavour: string;
  quantity: number;
  orderCount: number;
  readyTime: string;
  batches: number;
  hasRecipe: boolean;
};

const BATCH_SIZE = 24;
const STATUS_OPTIONS: ProductionStatus[] = ['Confirmed', 'In Kitchen', 'Ready'];
const CUTOFF_PERIODS: CutoffPeriod[] = ['Morning', 'Afternoon', 'Evening', 'Unscheduled'];

const normalizeLabel = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+mini\s+tart$/i, '')
    .replace(/\s+/g, ' ');

const formatQuantity = (value: number) =>
  toSafeNumber(value).toLocaleString('en-MY', { maximumFractionDigits: 2 });

const formatMoney = (value: number) =>
  `RM${toSafeNumber(value).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatCostPerGram = (value: number) =>
  `RM${toSafeNumber(value).toFixed(3)}/g`;

const getReadyTime = (deliveryTime?: string) => {
  if (!deliveryTime || !/^\d{1,2}:\d{2}/.test(deliveryTime)) return 'Time pending';
  const [hours, minutes] = deliveryTime.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 'Time pending';
  const totalMinutes = (hours * 60 + minutes - 30 + 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
};

const earliestTime = (current: string | undefined, next: string) => {
  if (!current || current === 'Time pending') return next;
  if (next === 'Time pending') return current;
  return [current, next].sort()[0];
};

const getCutoffPeriod = (readyTime: string): CutoffPeriod => {
  if (readyTime === 'Time pending') return 'Unscheduled';
  const hour = Number(readyTime.slice(0, 2));
  if (!Number.isFinite(hour)) return 'Unscheduled';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
};

const getProductionStatus = (order: Order): ProductionStatus | null => {
  const workflow = String(order.workflowStatus || '').trim().toLowerCase();
  const payment = String(order.paymentStatus || '').trim().toLowerCase();
  const kitchen = String(order.kitchenStatus || '').trim().toLowerCase();

  if (['completed', 'cancelled', 'canceled', 'out for delivery'].includes(workflow) || kitchen === 'completed') {
    return null;
  }
  if (kitchen === 'ready' || workflow === 'ready') return 'Ready';
  if (kitchen === 'preparing' || ['preparing', 'in kitchen'].includes(workflow)) return 'In Kitchen';
  if (payment === 'paid' || ['paid', 'confirmed'].includes(workflow)) return 'Confirmed';
  return null;
};

const getOrderFlavourLines = (order: Order) => {
  const structured = Array.isArray(order.flavourQuantities)
    ? order.flavourQuantities
        .map((item) => ({
          name: String(item?.name || '').trim(),
          quantity: Math.max(0, toSafeNumber(item?.quantity))
        }))
        .filter((item) => item.name && item.quantity > 0)
    : [];

  if (structured.length > 0) return structured;

  const flavours = Array.isArray(order.flavours)
    ? order.flavours.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const totalQuantity = Math.max(0, Math.floor(toSafeNumber(order.quantity)));

  if (flavours.length === 0) {
    return [{ name: order.product || 'Product', quantity: totalQuantity }];
  }
  if (flavours.length === 1) {
    return [{ name: flavours[0], quantity: totalQuantity }];
  }

  const baseQuantity = Math.floor(totalQuantity / flavours.length);
  const remainder = totalQuantity % flavours.length;
  return flavours.map((name, index) => ({
    name,
    quantity: baseQuantity + (index < remainder ? 1 : 0)
  }));
};

const displayIngredientAmount = (grams: number) => {
  const safeGrams = Math.max(0, toSafeNumber(grams));
  if (safeGrams >= 1000) return `${formatQuantity(safeGrams)}g · ${(safeGrams / 1000).toFixed(2)}kg`;
  return `${formatQuantity(safeGrams)}g`;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

function EmptyState() {
  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[18px] border border-[#334155] bg-[#111111] px-5 text-center shadow-panel">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]">
        <Sparkles size={22} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-white">No production required for this date.</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#64748B]">
        Change the date or include another production status to review upcoming kitchen work.
      </p>
    </section>
  );
}

export default function ProductionCenterPage({ orders }: ProductionCenterPageProps) {
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [selectedStatuses, setSelectedStatuses] = useState<ProductionStatus[]>(['Confirmed', 'In Kitchen']);

  const plan = useMemo(() => {
    const recipeByFlavour = new Map(
      recipeTemplates.map((recipe) => [normalizeLabel(recipe.flavour), recipe])
    );
    const selectedOrders = orders.filter((order) => {
      const status = getProductionStatus(order);
      return order.deliveryDate === selectedDate && Boolean(status && selectedStatuses.includes(status));
    });
    const flavourTotals = new Map<
      string,
      { quantity: number; readyTime: string; orderIds: Set<string> }
    >();
    const cutoffTotals = new Map<
      CutoffPeriod,
      Map<string, { quantity: number; readyTime: string; orderIds: Set<string> }>
    >();

    selectedOrders.forEach((order, orderIndex) => {
      const readyTime = getReadyTime(order.deliveryTime);
      const cutoff = getCutoffPeriod(readyTime);
      const orderId = String(order.supabaseId || order.id || order.orderNo || orderIndex);
      const cutoffMap = cutoffTotals.get(cutoff) || new Map();

      getOrderFlavourLines(order).forEach((item) => {
        if (item.quantity <= 0) return;
        const recipe = recipeByFlavour.get(normalizeLabel(item.name));
        const label = recipe?.flavour || item.name;
        const current = flavourTotals.get(label);
        flavourTotals.set(label, {
          quantity: (current?.quantity || 0) + item.quantity,
          readyTime: earliestTime(current?.readyTime, readyTime),
          orderIds: new Set([...(current?.orderIds || []), orderId])
        });

        const cutoffCurrent = cutoffMap.get(label);
        cutoffMap.set(label, {
          quantity: (cutoffCurrent?.quantity || 0) + item.quantity,
          readyTime: earliestTime(cutoffCurrent?.readyTime, readyTime),
          orderIds: new Set([...(cutoffCurrent?.orderIds || []), orderId])
        });
      });

      cutoffTotals.set(cutoff, cutoffMap);
    });

    const toProductionLine = (
      flavour: string,
      detail: { quantity: number; readyTime: string; orderIds: Set<string> }
    ): ProductionLine => ({
      flavour,
      quantity: detail.quantity,
      orderCount: detail.orderIds.size,
      readyTime: detail.readyTime,
      batches: Math.ceil(detail.quantity / BATCH_SIZE),
      hasRecipe: recipeByFlavour.has(normalizeLabel(flavour))
    });

    const productionLines = Array.from(flavourTotals, ([flavour, detail]) =>
      toProductionLine(flavour, detail)
    ).sort((a, b) => {
      if (a.readyTime !== b.readyTime) return a.readyTime.localeCompare(b.readyTime);
      return b.quantity - a.quantity;
    });

    const cutoffGroups = CUTOFF_PERIODS.map((period) => ({
      period,
      lines: Array.from(cutoffTotals.get(period) || [], ([flavour, detail]) =>
        toProductionLine(flavour, detail)
      ).sort((a, b) => a.readyTime.localeCompare(b.readyTime) || b.quantity - a.quantity)
    })).filter((group) => group.lines.length > 0);

    const ingredientTotals = new Map<
      string,
      {
        name: string;
        grams: number;
        flavours: Set<string>;
        costPerGram: number;
        estimatedCost: number;
        costMissing: boolean;
      }
    >();
    productionLines.forEach((line) => {
      recipeByFlavour.get(normalizeLabel(line.flavour))?.ingredients.forEach((ingredient) => {
        const current = ingredientTotals.get(ingredient.id);
        const costTemplate = initialIngredientCosts[ingredient.id];
        const purchasePrice = toSafeNumber(costTemplate?.purchasePrice);
        const purchaseGrams = toSafeNumber(costTemplate?.purchaseGrams);
        const costMissing = !costTemplate || purchasePrice <= 0 || purchaseGrams <= 0;
        const costPerGram = costMissing ? 0 : purchasePrice / purchaseGrams;
        const addedGrams = ingredient.amount * line.quantity;
        ingredientTotals.set(ingredient.id, {
          name: ingredient.name,
          grams: (current?.grams || 0) + addedGrams,
          flavours: new Set([...(current?.flavours || []), line.flavour]),
          costPerGram,
          estimatedCost: (current?.estimatedCost || 0) + addedGrams * costPerGram,
          costMissing
        });
      });
    });

    const ingredients = Array.from(ingredientTotals.values()).sort((a, b) => b.grams - a.grams);
    const estimatedRevenue = selectedOrders.reduce(
      (sum, order) => sum + toSafeNumber(order.totalAmount),
      0
    );
    const estimatedIngredientCost = ingredients.reduce(
      (sum, ingredient) => sum + toSafeNumber(ingredient.estimatedCost),
      0
    );
    const estimatedGrossProfit = estimatedRevenue - estimatedIngredientCost;
    const estimatedGrossMargin =
      estimatedRevenue > 0 ? (estimatedGrossProfit / estimatedRevenue) * 100 : 0;
    const totalQuantity = productionLines.reduce((sum, line) => sum + line.quantity, 0);

    return {
      selectedOrders,
      productionLines,
      cutoffGroups,
      ingredients,
      totalQuantity,
      estimatedBatches: productionLines.reduce((sum, line) => sum + line.batches, 0),
      missingRecipeCount: productionLines.filter((line) => !line.hasRecipe).length,
      missingCostCount: ingredients.filter((ingredient) => ingredient.costMissing).length,
      estimatedRevenue,
      estimatedIngredientCost,
      estimatedGrossProfit,
      estimatedGrossMargin,
      averageIngredientCostPerTart:
        totalQuantity > 0 ? estimatedIngredientCost / totalQuantity : 0
    };
  }, [orders, selectedDate, selectedStatuses]);

  const selectedDateObject = parseISO(selectedDate);
  const selectedDateLabel = isValid(selectedDateObject)
    ? format(selectedDateObject, 'EEEE, dd MMMM yyyy')
    : selectedDate;

  const toggleStatus = (status: ProductionStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    );
  };

  const printProductionSheet = () => {
    if (plan.productionLines.length === 0) return;
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      window.alert('Please allow pop-ups to print the production sheet.');
      return;
    }

    const flavourRows = plan.productionLines
      .map(
        (line) => `
          <tr>
            <td>${escapeHtml(line.flavour)}</td>
            <td>${line.quantity}</td>
            <td>${line.orderCount}</td>
            <td>${escapeHtml(line.readyTime)}</td>
            <td>${line.batches}</td>
            <td>${line.hasRecipe ? 'Available' : 'Missing'}</td>
          </tr>`
      )
      .join('');
    const ingredientRows = plan.ingredients
      .map(
        (ingredient) => `
          <tr>
            <td>${escapeHtml(ingredient.name)}</td>
            <td>${escapeHtml(displayIngredientAmount(ingredient.grams))}</td>
            <td>${ingredient.costMissing ? 'Cost missing' : escapeHtml(formatCostPerGram(ingredient.costPerGram))}</td>
            <td>${escapeHtml(formatMoney(ingredient.estimatedCost))}</td>
            <td>${ingredient.flavours.size}</td>
          </tr>`
      )
      .join('');
    const batchRows = plan.productionLines
      .map(
        (line) => `
          <tr>
            <td>${escapeHtml(line.flavour)}</td>
            <td>${line.quantity}</td>
            <td>${line.batches}</td>
            <td>${line.quantity} / ${line.batches * BATCH_SIZE} pcs</td>
          </tr>`
      )
      .join('');

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>LBL Production Sheet - ${escapeHtml(selectedDate)}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #171717; font: 12px Arial, sans-serif; }
            header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 2px solid #c8a96b; }
            h1 { margin: 4px 0 0; font-size: 24px; }
            h2 { margin: 22px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; }
            p { margin: 0; color: #555; }
            .brand { color: #9b7a3f; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
            .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
            .stat { border: 1px solid #ddd; padding: 9px; }
            .stat strong { display: block; margin-top: 4px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f4f0e7; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
            th, td { border: 1px solid #ddd; padding: 7px; }
            footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; color: #666; font-size: 10px; }
          </style>
        </head>
        <body>
          <header>
            <div>
              <div class="brand">Layer By Layer Bakery</div>
              <h1>Daily Production Sheet</h1>
            </div>
            <p>${escapeHtml(selectedDateLabel)}</p>
          </header>
          <div class="stats">
            <div class="stat">Revenue<strong>${formatMoney(plan.estimatedRevenue)}</strong></div>
            <div class="stat">Ingredient Cost<strong>${formatMoney(plan.estimatedIngredientCost)}</strong></div>
            <div class="stat">Gross Profit<strong>${formatMoney(plan.estimatedGrossProfit)}</strong></div>
            <div class="stat">Gross Margin<strong>${plan.estimatedGrossMargin.toFixed(1)}%</strong></div>
          </div>
          <h2>Flavour Summary</h2>
          <table>
            <thead><tr><th>Flavour</th><th>Pieces</th><th>Orders</th><th>Ready</th><th>Batches</th><th>Recipe</th></tr></thead>
            <tbody>${flavourRows}</tbody>
          </table>
          <h2>Ingredient Forecast</h2>
          <table>
            <thead><tr><th>Ingredient</th><th>Total Required</th><th>Cost / Gram</th><th>Estimated Cost</th><th>Flavours</th></tr></thead>
            <tbody>${ingredientRows || '<tr><td colspan="5">No recipe data available.</td></tr>'}</tbody>
          </table>
          <h2>Batch Planner</h2>
          <table>
            <thead><tr><th>Flavour</th><th>Quantity</th><th>Required Batches</th><th>Batch Usage</th></tr></thead>
            <tbody>${batchRows}</tbody>
          </table>
          <footer>Costing uses template ingredient prices. No inventory has been deducted.</footer>
          <script>window.addEventListener('load', () => { window.print(); });</script>
        </body>
      </html>`);
    printWindow.document.close();
  };

  const kpis = [
    {
      label: 'Selected Orders',
      value: plan.selectedOrders.length,
      hint: selectedDate === format(new Date(), 'yyyy-MM-dd') ? 'Due today' : 'Due on selected date',
      icon: CalendarDays
    },
    {
      label: 'Total Tart Quantity',
      value: formatQuantity(plan.totalQuantity),
      hint: 'Pieces in this plan',
      icon: PackageCheck
    },
    {
      label: 'Active Flavours',
      value: plan.productionLines.length,
      hint: 'Production lines',
      icon: ChefHat
    },
    {
      label: 'Estimated Batches',
      value: plan.estimatedBatches,
      hint: `${BATCH_SIZE} pieces per batch`,
      icon: Layers3
    }
  ];
  const costKpis = [
    {
      label: 'Estimated Revenue',
      value: formatMoney(plan.estimatedRevenue),
      hint: 'Selected order totals',
      icon: CircleDollarSign,
      tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10'
    },
    {
      label: 'Ingredient Cost',
      value: formatMoney(plan.estimatedIngredientCost),
      hint: 'Template recipe cost',
      icon: Banknote,
      tone: 'text-amber-300 border-amber-400/25 bg-amber-400/10'
    },
    {
      label: 'Gross Profit',
      value: formatMoney(plan.estimatedGrossProfit),
      hint: 'Revenue less ingredients',
      icon: TrendingUp,
      tone: 'text-sky-300 border-sky-400/25 bg-sky-400/10'
    },
    {
      label: 'Gross Margin',
      value: `${plan.estimatedGrossMargin.toFixed(1)}%`,
      hint: 'Ingredient-level margin',
      icon: Percent,
      tone: 'text-[#E4C98E] border-[#C8A96B]/25 bg-[#C8A96B]/10'
    }
  ];

  return (
    <div className="space-y-4 text-[#F8FAFC]">
      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#C8A96B]">Production Center</p>
            <h1 className="mt-1.5 text-2xl font-semibold text-white">Daily Production Sheet</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#94A3B8]">
              Plan flavour demand, ingredient preparation and oven batches from confirmed bakery orders.
            </p>
          </div>
          <button
            type="button"
            onClick={printProductionSheet}
            disabled={plan.productionLines.length === 0}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#C8A96B] px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#D9BC7C] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Printer size={16} />
            Print Production Sheet
          </button>
        </div>
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)_auto] lg:items-end">
          <label>
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
              Production Date
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#334155] bg-[#0F172A] px-3 text-sm font-semibold text-white outline-none transition focus:border-[#C8A96B]/70"
            />
          </label>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
              Include Order Status
            </p>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((status) => {
                const selected = selectedStatuses.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
                      selected
                        ? 'border-[#C8A96B]/50 bg-[#C8A96B]/12 text-[#E4C98E]'
                        : 'border-[#334155] bg-[#0F172A] text-[#64748B] hover:text-white'
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? 'border-[#C8A96B] bg-[#C8A96B] text-[#0F172A]' : 'border-[#475569]'}`}>
                      {selected && <Check size={11} strokeWidth={3} />}
                    </span>
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[#334155] bg-[#0F172A] px-3 py-2.5 text-right">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#64748B]">Planning date</p>
            <p className="mt-1 text-xs font-semibold text-[#CBD5E1]">{selectedDateLabel}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, hint, icon: Icon }) => (
          <article key={label} className="min-h-[104px] rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
                <p className="mt-2.5 text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-xs text-[#94A3B8]">{hint}</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#E4C98E]">
                <Icon size={17} />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {costKpis.map(({ label, value, hint, icon: Icon, tone }) => (
          <article key={label} className="min-h-[104px] rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
                <p className="mt-2.5 truncate text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 truncate text-xs text-[#94A3B8]">{hint}</p>
              </div>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                <Icon size={17} />
              </span>
            </div>
          </article>
        ))}
      </section>

      {plan.productionLines.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <div className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
              <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Production Profit Summary</p>
                  <h2 className="mt-1 text-base font-semibold text-white">Estimated Batch Economics</h2>
                </div>
                <TrendingUp size={18} className="text-emerald-300" />
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-[#334155] lg:grid-cols-5 lg:divide-y-0">
                {[
                  ['Revenue', formatMoney(plan.estimatedRevenue)],
                  ['Ingredient Cost', formatMoney(plan.estimatedIngredientCost)],
                  ['Gross Profit', formatMoney(plan.estimatedGrossProfit)],
                  ['Gross Margin', `${plan.estimatedGrossMargin.toFixed(1)}%`],
                  ['Cost / Tart', formatMoney(plan.averageIngredientCostPerTart)]
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 p-3">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">{label}</p>
                    <p className="mt-2 truncate text-base font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-[18px] border border-amber-400/25 bg-amber-400/10 p-4 shadow-panel">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-200">Template costing</p>
                <p className="mt-1.5 text-xs leading-5 text-amber-100/70">
                  Costing uses template ingredient prices. Replace with actual supplier prices later.
                </p>
                {plan.missingCostCount > 0 && (
                  <p className="mt-2 text-xs font-semibold text-rose-300">
                    {plan.missingCostCount} ingredient cost{plan.missingCostCount === 1 ? '' : 's'} missing.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Production Cut-Off View</p>
                <h2 className="mt-1 text-base font-semibold text-white">Ready-Time Work Blocks</h2>
              </div>
              <SunMedium size={18} className="text-[#C8A96B]" />
            </div>
            <div className="grid gap-3 p-3 lg:grid-cols-3">
              {plan.cutoffGroups.map((group) => (
                <article key={group.period} className="overflow-hidden rounded-[14px] border border-[#334155] bg-[#0F172A]">
                  <div className="flex items-center justify-between border-b border-[#334155] px-3 py-2.5">
                    <p className="text-sm font-semibold text-white">{group.period}</p>
                    <span className="text-xs font-semibold text-[#E4C98E]">
                      {group.lines.reduce((sum, line) => sum + line.quantity, 0)} pcs
                    </span>
                  </div>
                  <div className="divide-y divide-[#334155]">
                    {group.lines.map((line) => (
                      <div key={line.flavour} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#E2E8F0]">{line.flavour}</p>
                          <p className="mt-1 text-[10px] text-[#64748B]">{line.orderCount} orders · ready {line.readyTime}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-[#E4C98E]">{line.quantity}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid items-start gap-4 xl:grid-cols-12">
            <div className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel xl:col-span-7">
              <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Flavour Production Summary</p>
                  <h2 className="mt-1 text-base font-semibold text-white">Consolidated Demand</h2>
                </div>
                <span className="text-xs text-[#64748B]">Earliest ready time shown</span>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {plan.productionLines.map((line) => (
                  <article key={line.flavour} className="rounded-[14px] border border-[#334155] bg-[#0F172A] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{line.flavour}</p>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          {line.orderCount} order{line.orderCount === 1 ? '' : 's'} · ready {line.readyTime}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${line.hasRecipe ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-300'}`}>
                        {line.hasRecipe ? 'Recipe Ready' : 'Recipe Missing'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#334155] pt-2.5">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.1em] text-[#64748B]">Pieces</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatQuantity(line.quantity)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-[#64748B]">Batches</p>
                        <p className="mt-1 text-lg font-semibold text-[#E4C98E]">{line.batches}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel xl:col-span-5">
              <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Batch Planner</p>
                  <h2 className="mt-1 text-base font-semibold text-white">24-Piece Oven Runs</h2>
                </div>
                <Layers3 size={18} className="text-[#C8A96B]" />
              </div>
              <div className="divide-y divide-[#334155]">
                {plan.productionLines.map((line) => (
                  <div key={line.flavour} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-white">{line.flavour}</p>
                      <span className="text-sm font-semibold text-[#E4C98E]">{line.quantity} pcs</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-[#334155] bg-[#0F172A] px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-[0.1em] text-[#64748B]">Required batches</p>
                        <p className="mt-1 font-semibold text-[#CBD5E1]">{line.batches}</p>
                      </div>
                      <div className="rounded-lg border border-[#334155] bg-[#0F172A] px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-[0.1em] text-[#64748B]">Batch usage</p>
                        <p className="mt-1 font-semibold text-[#CBD5E1]">{line.quantity} / {line.batches * BATCH_SIZE} pcs</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <div className="flex flex-col gap-2 border-b border-[#334155] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Ingredient Forecast</p>
                <h2 className="mt-1 text-base font-semibold text-white">Combined Preparation Requirements</h2>
              </div>
              <p className="text-xs text-[#64748B]">
                Shared Recipe Calculator templates
                {plan.missingRecipeCount > 0 ? ` · ${plan.missingRecipeCount} flavour without template` : ''}
              </p>
            </div>
            {plan.ingredients.length > 0 ? (
              <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {plan.ingredients.map((ingredient) => (
                  <article key={ingredient.name} className="rounded-[14px] border border-[#334155] bg-[#0F172A] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{ingredient.name}</p>
                        <p className="mt-1 truncate text-xs text-[#64748B]">
                          Combined from {ingredient.flavours.size} flavour{ingredient.flavours.size === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Scale size={16} className="shrink-0 text-[#C8A96B]" />
                    </div>
                    <p className="mt-3 text-lg font-semibold text-[#E4C98E]">{displayIngredientAmount(ingredient.grams)}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#334155] pt-2.5">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-[#64748B]">Cost / gram</p>
                        <p className={`mt-1 text-xs font-semibold ${ingredient.costMissing ? 'text-rose-300' : 'text-[#CBD5E1]'}`}>
                          {ingredient.costMissing ? 'Cost missing' : formatCostPerGram(ingredient.costPerGram)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase tracking-[0.1em] text-[#64748B]">Estimated cost</p>
                        <p className="mt-1 text-xs font-semibold text-white">{formatMoney(ingredient.estimatedCost)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[#64748B]">No recipe-based ingredient forecast available.</div>
            )}
          </section>

          <section className="overflow-hidden rounded-[18px] border border-[#334155] bg-[#111111] shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-[#334155] px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Kitchen Production Sheet</p>
                <h2 className="mt-1 text-base font-semibold text-white">{selectedDateLabel}</h2>
              </div>
              <FlaskConical size={18} className="text-[#C8A96B]" />
            </div>
            <div className="divide-y divide-[#334155]">
              {plan.productionLines.map((line, index) => (
                <div key={line.flavour} className="grid gap-3 px-4 py-3 sm:grid-cols-[48px_minmax(0,1fr)_100px_100px_110px] sm:items-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#334155] bg-[#0F172A] text-xs font-semibold text-[#C8A96B]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{line.flavour}</p>
                    <p className="mt-1 text-xs text-[#64748B]">{line.orderCount} linked orders</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[#64748B]">Quantity</p>
                    <p className="mt-1 text-sm font-semibold text-[#CBD5E1]">{line.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[#64748B]">Batches</p>
                    <p className="mt-1 text-sm font-semibold text-[#CBD5E1]">{line.batches}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[#64748B]">Ready Time</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#E4C98E]">
                      <Clock3 size={12} />
                      {line.readyTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <p className="flex items-center gap-2 px-1 text-xs text-[#64748B]">
        <ChefHat size={14} className="text-[#C8A96B]" />
        Planning only. Ingredient inventory is not deducted and no production records are written.
      </p>
    </div>
  );
}
