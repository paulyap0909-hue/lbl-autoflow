import type { Order, Customer, Product, KitchenTask, DeliveryTask, WhatsAppTemplate, SettingField } from '../data/mockData';
import { getProductUnitPrice } from './pricing';

const STORAGE_KEYS = {
  ORDERS: 'lbl_orders',
  CUSTOMERS: 'lbl_customers',
  PRODUCTS: 'lbl_products',
  KITCHEN_TASKS: 'lbl_kitchen_tasks',
  DELIVERY_TASKS: 'lbl_delivery_tasks',
  WHATSAPP_TEMPLATES: 'lbl_whatsapp_templates',
  SETTINGS: 'lbl_settings'
};

export const loadFromLocalStorage = () => {
  try {
    const products = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRODUCTS) || '[]') as Product[];

    return {
      orders: JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]') as Order[],
      customers: JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[],
      products: products.map((product) => ({
        ...product,
        unit_price: getProductUnitPrice(product),
        imageUrl: product.imageUrl || product.image_url || product.image || '',
        image_url: product.imageUrl || product.image_url || product.image || '',
        image: product.imageUrl || product.image_url || product.image || '',
        status: product.status === ('Active' as Product['status']) ? 'Available' : product.status
      })),
      kitchenTasks: JSON.parse(localStorage.getItem(STORAGE_KEYS.KITCHEN_TASKS) || '[]') as KitchenTask[],
      deliveryTasks: JSON.parse(localStorage.getItem(STORAGE_KEYS.DELIVERY_TASKS) || '[]') as DeliveryTask[],
      whatsappTemplates: JSON.parse(localStorage.getItem(STORAGE_KEYS.WHATSAPP_TEMPLATES) || '[]') as WhatsAppTemplate[],
      settings: JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '[]') as SettingField[]
    };
  } catch {
    return {
      orders: [],
      customers: [],
      products: [],
      kitchenTasks: [],
      deliveryTasks: [],
      whatsappTemplates: [],
      settings: []
    };
  }
};

export const saveToLocalStorage = (key: keyof typeof STORAGE_KEYS, data: unknown) => {
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error);
  }
};

export const saveAllToLocalStorage = (
  orders: Order[],
  customers: Customer[],
  products: Product[],
  kitchenTasks: KitchenTask[],
  deliveryTasks: DeliveryTask[],
  whatsappTemplates: WhatsAppTemplate[],
  settings: SettingField[]
) => {
  try {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    localStorage.setItem(STORAGE_KEYS.KITCHEN_TASKS, JSON.stringify(kitchenTasks));
    localStorage.setItem(STORAGE_KEYS.DELIVERY_TASKS, JSON.stringify(deliveryTasks));
    localStorage.setItem(STORAGE_KEYS.WHATSAPP_TEMPLATES, JSON.stringify(whatsappTemplates));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save data to localStorage:', error);
  }
};

export const clearLocalStorage = () => {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};

export const exportBackupJSON = (
  orders: Order[],
  customers: Customer[],
  products: Product[],
  kitchenTasks: KitchenTask[],
  deliveryTasks: DeliveryTask[],
  whatsappTemplates: WhatsAppTemplate[],
  settings: SettingField[]
) => {
  const backup = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: {
      orders,
      customers,
      products,
      kitchenTasks,
      deliveryTasks,
      whatsappTemplates,
      settings
    }
  };

  const dataStr = JSON.stringify(backup, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lbl-autoflow-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importBackupJSON = (file: File): Promise<{
  orders: Order[];
  customers: Customer[];
  products: Product[];
  kitchenTasks: KitchenTask[];
  deliveryTasks: DeliveryTask[];
  whatsappTemplates: WhatsAppTemplate[];
  settings: SettingField[];
}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backup = JSON.parse(event.target?.result as string);
        resolve(backup.data);
      } catch (error) {
        reject(new Error('Invalid backup file format'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};
