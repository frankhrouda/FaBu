import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = (messageOrOptions, type = 'success') => {
    const isObjectInput = typeof messageOrOptions === 'object' && messageOrOptions !== null;
    const message = isObjectInput ? String(messageOrOptions.message || '') : String(messageOrOptions || '');
    const resolvedType = isObjectInput ? (messageOrOptions.type || 'success') : type;

    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type: resolvedType }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, show, dismiss };
}

export function ToastContainer({ toasts, dismiss, onDismiss }) {
  const handleDismiss = dismiss || onDismiss || (() => {});

  return (
    <div className="fixed top-16 left-0 right-0 z-50 flex flex-col gap-2 px-4 max-w-lg mx-auto pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium pointer-events-auto animate-fade-in ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
          }`}
        >
          {toast.type === 'error' ? <XCircle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => handleDismiss(toast.id)} className="shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
