import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calculator,
  ChefHat,
  CircleDollarSign,
  FlaskConical,
  PackageCheck,
  Percent,
  Scale,
  Target
} from 'lucide-react';
import {
  initialIngredientCosts,
  MINI_TART_SELLING_PRICE,
  recipeTemplates,
  type IngredientCost
} from '../data/recipeTemplates';

type CalculatorMode = 'quantity' | 'yield';

const SELLING_PRICE_PER_PIECE = MINI_TART_SELLING_PRICE;

const toSafeAmount = (value: string | number) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const formatAmount = (value: number) =>
  (Number.isFinite(value) ? value : 0).toLocaleString('en-MY', { maximumFractionDigits: 2 });

const formatMoney = (value: number) =>
  `RM${(Number.isFinite(value) ? value : 0).toFixed(2)}`;

export default function RecipeCalculatorPage() {
  const [mode, setMode] = useState<CalculatorMode>('quantity');
  const [selectedFlavour, setSelectedFlavour] = useState(recipeTemplates[0].flavour);
  const [targetQuantity, setTargetQuantity] = useState(10);
  const [availableIngredients, setAvailableIngredients] = useState<Record<string, number>>({});
  const [ingredientCosts, setIngredientCosts] = useState<Record<string, IngredientCost>>(initialIngredientCosts);

  const recipe = useMemo(
    () => recipeTemplates.find((item) => item.flavour === selectedFlavour) ?? recipeTemplates[0],
    [selectedFlavour]
  );

  useEffect(() => {
    setAvailableIngredients(
      Object.fromEntries(recipe.ingredients.map((ingredient) => [ingredient.id, 0]))
    );
  }, [recipe]);

  const recipeCost = useMemo(() => {
    const ingredients = recipe.ingredients.map((ingredient) => {
      const cost = ingredientCosts[ingredient.id] ?? { purchasePrice: 0, purchaseGrams: 0 };
      const purchasePrice = toSafeAmount(cost.purchasePrice);
      const purchaseGrams = toSafeAmount(cost.purchaseGrams);
      const unitCost = purchaseGrams > 0 ? purchasePrice / purchaseGrams : 0;
      const costPerPiece = ingredient.amount * unitCost;
      return { ingredient, purchasePrice, purchaseGrams, unitCost, costPerPiece };
    });
    const costPerPiece = ingredients.reduce((sum, item) => sum + item.costPerPiece, 0);
    const grossProfitPerPiece = SELLING_PRICE_PER_PIECE - costPerPiece;
    const grossMargin = SELLING_PRICE_PER_PIECE > 0
      ? (grossProfitPerPiece / SELLING_PRICE_PER_PIECE) * 100
      : 0;

    return { ingredients, costPerPiece, grossProfitPerPiece, grossMargin };
  }, [ingredientCosts, recipe]);

  const yieldResult = useMemo(() => {
    const ratios = recipe.ingredients.map((ingredient) => ({
      ingredient,
      available: toSafeAmount(availableIngredients[ingredient.id] ?? 0),
      ratio: toSafeAmount(availableIngredients[ingredient.id] ?? 0) / ingredient.amount
    }));
    const estimatedYield = ratios.length
      ? Math.max(0, Math.floor(Math.min(...ratios.map((item) => item.ratio))))
      : 0;
    const limiting = ratios.reduce<(typeof ratios)[number] | null>((lowest, item) => {
      if (!lowest || item.ratio < lowest.ratio) return item;
      return lowest;
    }, null);

    return {
      estimatedYield,
      limitingIngredient: ratios.some((item) => item.available > 0) ? limiting?.ingredient.name ?? '-' : '-',
      ingredients: ratios.map((item) => ({
        ...item,
        remaining: Math.max(0, item.available - estimatedYield * item.ingredient.amount)
      }))
    };
  }, [availableIngredients, recipe]);

  const safeTargetQuantity = Math.max(0, Math.floor(toSafeAmount(targetQuantity)));
  const estimatedYield = mode === 'yield' ? yieldResult.estimatedYield : safeTargetQuantity;
  const batchCost = recipeCost.costPerPiece * safeTargetQuantity;
  const batchRevenue = SELLING_PRICE_PER_PIECE * safeTargetQuantity;
  const batchGrossProfit = batchRevenue - batchCost;
  const yieldRevenue = SELLING_PRICE_PER_PIECE * yieldResult.estimatedYield;
  const yieldTotalCost = recipeCost.costPerPiece * yieldResult.estimatedYield;
  const yieldGrossProfit = yieldRevenue - yieldTotalCost;
  const yieldGrossMargin = yieldRevenue > 0 ? (yieldGrossProfit / yieldRevenue) * 100 : 0;

  const kpis = [
    { label: 'Selected Flavour', value: recipe.shortLabel, detail: recipe.flavour, icon: ChefHat },
    { label: 'Target Quantity', value: mode === 'quantity' ? safeTargetQuantity : '-', detail: 'Mini tarts planned', icon: Target },
    { label: 'Estimated Yield', value: estimatedYield, detail: mode === 'yield' ? 'Based on available stock' : 'Matches target quantity', icon: PackageCheck },
    { label: 'Ingredient Types', value: recipe.ingredients.length, detail: 'Template recipe inputs', icon: FlaskConical },
    { label: 'Cost / Piece', value: formatMoney(recipeCost.costPerPiece), detail: 'Ingredient cost only', icon: Banknote },
    { label: 'Selling Price', value: formatMoney(SELLING_PRICE_PER_PIECE), detail: 'Mini Tart selling price', icon: CircleDollarSign },
    { label: 'Gross Profit / Piece', value: formatMoney(recipeCost.grossProfitPerPiece), detail: 'Before overheads', icon: PackageCheck },
    { label: 'Gross Margin', value: `${recipeCost.grossMargin.toFixed(1)}%`, detail: 'Ingredient gross margin', icon: Percent }
  ];

  const updateIngredientCost = (ingredientId: string, field: keyof IngredientCost, value: string) => {
    setIngredientCosts((current) => ({
      ...current,
      [ingredientId]: {
        ...(current[ingredientId] ?? { purchasePrice: 0, purchaseGrams: 0 }),
        [field]: toSafeAmount(value)
      }
    }));
  };

  return (
    <div className="space-y-4 bg-[#0F172A]">
      <section className="rounded-[20px] border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#C8A96B]">Production Planning</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Recipe Cost &amp; Yield Center</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#94A3B8]">
              Calculate ingredient requirements, recipe cost, production yield and estimated gross profit.
            </p>
          </div>
          <span className="w-fit rounded-xl border border-[#C8A96B]/30 bg-[#C8A96B]/10 px-3.5 py-2.5 text-xs font-semibold text-[#E4C98E]">
            Template Mode
          </span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-[16px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">{label}</p>
                <p className="mt-3 truncate text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 truncate text-xs text-[#94A3B8]">{detail}</p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C8A96B]/25 bg-[#C8A96B]/10 text-[#C8A96B]">
                <Icon size={18} />
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel md:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Calculator Mode</p>
            <div className="mt-3 inline-flex w-full rounded-xl border border-[#334155] bg-[#0F172A] p-1 sm:w-auto">
              <button type="button" onClick={() => setMode('quantity')} className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition sm:flex-none ${mode === 'quantity' ? 'bg-[#C8A96B] text-[#0F172A]' : 'text-[#94A3B8] hover:text-white'}`}>
                <Calculator size={16} /> Quantity to Ingredients
              </button>
              <button type="button" onClick={() => setMode('yield')} className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition sm:flex-none ${mode === 'yield' ? 'bg-[#C8A96B] text-[#0F172A]' : 'text-[#94A3B8] hover:text-white'}`}>
                <Scale size={16} /> Ingredients to Yield
              </button>
            </div>
          </div>
          <p className="text-xs text-[#64748B]">Selling price: RM2.50 per Mini Tart</p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Flavour Selector</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Choose a recipe template</h4>
          </div>
          <span className="text-xs text-[#64748B]">6 flavours</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {recipeTemplates.map((template, index) => {
            const selected = template.flavour === recipe.flavour;
            return (
              <button key={template.flavour} type="button" onClick={() => setSelectedFlavour(template.flavour)} className={`min-h-[78px] rounded-[16px] border p-3.5 text-left transition ${selected ? 'border-[#C8A96B] bg-[#C8A96B]/10 shadow-[0_12px_32px_rgba(200,169,107,0.12)]' : 'border-[#334155] bg-[#111111] hover:border-[#C8A96B]/45'}`}>
                <span className={`text-xs font-semibold ${selected ? 'text-[#E4C98E]' : 'text-[#64748B]'}`}>0{index + 1}</span>
                <p className="mt-3 text-sm font-semibold leading-5 text-white">{template.flavour}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel md:p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Ingredient Cost Database</p>
            <h4 className="mt-2 text-xl font-semibold text-white">{recipe.flavour} purchasing inputs</h4>
          </div>
          <p className="text-xs text-[#64748B]">Editable locally for this session</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {recipeCost.ingredients.map((item) => (
            <div key={item.ingredient.id} className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-3.5">
              <p className="font-semibold text-white">{item.ingredient.name}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">Purchase price</span>
                  <div className="flex h-10 items-center rounded-xl border border-[#334155] bg-[#111111] px-3 focus-within:border-[#C8A96B]/60">
                    <span className="mr-1 text-xs text-[#94A3B8]">RM</span>
                    <input type="number" min="0" step="0.01" value={item.purchasePrice} onChange={(event) => updateIngredientCost(item.ingredient.id, 'purchasePrice', event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none" />
                  </div>
                </label>
                <label>
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">Purchase unit</span>
                  <div className="flex h-10 items-center rounded-xl border border-[#334155] bg-[#111111] px-3 focus-within:border-[#C8A96B]/60">
                    <input type="number" min="0" step="1" value={item.purchaseGrams} onChange={(event) => updateIngredientCost(item.ingredient.id, 'purchaseGrams', event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none" />
                    <span className="text-xs text-[#94A3B8]">g</span>
                  </div>
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#334155] pt-3">
                <span className="truncate text-xs text-[#94A3B8]">{formatMoney(item.purchasePrice)} / {formatAmount(item.purchaseGrams)}g</span>
                <span className="shrink-0 text-sm font-semibold text-[#E4C98E]">{formatMoney(item.unitCost)} / g</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <div className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel md:p-4">
          {mode === 'quantity' ? (
            <>
              <div className="flex flex-col gap-4 border-b border-[#334155] pb-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Production Target</p>
                  <h4 className="mt-2 text-xl font-semibold text-white">Ingredients and batch cost</h4>
                </div>
                <label className="w-full md:w-56">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">Target quantity</span>
                  <div className="flex h-12 items-center rounded-xl border border-[#334155] bg-[#0F172A] px-3 focus-within:border-[#C8A96B]/60">
                    <input type="number" min="0" step="1" value={targetQuantity} onChange={(event) => setTargetQuantity(toSafeAmount(event.target.value))} className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-white outline-none" />
                    <span className="text-sm text-[#64748B]">pieces</span>
                  </div>
                </label>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {recipeCost.ingredients.map((item) => {
                  const requiredGrams = item.ingredient.amount * safeTargetQuantity;
                  const totalCost = item.costPerPiece * safeTargetQuantity;
                  return (
                    <div key={item.ingredient.id} className="rounded-[18px] border border-[#334155] bg-[#0F172A] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-white">{item.ingredient.name}</p>
                          <p className="mt-1 text-xs text-[#94A3B8]">{formatAmount(item.ingredient.amount)}g / piece · {formatMoney(item.costPerPiece)} / piece</p>
                        </div>
                        <Scale size={17} className="shrink-0 text-[#C8A96B]" />
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#334155] pt-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-[#64748B]">Required</p>
                          <p className="mt-2 text-xl font-semibold text-[#E4C98E]">{formatAmount(requiredGrams)}g</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-[#64748B]">Total cost</p>
                          <p className="mt-2 text-xl font-semibold text-white">{formatMoney(totalCost)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Total Batch Cost', formatMoney(batchCost), 'Ingredients for target quantity'],
                  ['Cost Per Piece', formatMoney(recipeCost.costPerPiece), 'Calculated recipe cost'],
                  ['Selling Price', formatMoney(SELLING_PRICE_PER_PIECE), 'Per Mini Tart'],
                  ['Estimated Revenue', formatMoney(batchRevenue), 'Target quantity sales'],
                  ['Gross Profit / Piece', formatMoney(recipeCost.grossProfitPerPiece), 'Before overheads'],
                  ['Gross Margin', `${recipeCost.grossMargin.toFixed(1)}%`, `Batch profit ${formatMoney(batchGrossProfit)}`]
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{value}</p>
                    <p className="mt-1 text-xs text-[#94A3B8]">{detail}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[#334155] pb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Available Ingredients</p>
                <h4 className="mt-2 text-xl font-semibold text-white">Calculate yield and profit</h4>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {recipe.ingredients.map((ingredient) => (
                  <label key={ingredient.id} className="rounded-[18px] border border-[#334155] bg-[#0F172A] p-4">
                    <span className="font-semibold text-white">{ingredient.name}</span>
                    <span className="mt-1 block text-xs text-[#64748B]">Needs {formatAmount(ingredient.amount)}g per piece</span>
                    <div className="mt-4 flex h-11 items-center rounded-xl border border-[#334155] bg-[#111111] px-3 focus-within:border-[#C8A96B]/60">
                      <input type="number" min="0" step="0.1" value={availableIngredients[ingredient.id] ?? 0} onChange={(event) => setAvailableIngredients((current) => ({ ...current, [ingredient.id]: toSafeAmount(event.target.value) }))} className="min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none" />
                      <span className="text-sm text-[#64748B]">g available</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-[18px] border border-[#C8A96B]/30 bg-[#C8A96B]/10 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E4C98E]">Can produce</p>
                  <p className="mt-3 text-4xl font-semibold text-white">{yieldResult.estimatedYield}</p>
                  <p className="mt-1 text-sm text-[#E4C98E]">mini tart pieces</p>
                  <div className="mt-5 border-t border-[#C8A96B]/20 pt-4">
                    <p className="text-xs text-[#94A3B8]">Limiting ingredient</p>
                    <p className="mt-1 font-semibold text-white">{yieldResult.limitingIngredient}</p>
                  </div>
                </div>
                <div className="rounded-[18px] border border-[#334155] bg-[#0F172A] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748B]">Remaining after production</p>
                  <div className="mt-3 space-y-2">
                    {yieldResult.ingredients.map((item) => (
                      <div key={item.ingredient.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                        <span className="truncate text-sm text-[#CBD5E1]">{item.ingredient.name}</span>
                        <span className="shrink-0 text-sm font-semibold text-white">{formatAmount(item.remaining)}g</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Estimated Revenue', formatMoney(yieldRevenue), `${yieldResult.estimatedYield} pieces × RM2.50`],
                  ['Estimated Total Cost', formatMoney(yieldTotalCost), 'Ingredient cost'],
                  ['Estimated Gross Profit', formatMoney(yieldGrossProfit), 'Before overheads'],
                  ['Gross Margin', `${yieldGrossMargin.toFixed(1)}%`, 'Based on possible yield']
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-[16px] border border-[#334155] bg-[#0F172A] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{label}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{value}</p>
                    <p className="mt-1 text-xs text-[#94A3B8]">{detail}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="rounded-[18px] border border-[#334155] bg-[#111111] p-3.5 shadow-panel md:p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Recipe Cost Per Piece</p>
              <h4 className="mt-2 text-xl font-semibold text-white">{recipe.flavour}</h4>
              <p className="mt-1 text-sm text-[#94A3B8]">Ingredient breakdown for 1 piece</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#334155] bg-[#0F172A] text-[#C8A96B]"><ChefHat size={18} /></span>
          </div>

          <div className="mt-5 space-y-2">
            {recipeCost.ingredients.map((item, index) => (
              <div key={item.ingredient.id} className="flex items-center gap-3 rounded-[14px] border border-[#334155] bg-[#0F172A] px-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C8A96B]/10 text-xs font-semibold text-[#C8A96B]">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{item.ingredient.name}</span>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#E4C98E]">{formatAmount(item.ingredient.amount)}g</p>
                  <p className="mt-0.5 text-[10px] text-[#94A3B8]">{formatMoney(item.costPerPiece)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[16px] border border-[#C8A96B]/25 bg-[#C8A96B]/10 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#E4C98E]">Total cost / piece</span>
              <span className="text-xl font-semibold text-white">{formatMoney(recipeCost.costPerPiece)}</span>
            </div>
          </div>

          <div className="mt-5 flex gap-3 rounded-[16px] border border-amber-500/20 bg-amber-500/10 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
            <p className="text-xs leading-5 text-amber-100">
              Template costing only. Replace with actual LBL ingredient prices.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
