import React, { useEffect, useMemo, useState } from 'react';
import Toast from '../components/Toast';
import {
  completeFollowUpTaskInSupabase,
  loadFollowUpTasksFromSupabase,
  notifyFollowUpTasksChanged,
  type FollowUpTask
} from '../services/followUpTaskService';
import { createLeadActivityInSupabase } from '../services/salesLeadService';

const getCurrentUserLabel = () => {
  try {
    const user = JSON.parse(localStorage.getItem('lbl_currentUser') || '{}') as { email?: string };
    return user.email || 'Unknown user';
  } catch {
    return 'Unknown user';
  }
};

const statusTone = (status: FollowUpTask['status']) => {
  if (status === 'Completed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'Overdue') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  return 'border-gold/30 bg-gold/10 text-softGold';
};

export default function FollowUpTasksPage() {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const reload = async () => {
    try {
      setTasks(await loadFollowUpTasksFromSupabase());
    } catch (error) {
      console.error('Follow-up task load error:', error);
      setToast({ message: 'Failed to load follow-up tasks.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const stats = useMemo(() => ({
    dueToday: tasks.filter((task) => task.dueDate === new Date().toISOString().slice(0, 10) && task.status !== 'Completed').length,
    overdue: tasks.filter((task) => task.status === 'Overdue').length,
    completed: tasks.filter((task) => task.status === 'Completed').length
  }), [tasks]);

  const completeTask = async (task: FollowUpTask) => {
    if (!task.id) return;
    try {
      await completeFollowUpTaskInSupabase(task.id);
      await createLeadActivityInSupabase({
        leadId: task.leadId,
        activityType: 'Follow-up Completed',
        description: task.title,
        performedBy: getCurrentUserLabel()
      });
      await reload();
      notifyFollowUpTasksChanged();
      setToast({ message: 'Follow-up completed.', type: 'success' });
    } catch (error) {
      console.error('Follow-up completion error:', error);
      setToast({ message: 'Failed to complete follow-up.', type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[20px] border border-white/10 bg-[#141414] p-4 shadow-panel md:p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-softGold">Sales CRM</p>
        <h3 className="mt-1.5 text-2xl font-semibold text-white">Follow-up Tasks</h3>
        <p className="mt-2 text-sm text-slate-400">Every sales commitment, due date and completed follow-up in one place.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Follow-up Due Today', stats.dueToday],
          ['Overdue Tasks', stats.overdue],
          ['Completed Tasks', stats.completed]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/10 bg-[#141414] p-3.5 shadow-panel">
            <p className="text-xs uppercase tracking-[0.18em] text-softGold">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-[18px] border border-white/10 bg-[#141414] shadow-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#0f0f0f] text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold text-white">{task.leadName}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-200">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{task.description || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{task.dueDate}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(task.status)}`}>{task.status}</span></td>
                  <td className="px-4 py-3">
                    <button disabled={task.status === 'Completed'} onClick={() => completeTask(task)} className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold text-softGold disabled:cursor-not-allowed disabled:opacity-40">Mark Completed</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && tasks.length === 0 && <div className="p-10 text-center text-sm text-slate-400">No follow-up tasks yet.</div>}
          {loading && <div className="p-10 text-center text-sm text-slate-400">Loading follow-up tasks...</div>}
        </div>
      </section>
    </div>
  );
}
