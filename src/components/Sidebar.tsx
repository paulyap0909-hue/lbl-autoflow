import React from 'react';
import {
  BarChart3,
  Building2,
  Boxes,
  Calculator,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  FileText,
  Factory,
  Gauge,
  LogOut,
  MessageCircle,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingBag,
  Sparkles,
  Truck,
  UserRoundCog,
  UsersRound
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CurrentUser } from '../pages/LoginPage';

type NavItem = {
  id: string;
  label: string;
  section: 'Overview' | 'Operations' | 'Customers' | 'Business' | 'Production' | 'System';
  icon: LucideIcon;
};

type SidebarProps = {
  active: string;
  onSelect: (id: string) => void;
  currentUser: CurrentUser;
  allowedPages: string[];
  onLogout: () => void;
  followUpBadge?: number;
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Command Center', section: 'Overview', icon: Gauge },
  { id: 'orders', label: 'Orders', section: 'Operations', icon: ShoppingBag },
  { id: 'kitchen', label: 'Kitchen Queue', section: 'Operations', icon: ChefHat },
  { id: 'delivery', label: 'Delivery', section: 'Operations', icon: Truck },
  { id: 'invoices', label: 'Invoices', section: 'Operations', icon: ReceiptText },
  { id: 'customers', label: 'Customers', section: 'Customers', icon: UsersRound },
  { id: 'sales-crm', label: 'Corporate Leads', section: 'Customers', icon: UserRoundCog },
  { id: 'whatsapp-crm', label: 'WhatsApp CRM', section: 'Customers', icon: MessageCircle },
  { id: 'follow-up-tasks', label: 'Follow-up Tasks', section: 'Customers', icon: ClipboardCheck },
  { id: 'sales-dashboard', label: 'Sales Pipeline', section: 'Customers', icon: BarChart3 },
  { id: 'corporate-accounts', label: 'Corporate Accounts', section: 'Customers', icon: Building2 },
  { id: 'quotations', label: 'Quotations', section: 'Business', icon: FileText },
  { id: 'products', label: 'Products', section: 'Production', icon: PackageSearch },
  { id: 'production-center', label: 'Production Center', section: 'Production', icon: Factory },
  { id: 'recipe-calculator', label: 'Recipe Calculator', section: 'Production', icon: Calculator },
  { id: 'events', label: 'Events', section: 'Production', icon: CalendarDays },
  { id: 'automation', label: 'Automation Center', section: 'System', icon: Sparkles },
  { id: 'templates', label: 'WhatsApp Templates', section: 'System', icon: Boxes },
  { id: 'settings', label: 'Settings', section: 'System', icon: Settings }
];

const sections: NavItem['section'][] = [
  'Overview',
  'Operations',
  'Customers',
  'Business',
  'Production',
  'System'
];

export default function Sidebar({ active, onSelect, currentUser, allowedPages, onLogout, followUpBadge = 0 }: SidebarProps) {
  const visibleItems = navItems.filter((item) => allowedPages.includes(item.id));

  return (
    <aside className="flex w-full flex-col border-b border-[#23252a] bg-[#010102] p-3 text-sm text-[#f7f8f8] md:sticky md:top-0 md:h-screen md:w-[240px] md:shrink-0 md:border-b-0 md:border-r md:p-3.5">
      <div className="flex shrink-0 items-center gap-2.5 px-2 py-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#5e6ad2] bg-[#5e6ad2] text-sm font-semibold text-white">
          LBL
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase text-[#5e6ad2]">AutoFlow</p>
          <h1 className="mt-0.5 text-sm font-semibold text-[#f7f8f8]">Layer By Layer</h1>
        </div>
      </div>

      <div className="mt-3 shrink-0 rounded-xl border border-[#23252a] bg-[#0f1011] p-2.5">
        <p className="text-[10px] font-semibold uppercase text-[#5e6ad2]">Signed in</p>
        <p className="mt-1.5 truncate text-xs font-semibold text-[#f7f8f8]">{currentUser.email}</p>
        <p className="mt-1 text-xs capitalize text-[#8a8f98]">{currentUser.role} workspace</p>
      </div>

      <nav className="mt-3 max-h-[320px] min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 md:max-h-none">
        {sections.map((section, sectionIndex) => {
          const sectionItems = visibleItems.filter((item) => item.section === section);
          if (!sectionItems.length) return null;

          return (
            <div
              key={section}
              className={sectionIndex === 0 ? '' : 'border-t border-[#23252a] pt-2'}
            >
              <p className="mb-1 px-2.5 text-[9px] font-semibold uppercase text-[#62666d]">{section}</p>
              <div className="space-y-0.5">
                {sectionItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelect(item.id)}
                      className={`flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition ${
                        isActive
                          ? 'bg-[#5e6ad2] text-white'
                          : 'text-[#d0d6e0] hover:bg-[#141516] hover:text-[#f7f8f8]'
                      }`}
                    >
                      <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                      {item.id === 'follow-up-tasks' && followUpBadge > 0 && (
                        <span className="rounded-full bg-[#EF4444] px-2 py-0.5 text-[10px] font-semibold text-white">{followUpBadge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-3 shrink-0 border-t border-[#23252a] pt-3">
        <button
          onClick={onLogout}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 text-xs font-semibold text-[#FCA5A5] transition hover:bg-[#EF4444]/20"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
