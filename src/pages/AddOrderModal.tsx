import React, { useEffect, useMemo, useState } from 'react';
import type { Customer, DiscountType, Order, Product } from '../data/mockData';
import type { OrderOperationalWorkflowResult } from '../services/orderService';
import { getMalaysiaDateTimeInputs } from '../utils/malaysiaDateTime';
import { formatRM, getProductUnitPrice } from '../utils/pricing';

type AddOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddOrder: (order: Order) => void | OrderOperationalWorkflowResult | Promise<void | OrderOperationalWorkflowResult>;
  products: Product[];
  customers?: Customer[];
  existingOrders?: Order[];
};

type FlavourMode = 'single' | 'mixed';
type DeliveryType = 'Delivery' | 'Self Collect';
type PaymentMethod = NonNullable<Order['paymentMethod']>;

type MixedFlavourRow = {
  id: string;
  flavour: string;
  quantity: number;
};

type ProductOption = {
  id: string;
  name: string;
  category: Product['category'];
  unitPrice: number;
  flavours: string[];
};

const wizardSteps = ['Customer', 'Product', 'Quantity', 'Flavours', 'Delivery', 'Payment', 'Review'] as const;
const paymentMethods: PaymentMethod[] = ['Cash', 'QR', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Customer Wallet'];
const formatCurrency = formatRM;
const createRow = (flavour: string): MixedFlavourRow => ({
  id: Math.random().toString(36).slice(2, 10),
  flavour,
  quantity: 1
});

const inputClass =
  'mt-2 w-full rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-white outline-none transition focus:border-gold/60';

export default function AddOrderModal({
  isOpen,
  onClose,
  onAddOrder,
  products,
  customers = [],
  existingOrders = []
}: AddOrderModalProps) {
  const availableProducts = useMemo(
    () => products
      .filter((item) => item.status === 'Available')
      .sort((first, second) =>
        (first.sortOrder ?? Number.MAX_SAFE_INTEGER) - (second.sortOrder ?? Number.MAX_SAFE_INTEGER)
        || first.name.localeCompare(second.name)
      ),
    [products]
  );

  const productOptions = useMemo<ProductOption[]>(() => {
    const groupedCategories: Product['category'][] = ['Mini Tart', 'Croissant Egg Tart'];
    const groupedOptions = groupedCategories.flatMap((category) => {
      const categoryProducts = availableProducts.filter((item) => item.category === category);
      if (!categoryProducts.length) return [];
      return [{
        id: `category:${category}`,
        name: category,
        category,
        unitPrice: getProductUnitPrice(categoryProducts[0]),
        flavours: Array.from(new Set(categoryProducts.flatMap((item) => item.flavours?.length ? item.flavours : [item.name])))
      }];
    });

    const individualOptions = availableProducts
      .filter((item) => !groupedCategories.includes(item.category))
      .map((item) => ({
        id: `product:${item.id}`,
        name: item.name,
        category: item.category,
        unitPrice: getProductUnitPrice(item),
        flavours: item.flavours?.length ? item.flavours : [item.name]
      }));

    return [...groupedOptions, ...individualOptions];
  }, [availableProducts]);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [mode, setMode] = useState<FlavourMode>('single');
  const [singleFlavour, setSingleFlavour] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState(0);
  const [mixedRows, setMixedRows] = useState<MixedFlavourRow[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => getMalaysiaDateTimeInputs().date);
  const [deliveryTime, setDeliveryTime] = useState(() => getMalaysiaDateTimeInputs().time);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<Order['paymentStatus']>('Pending');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('Delivery');
  const [currentStep, setCurrentStep] = useState(0);
  const [highestCompletedStep, setHighestCompletedStep] = useState(0);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdOrderNo, setCreatedOrderNo] = useState('');

  const selectedProduct = useMemo(
    () => productOptions.find((item) => item.id === selectedProductId) ?? null,
    [productOptions, selectedProductId]
  );
  const product = selectedProduct?.name ?? '';
  const productCategory = selectedProduct?.category;
  const requiresFlavourAllocation = productCategory === 'Mini Tart' || productCategory === 'Croissant Egg Tart';
  const flavours = useMemo(() => selectedProduct?.flavours ?? [], [selectedProduct]);

  const unitPrice = selectedProduct?.unitPrice ?? 0;

  const quantityPresets = useMemo(() => {
    if (productCategory === 'Mini Tart') return [24, 48, 60, 100];
    if (productCategory === 'Croissant Egg Tart' || productCategory === 'Chewy Cookie') return [6, 12, 24];
    return [];
  }, [productCategory]);

  const existingCustomers = useMemo(() => {
    const customerMap = new Map<string, { key: string; id?: string; name: string; phone: string; address: string; walletBalance: number }>();

    customers.forEach((customer) => {
      const key = customer.id ? `id:${customer.id}` : customer.phone.replace(/\D/g, '');
      if (!key) return;
      customerMap.set(key, {
        key,
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address || '',
        walletBalance: Number(customer.walletBalance) || 0
      });
    });

    [...existingOrders].reverse().forEach((order) => {
      const normalizedPhone = order.phone.replace(/\D/g, '');
      const key = normalizedPhone || order.customerName.trim().toLowerCase();
      if (!key || Array.from(customerMap.values()).some((customer) => customer.phone.replace(/\D/g, '') === normalizedPhone)) return;

      customerMap.set(key, {
        key,
        name: order.customerName,
        phone: order.phone,
        address: order.address === 'Self Collect' ? '' : order.address,
        walletBalance: 0
      });
    });

    return Array.from(customerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, existingOrders]);

  const selectedExistingCustomer = existingCustomers.find((customer) => customer.key === selectedCustomerKey) ?? null;

  useEffect(() => {
    const initialFlavour = flavours[0] ?? '';
    setSingleFlavour(initialFlavour);
    setMixedRows(initialFlavour ? [createRow(initialFlavour)] : []);
  }, [flavours]);

  useEffect(() => {
    if (!isOpen) return;
    const malaysiaNow = getMalaysiaDateTimeInputs();
    setSelectedProductId('');
    setMode('single');
    setSingleFlavour('');
    setSelectedQuantity(0);
    setMixedRows([]);
    setDeliveryFee(0);
    setDiscountType('none');
    setDiscountValue(0);
    setDiscountReason('');
    setDeliveryDate(malaysiaNow.date);
    setDeliveryTime(malaysiaNow.time);
    setCustomerName('');
    setPhone('');
    setAddress('');
    setRemark('');
    setPaymentStatus('Pending');
    setPaymentMethod('');
    setDeliveryType('Delivery');
    setCurrentStep(0);
    setHighestCompletedStep(0);
    setSelectedCustomerKey('');
    setSuccessMessage('');
    setCreatedOrderNo('');
    setErrors({});
  }, [isOpen]);

  const activeMixedRows = mixedRows.filter((row) => row.quantity > 0);
  const assignedQuantity = !requiresFlavourAllocation
    ? selectedQuantity
    : mode === 'single'
    ? selectedQuantity
    : activeMixedRows.reduce((sum, row) => sum + row.quantity, 0);

  const selectedFlavourQuantities = useMemo(() => {
    if (!requiresFlavourAllocation) {
      return selectedProduct && selectedQuantity > 0
        ? [{ name: selectedProduct.name, quantity: selectedQuantity }]
        : [];
    }
    if (mode === 'single') {
      return singleFlavour ? [{ name: singleFlavour, quantity: selectedQuantity }] : [];
    }

    return activeMixedRows.map((row) => ({
      name: row.flavour,
      quantity: row.quantity
    }));
  }, [activeMixedRows, mode, requiresFlavourAllocation, selectedProduct, selectedQuantity, singleFlavour]);

  const getBulkUnitPrice = (quantity: number) => {
    if (productCategory !== 'Mini Tart') return unitPrice;
    if (quantity >= 200) return 2;
    if (quantity >= 96) return 2.2;
    if (quantity >= 48) return 2.3;
    return 2.5;
  };

  const pricing = useMemo(() => {
    const originalUnitPrice = unitPrice;
    const originalSubtotal = originalUnitPrice * selectedQuantity;
    let finalUnitPrice = originalUnitPrice;
    let discountAmount = 0;

    if (discountType === 'custom_unit_price') {
      finalUnitPrice = Math.max(0, discountValue || originalUnitPrice);
      discountAmount = Math.max(originalSubtotal - finalUnitPrice * selectedQuantity, 0);
    }

    if (discountType === 'percentage') {
      const percentage = Math.min(Math.max(discountValue, 0), 100);
      discountAmount = originalSubtotal * (percentage / 100);
      finalUnitPrice = selectedQuantity > 0
        ? (originalSubtotal - discountAmount) / selectedQuantity
        : originalUnitPrice;
    }

    if (discountType === 'fixed_amount') {
      discountAmount = Math.min(Math.max(discountValue, 0), originalSubtotal);
      finalUnitPrice = selectedQuantity > 0
        ? (originalSubtotal - discountAmount) / selectedQuantity
        : originalUnitPrice;
    }

    if (discountType === 'bulk_order') {
      finalUnitPrice = getBulkUnitPrice(selectedQuantity);
      discountAmount = Math.max(originalSubtotal - finalUnitPrice * selectedQuantity, 0);
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
  }, [deliveryFee, discountType, discountValue, productCategory, selectedQuantity, unitPrice]);

  const validateStep = (step: number) => {
    const nextErrors: Record<string, string> = {};

    if (step === 0) {
      if (!customerName.trim()) nextErrors.customerName = 'Customer name is required.';
      if (!phone.trim()) nextErrors.phone = 'Phone number is required.';
    }

    if (step === 1) {
      if (!productOptions.length) {
        nextErrors.product = 'No available products. Add an available product first.';
      } else if (!selectedProduct) {
        nextErrors.product = 'Please select a product.';
      }
    }

    if (step === 2 && selectedQuantity < 1) {
      nextErrors.quantity = 'Quantity must be at least 1.';
    }

    if (step === 3 && requiresFlavourAllocation) {
      if (mode === 'single' && !singleFlavour) {
        nextErrors.flavour = 'Please select a flavour.';
      }
      if (mode === 'mixed' && !activeMixedRows.length) {
        nextErrors.mixedRows = 'Add at least one flavour.';
      } else if (mode === 'mixed' && assignedQuantity !== selectedQuantity) {
        nextErrors.mixedRows = assignedQuantity > selectedQuantity
          ? `Reduce the allocation by ${assignedQuantity - selectedQuantity}.`
          : `Assign ${selectedQuantity - assignedQuantity} more item(s).`;
      }
    }

    if (step === 4) {
      if (!deliveryDate) nextErrors.deliveryDate = 'Date is required.';
      if (!deliveryTime) nextErrors.deliveryTime = 'Time is required.';
      if (deliveryType === 'Delivery' && !address.trim()) {
        nextErrors.address = 'Delivery address is required.';
      }
    }

    if (step === 5) {
      if (!paymentMethod) nextErrors.paymentMethod = 'Please select a payment method.';
      if (paymentMethod === 'Customer Wallet' && !selectedExistingCustomer?.id) {
        nextErrors.paymentMethod = 'Select an existing customer to use Customer Wallet.';
      } else if (paymentMethod === 'Customer Wallet' && (selectedExistingCustomer?.walletBalance ?? 0) < pricing.totalAmount) {
        nextErrors.paymentMethod = 'Insufficient wallet balance';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateOrder = () => {
    for (let step = 0; step <= 5; step += 1) {
      if (!validateStep(step)) {
        setCurrentStep(step);
        return false;
      }
    }
    return true;
  };

  const resetForm = () => {
    setSelectedProductId('');
    setMode('single');
    setSingleFlavour('');
    setMixedRows([]);
    setSelectedQuantity(0);
    setDeliveryFee(0);
    setDiscountType('none');
    setDiscountValue(0);
    setDiscountReason('');
    const malaysiaNow = getMalaysiaDateTimeInputs();
    setDeliveryDate(malaysiaNow.date);
    setDeliveryTime(malaysiaNow.time);
    setCustomerName('');
    setPhone('');
    setAddress('');
    setRemark('');
    setPaymentStatus('Pending');
    setPaymentMethod('');
    setDeliveryType('Delivery');
    setCurrentStep(0);
    setHighestCompletedStep(0);
    setSelectedCustomerKey('');
    setErrors({});
    setCreatedOrderNo('');
  };

  const handleCreateOrder = async () => {
    if (isCreating || createdOrderNo || currentStep !== wizardSteps.length - 1) return;
    if (!validateOrder()) return;
    setIsCreating(true);

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const finalPaymentStatus: Order['paymentStatus'] = paymentMethod === 'Customer Wallet' ? 'Paid' : paymentStatus;
    const initialWorkflow = finalPaymentStatus === 'Paid' ? 'Paid' : 'Pending Payment';
    const flavourQuantities = selectedFlavourQuantities;

    const newOrder: Order = {
      id: 'Pending Order No',
      customerId: selectedExistingCustomer?.id,
      customerName: customerName.trim(),
      phone: phone.trim(),
      product,
      flavours: flavourQuantities.map((item) => item.name),
      flavourQuantities,
      quantity: flavourQuantities.reduce((sum, item) => sum + item.quantity, 0),
      deliveryDate,
      deliveryTime: deliveryTime.includes(':') ? deliveryTime : `${deliveryTime}:00`,
      address: deliveryType === 'Self Collect' ? 'Self Collect' : address.trim(),
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
      paymentStatus: finalPaymentStatus,
      paymentMethod: paymentMethod || undefined,
      kitchenStatus: 'New',
      deliveryStatus: 'Pending',
      remark: remark.trim() || undefined
    };

    try {
      const result = await onAddOrder(newOrder);
      const savedOrder = result && 'savedOrder' in result ? result.savedOrder : null;
      const warnings = result && 'warnings' in result ? result.warnings : [];
      setCreatedOrderNo(savedOrder?.orderNo || savedOrder?.id || 'Created');
      setSuccessMessage(
        warnings.length
          ? `Order created, but workflow sync needs attention: ${warnings.join(', ')}.`
          : 'Order created successfully.'
      );
      window.setTimeout(() => {
        resetForm();
        onClose();
      }, warnings.length ? 1400 : 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create order.';
      setErrors((current) => ({ ...current, submit: message }));
    } finally {
      setIsCreating(false);
    }
  };

  const handleProductChange = (nextProductId: string) => {
    setSelectedProductId(nextProductId);
    setMode('single');
    setSelectedQuantity(0);
    setErrors({});
  };

  const handleExistingCustomer = (key: string) => {
    setSelectedCustomerKey(key);
    const customer = existingCustomers.find((item) => item.key === key);
    if (!customer) return;

    setCustomerName(customer.name);
    setPhone(customer.phone);
    if (deliveryType === 'Delivery') setAddress(customer.address);
    setErrors({});
  };

  const addMixedRow = () => {
    if (flavours.length) {
      setMixedRows((current) => [...current, createRow(flavours[0])]);
    }
  };

  const removeMixedRow = (rowId: string) => {
    setMixedRows((current) => current.filter((row) => row.id !== rowId));
  };

  const goNext = () => {
    if (!validateStep(currentStep)) return;
    setHighestCompletedStep((step) => Math.max(step, currentStep + 1));
    setCurrentStep((step) => Math.min(step + 1, wizardSteps.length - 1));
  };

  const goBack = () => {
    setErrors({});
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="flex h-[calc(100vh-16px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d0d] shadow-2xl sm:h-[calc(100vh-48px)]">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-softGold">Bakery Order Wizard V2</p>
            <h3 className="mt-1 text-xl font-semibold text-white sm:text-2xl">Create New Bakery Order</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">
            Close
          </button>
        </header>

        <form onSubmit={(event) => event.preventDefault()} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="grid grid-cols-7 gap-1.5">
              {wizardSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  className="min-w-0 text-left"
                >
                  <span className={`block h-1.5 rounded-full ${index <= currentStep ? 'bg-gold' : 'bg-white/10'}`} />
                  <span className={`mt-1.5 block truncate text-[10px] font-medium sm:text-xs ${index === currentStep ? 'text-softGold' : 'text-slate-500'}`}>
                    {step}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section className="min-h-[430px] rounded-[20px] border border-white/10 bg-[#141414] p-4 sm:p-6">
                <div className="mb-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-softGold">
                    Step {currentStep + 1} of {wizardSteps.length}
                  </p>
                  <h4 className="mt-1 text-xl font-semibold text-white">{wizardSteps[currentStep]}</h4>
                </div>

                {currentStep === 0 && (
                  <div className="space-y-4">
                    {existingCustomers.length > 0 && (
                      <label className="block text-sm text-slate-300">
                        Existing Customer
                        <select value={selectedCustomerKey} onChange={(event) => handleExistingCustomer(event.target.value)} className={inputClass}>
                          <option value="">Create a new customer</option>
                          {existingCustomers.map((customer) => (
                            <option key={customer.key} value={customer.key}>
                              {customer.name} - {customer.phone}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-slate-500">Select a returning customer to fill their details automatically.</p>
                      </label>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm text-slate-300">
                        Customer Name
                        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClass} placeholder="Enter customer name" autoFocus />
                        {errors.customerName && <p className="mt-2 text-sm text-rose-300">{errors.customerName}</p>}
                      </label>
                      <label className="block text-sm text-slate-300">
                        Phone Number
                        <input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} placeholder="012 345 6789" />
                        {errors.phone && <p className="mt-2 text-sm text-rose-300">{errors.phone}</p>}
                      </label>
                    </div>
                  </div>
                )}

                {currentStep === 1 && (
                  <div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {productOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleProductChange(option.id)}
                          className={`rounded-[18px] border p-5 text-left transition ${
                            selectedProductId === option.id ? 'border-gold bg-gold/10' : 'border-white/10 bg-[#0f0f0f] hover:border-gold/40'
                          }`}
                        >
                          <p className="text-lg font-semibold text-white">{option.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{option.category}</p>
                          <p className="mt-3 text-sm text-slate-300">{formatCurrency(option.unitPrice)} per piece</p>
                        </button>
                      ))}
                    </div>
                    {errors.product && <p className="mt-3 text-sm text-rose-300">{errors.product}</p>}
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="mx-auto max-w-xl">
                    <p className="text-sm text-slate-400">How many pieces does the customer need?</p>
                    <div className="mt-5 flex items-center rounded-[18px] border border-gold/30 bg-gold/5 p-2">
                      <button type="button" onClick={() => setSelectedQuantity((value) => Math.max(1, value - 1))} className="h-12 w-12 rounded-xl bg-white/5 text-xl text-white hover:bg-white/10">-</button>
                      <input
                        type="number"
                        min={1}
                        value={selectedQuantity}
                        onChange={(event) => setSelectedQuantity(Math.max(1, Number(event.target.value) || 1))}
                        className="min-w-0 flex-1 bg-transparent text-center text-4xl font-semibold text-white outline-none"
                      />
                      <button type="button" onClick={() => setSelectedQuantity((value) => value + 1)} className="h-12 w-12 rounded-xl bg-white/5 text-xl text-white hover:bg-white/10">+</button>
                    </div>
                    {quantityPresets.length > 0 && (
                      <div className={`mt-4 grid gap-2 ${quantityPresets.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                      {quantityPresets.map((quantity) => (
                        <button key={quantity} type="button" onClick={() => setSelectedQuantity(quantity)} className="rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-sm text-slate-300 hover:border-gold/40 hover:text-white">
                          {quantity}
                        </button>
                      ))}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-slate-500">
                      {quantityPresets.length ? 'Choose a common quantity or enter a custom amount above.' : 'Enter a custom quantity above.'}
                    </p>
                    {errors.quantity && <p className="mt-3 text-sm text-rose-300">{errors.quantity}</p>}
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-[16px] border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-slate-400">Selected Quantity</p>
                        <p className="text-2xl font-semibold text-white">{selectedQuantity}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm text-slate-400">Current Assigned</p>
                        <p className={`text-2xl font-semibold ${assignedQuantity > selectedQuantity ? 'text-rose-300' : assignedQuantity === selectedQuantity ? 'text-emerald-300' : 'text-softGold'}`}>
                          {assignedQuantity} / {selectedQuantity}
                        </p>
                      </div>
                    </div>

                    {!requiresFlavourAllocation ? (
                      <div className="rounded-[18px] border border-gold/20 bg-gold/5 p-5">
                        <p className="text-xs uppercase tracking-[0.18em] text-softGold">Selected Product</p>
                        <p className="mt-2 text-lg font-semibold text-white">{product}</p>
                        <p className="mt-1 text-sm text-slate-300">{selectedQuantity} pieces</p>
                        <p className="mt-4 text-sm text-slate-400">No flavour allocation required.</p>
                      </div>
                    ) : (
                      <>
                    <div className="inline-flex rounded-xl border border-white/10 bg-[#0f0f0f] p-1">
                      {(['single', 'mixed'] as FlavourMode[]).map((flavourMode) => (
                        <button
                          key={flavourMode}
                          type="button"
                          onClick={() => setMode(flavourMode)}
                          className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${mode === flavourMode ? 'bg-gold text-charcoal' : 'text-slate-300'}`}
                        >
                          {flavourMode} Flavour
                        </button>
                      ))}
                    </div>

                    {mode === 'single' ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {flavours.map((flavour) => (
                          <button
                            key={flavour}
                            type="button"
                            onClick={() => setSingleFlavour(flavour)}
                            className={`rounded-[16px] border p-4 text-left text-sm font-semibold transition ${
                              singleFlavour === flavour ? 'border-gold bg-gold/10 text-white' : 'border-white/10 bg-[#0f0f0f] text-slate-300 hover:border-gold/40'
                            }`}
                          >
                            {flavour}
                            <span className="mt-2 block text-xs font-normal text-slate-500">x {selectedQuantity}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {mixedRows.map((row) => (
                          <div key={row.id} className="grid gap-3 rounded-[16px] border border-white/10 bg-[#0f0f0f] p-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
                            <label className="text-sm text-slate-300">
                              Flavour
                              <select
                                value={row.flavour}
                                onChange={(event) => setMixedRows((current) => current.map((item) => item.id === row.id ? { ...item, flavour: event.target.value } : item))}
                                className={inputClass}
                              >
                                {flavours.map((flavour) => <option key={flavour}>{flavour}</option>)}
                              </select>
                            </label>
                            <label className="text-sm text-slate-300">
                              Quantity
                              <input
                                type="number"
                                min={1}
                                value={row.quantity}
                                onChange={(event) => setMixedRows((current) => current.map((item) => item.id === row.id ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item))}
                                className={inputClass}
                              />
                            </label>
                            <button type="button" onClick={() => removeMixedRow(row.id)} className="rounded-xl border border-rose-500/20 px-3 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10">
                              Remove
                            </button>
                          </div>
                        ))}
                        <button type="button" onClick={addMixedRow} className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-sm font-medium text-softGold hover:bg-gold/10">
                          Add Flavour
                        </button>
                      </div>
                    )}

                    {(errors.flavour || errors.mixedRows) && <p className="text-sm text-rose-300">{errors.flavour || errors.mixedRows}</p>}
                    {assignedQuantity > selectedQuantity && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        Quantity exceeded. Reduce the flavour allocation by {assignedQuantity - selectedQuantity}.
                      </div>
                    )}
                      </>
                    )}
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-white/10 bg-[#0f0f0f] p-1.5">
                      {(['Delivery', 'Self Collect'] as DeliveryType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setDeliveryType(type);
                            if (type === 'Self Collect') setDeliveryFee(0);
                            if (type === 'Delivery' && deliveryFee === 0) setDeliveryFee(10);
                          }}
                          className={`rounded-xl px-4 py-3 text-sm font-semibold ${deliveryType === type ? 'bg-gold text-charcoal' : 'text-slate-300'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm text-slate-300">
                        {deliveryType} Date
                        <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className={inputClass} />
                        {errors.deliveryDate && <p className="mt-2 text-sm text-rose-300">{errors.deliveryDate}</p>}
                      </label>
                      <label className="text-sm text-slate-300">
                        {deliveryType} Time
                        <input type="time" value={deliveryTime} onChange={(event) => setDeliveryTime(event.target.value)} className={inputClass} />
                        {errors.deliveryTime && <p className="mt-2 text-sm text-rose-300">{errors.deliveryTime}</p>}
                      </label>
                    </div>
                    {deliveryType === 'Delivery' && (
                      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                        <label className="text-sm text-slate-300">
                          Delivery Address
                          <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Enter full delivery address" />
                          {errors.address && <p className="mt-2 text-sm text-rose-300">{errors.address}</p>}
                        </label>
                        <label className="text-sm text-slate-300">
                          Delivery Fee
                          <input type="number" min={0} step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(Math.max(0, Number(event.target.value) || 0))} className={inputClass} />
                        </label>
                      </div>
                    )}
                    <label className="block text-sm text-slate-300">
                      Order Notes
                      <textarea value={remark} onChange={(event) => setRemark(event.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Kitchen notes, packing request or customer instructions" />
                    </label>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm text-slate-300">Payment Method</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {paymentMethods.map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => {
                              setPaymentMethod(method);
                              if (method === 'Customer Wallet') setPaymentStatus('Paid');
                              setErrors((current) => ({ ...current, paymentMethod: '' }));
                            }}
                            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium ${paymentMethod === method ? 'border-gold bg-gold/10 text-white' : 'border-white/10 bg-[#0f0f0f] text-slate-300'}`}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                      {errors.paymentMethod && <p className="mt-3 text-sm text-rose-300">{errors.paymentMethod}</p>}
                      {paymentMethod === 'Customer Wallet' ? (
                        <div className={`mt-3 rounded-xl border p-4 ${selectedExistingCustomer?.id ? 'border-[#C8A96B]/30 bg-[#C8A96B]/5' : 'border-rose-500/25 bg-rose-500/5'}`}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-slate-400">Customer wallet balance</span>
                            <span className="font-semibold text-white">{formatCurrency(selectedExistingCustomer?.walletBalance || 0)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                            <span className="text-slate-400">Order total</span>
                            <span className="font-semibold text-[#E4C98E]">{formatCurrency(pricing.totalAmount)}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {selectedExistingCustomer?.id
                              ? selectedExistingCustomer.walletBalance >= pricing.totalAmount
                                ? 'Wallet payment will be deducted after the order is created.'
                                : 'Insufficient wallet balance'
                              : 'Select an existing customer in Step 1 to use wallet payment.'}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm text-slate-300">
                        Payment Status
                        <select value={paymentStatus} disabled={paymentMethod === 'Customer Wallet'} onChange={(event) => setPaymentStatus(event.target.value as Order['paymentStatus'])} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                          <option>Pending</option>
                          <option>Paid</option>
                          <option>Overdue</option>
                        </select>
                      </label>
                      <label className="text-sm text-slate-300">
                        Discount Type
                        <select
                          value={discountType}
                          onChange={(event) => {
                            setDiscountType(event.target.value as DiscountType);
                            setDiscountValue(0);
                            setDiscountReason('');
                          }}
                          className={inputClass}
                        >
                          <option value="none">None</option>
                          <option value="custom_unit_price">Custom Unit Price</option>
                          <option value="percentage">Percentage</option>
                          <option value="fixed_amount">Fixed Amount</option>
                          <option value="bulk_order">Bulk Order</option>
                        </select>
                      </label>
                    </div>

                    {discountType !== 'none' && discountType !== 'bulk_order' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm text-slate-300">
                          {discountType === 'custom_unit_price' ? 'Special Unit Price' : discountType === 'percentage' ? 'Discount Percentage' : 'Discount Amount'}
                          <input
                            type="number"
                            min={0}
                            max={discountType === 'percentage' ? 100 : undefined}
                            step="0.01"
                            value={discountValue}
                            onChange={(event) => setDiscountValue(discountType === 'percentage' ? Math.min(100, Math.max(0, Number(event.target.value) || 0)) : Math.max(0, Number(event.target.value) || 0))}
                            className={inputClass}
                          />
                        </label>
                        <label className="text-sm text-slate-300">
                          Discount Reason
                          <input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} className={inputClass} placeholder="Promotion or approval reason" />
                        </label>
                      </div>
                    )}

                    {discountType === 'bulk_order' && (
                      <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-slate-300">
                        Mini Tart tiers: 1-47 RM2.50, 48-95 RM2.30, 96-199 RM2.20, 200+ RM2.00.
                        <span className="ml-1 font-semibold text-softGold">Applied: {formatCurrency(pricing.finalUnitPrice)}</span>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 6 && (
                  <div className="space-y-4">
                    <div className="rounded-[16px] border border-gold/20 bg-gold/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-softGold">Final Confirmation</p>
                      <p className="mt-1 text-sm text-slate-300">Review every detail before creating the order.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] border border-white/10 bg-[#0f0f0f] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-softGold">Customer</p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p className="flex justify-between gap-3 text-slate-400"><span>Name</span><span className="text-right font-medium text-white">{customerName || 'Not provided'}</span></p>
                          <p className="flex justify-between gap-3 text-slate-400"><span>Phone</span><span className="text-right text-white">{phone || 'Not provided'}</span></p>
                        </div>
                      </div>
                      <div className="rounded-[16px] border border-white/10 bg-[#0f0f0f] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-softGold">Delivery / Collection</p>
                        <div className="mt-3 space-y-2 text-sm">
                          <p className="flex justify-between gap-3 text-slate-400"><span>Type</span><span className="text-right font-medium text-white">{deliveryType}</span></p>
                          <p className="flex justify-between gap-3 text-slate-400"><span>Date</span><span className="text-right text-white">{deliveryDate}</span></p>
                          <p className="flex justify-between gap-3 text-slate-400"><span>Time</span><span className="text-right text-white">{deliveryTime}</span></p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-[#0f0f0f] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-softGold">Address</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{deliveryType === 'Self Collect' ? 'Self Collect' : address}</p>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-[#0f0f0f] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-softGold">Order Items</p>
                          <p className="mt-1 font-semibold text-white">{product || 'No product selected'} - {selectedQuantity} pcs</p>
                        </div>
                        <button type="button" onClick={() => setCurrentStep(3)} className="text-sm text-softGold">Edit</button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedFlavourQuantities.map((item, index) => (
                          <div key={`${item.name}-${index}`} className="flex justify-between gap-3 text-sm text-slate-300">
                            <span>{item.name}</span>
                            <span>x {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-[#0f0f0f] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-softGold">Payment</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="flex justify-between gap-3 text-slate-400"><span>Payment status</span><span className="text-white">{paymentStatus}</span></p>
                        <p className="flex justify-between gap-3 text-slate-400"><span>Payment method</span><span className="text-white">{paymentMethod || 'Not selected'}</span></p>
                        <div className="my-3 border-t border-white/10" />
                        <p className="flex justify-between gap-3 text-slate-400"><span>Subtotal</span><span className="text-white">{formatCurrency(pricing.originalSubtotal)}</span></p>
                        <p className="flex justify-between gap-3 text-slate-400"><span>Discount</span><span className="text-white">- {formatCurrency(pricing.discountAmount)}</span></p>
                        <p className="flex justify-between gap-3 text-slate-400"><span>Delivery fee</span><span className="text-white">{formatCurrency(deliveryFee)}</span></p>
                        <p className="flex justify-between gap-3 border-t border-white/10 pt-3 text-base font-semibold text-white"><span>Total</span><span className="text-softGold">{formatCurrency(pricing.totalAmount)}</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <aside className="rounded-[20px] border border-gold/20 bg-[#111111] p-4 lg:sticky lg:top-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-softGold">Live Summary</p>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-400">Step {currentStep + 1}/7</span>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {highestCompletedStep === 0 && (
                    <div className="rounded-[16px] border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center">
                      <p className="font-medium text-white">Order summary is empty</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">Complete each step to build the order summary.</p>
                    </div>
                  )}

                  {highestCompletedStep >= 1 && (
                    <div className="border-b border-white/10 pb-3">
                      <p className="text-slate-500">Customer</p>
                      <p className="mt-1 truncate font-medium text-white">{customerName}</p>
                    </div>
                  )}

                  {highestCompletedStep >= 2 && (
                    <div className="border-b border-white/10 pb-3">
                      <p className="text-slate-500">Product</p>
                      <p className="mt-1 text-white">{product}</p>
                    </div>
                  )}

                  {highestCompletedStep >= 3 && (
                    <div className="border-b border-white/10 pb-3">
                      <p className="text-slate-500">Quantity</p>
                      <p className="mt-1 text-white">{selectedQuantity} pcs</p>
                    </div>
                  )}

                  {highestCompletedStep >= 4 && requiresFlavourAllocation && (
                    <div className="border-b border-white/10 pb-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Flavour allocation</span>
                        <span className={assignedQuantity === selectedQuantity ? 'text-emerald-300' : assignedQuantity > selectedQuantity ? 'text-rose-300' : 'text-softGold'}>
                          {assignedQuantity}/{selectedQuantity}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${assignedQuantity > selectedQuantity ? 'bg-rose-400' : 'bg-gold'}`}
                          style={{ width: `${Math.min((assignedQuantity / Math.max(selectedQuantity, 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {highestCompletedStep >= 4 && !requiresFlavourAllocation && (
                    <div className="border-b border-white/10 pb-3">
                      <p className="text-slate-500">Item</p>
                      <p className="mt-1 text-white">{product} x {selectedQuantity}</p>
                    </div>
                  )}

                  {highestCompletedStep >= 5 && (
                    <div className="border-b border-white/10 pb-3">
                      <p className="text-slate-500">Fulfilment</p>
                      <p className="mt-1 text-white">{deliveryType}</p>
                    </div>
                  )}

                  {highestCompletedStep >= 6 && (
                    <div className="border-b border-white/10 pb-3">
                      <p className="text-slate-500">Payment</p>
                      <p className="mt-1 text-white">{paymentMethod}</p>
                    </div>
                  )}

                  {highestCompletedStep >= 3 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{formatCurrency(pricing.originalSubtotal)}</span></div>
                      <div className="flex justify-between text-slate-400"><span>Discount</span><span>- {formatCurrency(pricing.discountAmount)}</span></div>
                      {highestCompletedStep >= 5 && (
                        <div className="flex justify-between text-slate-400"><span>Delivery</span><span>{formatCurrency(deliveryFee)}</span></div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-[16px] bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-softGold">Order Total</p>
                  <p className="mt-1 text-3xl font-semibold text-white">
                    {highestCompletedStep >= 3 ? formatCurrency(pricing.totalAmount) : formatCurrency(0)}
                  </p>
                </div>
              </aside>
            </div>
          </div>

          <footer className="border-t border-white/10 bg-[#0d0d0d] px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5">
                {successMessage && <p className="text-sm text-emerald-300">{successMessage}</p>}
                {errors.submit && <p className="text-sm text-rose-300">{errors.submit}</p>}
                {!successMessage && !errors.submit && <p className="text-sm text-slate-500">{wizardSteps[currentStep]} details</p>}
              </div>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button type="button" onClick={goBack} disabled={isCreating} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10">
                    Back
                  </button>
                )}
                {currentStep < wizardSteps.length - 1 ? (
                  <button type="button" onClick={goNext} className="ml-auto rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-charcoal hover:bg-[#b9985f]">
                    Continue
                  </button>
                ) : (
                  <button type="button" onClick={handleCreateOrder} disabled={isCreating || Boolean(createdOrderNo)} className="ml-auto rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-charcoal hover:bg-[#b9985f] disabled:cursor-not-allowed disabled:opacity-60">
                    {isCreating ? 'Creating...' : createdOrderNo ? 'Order Created' : 'Create Order'}
                  </button>
                )}
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
