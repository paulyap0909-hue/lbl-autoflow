import type { Product } from '../data/mockData';
import { getProductUnitPrice, toSafeNumber } from '../utils/pricing';
import { supabase } from './supabase';

type ProductRow = {
  id: string;
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
};

const TABLE_NAME = 'products';

const normalizeStatus = (status: ProductRow['status']): Product['status'] => {
  if (status === 'Active') return 'Available';
  return status ?? 'Available';
};

export const productFromRow = (row: ProductRow): Product => ({
  id: row.id,
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
  createdAt: row.created_at || row.createdAt || new Date().toISOString().slice(0, 10)
});

const getProductImageValue = (product: Product) => product.imageUrl || product.image_url || product.image || '';

export const productToRow = (product: Product) => ({
  name: product.name,
  category: product.category,
  unit_price: getProductUnitPrice(product),
  image_url: getProductImageValue(product),
  status: product.status,
  flavours: product.flavours,
  description: product.description,
});

export async function loadProductsFromSupabase() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => productFromRow(row as ProductRow));
}

export async function createProductInSupabase(product: Product) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(productToRow(product))
    .select()
    .single();

  if (error) throw error;
  return productFromRow(data as ProductRow);
}

export async function updateProductInSupabase(product: Product) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(productToRow(product))
    .eq('id', product.id)
    .select()
    .single();

  if (error) throw error;
  return productFromRow(data as ProductRow);
}

export async function deleteProductInSupabase(productId: string) {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', productId);
  if (error) throw error;
}
