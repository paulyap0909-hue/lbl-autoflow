import React, { useState } from 'react';
import type { SettingField } from '../data/mockData';
import Toast from '../components/Toast';

type SettingsPageProps = {
  settings: SettingField[];
  onResetDemoData: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => Promise<boolean>;
};

export default function SettingsPage({ settings, onResetDemoData, onExportBackup, onImportBackup }: SettingsPageProps) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const success = await onImportBackup(file);
      if (success) {
        setToast({ message: 'Backup imported successfully!', type: 'success' });
      } else {
        setToast({ message: 'Failed to import backup. Invalid file format.', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Error importing backup.', type: 'error' });
    }

    // Reset file input
    event.target.value = '';
  };

  const handleExport = () => {
    onExportBackup();
    setToast({ message: 'Backup exported successfully!', type: 'success' });
  };

  const handleReset = () => {
    onResetDemoData();
    setToast({ message: 'Demo data has been reset.', type: 'success' });
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-white">Integration Settings</h3>
        <p className="mt-2 text-sm text-slate-400">Configure future connections for WhatsApp, Sheets and payments.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {settings.map((field) => (
          <div key={field.label} className="rounded-[28px] border border-white/10 bg-[#0f0f0f] p-6 shadow-panel">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-white">{field.label}</h4>
                <p className="mt-2 text-sm text-slate-400">Mock configuration field for future integration support.</p>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Preview</span>
            </div>
            <input
              value={field.value}
              readOnly
              className="w-full rounded-3xl border border-white/10 bg-[#141414] px-4 py-3 text-slate-200 outline-none"
            />
          </div>
        ))}
      </div>

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-white">Data Management</h3>
        <p className="mt-2 text-sm text-slate-400">Backup, restore, and reset your LBL AutoFlow data.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/5 p-6">
            <h4 className="font-semibold text-emerald-200">Export Backup</h4>
            <p className="mt-2 text-sm text-slate-400">Download all your data as a JSON file for safe keeping.</p>
            <button
              onClick={handleExport}
              className="mt-4 w-full rounded-3xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Export Now
            </button>
          </div>

          <div className="rounded-[28px] border border-sky-500/20 bg-sky-500/5 p-6">
            <h4 className="font-semibold text-sky-200">Import Backup</h4>
            <p className="mt-2 text-sm text-slate-400">Restore data from a previously exported backup file.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={handleImportClick}
              className="mt-4 w-full rounded-3xl bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20"
            >
              Import Backup
            </button>
          </div>

          <div className="rounded-[28px] border border-rose-500/20 bg-rose-500/5 p-6">
            <h4 className="font-semibold text-rose-200">Reset Demo Data</h4>
            <p className="mt-2 text-sm text-slate-400">Clear all data and restore default demo samples.</p>
            <button
              onClick={handleReset}
              className="mt-4 w-full rounded-3xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              Reset Now
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#141414] p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-white">Data Persistence</h3>
        <p className="mt-2 text-sm text-slate-400">All data is automatically saved to your browser's local storage. Your data persists across sessions.</p>
        <div className="mt-6 rounded-[24px] border border-white/10 bg-[#0f0f0f] p-5">
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-gold flex-shrink-0" />
              <span>Orders and customer profiles saved automatically</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-gold flex-shrink-0" />
              <span>Kitchen queue and delivery tasks synchronized</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-gold flex-shrink-0" />
              <span>Products, templates and settings persisted</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-gold flex-shrink-0" />
              <span>Export backups for offline storage</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
