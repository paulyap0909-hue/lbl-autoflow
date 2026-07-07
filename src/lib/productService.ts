import type { Product } from '../data/mockData';
import { getProductUnitPrice, toSafeNumber } from '../utils/pricing';
import { supabase } from './supabase';

type ProductRow = {
  id: string | number;
  name: string;
  category: Product['category'];
  unit_price?: number | string | null;
  price?: number | string | null;
  imageUrl?: string | null;
  image?: string | null;
  image_url?: string | null;
  status?: Product['status'] | 'Active' | null;
  flavours?: string[] | null;
  description?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  sort_order?: number | string | null;
  sortOrder?: number | string | null;
};

const TABLE_NAME = 'products';

const normalizeStatus = (status: ProductRow['status']): Product['status'] => {
  if (status === 'Active') return 'Available';
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'available') return 'Available';
  if (normalized === 'unavailable' || normalized === 'inactive') return 'Unavailable';
  if (normalized === 'out of stock') return 'Out of Stock';
  if (normalized === 'seasonal') return 'Seasonal';
  if (normalized === 'premium') return 'Premium';
  return 'Available';
};

export const productFromRow = (row: ProductRow): Product => ({
  id: String(row.id),
  name: row.name,
  category: row.category,
  unit_price: toSafeNumber(row.unit_price ?? row.price ?? 0),
  price: row.price == null ? undefined : toSafeNumber(row.price),
  imageUrl: row.image_url || row.imageUrl || row.image || '',
  image_url: row.image_url || row.imageUrl || row.image || '',
  image: row.image_url || row.imageUrl || row.image || '',
  status: normalizeStatus(row.status),
  flavours: row.flavours?.length ? row.flavours : [row.name],
  description: row.description || '',
  createdAt: row.created_at || row.createdAt || new Date().toISOString().slice(0, 10),
  updatedAt: row.updated_at || row.updatedAt || undefined,
  sortOrder: row.sort_order == null && row.sortOrder == null
    ? undefined
    : toSafeNumber(row.sort_order ?? row.sortOrder)
});

const getProductImageValue = (product: Product) => product.imageUrl || product.image_url || product.image || '';

export const productToRow = (product: Product, includeOptionalColumns = true) => ({
  name: product.name,
  category: product.category,
  unit_price: getProductUnitPrice(product),
  image_url: getProductImageValue(product),
  status: product.status,
  flavours: product.flavours,
  description: product.description,
  ...(includeOptionalColumns ? {
    updated_at: new Date().toISOString(),
    ...(product.sortOrder == null ? {} : { sort_order: product.sortOrder })
  } : {})
});

const isMissingOptionalProductColumn = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST204'
  && ['sort_order', 'updated_at'].some((column) => String(error.message ?? '').includes(column));

export async function loadProductsFromSupabase() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? [])
    .map((row) => productFromRow(row as ProductRow))
    .sort((first, second) =>
      (first.sortOrder ?? Number.MAX_SAFE_INTEGER) - (second.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || first.name.localeCompare(second.name)
    );
}

export async function createProductInSupabase(product: Product) {
  let { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(productToRow(product))
    .select()
    .single();

  if (isMissingOptionalProductColumn(error)) {
    const retry = await supabase
      .from(TABLE_NAME)
      .insert(productToRow(product, false))
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return productFromRow(data as ProductRow);
}

export async function updateProductInSupabase(product: Product) {
  let { data, error } = await supabase
    .from(TABLE_NAME)
    .update(productToRow(product))
    .eq('id', product.id)
    .select()
    .single();

  if (isMissingOptionalProductColumn(error)) {
    const retry = await supabase
      .from(TABLE_NAME)
      .update(productToRow(product, false))
      .eq('id', product.id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return productFromRow(data as ProductRow);
}

export async function deleteProductInSupabase(productId: string) {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', productId);
  if (error) throw error;
}
