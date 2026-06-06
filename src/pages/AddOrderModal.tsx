import React, { useEffect, useMemo, useState } from 'react';
import type { DiscountType, Order, Product } from '../data/mockData';
import { formatRM, getProductUnitPrice } from '../utils/pricing';

type AddOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddOrder: (order: Order) => void | Promise<void>;
  products: Product[];
};

type FlavourMode = 'single' | 'mixed';

type MixedFlavourRow = {
  id: string;
  flavour: string;
  quantity: number;
};

const formatCurrency = formatRM;
const createRow = (flavour: string) => ({ id: Math.random().toString(36).slice(2, 10), flavour, quantity: 1 });

export default function AddOrderModal({ isOpen, onClose, onAddOrder, products }: AddOrderModalProps) {
  const availableProducts = useMemo(
    () => products.filter((item) => item.status !== 'Out of Stock'),
    [products]
  );

  const categories = useMemo(
    () => Array.from(new Set(availableProducts.map((item) => item.category))) as Order['product'][],
    [availableProducts]
  );
  const defaultCategory = categories[0] ?? 'Mini Tart';
  const [product, setProduct] = useState<Order['product']>(defaultCategory);
  const [mode, setMode] = useState<FlavourMode>('single');
  const [singleFlavour, setSingleFlavour] = useState('');
  const [singleQuantity, setSingleQuantity] = useState(12);
  const [mixedRows, setMixedRows] = useState<MixedFlavourRow[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(10);
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('2026-06-03');
  const [deliveryTime, setDeliveryTime] = useState('11:30');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<Order['paymentStatus']>('Pending');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flavours = useMemo(
    () =>
      Array.from(
        new Set(
          availableProducts
            .filter((productItem) => productItem.category === product)
            .flatMap((productItem) => productItem.flavours)
        )
      ),
    [product, availableProducts]
  );

  const unitPrice = useMemo(
    () => {
      const selectedProduct = availableProducts.find((productItem) => productItem.category === product);
      return selectedProduct ? getProductUnitPrice(selectedProduct) : 0;
    },
    [product, availableProducts]
  );

  useEffect(() => {
    if (!categories.includes(product) && categories.length) {
      setProduct(categories[0]);
    }
  }, [categories, product]);

  useEffect(() => {
    const initialFlavour = flavours[0] ?? '';
    setSingleFlavour(initialFlavour);
    setMixedRows(initialFlavour ? [createRow(initialFlavour)] : []);
  }, [flavours]);

  const totalQuantity = useMemo(() => {
    if (mode === 'single') return singleQuantity;
    return mixedRows.reduce((sum, row) => sum + row.quantity, 0);
  }, [mode, singleQuantity, mixedRows]);

  const getBulkUnitPrice = (quantity: number) => {
    if (product !== 'Mini Tart') return unitPrice;
    if (quantity >= 200) return 2;
    if (quantity >= 96) return 2.2;
    if (quantity >= 48) return 2.3;
    return 2.5;
  };

  const pricing = useMemo(() => {
    const originalUnitPrice = unitPrice;
    const originalSubtotal = originalUnitPrice * totalQuantity;
    let finalUnitPrice = originalUnitPrice;
    let discountAmount = 0;

    if (discountType === 'custom_unit_price') {
      finalUnitPrice = Math.max(0, discountValue || originalUnitPrice);
      discountAmount = Math.max(originalSubtotal - finalUnitPrice * totalQuantity, 0);
    }

    if (discountType === 'percentage') {
      const percentage = Math.min(Math.max(discountValue, 0), 100);
      discountAmount = originalSubtotal * (percentage / 100);
      finalUnitPrice = totalQuantity > 0 ? (originalSubtotal - discountAmount) / totalQuantity : originalUnitPrice;
    }

    if (discountType === 'fixed_amount') {
      discountAmount = Math.min(Math.max(discountValue, 0), originalSubtotal);
      finalUnitPrice = totalQuantity > 0 ? (originalSubtotal - discountAmount) / totalQuantity : originalUnitPrice;
    }

    if (discountType === 'bulk_order') {
      finalUnitPrice = getBulkUnitPrice(totalQuantity);
      discountAmount = Math.max(originalSubtotal - finalUnitPrice * totalQuantity, 0);
    }

    const finalSubtotal = Math.max(originalSubtotal - discountAmount, 0);

    return {
      originalUnitPrice,
      finalUnitPrice,
      originalSubtotal,
      discountAmount,
      finalSubtotal,
      totalAmount: finalSubtotal + deliveryFee
    };
  }, [deliveryFee, discountType, discountValue, product, totalQuantity, unitPrice]);

  const activeMixedRows = mixedRows.filter((row) => row.quantity > 0);

  const selectedFlavourQuantities = useMemo(() => {
    if (mode === 'single') {
      return singleFlavour ? [{ name: singleFlavour, quantity: singleQuantity }] : [];
    }

    return activeMixedRows.map((row) => ({
      name: row.flavour,
      quantity: row.quantity
    }));
  }, [activeMixedRows, mode, singleFlavour, singleQuantity]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!customerName.trim()) nextErrors.customerName = 'Customer name is required.';
    if (!phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (!address.trim()) nextErrors.address = 'Delivery address is required.';
    if (!categories.length) nextErrors.product = 'No available products. Please add an available product first.';
    if (!singleFlavour && mode === 'single') nextErrors.flavour = 'Please select an available flavour.';
    if (!deliveryDate) nextErrors.deliveryDate = 'Delivery date is required.';
    if (!deliveryTime) nextErrors.deliveryTime = 'Delivery time is required.';
    if (mode === 'mixed') {
      if (!activeMixedRows.length) nextErrors.mixedRows = 'Add at least one flavour row.';
      if (activeMixedRows.some((row) => row.quantity < 1)) nextErrors.mixedRows = 'Each flavour must have quantity.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setProduct(defaultCategory);
    setMode('single');
    setSingleQuantity(12);
    setDeliveryFee(10);
    setDiscountType('none');
    setDiscountValue(0);
    setDiscountReason('');
    setDeliveryDate('2026-06-03');
    setDeliveryTime('11:30');
    setCustomerName('');
    setPhone('');
    setAddress('');
    setRemark('');
    setPaymentStatus('Pending');
    setErrors({});
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;
    setIsSubmitting(true);

    const orderDate = new Date();
    const dateKey = `${orderDate.getFullYear()}${String(orderDate.getMonth() + 1).padStart(2, '0')}${String(orderDate.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const initialWorkflow = paymentStatus === 'Paid' ? 'Paid' : 'Pending Payment';
    const flavourQuantities = selectedFlavourQuantities;
    const newOrder: Order = {
      id: `LBL-${dateKey}-${Math.floor(100 + Math.random() * 900)}`,
      customerName: customerName.trim(),
      phone: phone.trim(),
      product,
      flavours: flavourQuantities.map((item) => item.name),
      flavourQuantities,
      quantity: flavourQuantities.reduce((sum, item) => sum + item.quantity, 0),
      deliveryDate,
      deliveryTime: deliveryTime.includes(':') ? deliveryTime : `${deliveryTime}:00`,
      address: address.trim(),
      unitPrice: parseFloat(pricing.finalUnitPrice.toFixed(2)),
      originalUnitPrice: parseFloat(pricing.originalUnitPrice.toFixed(2)),
      finalUnitPrice: parseFloat(pricing.finalUnitPrice.toFixed(2)),
      discountType,
      discountValue: parseFloat((discountType === 'none' ? 0 : discountValue).toFixed(2)),
      discountAmount: parseFloat(pricing.discountAmount.toFixed(2)),
      discountReason: discountReason.trim() || undefined,
      originalSubtotal: parseFloat(pricing.originalSubtotal.toFixed(2)),
      finalSubtotal: parseFloat(pricing.finalSubtotal.toFixed(2)),
      deliveryFee,
      totalAmount: parseFloat(pricing.totalAmount.toFixed(2)),
      workflowStatus: initialWorkflow,
      statusHistory: [
        { status: 'New Order', timestamp },
        { status: initialWorkflow, timestamp }
      ],
      paymentStatus,
      kitchenStatus: initialWorkflow === 'Paid' ? 'New' : 'New',
      deliveryStatus: 'Pending',
      remark: remark.trim() || undefined
    };

    try {
      await onAddOrder(newOrder);
      setSuccessMessage('Order created successfully. Updating dashboard...');
      resetForm();
      window.setTimeout(() => onClose(), 900);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create order.';
      setErrors((current) => ({ ...current, submit: message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductChange = (next: Order['product']) => {
    setProduct(next);
    setMode('single');
  };

  const addMixedRow = () => {
    if (flavours.length) {
      setMixedRows((current) => [...current, createRow(flavours[0])]);
    }
  };

  const removeMixedRow = (rowId: string) => {
    setMixedRows((current) => current.filter((row) => row.id !== rowId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[calc(100vh-64px)] w-full max-w-[1400px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d]/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-8 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-softGold">Premium Order Workflow</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">Create New Bakery Order</h3>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_1.35fr_0.95fr]">
              <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel backdrop-blur-sm">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-softGold">Customer & Order Info</p>
                    <h4 className="mt-2 text-xl font-semibold text-white">Order details</h4>
                  </div>
                  <div className="rounded-3xl bg-[#1f1f1f] px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">Pricing guide</div>
                </div>
                <div className="space-y-4">
                  <label className="block text-sm text-slate-300">
                    Customer Name
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                      placeholder="Enter full name"
                    />
                    {errors.customerName && <p className="mt-2 text-sm text-rose-300">{errors.customerName}</p>}
                  </label>
                  <label className="block text-sm text-slate-300">
                    Phone Number
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                      placeholder="+60 12 345 6789"
                    />
                    {errors.phone && <p className="mt-2 text-sm text-rose-300">{errors.phone}</p>}
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm text-slate-300">
                      Product Type
                      <select
                        value={product}
                        onChange={(e) => handleProductChange(e.target.value as Order['product'])}
                        className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                      >
                        {categories.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                      {errors.product && <p className="mt-2 text-sm text-rose-300">{errors.product}</p>}
                    </label>
                    <label className="block text-sm text-slate-300">
                      Unit Price
                      <div className="mt-3 rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white">
                        {formatCurrency(unitPrice)} / pc
                      </div>
                    </label>
                  </div>
                  <div className="rounded-[28px] border border-gold/20 bg-gold/5 p-5">
                    <p className="text-xs uppercase tracking-[0.26em] text-softGold">Pricing Control</p>
                    <div className="mt-4 space-y-4">
                      <label className="block text-sm text-slate-300">
                        Discount Type
                        <select
                          value={discountType}
                          onChange={(e) => {
                            setDiscountType(e.target.value as DiscountType);
                            setDiscountValue(0);
                            setDiscountReason('');
                          }}
                          className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                        >
                          <option value="none">None</option>
                          <option value="custom_unit_price">Custom Unit Price</option>
                          <option value="percentage">Percentage</option>
                          <option value="fixed_amount">Fixed Amount</option>
                          <option value="bulk_order">Bulk Order</option>
                        </select>
                      </label>

                      {discountType === 'custom_unit_price' && (
                        <label className="block text-sm text-slate-300">
                          Special Unit Price
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={discountValue}
                            onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
                            className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                            placeholder="2.30"
                          />
                        </label>
                      )}

                      {discountType === 'percentage' && (
                        <label className="block text-sm text-slate-300">
                          Discount Percentage
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={discountValue}
                            onChange={(e) => setDiscountValue(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                            className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                            placeholder="10"
                          />
                        </label>
                      )}

                      {discountType === 'fixed_amount' && (
                        <label className="block text-sm text-slate-300">
                          Discount Amount
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={discountValue}
                            onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
                            className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                            placeholder="20.00"
                          />
                        </label>
                      )}

                      {discountType === 'bulk_order' && (
                        <div className="rounded-[24px] border border-white/10 bg-[#111111] p-4 text-sm text-slate-300">
                          <p className="font-semibold text-white">Auto bulk tier</p>
                          <p className="mt-2">Mini Tart: 1-47 RM2.50, 48-95 RM2.30, 96-199 RM2.20, 200+ RM2.00</p>
                          <p className="mt-2 text-softGold">Applied unit price: {formatCurrency(pricing.finalUnitPrice)}</p>
                        </div>
                      )}

                      {discountType !== 'none' && discountType !== 'bulk_order' && (
                        <label className="block text-sm text-slate-300">
                          Discount Reason
                          <input
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                            placeholder="Corporate order, promo, owner approval..."
                          />
                        </label>
                      )}

                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div className="rounded-[22px] bg-black/20 p-3">
                          <p className="text-slate-400">Original subtotal</p>
                          <p className="mt-1 font-semibold text-white">{formatCurrency(pricing.originalSubtotal)}</p>
                        </div>
                        <div className="rounded-[22px] bg-black/20 p-3">
                          <p className="text-slate-400">Discount</p>
                          <p className="mt-1 font-semibold text-softGold">{formatCurrency(pricing.discountAmount)}</p>
                        </div>
                        <div className="rounded-[22px] bg-black/20 p-3">
                          <p className="text-slate-400">Final unit price</p>
                          <p className="mt-1 font-semibold text-white">{formatCurrency(pricing.finalUnitPrice)}</p>
                        </div>
                        <div className="rounded-[22px] bg-black/20 p-3">
                          <p className="text-slate-400">Final subtotal</p>
                          <p className="mt-1 font-semibold text-white">{formatCurrency(pricing.finalSubtotal)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm text-slate-300">
                      Quantity
                      <div className="mt-3 flex items-center rounded-[24px] border border-white/10 bg-[#111111] px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSingleQuantity((value) => Math.max(1, value - 1))}
                          className="rounded-full bg-white/5 px-3 py-2 text-white transition hover:bg-white/10"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={singleQuantity}
                          onChange={(e) => setSingleQuantity(Math.max(1, Number(e.target.value) || 1))}
                          className="mx-3 w-full bg-transparent text-center text-lg font-semibold text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setSingleQuantity((value) => value + 1)}
                          className="rounded-full bg-white/5 px-3 py-2 text-white transition hover:bg-white/10"
                        >
                          +
                        </button>
                      </div>
                    </label>
                    <label className="block text-sm text-slate-300">
                      Remark
                      <input
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                        placeholder="Add a note for the kitchen"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] border border-white/10 bg-[#111111]/80 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-softGold">Pricing helper</p>
                  <p className="mt-3 text-sm text-slate-300">Mini Tart = RM2.50 / pc</p>
                  <p className="mt-2 text-sm text-slate-300">Croissant Egg Tart = RM11.80 / pc</p>
                </div>
              </section>

              <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel backdrop-blur-sm">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-softGold">Flavour Selection</p>
                    <h4 className="mt-2 text-xl font-semibold text-white">Choose your flavours</h4>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-[#111111] p-1 text-sm text-slate-300">
                    <button
                      type="button"
                      className={`inline-flex h-11 items-center justify-center rounded-3xl px-4 transition ${mode === 'single' ? 'bg-gold text-charcoal' : 'text-slate-300 hover:text-white'}`}
                      onClick={() => setMode('single')}
                    >
                      Single Flavour
                    </button>
                    <button
                      type="button"
                      className={`inline-flex h-11 items-center justify-center rounded-3xl px-4 transition ${mode === 'mixed' ? 'bg-gold text-charcoal' : 'text-slate-300 hover:text-white'}`}
                      onClick={() => setMode('mixed')}
                    >
                      Mixed Flavour
                    </button>
                  </div>
                </div>

                {mode === 'single' ? (
                  <>
                  {errors.flavour && <p className="mb-4 text-sm text-rose-300">{errors.flavour}</p>}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {flavours.map((flavour) => (
                      <button
                        key={flavour}
                        type="button"
                        onClick={() => setSingleFlavour(flavour)}
                        className={`group rounded-[28px] border px-4 py-4 text-left transition ${
                          singleFlavour === flavour ? 'border-gold bg-gold/10 text-white shadow-lg' : 'border-white/10 bg-[#111111] text-slate-300 hover:border-gold hover:text-white'
                        }`}
                      >
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-3xl bg-white/5 text-lg font-semibold text-softGold">
                          {flavour.charAt(0)}
                        </div>
                        <p className="font-semibold">{flavour}</p>
                        <p className="mt-2 text-sm text-slate-400">Classic luxury bakery flavour.</p>
                      </button>
                    ))}
                  </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    {mixedRows.map((row, index) => (
                      <div key={row.id} className="rounded-[28px] border border-white/10 bg-[#111111] p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex-1 text-sm text-slate-300">
                            Flavour
                            <select
                              value={row.flavour}
                              onChange={(e) =>
                                setMixedRows((current) => current.map((item) => item.id === row.id ? { ...item, flavour: e.target.value } : item))
                              }
                              className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#0f0f0f] px-4 py-3 text-white outline-none"
                            >
                              {flavours.map((flavour) => (
                                <option key={flavour}>{flavour}</option>
                              ))}
                            </select>
                          </label>
                          <label className="w-full max-w-[160px] text-sm text-slate-300">
                            Quantity
                            <div className="mt-3 flex items-center rounded-[24px] border border-white/10 bg-[#0f0f0f] px-2 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setMixedRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
                                    )
                                  )
                                }
                                className="rounded-full bg-white/5 px-3 py-2 text-white transition hover:bg-white/10"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={row.quantity}
                                onChange={(e) =>
                                  setMixedRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, quantity: Math.max(1, Number(e.target.value) || 1) } : item
                                    )
                                  )
                                }
                                className="mx-3 w-full bg-transparent text-center text-white outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setMixedRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, quantity: item.quantity + 1 } : item
                                    )
                                  )
                                }
                                className="rounded-full bg-white/5 px-3 py-2 text-white transition hover:bg-white/10"
                              >
                                +
                              </button>
                            </div>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeMixedRow(row.id)}
                            className="mt-3 h-12 rounded-[24px] border border-rose-500/20 bg-rose-500/10 px-4 text-sm text-rose-200 transition hover:bg-rose-500/20 sm:mt-0"
                          >
                            Remove
                          </button>
                        </div>
                        {index === 0 && errors.mixedRows && <p className="mt-3 text-sm text-rose-300">{errors.mixedRows}</p>}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addMixedRow}
                      className="inline-flex items-center justify-center rounded-[24px] border border-white/10 bg-white/5 px-5 py-3 text-sm text-white transition hover:bg-white/10"
                    >
                      Add Another Flavour
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel backdrop-blur-sm">
                <div className="mb-6">
                  <p className="text-sm uppercase tracking-[0.24em] text-softGold">Delivery & Summary</p>
                  <h4 className="mt-2 text-xl font-semibold text-white">Finalize the order</h4>
                </div>
                <div className="space-y-4">
                  <label className="block text-sm text-slate-300">
                    Delivery Date
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                    />
                    {errors.deliveryDate && <p className="mt-2 text-sm text-rose-300">{errors.deliveryDate}</p>}
                  </label>
                  <label className="block text-sm text-slate-300">
                    Delivery Time
                    <input
                      type="time"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                    />
                    {errors.deliveryTime && <p className="mt-2 text-sm text-rose-300">{errors.deliveryTime}</p>}
                  </label>
                  <label className="block text-sm text-slate-300">
                    Delivery Fee
                    <input
                      type="number"
                      min={0}
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Address
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={4}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                      placeholder="Delivery address"
                    />
                    {errors.address && <p className="mt-2 text-sm text-rose-300">{errors.address}</p>}
                  </label>
                  <label className="block text-sm text-slate-300">
                    Payment Status
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value as Order['paymentStatus'])}
                      className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
                    >
                      <option>Pending</option>
                      <option>Paid</option>
                      <option>Overdue</option>
                    </select>
                  </label>
                </div>

                <div className="mt-6 rounded-[32px] border border-white/10 bg-[#111111]/80 p-6 text-slate-300">
                  <div className="flex items-center justify-between text-sm uppercase tracking-[0.23em] text-softGold">
                    <span>Summary</span>
                    <span>{mode === 'single' ? 'Single Flavour' : 'Mixed Flavours'}</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Total Quantity</span>
                      <span>{totalQuantity} pcs</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Original Subtotal</span>
                      <span>{formatCurrency(pricing.originalSubtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Discount</span>
                      <span>{formatCurrency(pricing.discountAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Final Subtotal</span>
                      <span>{formatCurrency(pricing.finalSubtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Delivery Fee</span>
                      <span>{formatCurrency(deliveryFee)}</span>
                    </div>
                  </div>
                  <div className="mt-6 rounded-[24px] bg-[#0f0f0f] px-5 py-6 text-center">
                    <p className="text-sm uppercase tracking-[0.24em] text-softGold">Total</p>
                    <p className="mt-3 text-4xl font-semibold text-white">{formatCurrency(pricing.totalAmount)}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="sticky bottom-0 z-20 bg-[#0d0d0d]/95 border-t border-white/10 px-8 py-5 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1320px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {successMessage ? (
                  <p className="rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMessage}</p>
                ) : (
                  <p className="text-sm text-slate-400">Review the order summary before creating the premium bakery order.</p>
                )}
                {errors.submit && <p className="mt-2 text-sm text-rose-300">{errors.submit}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-3xl bg-gold px-6 py-3 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
