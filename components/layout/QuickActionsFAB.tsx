'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useQuickActions } from '../../contexts/QuickActionsContext';

/**
 * Desktop-only quick-add speed dial (bottom-left). On mobile the same actions
 * live in the tab bar's "More" sheet, so this is hidden below `md`.
 */
export default function QuickActionsFAB() {
  const { isAuthenticated } = useAuth();
  const { open, actions } = useQuickActions();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { setIsOpen(false); }, [pathname]);

  if (!isAuthenticated()) return null;

  const handleActionClick = (id: typeof actions[number]['id']) => {
    setIsOpen(false);
    open(id);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="hidden md:block fixed inset-0 z-[10001] bg-black/40 backdrop-blur-[3px]"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="hidden md:flex fixed left-6 bottom-6 z-[10002] flex-col items-start gap-2 pointer-events-none">
        {/* Speed-dial items */}
        <div className={`flex flex-col-reverse items-start gap-2 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {actions.map((action, i) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action.id)}
              className={`w-52 flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/95 px-4 py-2.5 text-slate-100 shadow-card-glass transition-all duration-200 hover:bg-zinc-700/95 focus:outline-none focus:ring-2 focus:ring-vc-500 ${
                isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
              style={{ transitionDelay: isOpen ? `${i * 35}ms` : `${(actions.length - 1 - i) * 20}ms` }}
              aria-label={action.label}
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-vc-400">
                {action.icon}
              </span>
              <span className="text-sm font-medium whitespace-nowrap">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Main FAB */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white bg-vc-fab shadow-glow-vc transition-all duration-200 active:scale-90 pointer-events-auto border border-vc-700/40"
          aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={isOpen}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${isOpen ? 'rotate-45' : 'rotate-0'}`}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </>
  );
}
