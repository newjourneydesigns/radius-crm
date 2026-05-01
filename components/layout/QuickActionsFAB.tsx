'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import AddNoteModal from '../dashboard/AddNoteModal';
import QuickConnectionModal from '../modals/QuickConnectionModal';
import AddPrayerModal from '../modals/AddPrayerModal';
import SetFollowUpModal from '../modals/SetFollowUpModal';
import AddCardModal from '../modals/AddCardModal';

type ActionId = 'note' | 'connection' | 'followup' | 'prayer' | 'card';

const ACTIONS: { id: ActionId; label: string; icon: React.ReactNode }[] = [
  // Index 0 = bottom (closest to FAB), index 4 = top (furthest)
  {
    id: 'note',
    label: 'Log a Note',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    id: 'connection',
    label: 'Log a Connection',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: 'followup',
    label: 'Set Follow-Up',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <circle cx="12" cy="16" r="2" />
      </svg>
    ),
  },
  {
    id: 'prayer',
    label: 'Log Prayer',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    id: 'card',
    label: 'Add Board Card',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
];

export default function QuickActionsFAB() {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActionId | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!isAuthenticated()) return null;

  const handleActionClick = (id: ActionId) => {
    setIsOpen(false);
    setActiveModal(id);
  };

  const closeModal = () => setActiveModal(null);

  return (
    <>
      {/* Backdrop — blurs content and captures outside taps */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-[3px]"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* FAB container — stays bottom-left on both mobile and desktop */}
      <div
        className="fixed left-4 z-[10002] flex flex-col items-start gap-2 bottom-[calc(98px+env(safe-area-inset-bottom,0px)+16px)] md:bottom-6"
      >
        {/* Speed dial items — rendered flex-col-reverse so index 0 (Note) is closest to FAB */}
        <div className={`flex flex-col-reverse items-start gap-2 ${!isOpen ? 'pointer-events-none' : ''}`}>
          {ACTIONS.map((action, i) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action.id)}
              className={`w-48 max-w-[calc(100vw-2rem)] flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/95 px-4 py-2.5 text-slate-100 shadow-card-glass transition-all duration-200 hover:bg-slate-700/95 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isOpen
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-3 pointer-events-none'
              }`}
              style={{
                transitionDelay: isOpen
                  ? `${i * 35}ms`
                  : `${(ACTIONS.length - 1 - i) * 20}ms`,
              }}
              aria-label={action.label}
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-blue-300">
                {action.icon}
              </span>
              <span className="text-xs font-semibold whitespace-nowrap">
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* Main FAB button */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-200 active:scale-90"
          style={{
            background: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)',
            boxShadow: isOpen
              ? '0 2px 8px rgba(96, 165, 250, 0.3), 0 1px 4px rgba(0,0,0,0.3)'
              : '0 0 14px rgba(96, 165, 250, 0.45), 0 2px 8px rgba(0,0,0,0.35)',
            border: '2px solid rgba(9, 27, 52, 0.85)',
          }}
          aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={isOpen}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${isOpen ? 'rotate-45' : 'rotate-0'}`}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Modals */}
      <AddNoteModal isOpen={activeModal === 'note'} onClose={closeModal} />
      <QuickConnectionModal isOpen={activeModal === 'connection'} onClose={closeModal} />
      <AddPrayerModal isOpen={activeModal === 'prayer'} onClose={closeModal} />
      <SetFollowUpModal isOpen={activeModal === 'followup'} onClose={closeModal} />
      <AddCardModal isOpen={activeModal === 'card'} onClose={closeModal} />
    </>
  );
}
