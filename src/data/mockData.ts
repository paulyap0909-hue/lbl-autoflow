export type FlavourQuantity = {
  name: string;
  quantity: number;
};

export type DiscountType = 'none' | 'custom_unit_price' | 'percentage' | 'fixed_amount' | 'bulk_order';

export type Order = {
  id: string;
  supabaseId?: string;
  customerId?: string | number;
  orderNo?: string;
  customerName: string;
  phone: string;
  product: 'Mini Tart' | 'Croissant Egg Tart';
  flavours: string[];
  flavourQuantities?: FlavourQuantity[];
  quantity: number;
  deliveryDate: string;
  deliveryTime: string;
  address: string;
  unitPrice: number;
  originalUnitPrice?: number;
  finalUnitPrice?: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
  discountReason?: string;
  originalSubtotal?: number;
  finalSubtotal?: number;
  deliveryFee: number;
  totalAmount: number;
  workflowStatus: 'New Order' | 'Pending Payment' | 'Paid' | 'Preparing' | 'Ready' | 'Out For Delivery' | 'Completed' | 'Cancelled';
  statusHistory: {
    status: 'New Order' | 'Pending Payment' | 'Paid' | 'Preparing' | 'Ready' | 'Out For Delivery' | 'Completed' | 'Cancelled';
    timestamp: string;
  }[];
  paymentStatus: 'Paid' | 'Pending' | 'Overdue';
  kitchenStatus: 'New' | 'Preparing' | 'Ready';
  deliveryStatus: 'Pending' | 'Assigned' | 'Out for Delivery' | 'Delivered';
  remark?: string;
};

export type Customer = {
  id?: string;
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  notes?: string;
  totalOrders: number;
  totalSpend: number;
  averageOrderValue?: number;
  firstOrderDate?: string;
  lastOrderDate: string;
  favouriteProduct: string;
  favouriteFlavour: string;
  status: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  customerTier?: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  customer_tier?: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  customerStatus?: 'Active' | 'Archived';
};

export type KitchenTask = {
  orderId: string;
  product: string;
  flavours: string[];
  flavourQuantities?: FlavourQuantity[];
  quantity: number;
  deliveryDate: string;
  deliveryTime: string;
  requiredReadyTime: string;
  kitchenStatus: 'New' | 'Preparing' | 'Ready';
};

export type DeliveryTask = {
  orderId: string;
  customerName: string;
  phone: string;
  address: string;
  deliveryDate: string;
  deliveryTime: string;
  driverName: string;
  deliveryStatus: 'Pending' | 'Assigned' | 'Out for Delivery' | 'Delivered';
};

export type AutomationRule = {
  title: string;
  description: string;
};

export type WhatsAppTemplate = {
  title: string;
  content: string;
};

export type SettingField = {
  label: string;
  value: string;
};

export type Product = {
  id: string;
  name: string;
  category: 'Mini Tart' | 'Croissant Egg Tart';
  unit_price: number;
  price?: number;
  imageUrl?: string;
  image_url?: string;
  image?: string;
  status: 'Available' | 'Out of Stock' | 'Seasonal' | 'Premium';
  flavours: string[];
  description: string;
  createdAt: string;
};

export const products: Product[] = [
  {
    id: 'P-001',
    name: 'Chocolate Noir Mini Tart',
    category: 'Mini Tart',
    unit_price: 2.5,
    image_url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=800&q=80',
    status: 'Premium',
    flavours: ['Chocolate Noir'],
    description: 'Rich dark chocolate shell with a silky ganache finish.',
    createdAt: '2026-05-18'
  },
  {
    id: 'P-002',
    name: 'Honey Brûlée Mini Tart',
    category: 'Mini Tart',
    unit_price: 2.5,
    image_url: 'https://images.unsplash.com/photo-1548345680-0e2b96dae8f1?auto=format&fit=crop&w=800&q=80',
    status: 'Available',
    flavours: ['Honey Brûlée'],
    description: 'Caramelised sugar crust with floral honey custard.',
    createdAt: '2026-04-05'
  },
  {
    id: 'P-003',
    name: 'Matcha Red Bean Mini Tart',
    category: 'Mini Tart',
    unit_price: 2.5,
    image_url: 'https://images.unsplash.com/photo-1543514003-7d5a0e0d8f80?auto=format&fit=crop&w=800&q=80',
    status: 'Seasonal',
    flavours: ['Matcha Red Bean'],
    description: 'Uji matcha cream paired with sweet red bean paste.',
    createdAt: '2026-05-01'
  },
  {
    id: 'P-004',
    name: 'Golden Corn Croissant Egg Tart',
    category: 'Croissant Egg Tart',
    unit_price: 11.8,
    image_url: 'https://images.unsplash.com/photo-1606755962777-8d4f8b21d607?auto=format&fit=crop&w=800&q=80',
    status: 'Available',
    flavours: ['Golden Corn'],
    description: 'Buttery croissant base with creamy golden corn filling.',
    createdAt: '2026-05-20'
  },
  {
    id: 'P-005',
    name: 'Velvet Taro Croissant Egg Tart',
    category: 'Croissant Egg Tart',
    unit_price: 11.8,
    image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    status: 'Seasonal',
    flavours: ['Velvet Taro'],
    description: 'Soft taro custard wrapped in flaky croissant layers.',
    createdAt: '2026-04-12'
  },
  {
    id: 'P-006',
    name: 'Caramel Lava Croissant Egg Tart',
    category: 'Croissant Egg Tart',
    unit_price: 11.8,
    image_url: 'https://images.unsplash.com/photo-1512058564366-c9e1ed6d555c?auto=format&fit=crop&w=800&q=80',
    status: 'Premium',
    flavours: ['Caramel Lava'],
    description: 'Molten caramel centre with crisp croissant pastry.',
    createdAt: '2026-05-08'
  }
];

export const orderList: Order[] = [
  {
    id: 'LBL-1001',
    customerName: 'Walk-in Customer 1',
    phone: '+60 12-345 6789',
    product: 'Mini Tart',
    flavours: ['Chocolate Noir', 'Lime Cheese'],
    flavourQuantities: [
      { name: 'Chocolate Noir', quantity: 12 },
      { name: 'Lime Cheese', quantity: 12 }
    ],
    quantity: 24,
    deliveryDate: '2026-06-03',
    deliveryTime: '10:30 AM',
    address: 'Jalan Bukit Bintang, Kuala Lumpur',
    unitPrice: 2.5,
    deliveryFee: 10,
    totalAmount: 70,
    workflowStatus: 'Pending Payment',
    statusHistory: [
      { status: 'New Order', timestamp: '2026-06-03 08:45' },
      { status: 'Pending Payment', timestamp: '2026-06-03 08:47' }
    ],
    paymentStatus: 'Pending',
    kitchenStatus: 'New',
    deliveryStatus: 'Pending',
    remark: 'Gift set packaging'
  },
  {
    id: 'LBL-1002',
    customerName: 'Walk-in Customer 2',
    phone: '+60 19-876 5432',
    product: 'Croissant Egg Tart',
    flavours: ['Caramel Lava'],
    flavourQuantities: [
      { name: 'Caramel Lava', quantity: 12 }
    ],
    quantity: 12,
    deliveryDate: '2026-06-03',
    deliveryTime: '1:00 PM',
    address: 'No. 28, Jalan Sultan Ismail, KL',
    unitPrice: 11.8,
    deliveryFee: 12,
    totalAmount: 149.6,
    workflowStatus: 'Preparing',
    statusHistory: [
      { status: 'New Order', timestamp: '2026-06-03 09:10' },
      { status: 'Pending Payment', timestamp: '2026-06-03 09:12' },
      { status: 'Paid', timestamp: '2026-06-03 09:20' },
      { status: 'Preparing', timestamp: '2026-06-03 09:30' }
    ],
    paymentStatus: 'Paid',
    kitchenStatus: 'Preparing',
    deliveryStatus: 'Assigned',
    remark: 'Extra napkins'
  },
  {
    id: 'LBL-1003',
    customerName: 'Walk-in Customer 3',
    phone: '+60 11-223 3445',
    product: 'Mini Tart',
    flavours: ['Matcha Red Bean', 'Biscoff'],
    flavourQuantities: [
      { name: 'Matcha Red Bean', quantity: 18 },
      { name: 'Biscoff', quantity: 18 }
    ],
    quantity: 36,
    deliveryDate: '2026-06-03',
    deliveryTime: '4:00 PM',
    address: 'Mont Kiara, Kuala Lumpur',
    unitPrice: 2.5,
    deliveryFee: 14,
    totalAmount: 104,
    workflowStatus: 'Out For Delivery',
    statusHistory: [
      { status: 'New Order', timestamp: '2026-06-03 10:05' },
      { status: 'Pending Payment', timestamp: '2026-06-03 10:07' },
      { status: 'Paid', timestamp: '2026-06-03 10:15' },
      { status: 'Preparing', timestamp: '2026-06-03 10:20' },
      { status: 'Ready', timestamp: '2026-06-03 10:45' },
      { status: 'Out For Delivery', timestamp: '2026-06-03 11:10' }
    ],
    paymentStatus: 'Overdue',
    kitchenStatus: 'Ready',
    deliveryStatus: 'Out for Delivery'
  }
];

export const customers: Customer[] = [];

export const kitchenTasks: KitchenTask[] = [
  {
    orderId: 'LBL-1001',
    product: 'Mini Tart',
    flavours: ['Chocolate Noir', 'Lime Cheese'],
    flavourQuantities: [
      { name: 'Chocolate Noir', quantity: 12 },
      { name: 'Lime Cheese', quantity: 12 }
    ],
    quantity: 24,
    deliveryDate: '2026-06-03',
    deliveryTime: '10:30 AM',
    requiredReadyTime: '10:30 AM',
    kitchenStatus: 'New'
  },
  {
    orderId: 'LBL-1002',
    product: 'Croissant Egg Tart',
    flavours: ['Caramel Lava'],
    flavourQuantities: [
      { name: 'Caramel Lava', quantity: 12 }
    ],
    quantity: 12,
    deliveryDate: '2026-06-03',
    deliveryTime: '1:00 PM',
    requiredReadyTime: '12:00 PM',
    kitchenStatus: 'Preparing'
  },
  {
    orderId: 'LBL-1003',
    product: 'Mini Tart',
    flavours: ['Matcha Red Bean', 'Biscoff'],
    flavourQuantities: [
      { name: 'Matcha Red Bean', quantity: 18 },
      { name: 'Biscoff', quantity: 18 }
    ],
    quantity: 36,
    deliveryDate: '2026-06-03',
    deliveryTime: '4:00 PM',
    requiredReadyTime: '3:30 PM',
    kitchenStatus: 'Ready'
  }
];

export const deliveryTasks: DeliveryTask[] = [
  {
    orderId: 'LBL-1002',
    customerName: 'Walk-in Customer 2',
    phone: '+60 19-876 5432',
    address: 'No. 28, Jalan Sultan Ismail, KL',
    deliveryDate: '2026-06-03',
    deliveryTime: '1:00 PM',
    driverName: 'Ibrahim',
    deliveryStatus: 'Assigned'
  },
  {
    orderId: 'LBL-1003',
    customerName: 'Walk-in Customer 3',
    phone: '+60 11-223 3445',
    address: 'Mont Kiara, Kuala Lumpur',
    deliveryDate: '2026-06-03',
    deliveryTime: '4:00 PM',
    driverName: 'Siti',
    deliveryStatus: 'Out for Delivery'
  }
];

export const automationRules: AutomationRule[] = [
  {
    title: 'New order created',
    description: 'Create invoice automatically for new orders.'
  },
  {
    title: 'Invoice created',
    description: 'Send WhatsApp notification to customer.'
  },
  {
    title: 'Payment pending after 2 hours',
    description: 'Send payment reminder automatically.'
  },
  {
    title: 'Payment paid',
    description: 'Notify kitchen to begin preparation.'
  },
  {
    title: 'Kitchen ready',
    description: 'Notify driver with delivery details.'
  },
  {
    title: 'Driver out for delivery',
    description: 'Notify customer with tracking update.'
  }
];

export const whatsappTemplates: WhatsAppTemplate[] = [
  {
    title: 'Order Confirmation',
    content: 'Thank you for ordering with LBL. Your order is confirmed and we are preparing it for delivery.'
  },
  {
    title: 'Payment Reminder',
    content: 'Hi, your order is awaiting payment. Please complete the payment to confirm delivery.'
  },
  {
    title: 'Kitchen Notification',
    content: 'New order received in the kitchen. Please begin preparation according to the schedule.'
  },
  {
    title: 'Driver Notification',
    content: 'A new delivery is assigned to you. Please collect the order and deliver on time.'
  },
  {
    title: 'Out for Delivery',
    content: 'Your order is now out for delivery. It will arrive shortly.'
  },
  {
    title: 'Feedback Request',
    content: 'We hope you enjoyed your LBL treats. Please share your feedback with us.'
  }
];

export const settingsFields: SettingField[] = [
  { label: 'WhatsApp Business Cloud API', value: 'Disabled' },
  { label: 'Google Sheets Integration', value: 'Mock Setup' },
  { label: 'Google Drive Sync', value: 'Mock Setup' },
  { label: 'Payment QR Code', value: 'Not Configured' },
  { label: 'Company Details', value: 'LBL Bakery, Kuala Lumpur' }
];
