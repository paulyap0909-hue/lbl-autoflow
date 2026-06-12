import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatRM, toSafeNumber } from '../utils/pricing';

type ProductionPoint = {
  name: string;
  value: number;
  fill: string;
};

type RevenuePoint = {
  date: string;
  label: string;
  revenue: number;
};

const COLORS = {
  background: '#0F172A',
  card: '#1E293B',
  border: '#334155',
  primary: '#F8FAFC',
  secondary: '#94A3B8',
  gold: '#C8A96B'
};

export function ProductionDonut({
  data,
  total
}: {
  data: ProductionPoint[];
  total: number;
}) {
  if (total <= 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex h-[168px] w-[168px] flex-col items-center justify-center rounded-full border-[22px] border-[#334155]">
          <span className="text-3xl font-semibold text-[#F8FAFC]">0</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#94A3B8]">No orders</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={84}
            stroke={COLORS.card}
            strokeWidth={4}
          />
          <Tooltip
            contentStyle={{ background: COLORS.background, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}
            itemStyle={{ color: COLORS.primary }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-[#F8FAFC]">{total}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#94A3B8]">Orders</span>
      </div>
    </div>
  );
}

export function RevenueLineChart({ data }: { data: RevenuePoint[] }) {
  const safeData = data.length ? data : [{ date: '', label: '', revenue: 0 }];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={safeData} margin={{ top: 5, right: 10, left: -18, bottom: 5 }}>
        <CartesianGrid stroke={COLORS.border} strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" stroke={COLORS.secondary} tick={{ fontSize: 10 }} interval={4} tickLine={false} axisLine={false} />
        <YAxis stroke={COLORS.secondary} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `RM${value}`} />
        <Tooltip
          formatter={(value) => [formatRM(toSafeNumber(value)), 'Revenue']}
          contentStyle={{ background: COLORS.background, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}
          labelStyle={{ color: COLORS.secondary }}
        />
        <Line type="monotone" dataKey="revenue" stroke={COLORS.gold} strokeWidth={3} dot={false} activeDot={{ r: 5, fill: COLORS.gold }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
