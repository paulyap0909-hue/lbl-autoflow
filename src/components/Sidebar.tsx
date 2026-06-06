import React from 'react';
import type { CurrentUser } from '../pages/LoginPage';

type NavItem = {
  id: string;
  label: string;
};

type SidebarProps = {
  active: string;
  onSelect: (id: string) => void;
  currentUser: CurrentUser;
  allowedPages: string[];
  onLogout: () => void;
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orders', label: 'Orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'products', label: 'Products' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'kitchen', label: 'Kitchen Queue' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'events', label: 'Events' },
  { id: 'sales-crm', label: 'Sales CRM' },
  { id: 'whatsapp-crm', label: 'WhatsApp CRM' },
  { id: 'automation', label: 'Automation Center' },
  { id: 'templates', label: 'WhatsApp Templates' },
  { id: 'settings', label: 'Settings' }
];

export default function Sidebar({ active, onSelect, currentUser, allowedPages, onLogout }: SidebarProps) {
  const visibleItems = navItems.filter((item) => allowedPages.includes(item.id));

  return (
    <aside className="w-full max-w-[280px] border-r border-white/10 bg-[#0d0d0d] p-6 text-sm text-cream md:w-[280px]">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-charcoal font-semibold shadow-panel">LBL</div>
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-softGold">AutoFlow</p>
          <h1 className="text-xl font-semibold">Layer By Layer</h1>
        </div>
      </div>

      <div className="mb-6 rounded-[24px] border border-white/10 bg-[#141414] p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-softGold">Logged in</p>
        <p className="mt-2 break-words text-sm font-semibold text-white">{currentUser.email}</p>
        <p className="mt-1 capitalize text-xs text-slate-400">{currentUser.role}</p>
      </div>

      <nav className="space-y-2">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
              active === item.id ? 'bg-white/10 text-cream shadow-panel' : 'text-slate-300 hover:bg-white/5 hover:text-cream'
            }`}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <button
        onClick={onLogout}
        className="mt-6 flex w-full items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
      >
        Logout
      </button>

      <div className="mt-10 rounded-3xl border border-white/10 bg-[#141414] p-5 text-sm text-slate-300 shadow-panel">
        <p className="text-softGold">Premium bakery ops</p>
        <p className="mt-3 leading-6 text-white/80">LBL AutoFlow keeps every order, kitchen queue and delivery plan in one luxury dashboard.</p>
      </div>
    </aside>
  );
}
