import React, { useMemo, useState, useEffect } from 'react';
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
import WhatsAppCenterPage from './pages/WhatsAppCenterPage';
import EventPage from './pages/EventPage';
import SalesCRMPage from './pages/SalesCRMPage';
import CorporateSalesDashboardPage from './pages/CorporateSalesDashboardPage';
import QuotationPage from './pages/QuotationPage';
import FollowUpTasksPage from './pages/FollowUpTasksPage';
import RecipeCalculatorPage from './pages/RecipeCalculatorPage';
import ProductionCenterPage from './pages/ProductionCenterPage';
import CorporateAccountsPage from './pages/CorporateAccountsPage';
import LoginPage, { type CurrentUser, type UserRole } from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
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
import { createFullOrderWorkflow, deleteOrderFromSupabase, loadOrdersFromSupabase, markOrderPaid as markOrderPaidInSupabase, orderFromRow, updateOrderInSupabase } from './services/orderService';
import { loadCustomersFromSupabase } from './services/customerService';
import { loadKitchenTasksFromSupabase, syncKitchenStatusForOrder, type KitchenTaskUpdateContext } from './services/kitchenService';
import { loadDeliveryTasksFromSupabase, updateDeliveryTaskStatus, type DeliveryDriverDetails } from './services/deliveryService';
import { loadInvoicesFromSupabase, type InvoiceRecord } from './services/invoiceService';
import { createAutomationLog, loadAutomationLogsFromSupabase } from './services/automationLogService';
import { loadFollowUpTasksFromSupabase } from './services/followUpTaskService';

const pageTitles: Record<string, string> = {
  dashboard: 'Command Center',
  orders: 'Orders',
  customers: 'Customers',
  products: 'Products',
  invoices: 'Invoices',
  kitchen: 'Kitchen Queue',
  delivery: 'Delivery',
  events: 'Events',
  'sales-crm': 'Corporate Leads',
  'sales-dashboard': 'Sales Pipeline',
  quotations: 'Quotations',
  'follow-up-tasks': 'Follow-up Tasks',
  'production-center': 'Production Center',
  'recipe-calculator': 'Recipe Calculator',
  'corporate-accounts': 'Corporate Accounts',
  'whatsapp-crm': 'WhatsApp CRM',
  automation: 'Automation Center',
  templates: 'WhatsApp Templates',
  settings: 'Settings'
};

const rolePermissions: Record<UserRole, string[]> = {
  admin: Object.keys(pageTitles),
  sales: ['dashboard', 'orders', 'customers', 'invoices', 'events', 'sales-crm', 'sales-dashboard', 'corporate-accounts', 'quotations', 'follow-up-tasks', 'whatsapp-crm', 'delivery', 'kitchen', 'products', 'production-center', 'recipe-calculator']
};

const getStoredUser = (): CurrentUser | null => {
  try {
    const savedUser = localStorage.getItem('lbl_currentUser');
    if (!savedUser) return null;
    const user = JSON.parse(savedUser) as CurrentUser;
    if ((user.role === 'admin' || user.role === 'sales') && user.email) return user;
  } catch (error) {
    console.error('Failed to read current user:', error);
  }
  localStorage.removeItem('lbl_currentUser');
  return null;
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => getStoredUser());
  
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
  }, []);

  // Load orders from Supabase first, then fall back to localStorage.
  useEffect(() => {
    let isMounted = true;

    const initializeData = async () => {
      const savedData = loadFromLocalStorage();
      const normalizedSavedOrders = savedData.orders.map((order) => orderFromRow(order));
      localStorage.removeItem('lbl_customers');

      if (savedData.orders.length > 0 || localStorage.getItem('lbl_orders')) {
        setProducts(savedData.products);
        setWhatsappTemplates(savedData.whatsappTemplates);
        setSettings(savedData.settings);
      }

      try {
        const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices] = await Promise.all([
          loadOrdersFromSupabase(),
          loadCustomersFromSupabase(),
          loadKitchenTasksFromSupabase(),
          loadDeliveryTasksFromSupabase(),
          loadInvoicesFromSupabase(),
          loadAutomationLogsFromSupabase()
        ]);
        if (!isMounted) return;
        setOrders(supabaseOrders);
        setKitchenTasks(supabaseKitchenTasks);
        setDeliveryTasks(supabaseDeliveryTasks);
        setInvoices(supabaseInvoices);
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
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (isInitialized) {
      saveAllToLocalStorage(orders, customers, products, kitchenTasks, deliveryTasks, whatsappTemplates, settings);
    }
  }, [orders, customers, products, kitchenTasks, deliveryTasks, whatsappTemplates, settings, isInitialized]);
const reloadOrdersFromSupabase = async () => {
  const supabaseOrders = await loadOrdersFromSupabase();
  console.log('Orders loaded from Supabase:', supabaseOrders);
  setOrders(supabaseOrders);
  setOrderSource('Supabase');
  setOrderError('');
};

useEffect(() => {
  if (activePage !== 'orders') return;

  reloadOrdersFromSupabase();
}, [activePage]);

useEffect(() => {
  if (activePage !== 'dashboard') return;

  loadInvoicesFromSupabase()
    .then(setInvoices)
    .catch((error) => console.error('Dashboard invoice refresh error:', error));
}, [activePage]);

  const allowedPages = currentUser ? rolePermissions[currentUser.role] : [];
  const hasPageAccess = currentUser ? allowedPages.includes(activePage) : false;
  const isSalesUser = currentUser?.role === 'sales';

  const handleLogin = (user: CurrentUser) => {
    localStorage.setItem('lbl_currentUser', JSON.stringify(user));
    setCurrentUser(user);
    setActivePage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('lbl_currentUser');
    setCurrentUser(null);
    setActivePage('dashboard');
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

  const handleAddOrder = async (newOrder: Order) => {
    try {
      await createFullOrderWorkflow(newOrder, orders);
      const [supabaseOrders, supabaseCustomers, supabaseKitchenTasks, supabaseDeliveryTasks, supabaseInvoices] = await Promise.all([
        loadOrdersFromSupabase(),
        loadCustomersFromSupabase(),
        loadKitchenTasksFromSupabase(),
        loadDeliveryTasksFromSupabase(),
        loadInvoicesFromSupabase(),
        loadAutomationLogsFromSupabase()
      ]);
      setOrderSource('Supabase');
      setCustomerSource('Supabase');
      setCustomers(supabaseCustomers);
      setOrders(supabaseOrders);
      setKitchenTasks(supabaseKitchenTasks);
      setDeliveryTasks(supabaseDeliveryTasks);
      setInvoices(supabaseInvoices);
      setOrderError('');
    } catch (error) {
      console.error('Failed to save order to Supabase:', error);
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setOrderSource('localStorage');
      setOrderError(message);
      throw error;
    }
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
    setOrders((prev) => prev.filter((order) => order.id !== orderToDelete.id));
    setKitchenTasks((prev) => prev.filter((task) => task.orderId !== orderToDelete.id));
    setDeliveryTasks((prev) => prev.filter((task) => task.orderId !== orderToDelete.id));
    try {
      await deleteOrderFromSupabase(orderToDelete);
      setOrderSource('Supabase');
    } catch (error) {
      console.error('Failed to delete order from Supabase:', error);
      setOrderSource('localStorage');
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

  const updateDeliveryStatus = async (orderId: string, newStatus: 'Assigned' | 'Out for Delivery' | 'Delivered', driverName?: string, driverDetails?: DeliveryDriverDetails) => {
    const orderToUpdate = orders.find((order) => order.id === orderId);
    if (orderToUpdate) {
      const updatedWorkflowStatus: Order['workflowStatus'] =
        newStatus === 'Delivered'
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
        await updateDeliveryTaskStatus(orderToUpdate.orderNo || orderToUpdate.id, newStatus, driverName, driverDetails);
        await handleUpdateOrder(updatedOrder);
        await createAutomationLog('Delivery Status Updated', `${orderToUpdate.orderNo || orderToUpdate.id} delivery status changed to ${newStatus}`);
        setDeliveryTasks(await loadDeliveryTasksFromSupabase());
        await reloadOrdersFromSupabase();
      } catch (error) {
        console.error('Failed to persist delivery status:', error);
      }
    }
  };

  const summary = useMemo(() => {
    const todayOrders = orders.filter((order) => order.deliveryDate === '2026-06-03');
    const monthlyRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const productCounts = orders.reduce<Record<string, number>>((acc, order) => {
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
        return <OrdersPage orders={orders} products={products} orderSource={orderSource} orderError={orderError} onAddOrder={handleAddOrder} onUpdateOrder={handleUpdateOrder} onMarkOrderPaid={handleMarkOrderPaid} onDeleteOrder={handleDeleteOrder} />;
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
        return <SalesCRMPage />;
      case 'sales-dashboard':
        return <CorporateSalesDashboardPage orders={orders} />;
      case 'corporate-accounts':
        return <CorporateAccountsPage orders={orders} />;
      case 'quotations':
        return <QuotationPage />;
      case 'follow-up-tasks':
        return <FollowUpTasksPage />;
      case 'production-center':
        return <ProductionCenterPage orders={orders} />;
      case 'recipe-calculator':
        return <RecipeCalculatorPage />;
      case 'whatsapp-crm':
        return <WhatsAppCenterPage orders={orders} customers={customers} deliveryTasks={deliveryTasks} kitchenTasks={kitchenTasks} />;
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

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#010102] text-cream">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col md:flex-row md:items-start">
        <Sidebar active={activePage} onSelect={setActivePage} currentUser={currentUser} allowedPages={allowedPages} onLogout={handleLogout} followUpBadge={followUpBadge} />

        <main className="min-w-0 flex-1 p-3 md:p-4 xl:p-5">
          <div className="mb-4 flex flex-col gap-2 border-b border-[#23252a] pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-[#5e6ad2]">Welcome back</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#f7f8f8]">{hasPageAccess ? pageTitles[activePage] : 'Access Denied'}</h2>
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
