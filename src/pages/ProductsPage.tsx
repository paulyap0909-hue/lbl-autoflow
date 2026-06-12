import React, { useEffect, useMemo, useState } from 'react';
import type { Product } from '../data/mockData';
import Toast from '../components/Toast';
import { saveToLocalStorage } from '../utils/localStorage';
import { formatRM, getProductUnitPrice } from '../utils/pricing';
import { supabase } from '../lib/supabase';
import {
  createProductInSupabase,
  deleteProductInSupabase,
  productFromRow,
  updateProductInSupabase
} from '../lib/productService';

type ProductsPageProps = {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  readOnly?: boolean;
};

type ProductFormState = {
  name: string;
  category: Product['category'];
  description: string;
  price: string;
  status: Product['status'];
  imageUrl: string;
};

const emptyForm: ProductFormState = {
  name: '',
  category: 'Mini Tart',
  description: '',
  price: '',
  status: 'Available',
  imageUrl: ''
};

const statusOptions: Product['status'][] = ['Available', 'Out of Stock', 'Seasonal', 'Premium'];
const categoryOptions: Product['category'][] = ['Mini Tart', 'Croissant Egg Tart'];
const placeholderImage = 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80';
const getProductImageUrl = (product: Product) => product.imageUrl || product.image_url || product.image || placeholderImage;

const statusClass = (status: Product['status']) => {
  if (status === 'Available') return 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20';
  if (status === 'Out of Stock') return 'bg-rose-500/10 text-rose-200 border-rose-500/20';
  if (status === 'Seasonal') return 'bg-sky-500/10 text-sky-200 border-sky-500/20';
  return 'bg-gold/10 text-softGold border-gold/20';
};

const productToForm = (product: Product): ProductFormState => ({
  name: product.name,
  category: product.category,
  description: product.description,
  price: String(getProductUnitPrice(product)),
  status: product.status,
  imageUrl: product.imageUrl || product.image_url || product.image || ''
});

function ProductModal({
  mode,
  form,
  setForm,
  onClose,
  onSubmit
}: {
  mode: 'add' | 'edit';
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const priceValue = Number(form.price);
  const canSave = form.name.trim() && form.description.trim() && Number.isFinite(priceValue) && priceValue > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-softGold">Product Catalog</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{mode === 'add' ? 'Add Product' : 'Edit Product'}</h3>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
            Close
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <label className="block text-sm text-slate-300">
              Product Name
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
                placeholder="Chocolate Noir Mini Tart"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-300">
                Category
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as Product['category'] }))}
                  className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
                >
                  {categoryOptions.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-300">
                Unit Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
                  placeholder="2.50"
                />
              </label>
            </div>

            <label className="block text-sm text-slate-300">
              Status
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Product['status'] }))}
                className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
              >
                {statusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={4}
                className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
                placeholder="Describe the product for the catalog."
              />
            </label>

            <label className="block text-sm text-slate-300">
              Image URL
              <input
                value={form.imageUrl}
                onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
                className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none focus:border-gold/60"
                placeholder={placeholderImage}
              />
            </label>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4">
            <div className="aspect-[4/3] overflow-hidden rounded-[24px] border border-white/10 bg-[#111111]">
              <img
                src={form.imageUrl.trim() || placeholderImage}
                alt="Product preview"
                className="h-full w-full object-cover"
                onError={(event) => {
                  if (event.currentTarget.src !== placeholderImage) event.currentTarget.src = placeholderImage;
                }}
              />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.24em] text-softGold">Preview</p>
            <h4 className="mt-2 text-lg font-semibold text-white">{form.name || 'New LBL Product'}</h4>
            <p className="mt-2 text-sm leading-6 text-slate-400">{form.description || 'Premium bakery item ready for your catalog.'}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(form.status)}`}>{form.status}</span>
              <span className="text-lg font-semibold text-white">{formatRM(Number(form.price) || 0)}</span>
            </div>
          </aside>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 p-6 sm:flex-row sm:items-center sm:justify-end">
          <button onClick={onClose} className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSave}
            className="rounded-3xl bg-gold px-6 py-3 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === 'add' ? 'Save Product' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ productName, onCancel, onConfirm }: { productName: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-softGold">Delete Product</p>
        <h3 className="mt-3 text-2xl font-semibold text-white">Are you sure you want to delete this product?</h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">{productName} will be removed from the Products page and saved catalog.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200 transition hover:bg-rose-500/20">
            Delete Product
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage({ products, setProducts, readOnly = false }: ProductsPageProps) {
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [dataSource, setDataSource] = useState<'Supabase' | 'localStorage'>('localStorage');
  const [supabaseError, setSupabaseError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const activeCount = useMemo(() => products.filter((product) => product.status !== 'Out of Stock').length, [products]);

  const persistProducts = (nextProducts: Product[]) => {
    setProducts(nextProducts);
    saveToLocalStorage('PRODUCTS', nextProducts);
  };

  useEffect(() => {
    let isMounted = true;

    const loadProducts = async () => {
      setIsLoadingProducts(true);
      setSupabaseError('');
      try {
        console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);

        const { data, error } = await supabase
          .from('products')
          .select('*');

        console.log("Supabase response:", data);
        if (error) {
  console.error('Supabase error:', error);
}

        if (error) throw error;

        if (!isMounted) return;
        const supabaseProducts = (data ?? []).map((row) => productFromRow(row));
        if (supabaseProducts.length > 0) {
          persistProducts(supabaseProducts);
          setDataSource('Supabase');
          setToast({ message: 'Products loaded from Supabase.', type: 'success' });
        } else {
          setDataSource('localStorage');
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load products from Supabase:', error);
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        setSupabaseError(message);
        setDataSource('localStorage');
        setToast({ message: `Supabase load failed: ${message}`, type: 'error' });
      } finally {
        if (isMounted) setIsLoadingProducts(false);
      }
    };

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const openAddModal = () => {
    if (readOnly) return;
    setForm(emptyForm);
    setEditingProductId(null);
    setModalMode('add');
  };

  const openEditModal = (product: Product) => {
    if (readOnly) return;
    setForm(productToForm(product));
    setEditingProductId(product.id);
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingProductId(null);
    setForm(emptyForm);
  };

  const handleSaveProduct = async () => {
    if (readOnly) {
      setToast({ message: 'Products are view only for this role.', type: 'info' });
      return;
    }

    const trimmedName = form.name.trim();
    const price = Number(form.price);
    const imageUrl = form.imageUrl.trim();

    if (!trimmedName || !form.description.trim() || !Number.isFinite(price) || price <= 0) {
      setToast({ message: 'Please complete product name, description and valid unit price.', type: 'error' });
      return;
    }

    setIsSavingProduct(true);

    if (modalMode === 'add') {
      const newProduct: Product = {
        id: `P-${Date.now().toString().slice(-6)}`,
        name: trimmedName,
        category: form.category,
        unit_price: parseFloat(price.toFixed(2)),
        imageUrl,
        image_url: imageUrl,
        image: imageUrl,
        status: form.status,
        flavours: [trimmedName],
        description: form.description.trim(),
        createdAt: new Date().toISOString().slice(0, 10)
      };
      try {
        const savedProduct = await createProductInSupabase(newProduct);
        persistProducts([savedProduct, ...products]);
        setDataSource('Supabase');
        setToast({ message: 'Product added to Supabase and localStorage.', type: 'success' });
      } catch (error) {
        console.error('Failed to save product to Supabase:', error);
        persistProducts([newProduct, ...products]);
        setDataSource('localStorage');
        setToast({ message: 'Supabase save failed. Product saved to localStorage fallback.', type: 'info' });
      }
    }

    if (modalMode === 'edit' && editingProductId) {
      const productToUpdate = products.find((product) => product.id === editingProductId);
      if (!productToUpdate) {
        setIsSavingProduct(false);
        return;
      }

      const updatedProduct: Product = {
        ...productToUpdate,
        name: trimmedName,
        category: form.category,
        unit_price: parseFloat(price.toFixed(2)),
        imageUrl,
        image_url: imageUrl,
        image: imageUrl,
        status: form.status,
        flavours: [trimmedName],
        description: form.description.trim()
      };

      try {
        const savedProduct = await updateProductInSupabase(updatedProduct);
        const nextProducts = products.map((product) =>
          product.id === editingProductId ? savedProduct : product
        );
        persistProducts(nextProducts);
        setDataSource('Supabase');
        setToast({ message: 'Product updated in Supabase and localStorage.', type: 'success' });
      } catch (error) {
        console.error('Failed to update product in Supabase:', error);
        const nextProducts = products.map((product) =>
        product.id === editingProductId
          ? updatedProduct
          : product
        );
        persistProducts(nextProducts);
        setDataSource('localStorage');
        setToast({ message: 'Supabase update failed. Product updated in localStorage fallback.', type: 'info' });
      }
    }

    setIsSavingProduct(false);
    closeModal();
  };

  const handleConfirmDelete = async () => {
    if (readOnly) {
      setToast({ message: 'Products are view only for this role.', type: 'info' });
      setProductToDelete(null);
      return;
    }
    if (!productToDelete) return;
    setIsSavingProduct(true);
    try {
      await deleteProductInSupabase(productToDelete.id);
      const nextProducts = products.filter((product) => product.id !== productToDelete.id);
      persistProducts(nextProducts);
      setDataSource('Supabase');
      setToast({ message: 'Product deleted from Supabase and localStorage.', type: 'success' });
    } catch (error) {
      console.error('Failed to delete product from Supabase:', error);
      const nextProducts = products.filter((product) => product.id !== productToDelete.id);
      persistProducts(nextProducts);
      setDataSource('localStorage');
      setToast({ message: 'Supabase delete failed. Product deleted from localStorage fallback.', type: 'info' });
    } finally {
      setIsSavingProduct(false);
      setProductToDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[20px] border border-white/10 bg-[#141414] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-softGold">Production Catalog</p>
            <h3 className="mt-1.5 text-2xl font-semibold text-white">Product Catalog</h3>
            <p className="mt-2 text-sm text-slate-400">Manage product pricing, categories, stock status, and premium tart offerings in one pane.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-slate-300">
              {activeCount} available for orders
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-slate-300">
              Source: {isLoadingProducts ? 'Loading...' : dataSource}
            </div>
            {readOnly ? (
              <div className="rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2.5 text-xs font-semibold text-softGold">
                View Only
              </div>
            ) : (
              <button onClick={openAddModal} className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-charcoal transition hover:bg-[#b9985f]">
                Add Product
              </button>
            )}
          </div>
        </div>
      </section>

      {supabaseError && (
        <section className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 p-4 shadow-panel">
          <p className="text-xs uppercase tracking-[0.28em] text-rose-200">Supabase connection error</p>
          <p className="mt-3 text-sm leading-6 text-rose-100">{supabaseError}</p>
          <p className="mt-3 text-sm text-slate-300">Products are currently shown from localStorage fallback.</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {products.map((product) => (
          <div key={product.id} className="overflow-hidden rounded-[18px] border border-white/10 bg-[#0f0f0f] shadow-panel transition hover:border-gold/30 hover:bg-[#141414]">
            <div className="h-44 w-full overflow-hidden bg-[#141414]">
              <img
                src={getProductImageUrl(product)}
                alt={product.name}
                className="h-full w-full object-cover"
                onError={(event) => {
                  if (event.currentTarget.src !== placeholderImage) event.currentTarget.src = placeholderImage;
                }}
              />
            </div>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{product.category}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(product.status)}`}>{product.status}</span>
              </div>
              <h4 className="text-lg font-semibold text-white">{product.name}</h4>
              <p className="mt-2 text-sm leading-5 text-slate-400">{product.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-softGold">Price</p>
                  <p className="text-2xl font-semibold text-white">{formatRM(getProductUnitPrice(product))}</p>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <button onClick={() => openEditModal(product)} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-200 transition hover:bg-white/10">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductToDelete(product)}
                      className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalMode && (
        <ProductModal
          mode={modalMode}
          form={form}
          setForm={setForm}
          onClose={closeModal}
          onSubmit={handleSaveProduct}
        />
      )}

      {productToDelete && (
        <DeleteConfirmModal
          productName={productToDelete.name}
          onCancel={() => setProductToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {isSavingProduct && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-3xl border border-white/10 bg-[#111111] px-5 py-3 text-sm text-slate-200 shadow-panel">
          Syncing product data...
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
