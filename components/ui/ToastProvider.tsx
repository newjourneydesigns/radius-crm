'use client';

// Lightweight app-wide toast. Replaces blocking native alert() calls with a
// non-blocking, styled, auto-dismissing message that fits the installed PWA.
// Call const toast = useToast(); toast('Saved', 'success').

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'info' | 'success' | 'error';
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {});

/** Returns showToast(message, type?). No-op until the provider mounts. */
export function useToast() {
  return useContext(ToastContext);
}

const TONE: Record<ToastType, string> = {
  info: 'border-gray-700 bg-gray-800 text-gray-100',
  success: 'border-green-700 bg-green-900/80 text-green-100',
  error: 'border-red-700 bg-red-900/80 text-red-100',
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);

  useEffect(() => setMounted(true), []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (!message) return;
    const id = (idRef.current += 1);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed inset-x-0 top-0 z-[9998] flex flex-col items-center gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className={`pointer-events-auto w-full max-w-md cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-lg ${TONE[t.type]}`}
              >
                {t.message}
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
