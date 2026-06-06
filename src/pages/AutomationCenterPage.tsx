import React, { useEffect, useMemo, useState } from 'react';
import type { AutomationRule } from '../data/mockData';
import { type AutomationLog, loadAutomationLogsFromSupabase } from '../services/automationLogService';

type AutomationCenterPageProps = {
  rules: AutomationRule[];
};

type RuleStatus = 'Waiting' | 'Running' | 'Completed' | 'Alert' | 'Disabled';

type EngineRule = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  status: RuleStatus;
  lastRun: string;
};

const defaultEngineRules: EngineRule[] = [
  {
    id: 'new-order-invoice',
    name: 'New Order Invoice',
    trigger: 'When New Order Created',
    action: 'Generate Invoice',
    enabled: true,
    status: 'Waiting',
    lastRun: '-'
  },
  {
    id: 'invoice-kitchen-task',
    name: 'Kitchen Task Creator',
    trigger: 'When Invoice Generated',
    action: 'Create Kitchen Task',
    enabled: true,
    status: 'Waiting',
    lastRun: '-'
  },
  {
    id: 'kitchen-delivery-task',
    name: 'Delivery Task Creator',
    trigger: 'When Kitchen Task Ready',
    action: 'Create Delivery Task',
    enabled: true,
    status: 'Waiting',
    lastRun: '-'
  },
  {
    id: 'payment-reminder-alert',
    name: 'Payment Reminder Alert',
    trigger: 'When Payment Pending > 24 Hours',
    action: 'Show Reminder Alert',
    enabled: true,
    status: 'Waiting',
    lastRun: '-'
  },
  {
    id: 'delivery-order-complete',
    name: 'Order Completion',
    trigger: 'When Delivery Completed',
    action: 'Mark Order Completed',
    enabled: true,
    status: 'Waiting',
    lastRun: '-'
  }
];

const flowSteps = [
  'Invoice',
  'Kitchen Task',
  'Delivery Task',
  'Reminder Alert',
  'Order Completed'
] as const;

function statusStyle(status: RuleStatus) {
  if (status === 'Completed') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200';
  if (status === 'Running') return 'border-softGold/60 bg-softGold/10 text-softGold';
  if (status === 'Alert') return 'border-red-400/40 bg-red-400/10 text-red-200';
  if (status === 'Disabled') return 'border-white/10 bg-white/5 text-slate-500';
  return 'border-white/10 bg-white/5 text-slate-300';
}

export default function AutomationCenterPage({ rules }: AutomationCenterPageProps) {
  const [engineRules, setEngineRules] = useState<EngineRule[]>(defaultEngineRules);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logSource, setLogSource] = useState<'Supabase' | 'Unavailable'>('Supabase');
  const [flowState, setFlowState] = useState<Record<(typeof flowSteps)[number], boolean>>({
    Invoice: false,
    'Kitchen Task': false,
    'Delivery Task': false,
    'Reminder Alert': false,
    'Order Completed': false
  });

  const enabledCount = useMemo(() => engineRules.filter((rule) => rule.enabled).length, [engineRules]);
  const alertCount = useMemo(() => engineRules.filter((rule) => rule.status === 'Alert').length, [engineRules]);
  const completedCount = useMemo(() => engineRules.filter((rule) => rule.status === 'Completed').length, [engineRules]);

  const legacyRulesText = useMemo(
    () => rules.map((rule) => `${rule.title}: ${rule.description}`).join(' | '),
    [rules]
  );

  useEffect(() => {
    let isMounted = true;

    const loadLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const supabaseLogs = await loadAutomationLogsFromSupabase();
        if (!isMounted) return;
        setLogs(supabaseLogs);
        setLogSource('Supabase');
      } catch (error) {
        if (!isMounted) return;
        console.error('Automation logs unavailable:', error);
        setLogs([]);
        setLogSource('Unavailable');
      } finally {
        if (isMounted) setIsLoadingLogs(false);
      }
    };

    loadLogs();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateRule = (id: string, patch: Partial<EngineRule>) => {
    setEngineRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const runRule = (id: string, status: RuleStatus = 'Completed') => {
    const rule = engineRules.find((item) => item.id === id);

    if (!rule?.enabled) {
      return false;
    }

    updateRule(id, { status: 'Running' });
    window.setTimeout(() => {
      updateRule(id, { status, lastRun: new Intl.DateTimeFormat('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date()) });
    }, 220);

    return true;
  };

  const simulateNewOrder = () => {
    const invoiceRan = runRule('new-order-invoice');
    if (!invoiceRan) return;

    setFlowState((current) => ({ ...current, Invoice: true }));
    window.setTimeout(() => {
      const kitchenRan = runRule('invoice-kitchen-task');
      if (kitchenRan) {
        setFlowState((current) => ({ ...current, 'Kitchen Task': true }));
      }
    }, 520);
  };

  const simulateKitchenReady = () => {
    const deliveryRan = runRule('kitchen-delivery-task');
    if (deliveryRan) {
      setFlowState((current) => ({ ...current, 'Delivery Task': true }));
    }
  };

  const simulatePaymentPending = () => {
    const alertRan = runRule('payment-reminder-alert', 'Alert');
    if (alertRan) {
      setFlowState((current) => ({ ...current, 'Reminder Alert': true }));
    }
  };

  const simulateDeliveryCompleted = () => {
    const completedRan = runRule('delivery-order-complete');
    if (completedRan) {
      setFlowState((current) => ({ ...current, 'Order Completed': true }));
    }
  };

  const resetEngine = () => {
    setEngineRules(defaultEngineRules);
    setFlowState({
      Invoice: false,
      'Kitchen Task': false,
      'Delivery Task': false,
      'Reminder Alert': false,
      'Order Completed': false
    });
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[#141414] shadow-panel">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-softGold/30 bg-softGold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-softGold">
              Supabase logs
            </div>
            <h3 className="text-2xl font-semibold text-white md:text-3xl">LBL Automation Center</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              A workflow monitor for invoice generation, kitchen task creation, delivery task creation,
              payment reminders and order completion.
            </p>
            <p className="mt-4 line-clamp-2 text-xs text-slate-500" title={legacyRulesText}>
              Existing LBL rules loaded: {rules.length}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-xs text-slate-500">Enabled</p>
              <p className="mt-2 text-2xl font-semibold text-white">{enabledCount}/5</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-xs text-slate-500">Completed</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-200">{completedCount}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-xs text-slate-500">Alerts</p>
              <p className="mt-2 text-2xl font-semibold text-red-200">{alertCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">Mock Event Console</h4>
            <p className="mt-1 text-sm text-slate-400">Rules are simulated locally. Automation logs are loaded from Supabase.</p>
          </div>
          <button
            type="button"
            onClick={resetEngine}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-softGold/50 hover:text-softGold"
          >
            Reset Engine
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={simulateNewOrder}
            className="rounded-2xl bg-softGold px-4 py-3 text-sm font-semibold text-charcoal transition hover:brightness-110"
          >
            New Order Created
          </button>
          <button
            type="button"
            onClick={simulateKitchenReady}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-softGold/50"
          >
            Kitchen Task Ready
          </button>
          <button
            type="button"
            onClick={simulatePaymentPending}
            className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/15"
          >
            Payment Pending 24h
          </button>
          <button
            type="button"
            onClick={simulateDeliveryCompleted}
            className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
          >
            Delivery Completed
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        {flowSteps.map((step) => {
          const active = flowState[step];
          return (
            <div
              key={step}
              className={`rounded-[24px] border p-4 shadow-panel transition ${
                active
                  ? 'border-softGold/50 bg-softGold/10 text-softGold'
                  : 'border-white/10 bg-[#0f0f0f] text-slate-400'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.22em]">State</span>
                <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-softGold' : 'bg-white/20'}`} />
              </div>
              <p className="text-sm font-semibold">{step}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-semibold text-white">Automation Dashboard</h4>
          <span className="rounded-full border border-softGold/30 px-3 py-1 text-xs font-semibold text-softGold">
            Fixed Workflow
          </span>
        </div>

        <div className="overflow-hidden rounded-[22px] border border-white/10">
          <div className="grid min-w-[920px] grid-cols-[1.1fr_1.25fr_1fr_0.75fr_0.65fr_0.7fr] bg-white/[0.04] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span>Automation Name</span>
            <span>Trigger</span>
            <span>Action</span>
            <span>Status</span>
            <span>Last Run</span>
            <span>Enable</span>
          </div>
          <div className="overflow-x-auto">
            {engineRules.map((rule) => (
              <div
                key={rule.id}
                className="grid min-w-[920px] grid-cols-[1.1fr_1.25fr_1fr_0.75fr_0.65fr_0.7fr] items-center border-t border-white/10 px-4 py-4 text-sm"
              >
                <span className="font-semibold text-white">{rule.name}</span>
                <span className="text-slate-300">{rule.trigger}</span>
                <span className="text-slate-300">{rule.action}</span>
                <span
                  className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(
                    rule.enabled ? rule.status : 'Disabled'
                  )}`}
                >
                  {rule.enabled ? rule.status : 'Disabled'}
                </span>
                <span className="text-slate-400">{rule.lastRun}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateRule(rule.id, {
                      enabled: !rule.enabled,
                      status: rule.enabled ? 'Disabled' : 'Waiting'
                    })
                  }
                  className={`flex h-8 w-14 items-center rounded-full border px-1 transition ${
                    rule.enabled ? 'border-softGold bg-softGold' : 'border-white/10 bg-white/10'
                  }`}
                  aria-label={`Toggle ${rule.name}`}
                >
                  <span
                    className={`h-6 w-6 rounded-full bg-white shadow-panel transition ${
                      rule.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-semibold text-white">Automation Logs</h4>
          <span className="text-sm text-slate-500">{isLoadingLogs ? 'Loading...' : `${logs.length} events | Source: ${logSource}`}</span>
        </div>
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
              No automation logs yet
            </div>
          ) : logs.map((log) => (
            <div
              key={log.id}
              className="grid gap-2 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm md:grid-cols-[120px_1fr_1fr]"
            >
              <span className="font-semibold text-softGold">{new Date(log.created_at).toLocaleString('en-MY')}</span>
              <span className="text-slate-200">{log.event_name}</span>
              <span className="text-slate-400">{log.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
