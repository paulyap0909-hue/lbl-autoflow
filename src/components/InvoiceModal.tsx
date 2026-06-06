import React from 'react';
import type { Order } from '../data/mockData';
import InvoiceTemplate from './InvoiceTemplate';

type InvoiceModalProps = {
  order: Order;
  onClose: () => void;
  onMarkPaid: () => void;
};

export default function InvoiceModal({ order, onClose, onMarkPaid }: InvoiceModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-[1400px] overflow-hidden rounded-[32px] border border-white/10 bg-[#090909] shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-white/10 bg-[#0f0f0f] p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-softGold">Invoice View</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Professional Invoice</h3>
          </div>
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 md:static md:ml-4">
            Close
          </button>
        </div>

        <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-6">
          <InvoiceTemplate order={order} onMarkPaid={onMarkPaid} />
        </div>
      </div>
    </div>
  );
}
