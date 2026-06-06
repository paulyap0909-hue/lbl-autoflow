import React, { useEffect } from 'react';

type ToastProps = {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
};

export default function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgClass = type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-200' : 'bg-sky-500/10 border-sky-500/20 text-sky-200';
  const iconClass = type === 'success' ? 'text-emerald-400' : type === 'error' ? 'text-rose-400' : 'text-sky-400';

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-[20px] border ${bgClass} px-5 py-4 shadow-lg`}>
      <div className={`h-5 w-5 rounded-full ${iconClass}`}>
        {type === 'success' && (
          <svg className="h-full w-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {type === 'error' && (
          <svg className="h-full w-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium">{message}</p>
      <button onClick={onClose} className="ml-auto text-lg opacity-60 transition hover:opacity-100">
        ×
      </button>
    </div>
  );
}
