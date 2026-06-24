import React, { useMemo, useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import CustomersPage from './pages/CustomersPage';
import ProductsPage from './pages/ProductsPage';
import InvoicePage from './pages/InvoicePage';
import KitchenQueuePage from './pages/KitchenQueuePage';
import DeliveryPage from './pages/DeliveryPage';
import AutomationCenterPage from './pages/AutomationCenterPage';
import WhatsAppTemplatesPage from './pages/WhatsAppTemplatesPage';
import EventPage from './pages/EventPage';
import SalesCRMPage from './pages/SalesCRMPage';
import QuotationPage from './pages/QuotationPage';
import RecipeCalculatorPage from './pages/RecipeCalculatorPage';
import ProductionCenterPage from './pages/ProductionCenterPage';
import CorporateAccountsPage from './pages/CorporateAccountsPage';
import ReportsPage from './pages/ReportsPage';
import WhatsAppAssistant from './pages/WhatsAppAssistantInbox';
import MetaAdsCenterPage from './pages/MetaAdsCenterPage';
import LoginPage, { type CurrentUser, type UserRole } from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import { supabase } from './lib/supabase';
import {
  automationRules,
  deliveryTasks as deliveryData,
  kitchenTasks as kitchenData,
  orderList as orderData,
  products as productData,
  settingsFields as settingsData,
  whatsappTemplates as templateData
} from './data/mockData';
import type { Order, Product, Customer, KitchenTask, DeliveryTask, WhatsAppTemplate, SettingField } from './data/mockData';
import { loadFromLocalStorage, saveAllToLocalStorage, clearLocalStorage, exportBackupJSON, importBackupJSON } from './utils/localStorage';
import { createOrderOperationalWorkflow, deleteOrderFromSupabase, loadOrdersFromSupabase, markOrderPaid as markOrderPaidInSupabase, orderFromRow, updateOrderInSupabase, type OrderOperationalWorkflowResult } from './services/orderService';
import { loadCustomersFromSupabase } from './services/customerService';
import { loadKitchenTasksFromSupabase, syncKitchenStatusForOrder, type KitchenTaskUpdateContext } from './services/kitchenService';
import { createDeliveryTaskForOrder, isSelfCollectOrder, loadDeliveryTasksFromSupabase, updateDeliveryTaskStatus, type DeliveryDriverDetails } from './services/deliveryService';
import { loadInvoicesFromSupabase, type InvoiceRecord } from './services/invoiceService';
import { createAutomationLog, loadAutomationLogsFromSupabase } from './services/automationLogService';
import { loadFollowUpTasksFromSupabase } from './services/followUpTaskService';
import { isActiveOrder, isOrderRecordAvailable } from './utils/orderLifecycle';
import { loadProductsFromSupabase } from './lib/productService';

const pageTitles: Record<string, string> = {
  dashboard: 'Command Center',
  orders: 'Orders',
  customers: 'Customers',
  products: 'Products',
  invoices: 'Invoices',
  kitchen: 'Kitchen Queue',
  delivery: 'Delivery',
  events: 'Events',
  'sales-crm': 'Lead Center',
  quotations: 'Quotations',
  'production-center': 'Production Center',
  'recipe-calculator': 'Recipe Calculator',
  'cost-profit-calculator': 'Cost & Profit Calculator',
  'corporate-accounts': 'Corporate Accounts',
  'whatsapp-assistant': 'WhatsApp Assistant',
  reports: 'Reports Center',
  'meta-ads': 'Meta Ads Center',
  automation: 'Automation Center',
  templates: 'WhatsApp Templates',
  settings: 'Settings'
};

const visibleWorkspacePages = [
  'dashboard',
  'orders',
  'kitchen',
  'delivery',
  'invoices',
  'customers',
  'sales-crm',
  'corporate-accounts',
  'whatsapp-assistant',
  'quotations',
  'reports',
  'meta-ads',
  'products',
  'recipe-calculator',
  'cost-profit-calculator',
  'quotations'
];

const rolePermissions: Record<UserRole, string[]> = {
  admin: visibleWorkspacePages,
  sales: visibleWorkspacePages
};

const resolveUserRole = (email: string, metadataRole?: unknown): UserRole => {
  if (metadataRole === 'admin' || metadataRole === 'sales') return metadataRole;
  return email.toLowerCase() === 'paulyap0909@gmail.com' ? 'admin' : 'sales';
};

const currentUserFromAuthUser = (authUser?: {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null): CurrentUser | null => {
  const email = authUser?.email?.trim();
  if (!email) return null;
  const metadataRole = authUser?.app_metadata?.role || authUser?.user_metadata?.role;
  return {
    email,
    role: resolveUserRole(email, metadataRole)
  };
};

const syncLegacyCurrentUserLabel = (user: CurrentUser | null) => {
  try {
    if (user) {
      localStorage.setItem('lbl_currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('lbl_currentUser');
    }
  } catch (error) {
    console.error('Failed to sync current user label:', error);
  }
};

function AccessDenied() {
  return (
    <section className="flex min-h-[420px] items-center justify-center rounded-[32px] border border-white/10 bg-[#141414] p-8 text-center shadow-panel">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-softGold">Access Denied</p>
        <h3 className="mt-4 text-3xl font-semibold text-white">Access Denied</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
          Your current role does not have permission to open this page.
        </p>
      </div>
    </section>
  );
}

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Initialize state from localStorage, fallback to mock data
  const [isInitialized, setIsInitialized] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderSource, setOrderSource] = useState<'Supabase' | 'localStorage'>('localStorage');
  const [orderError, setOrderError] = useState('');
  const [customerSource, setCustomerSource] = useState<'Supabase' | 'localStorage'>('Supabase');
  const [products, setProducts] = useState<Product[]>(productData);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [kitchenTasks, setKitchenTasks] = useState<KitchenTask[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<DeliveryTask[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>(templateData);
  const [settings, setSettings] = useState<SettingField[]>(settingsData);
  const [followUpBadge, setFollowUpBadge] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let hasLoadedInitialSession = false;

    const initializeAuthSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!isMounted) return;
        const user = currentUserFromAuthUser(data.session?.user);
        setCurrentUser(user);
        syncLegacyCurrentUserLabel(user);
      } catch (error) {
        console.error('Failed to load Supabase auth session:', error);
        if (isMounted) {
          setCurrentUser(null);
          syncLegacyCurrentUserLabel(null);
        }
      } finally {
        hasLoadedInitialSession = true;
        if (isMounted) setAuthLoading(false);
      }
    };

    initializeAuthSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const user = currentUserFromAuthUser(session?.user);
      setCurrentUser(user);
      syncLegacyCurrentUserLabel(user);
      setActivePage((page) => (user && rolePermissions[user.role].includes(page) ? page : 'dashboard'));
      if (!user) {
        setIsInitialized(false);
        setMobileMenuOpen(false);
        setOrders([]);
        setCustomers([]);
        setKitchenTasks([]);
        setDeliveryTasks([]);
        setInvoices([]);
        setFollowUpBadge(0);
      }
      if (event !== 'INITIAL_SESSION' || hasLoadedInitialSession) {
        setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const repairMissingDeliveryTasks = async (
    sourceOrders: Order[],
    sourceDeliveryTasks: DeliveryTask[]
  ) => {
    const deliveryTaskKeys = new Set(
      (sourceDeliveryTasks as Array<DeliveryTask & Record<string, unknown>>)
        .flatMap((task) => [task.orderId, task.order_no, task.order_id])
        .filter((value) => value !== null && value !== undefined && String(value).trim())
        .map((value) => String(value))
    );

    const missingDeliveryOrders = sourceOrders.filter((order) => {
      const orderKeys = [order.id, order.orderNo, order.supabaseId]
        .filter((value) => value !== null && value !== undefined && String(value).trim())
        .map((value) => String(value));

      return isActiveOrder(order)
        && !isSelfCollectOrder(order)
        && !orderKeys.some((key) => deliveryTaskKeys.has(key));
    });

    if (missingDeliveryOrders.length === 0) return sourceDeliveryTasks;

    console.warn('Missing delivery tasks detected. Repairing delivery workflow records.', {
      count: missingDeliveryOrders.length,
      orders: missingDeliveryOrders.map((order) => ({
        orderId: order.supabaseId,
        orderNo: order.orderNo || order.id,
        customer: order.customerName,
        deliveryDate: order.deliveryDate,
        deliveryTime: order.deliveryTime
      }))
    });

    const repairResults = await Promise.allSettled(
      missingDeliveryOrders.map((order) => createDeliveryTaskForOrder(order))
    );

    repairResults.forEach((result, index) => {
      const order = missingDeliveryOrders[index];
      if (result.status === 'rejected') {
        console.error('Delivery Task Failed', {
          orderId: order.supabaseId,
          orderNo: order.orderNo || order.id,
          error: result.reason
        });
      } else if (result.value) {
        console.log('Delivery Task Created', {
          orderId: order.supabaseId,
          orderNo: order.orderNo || order.id,
          task: result.value
        });
      }
    });

    return loadDeliveryTasksFromSupabase();
  };

  useEffect(() => {
    if (authLoading || !currentUser) {
      setFollowUpBadge(0);
      return;
    }

    const refreshFollowUpBadge = async () => {
      try {
        const tasks = await loadFollowUpTasksFromSupabase();
        const today = new Date().toISOString().slice(0, 10);
        setFollowUpBadge(tasks.filter((task) => task.status === 'Overdue' || (task.dueDate === today && task.status !== 'Completed')).length);
      } catch (error) {
        console.error('Follow-up badge load error:', error);
      }
    };

    refreshFollowUpBadge();
    window.addEventListener('lbl:follow-up-tasks-updated', refreshFollowUpBadge);
    return () => window.removeEventListener('lbl:follow-up-tasks-updated', refreshFollowUpBadge);
  }, [authLoading, currentUser?.email]);

  // Load orders from Supabase first, then fall back to localStorage.
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setIsInitialized(false);
      return;
    }

    let isMounted = true;

    const initializeData = async () => {
      setIsInitialized(false);
      const savedData = loadFromLocalStorage();
      const normalizedSavedOrders = savedData.orders.map((order) => orderFromRow(order));
      localStorage.removeItem('lbl_customers');

      if (savedData.orders.length > 0 || localStorage.getItem('lbl_orders')) {
        setProducts(savedData.products);
        setWhatsappTemplates(savedData.whatsappTemplates);
        setSettings(savedData.settings);
      }

      try {
        const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices, supabaseProducts] = await Promise.all([
          loadOrdersFromSupabase(),
          loadCustomersFromSupabase(),
          loadKitchenTasksFromSupabase(),
          loadDeliveryTasksFromSupabase(),
          loadInvoicesFromSupabase(),
          loadProductsFromSupabase(),
          loadAutomationLogsFromSupabase()
        ]);
        const repairedDeliveryTasks = await repairMissingDeliveryTasks(supabaseOrders, supabaseDeliveryTasks);
        if (!isMounted) return;
        setOrders(supabaseOrders);
        setKitchenTasks(supabaseKitchenTasks);
        setDeliveryTasks(repairedDeliveryTasks);
        setInvoices(supabaseInvoices);
        setProducts(supabaseProducts);
        setCustomers(supabaseCustomers);
        setOrderSource('Supabase');
        setCustomerSource('Supabase');
        setOrderError('');
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load orders from Supabase:', error);
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        setOrders(normalizedSavedOrders);
        setKitchenTasks([]);
        setDeliveryTasks([]);
        console.log("Customers loaded from Supabase:", []);
        setCustomers(savedData.customers);
        setOrderSource('localStorage');
        setCustomerSource('localStorage');
        setOrderError(message);
      } finally {
        if (isMounted) setIsInitialized(true);
      }
    };

    initializeData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, currentUser?.email]);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (isInitialized) {
      saveAllToLocalStorage(orders, customers, products, kitchenTasks, deliveryTasks, whatsappTemplates, settings);
    }
  }, [orders, customers, products, kitchenTasks, deliveryTasks, whatsappTemplates, settings, isInitialized]);
const reloadOrdersFromSupabase = async () => {
  if (!currentUser) return;
  const supabaseOrders = await loadOrdersFromSupabase();
  console.log('Orders loaded from Supabase:', supabaseOrders);
  setOrders(supabaseOrders);
  setOrderSource('Supabase');
  setOrderError('');
};

useEffect(() => {
  if (authLoading || !currentUser) return;
  if (activePage !== 'orders') return;

  reloadOrdersFromSupabase();
}, [activePage, authLoading, currentUser?.email]);

useEffect(() => {
  if (authLoading || !currentUser) return;
  if (activePage !== 'dashboard') return;

  loadInvoicesFromSupabase()
    .then(setInvoices)
    .catch((error) => console.error('Dashboard invoice refresh error:', error));
}, [activePage, authLoading, currentUser?.email]);

  const allowedPages = currentUser ? rolePermissions[currentUser.role] : [];
  const hasPageAccess = currentUser ? allowedPages.includes(activePage) : false;
  const isSalesUser = currentUser?.role === 'sales';

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };

    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  const handleLogin = (user: CurrentUser) => {
    syncLegacyCurrentUserLabel(user);
    setCurrentUser(user);
    setActivePage('dashboard');
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Supabase logout error:', error);
    }
    syncLegacyCurrentUserLabel(null);
    setCurrentUser(null);
    setActivePage('dashboard');
    setIsInitialized(false);
    setOrders([]);
    setCustomers([]);
    setKitchenTasks([]);
    setDeliveryTasks([]);
    setInvoices([]);
    setFollowUpBadge(0);
  };

  const handleResetDemoData = () => {
    if (window.confirm('Are you sure? This will reset all data to demo defaults.')) {
      clearLocalStorage();
      setOrders(orderData);
      setCustomers([]);
      setProducts(productData);
      setKitchenTasks(kitchenData);
      setDeliveryTasks(deliveryData);
      setWhatsappTemplates(templateData);
      setSettings(settingsData);
    }
  };

  const handleExportBackup = () => {
    exportBackupJSON(orders, customers, products, kitchenTasks, deliveryTasks, whatsappTemplates, settings);
  };

  const handleImportBackup = async (file: File) => {
    try {
      const importedData = await importBackupJSON(file);
      setOrders(importedData.orders);
      localStorage.removeItem('lbl_customers');
      setCustomers([]);
      setProducts(importedData.products);
      setKitchenTasks(importedData.kitchenTasks);
      setDeliveryTasks(importedData.deliveryTasks);
      setWhatsappTemplates(importedData.whatsappTemplates);
      setSettings(importedData.settings);
      return true;
    } catch {
      return false;
    }
  };

  const buildKitchenTask = (order: Order): KitchenTask => ({
    orderId: order.id,
    product: order.product,
    flavours: order.flavours,
    flavourQuantities: order.flavourQuantities,
    quantity: order.quantity,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    requiredReadyTime: new Date(new Date(order.deliveryDate + ' ' + order.deliveryTime).getTime() - 30 * 60000)
      .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      .replace(/^(\d):/, '0$1'),
    kitchenStatus: order.kitchenStatus
  });

  const buildDeliveryTask = (order: Order): DeliveryTask => ({
    orderId: order.id,
    customerName: order.customerName,
    phone: order.phone,
    address: order.address,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    driverName: '',
    deliveryStatus: order.deliveryStatus
  });

  const syncOrderRelatedState = (updatedOrder: Order) => {
    setKitchenTasks((prev) => {
      const nextTask = buildKitchenTask(updatedOrder);
      return prev.some((task) => task.orderId === updatedOrder.id)
        ? prev.map((task) => (task.orderId === updatedOrder.id ? { ...task, ...nextTask } : task))
        : [nextTask, ...prev];
    });
    setDeliveryTasks((prev) => {
      const nextTask = buildDeliveryTask(updatedOrder);
      return prev.some((task) => task.orderId === updatedOrder.id)
        ? prev.map((task) => (task.orderId === updatedOrder.id ? { ...task, ...nextTask, driverName: task.driverName } : task))
        : [nextTask, ...prev];
    });
  };

  const handleAddOrder = async (newOrder: Order): Promise<OrderOperationalWorkflowResult> => {
    let workflowResult: OrderOperationalWorkflowResult;
    try {
      workflowResult = await createOrderOperationalWorkflow(newOrder, orders);
    } catch (error) {
      console.error('Order insert failed:', error);
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setOrderSource('localStorage');
      setOrderError(message);
      throw error;
    }

    const savedOrder = workflowResult.savedOrder;
    setOrders((current) => {
      const savedKeys = new Set([savedOrder.id, savedOrder.orderNo, savedOrder.supabaseId].filter(Boolean).map(String));
      return [
        savedOrder,
        ...current.filter((item) =>
          ![item.id, item.orderNo, item.supabaseId].filter(Boolean).some((key) => savedKeys.has(String(key)))
        )
      ];
    });
    setOrderSource('Supabase');
    setOrderError('');

    const refreshResults = await Promise.allSettled([
        loadOrdersFromSupabase(),
        loadCustomersFromSupabase(),
        loadKitchenTasksFromSupabase(),
        loadDeliveryTasksFromSupabase()
    ]);
    const [ordersRefresh, customersRefresh, kitchenRefresh, deliveryRefresh] = refreshResults;

    if (ordersRefresh.status === 'fulfilled') setOrders(ordersRefresh.value);
    else console.error('Order created but orders refresh failed:', ordersRefresh.reason);

    if (customersRefresh.status === 'fulfilled') {
      setCustomers(customersRefresh.value);
      setCustomerSource('Supabase');
    } else {
      console.error('Order created but customers refresh failed:', customersRefresh.reason);
    }

    if (kitchenRefresh.status === 'fulfilled') setKitchenTasks(kitchenRefresh.value);
    else console.error('Order created but kitchen queue refresh failed:', kitchenRefresh.reason);

    if (deliveryRefresh.status === 'fulfilled') {
      const refreshedOrders = ordersRefresh.status === 'fulfilled' ? ordersRefresh.value : [savedOrder, ...orders];
      try {
        setDeliveryTasks(await repairMissingDeliveryTasks(refreshedOrders, deliveryRefresh.value));
      } catch (error) {
        console.error('Order created but delivery workflow repair failed:', error);
        setDeliveryTasks(deliveryRefresh.value);
      }
    } else console.error('Order created but delivery queue refresh failed:', deliveryRefresh.reason);

    const refreshWarnings = [
      ordersRefresh.status === 'rejected' ? 'orders refresh' : '',
      customersRefresh.status === 'rejected' ? 'customer refresh' : '',
      kitchenRefresh.status === 'rejected' ? 'kitchen refresh' : '',
      deliveryRefresh.status === 'rejected' ? 'delivery refresh' : ''
    ].filter(Boolean);

    return {
      ...workflowResult,
      warnings: [...workflowResult.warnings, ...refreshWarnings]
    };
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
    syncOrderRelatedState(updatedOrder);
    try {
      const savedOrder = await updateOrderInSupabase(updatedOrder);
      setOrderSource('Supabase');
      const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices] = await Promise.all([
        loadOrdersFromSupabase(),
        loadCustomersFromSupabase(),
        loadKitchenTasksFromSupabase(),
        loadDeliveryTasksFromSupabase(),
        loadInvoicesFromSupabase(),
        loadAutomationLogsFromSupabase()
      ]);
      setOrders(supabaseOrders.length > 0 ? supabaseOrders : orders.map((order) => (order.id === updatedOrder.id ? savedOrder : order)));
      setCustomers(supabaseCustomers);
      setKitchenTasks(supabaseKitchenTasks);
      setDeliveryTasks(supabaseDeliveryTasks);
      setInvoices(supabaseInvoices);
      setCustomerSource('Supabase');
      setOrderError('');
    } catch (error) {
      console.error('Failed to update order in Supabase:', error);
      setOrderSource('localStorage');
      throw error;
    }
  };

  const handleMarkOrderPaid = async (orderId: string | number) => {
    setOrders((prev) => prev.map((order) => {
      if (order.id !== String(orderId) && order.orderNo !== String(orderId) && order.supabaseId !== String(orderId)) return order;
      return {
        ...order,
        paymentStatus: 'Paid',
        workflowStatus: order.workflowStatus === 'Pending Payment' || order.workflowStatus === 'New Order' ? 'Paid' : order.workflowStatus
      };
    }));

    try {
      await markOrderPaidInSupabase(orderId);
      const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices] = await Promise.all([
        loadOrdersFromSupabase(),
        loadCustomersFromSupabase(),
        loadKitchenTasksFromSupabase(),
        loadDeliveryTasksFromSupabase(),
        loadInvoicesFromSupabase(),
        loadAutomationLogsFromSupabase()
      ]);
      setOrders(supabaseOrders);
      setCustomers(supabaseCustomers);
      setKitchenTasks(supabaseKitchenTasks);
      setDeliveryTasks(supabaseDeliveryTasks);
      setInvoices(supabaseInvoices);
      setOrderSource('Supabase');
      setCustomerSource('Supabase');
      setOrderError('');
    } catch (error) {
      console.error('Failed to mark order paid:', error);
      setOrderSource('localStorage');
      throw error;
    }
  };

  const handleDeleteOrder = async (orderToDelete: Order) => {
    const orderKeys = new Set(
      [orderToDelete.id, orderToDelete.orderNo, orderToDelete.supabaseId]
        .filter(Boolean)
        .map(String)
    );
    setOrders((prev) => prev.filter((order) => order.id !== orderToDelete.id));
    setKitchenTasks((prev) => prev.filter((task) => !orderKeys.has(String(task.orderId))));
    setDeliveryTasks((prev) => prev.filter((task) => !orderKeys.has(String(task.orderId))));
    setInvoices((prev) => prev.filter((invoice) => !orderKeys.has(String(invoice.order_id ?? ''))));

    try {
      await deleteOrderFromSupabase(orderToDelete);
      const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices] = await Promise.all([
        loadOrdersFromSupabase(),
        loadCustomersFromSupabase(),
        loadKitchenTasksFromSupabase(),
        loadDeliveryTasksFromSupabase(),
        loadInvoicesFromSupabase()
      ]);
      setOrders(supabaseOrders);
      setCustomers(supabaseCustomers);
      setKitchenTasks(supabaseKitchenTasks);
      setDeliveryTasks(supabaseDeliveryTasks);
      setInvoices(supabaseInvoices);
      setOrderSource('Supabase');
      setCustomerSource('Supabase');
      setOrderError('');
    } catch (error) {
      console.error('Failed to delete order from Supabase:', error);
      setOrderSource('localStorage');
      const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices] = await Promise.all([
        loadOrdersFromSupabase(),
        loadCustomersFromSupabase(),
        loadKitchenTasksFromSupabase(),
        loadDeliveryTasksFromSupabase(),
        loadInvoicesFromSupabase()
      ]);
      setOrders(supabaseOrders);
      setCustomers(supabaseCustomers);
      setKitchenTasks(supabaseKitchenTasks);
      setDeliveryTasks(supabaseDeliveryTasks);
      setInvoices(supabaseInvoices);
      throw error;
    }
  };

  const updateKitchenStatus = async (
    orderId: string,
    newStatus: 'Preparing' | 'Ready' | 'Completed',
    taskContext?: KitchenTaskUpdateContext
  ) => {
    const orderToUpdate = orders.find((order) => order.id === orderId);
    if (orderToUpdate) {
      const updatedWorkflowStatus: Order['workflowStatus'] =
        newStatus === 'Completed' ? 'Ready' : newStatus === 'Ready' ? 'Ready' : 'Preparing';
      const updatedOrder: Order = {
        ...orderToUpdate,
        kitchenStatus: newStatus,
        workflowStatus: updatedWorkflowStatus
      };
      try {
        await syncKitchenStatusForOrder({
          ...taskContext,
          orderId: taskContext?.orderId || orderToUpdate.supabaseId,
          orderNo: taskContext?.orderNo || orderToUpdate.orderNo || orderToUpdate.id,
          linkedOrderId: orderToUpdate.id,
          targetStatus: newStatus,
          order: orderToUpdate
        });
        setOrders((currentOrders) => currentOrders.map((order) => (
          order.id === orderToUpdate.id ? updatedOrder : order
        )));
        await createAutomationLog('Kitchen Status Updated', `Kitchen task for ${orderToUpdate.orderNo || orderToUpdate.id} updated to ${newStatus}`);
        setKitchenTasks(await loadKitchenTasksFromSupabase());
        await reloadOrdersFromSupabase();
      } catch (error) {
        console.error('Kitchen update error', error);
        throw error;
      }
    }
  };

  const updateDeliveryStatus = async (orderId: string, newStatus: 'Assigned' | 'Out for Delivery' | 'Delivered' | 'Collected', driverName?: string, driverDetails?: DeliveryDriverDetails) => {
    const orderToUpdate = orders.find((order) => order.id === orderId);
    if (orderToUpdate) {
      const updatedWorkflowStatus: Order['workflowStatus'] =
        newStatus === 'Delivered' || newStatus === 'Collected'
          ? 'Completed'
          : newStatus === 'Out for Delivery'
            ? 'Out For Delivery'
            : orderToUpdate.workflowStatus;
      const updatedOrder: Order = {
        ...orderToUpdate,
        deliveryStatus: newStatus,
        workflowStatus: updatedWorkflowStatus
      };
      try {
        if (!(newStatus === 'Collected' && isSelfCollectOrder(orderToUpdate))) {
          await updateDeliveryTaskStatus(orderToUpdate.orderNo || orderToUpdate.id, newStatus, driverName, driverDetails);
        }
        await handleUpdateOrder(updatedOrder);
        await createAutomationLog('Delivery Status Updated', `${orderToUpdate.orderNo || orderToUpdate.id} delivery status changed to ${newStatus}`);
        setDeliveryTasks(await loadDeliveryTasksFromSupabase());
        await reloadOrdersFromSupabase();
      } catch (error) {
        console.error('Failed to persist delivery status:', error);
        throw error;
      }
    }
  };

  const summary = useMemo(() => {
    const summaryOrders = orders.filter(isOrderRecordAvailable);
    const todayOrders = summaryOrders.filter((order) => order.deliveryDate === '2026-06-03');
    const monthlyRevenue = summaryOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const productCounts = summaryOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.product] = (acc[order.product] || 0) + order.quantity;
      return acc;
    }, {});
    const bestSellingProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mini Tart';

    return {
      totalOrders: todayOrders.length,
      pendingPayment: todayOrders.filter((order) => order.paymentStatus !== 'Paid').length,
      pendingDeliveries: todayOrders.filter((order) => order.deliveryStatus !== 'Delivered').length,
      todaysRevenue: todayOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      monthlyRevenue,
      totalCustomers: customers.length,
      bestSellingProduct,
      preparing: todayOrders.filter((order) => order.kitchenStatus === 'Preparing').length,
      readyForDelivery: todayOrders.filter((order) => order.kitchenStatus === 'Ready').length,
      outForDelivery: todayOrders.filter((order) => order.deliveryStatus === 'Out for Delivery').length,
      completed: todayOrders.filter((order) => order.deliveryStatus === 'Delivered').length
    };
  }, [orders, customers]);

  const pageContent = () => {
    if (!hasPageAccess) return <AccessDenied />;

    switch (activePage) {
      case 'dashboard':
        return <DashboardPage orders={orders} customers={customers} kitchenTasks={kitchenTasks} deliveryTasks={deliveryTasks} invoices={invoices} summary={summary} followUpDueCount={followUpBadge} loading={!isInitialized} onNavigate={setActivePage} />;
      case 'orders':
        return <OrdersPage orders={orders} products={products} customers={customers} orderSource={orderSource} orderError={orderError} onAddOrder={handleAddOrder} onUpdateOrder={handleUpdateOrder} onMarkOrderPaid={handleMarkOrderPaid} onDeleteOrder={handleDeleteOrder} />;
      case 'customers':
        return <CustomersPage customers={customers} orders={orders} source={customerSource} />;
      case 'products':
        return <ProductsPage products={products} setProducts={setProducts} readOnly={isSalesUser} />;
      case 'invoices':
        return <InvoicePage onMarkOrderPaid={handleMarkOrderPaid} />;
      case 'kitchen':
        return <KitchenQueuePage kitchenTasks={kitchenTasks} orders={orders} onUpdateKitchenStatus={updateKitchenStatus} />;
      case 'delivery':
        return <DeliveryPage deliveryTasks={deliveryTasks} orders={orders} onUpdateDeliveryStatus={updateDeliveryStatus} />;
      case 'events':
        return <EventPage products={products} />;
      case 'sales-crm':
        return <SalesCRMPage onNavigate={setActivePage} />;
      case 'corporate-accounts':
        return <CorporateAccountsPage orders={orders} />;
      case 'whatsapp-assistant':
        return <WhatsAppAssistant />;
      case 'quotations':
        return <QuotationPage />;
      case 'reports':
        return <ReportsPage />;
      case 'meta-ads':
        return <MetaAdsCenterPage />;
      case 'production-center':
        return <ProductionCenterPage orders={orders} />;
      case 'recipe-calculator':
        return <RecipeCalculatorPage view="recipe" />;
      case 'cost-profit-calculator':
        return <RecipeCalculatorPage view="cost" />;
      case 'automation':
        return <AutomationCenterPage rules={automationRules} />;
      case 'templates':
        return <WhatsAppTemplatesPage templates={whatsappTemplates} orders={orders} />;
      case 'settings':
        return <SettingsPage settings={settings} onResetDemoData={handleResetDemoData} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} />;
      default:
        return <DashboardPage orders={orders} customers={customers} kitchenTasks={kitchenTasks} deliveryTasks={deliveryTasks} invoices={invoices} summary={summary} followUpDueCount={followUpBadge} loading={!isInitialized} onNavigate={setActivePage} />;
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#010102] px-6 text-cream">
        <div className="rounded-[28px] border border-white/10 bg-[#111111] p-6 text-center shadow-panel">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-gold text-base font-semibold text-charcoal">
            LBL
          </div>
          <p className="mt-5 text-xs uppercase tracking-[0.28em] text-softGold">Secure Access</p>
          <p className="mt-2 text-sm text-slate-400">Checking your Supabase session...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const activeTitle = hasPageAccess ? pageTitles[activePage] : 'Access Denied';
  const userInitials = currentUser.email
    .split('@')[0]
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LBL';

  return (
    <div className="min-h-screen bg-[#010102] text-cream">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-[#23252a] bg-[#090A0B]/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2d3036] bg-[#111214] text-[#f7f8f8] transition hover:border-[#C8A96B]/50 hover:text-[#E4C98E]"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">LBL AutoFlow</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{activeTitle}</p>
        </div>

        <div
          aria-label={`${currentUser.email}, ${currentUser.role}`}
          title={currentUser.email}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#C8A96B]/30 bg-[#C8A96B]/10 text-xs font-semibold text-[#E4C98E]"
        >
          {userInitials}
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 transition-[visibility] lg:hidden ${
          mobileMenuOpen
            ? 'visible pointer-events-auto'
            : 'invisible pointer-events-none delay-200'
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${mobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className={`relative h-full w-[80vw] max-w-[320px] border-r border-[#2d3036] bg-[#010102] shadow-2xl transition-transform duration-200 ease-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-[#2d3036] bg-[#111214] text-[#a7abb2] transition hover:text-white"
          >
            <X size={18} />
          </button>
          <Sidebar
            variant="drawer"
            active={activePage}
            onSelect={setActivePage}
            onNavigate={() => setMobileMenuOpen(false)}
            currentUser={currentUser}
            allowedPages={allowedPages}
            onLogout={handleLogout}
            followUpBadge={followUpBadge}
          />
        </div>
      </div>

      <div className="mx-auto flex min-h-screen max-w-[1600px] items-start">
        <Sidebar active={activePage} onSelect={setActivePage} currentUser={currentUser} allowedPages={allowedPages} onLogout={handleLogout} followUpBadge={followUpBadge} />

        <main className="min-w-0 flex-1 px-4 pb-4 pt-20 sm:px-5 lg:p-4 xl:p-5">
          <div className="mb-4 hidden flex-col gap-2 border-b border-[#23252a] pb-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-[#5e6ad2]">Welcome back</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#f7f8f8]">{activeTitle}</h2>
            </div>
            <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3.5 py-2.5 text-xs text-[#8a8f98]">
              Premium bakery operations interface
            </div>
          </div>

          {pageContent()}
        </main>
      </div>
    </div>
  );
}

export default App;
