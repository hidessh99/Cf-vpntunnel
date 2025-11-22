import React, { createContext, useContext, useState, useCallback } from 'react';

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2300);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div id="toast-container" className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 space-y-2 pointer-events-none w-max">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${t.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'} text-white px-4 py-2 rounded-xl shadow-xl text-xs font-bold transition-all transform animate-fade-in-up`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
