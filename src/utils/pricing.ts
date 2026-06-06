import type { Product } from '../data/mockData';

export const toSafeNumber = (value: unknown) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

export const getProductUnitPrice = (product: Product) => {
  const value = product.unit_price ?? product.price ?? 0;
  return toSafeNumber(value);
};

export const formatRM = (value: number | string | null | undefined) => {
  return `RM${toSafeNumber(value).toFixed(2)}`;
};
