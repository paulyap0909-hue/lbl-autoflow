import React, { useEffect, useMemo, useState } from 'react';
import type { DiscountType, Order, Product } from '../data/mockData';
import { formatRM, getProductUnitPrice } from '../utils/pricing';

type EditOrderModalProps = {
  order: Order;
  products: Product[];
  onClose: () => void;
  onSave: (order: Order) => void | Promise<void>;
};

type FlavourRow = {
  id: string;
  flavour: string;
  quantity: number;
};

const rowId = () => Math.random().toString(36).slice(2, 10);

const getRowsFromOrder = (order: Order): FlavourRow[] => {
  if (order.flavourQuantities?.length) {
    return order.flavourQuantities.map((item) => ({
      id: rowId(),
      flavour: item.name,
      quantity: item.quantity
    }));
  }

  const fallbackQty = order.flavours.length > 1 ? Math.floor(order.quantity / order.flavours.length) : order.quantity;
  return (order.flavours.length ? order.flavours : [order.product]).map((flavour) => ({
    id: rowId(),
    flavour,
    quantity: fallbackQty || 1
  }));
};

export default function EditOrderModal({ order, products, onClose, onSave }: EditOrderModalProps) {
  const availableProducts = useMemo(() => products.filter((item) => item.status !== 'Out of Stock'), [products]);
  const categories = useMemo(() => Array.from(new Set(availableProducts.map((item) => item.category))) as Order['product'][], [availableProducts]);

  const [customerName, setCustomerName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.phone);
  const [product, setProduct] = useState<Order['product']>(order.product);
  const [rows, setRows] = useState<FlavourRow[]>(() => getRowsFromOrder(order));
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate);
  const [deliveryTime, setDeliveryTime] = useState(order.deliveryTime);
  const [deliveryFee, setDeliveryFee] = useState(order.deliveryFee);
  const [address, setAddress] = useState(order.address);
  const [paymentStatus, setPaymentStatus] = useState<Order['paymentStatus']>(order.paymentStatus);
  const [remark, setRemark] = useState(order.remark || '');
  const [discountType, setDiscountType] = useState<DiscountType>(order.discountType || 'none');
  const [discountValue, setDiscountValue] = useState(order.discountValue || 0);
  const [discountReason, setDiscountReason] = useState(order.discountReason || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const flavours = useMemo(
    () =>
      Array.from(
        new Set(
          availableProducts
            .filter((productItem) => productItem.category === product)
            .flatMap((productItem) => productItem.flavours)
        )
      ),
    [availableProducts, product]
  );

  const defaultUnitPrice = useMemo(() => {
    const selectedProduct = availableProducts.find((productItem) => productItem.category === product);
    return selectedProduct ? getProductUnitPrice(selectedProduct) : order.originalUnitPrice || order.unitPrice || 0;
  }, [availableProducts, order.originalUnitPrice, order.unitPrice, product]);

  useEffect(() => {
    if (rows.length === 0 && flavours[0]) {
      setRows([{ id: rowId(), flavour: flavours[0], quantity: 1 }]);
    }
  }, [flavours, rows.length]);

  const activeRows = rows.filter((row) => row.flavour.trim() && row.quantity > 0);
  const quantity = activeRows.reduce((sum, row) => sum + row.quantity, 0);

  const bulkUnitPrice = (qty: number) => {
    if (product !== 'Mini Tart') return defaultUnitPrice;
    if (qty >= 200) return 2;
    if (qty >= 96) return 2.2;
    if (qty >= 48) return 2.3;
    return 2.5;
  };

  const pricing = useMemo(() => {
    const originalUnitPrice = order.originalUnitPrice || defaultUnitPrice;
    const originalSubtotal = quantity * originalUnitPrice;
    let finalUnitPrice = order.finalUnitPrice || originalUnitPrice;
    let discountAmount = 0;

    if (discountType === 'none') {
      finalUnitPrice = originalUnitPrice;
      discountAmount = 0;
    }
    if (discountType === 'custom_unit_price') {
      finalUnitPrice = Math.max(0, discountValue || originalUnitPrice);
      discountAmount = Math.max(originalSubtotal - finalUnitPrice * quantity, 0);
    }
    if (discountType === 'percentage') {
      const percentage = Math.min(Math.max(discountValue, 0), 100);
      discountAmount = originalSubtotal * (percentage / 100);
      finalUnitPrice = quantity > 0 ? (originalSubtotal - discountAmount) / quantity : originalUnitPrice;
    }
    if (discountType === 'fixed_amount') {
      discountAmount = Math.min(Math.max(discountValue, 0), originalSubtotal);
      finalUnitPrice = quantity > 0 ? (originalSubtotal - discountAmount) / quantity : originalUnitPrice;
    }
    if (discountType === 'bulk_order') {
      finalUnitPrice = bulkUnitPrice(quantity);
      discountAmount = Math.max(originalSubtotal - finalUnitPrice * quantity, 0);
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
  }, [defaultUnitPrice, deliveryFee, discountType, discountValue, order.finalUnitPrice, order.originalUnitPrice, quantity]);

  const addRow = () => setRows((current) => [...current, { id: rowId(), flavour: flavours[0] || product, quantity: 1 }]);
  const removeRow = (id: string) => setRows((current) => current.filter((row) => row.id !== id));

  const handleSave = async () => {
    setError('');
    if (!customerName.trim() || !phone.trim() || !address.trim()) {
      setError('Please complete customer name, phone and address.');
      return;
    }
    if (activeRows.length === 0) {
      setError('Please add at least one flavour with quantity.');
      return;
    }

    const flavourQuantities = activeRows.map((row) => ({
      name: row.flavour,
      quantity: row.quantity
    }));

    const updatedOrder: Order = {
      ...order,
      customerName: customerName.trim(),
      phone: phone.trim(),
      product,
      flavours: flavourQuantities.map((item) => item.name),
      flavourQuantities,
      quantity,
      deliveryDate,
      deliveryTime,
      deliveryFee,
      address: address.trim(),
      paymentStatus,
      remark: remark.trim() || undefined,
      unitPrice: parseFloat(pricing.finalUnitPrice.toFixed(2)),
      originalUnitPrice: parseFloat(pricing.originalUnitPrice.toFixed(2)),
      finalUnitPrice: parseFloat(pricing.finalUnitPrice.toFixed(2)),
      discountType,
      discountValue: parseFloat((discountType === 'none' ? 0 : discountValue).toFixed(2)),
      discountAmount: parseFloat(pricing.discountAmount.toFixed(2)),
      discountReason: discountReason.trim() || undefined,
      originalSubtotal: parseFloat(pricing.originalSubtotal.toFixed(2)),
      finalSubtotal: parseFloat(pricing.finalSubtotal.toFixed(2)),
      totalAmount: parseFloat(pricing.totalAmount.toFixed(2))
    };

    setIsSaving(true);
    try {
      await onSave(updatedOrder);
    } catch (saveError) {
      console.error('Failed to update order:', saveError);
      setError('Failed to update order');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-48px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-softGold">Edit Order</p>
            <h3 className="mt-2 text-3xl font-semibold text-white">Edit Bakery Order</h3>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
            Cancel
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr_0.9fr]">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-softGold">Customer</p>
              <div className="mt-5 space-y-4">
                <Field label="Customer Name" value={customerName} onChange={setCustomerName} />
                <Field label="Phone" value={phone} onChange={setPhone} />
                <label className="block text-sm text-slate-300">
                  Product
                  <select value={product} onChange={(event) => setProduct(event.target.value as Order['product'])} className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none">
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Payment Status
                  <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as Order['paymentStatus'])} className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none">
                    <option>Pending</option>
                    <option>Paid</option>
                    <option>Overdue</option>
                  </select>
                </label>
                <Field label="Remark" value={remark} onChange={setRemark} />
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-softGold">Flavours</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">Flavour quantities</h4>
                </div>
                <button onClick={addRow} className="rounded-2xl bg-gold px-4 py-2 text-sm font-semibold text-charcoal">Add</button>
              </div>
              <div className="mt-5 space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="grid gap-3 rounded-[24px] border border-white/10 bg-[#111111] p-4 sm:grid-cols-[1fr_120px_auto]">
                    <select
                      value={row.flavour}
                      onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, flavour: event.target.value } : item))}
                      className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white outline-none"
                    >
                      {flavours.map((flavour) => <option key={flavour}>{flavour}</option>)}
                      {!flavours.includes(row.flavour) && <option>{row.flavour}</option>}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item))}
                      className="rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-sm text-white outline-none"
                    />
                    <button onClick={() => removeRow(row.id)} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">Remove</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-softGold">Delivery</p>
              <div className="mt-5 space-y-4">
                <Field label="Delivery Date" value={deliveryDate} onChange={setDeliveryDate} type="date" />
                <Field label="Delivery Time" value={deliveryTime} onChange={setDeliveryTime} type="time" />
                <Field label="Delivery Fee" value={String(deliveryFee)} onChange={(value) => setDeliveryFee(Math.max(0, Number(value) || 0))} type="number" />
                <label className="block text-sm text-slate-300">
                  Address
                  <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={4} className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none" />
                </label>
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-[28px] border border-gold/20 bg-gold/5 p-5">
            <p className="text-sm uppercase tracking-[0.24em] text-softGold">Pricing Control</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              <label className="block text-sm text-slate-300">
                Discount Type
                <select value={discountType} onChange={(event) => { setDiscountType(event.target.value as DiscountType); setDiscountValue(0); }} className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none">
                  <option value="none">None</option>
                  <option value="custom_unit_price">Custom Unit Price</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed Amount</option>
                  <option value="bulk_order">Bulk Order</option>
                </select>
              </label>
              {discountType !== 'none' && discountType !== 'bulk_order' && (
                <Field
                  label={discountType === 'custom_unit_price' ? 'Special Unit Price' : discountType === 'percentage' ? 'Discount Percentage' : 'Discount Amount'}
                  value={String(discountValue)}
                  onChange={(value) => setDiscountValue(Math.max(0, Number(value) || 0))}
                  type="number"
                />
              )}
              {discountType !== 'none' && (
                <Field label="Discount Reason" value={discountReason} onChange={setDiscountReason} />
              )}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              <Summary label="Original Unit" value={formatRM(pricing.originalUnitPrice)} />
              <Summary label="Final Unit" value={formatRM(pricing.finalUnitPrice)} />
              <Summary label="Original Subtotal" value={formatRM(pricing.originalSubtotal)} />
              <Summary label="Discount" value={formatRM(pricing.discountAmount)} />
              <Summary label="Total" value={formatRM(pricing.totalAmount)} />
            </div>
          </section>

          {error && <p className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 p-6">
          <button onClick={onClose} disabled={isSaving} className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving} className="rounded-3xl bg-gold px-6 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none"
      />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-white">{value}</p>
    </div>
  );
}
