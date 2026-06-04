'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import AddNoteModal from '../components/dashboard/AddNoteModal';
import QuickConnectionModal from '../components/modals/QuickConnectionModal';
import AddPrayerModal from '../components/modals/AddPrayerModal';
import SetFollowUpModal from '../components/modals/SetFollowUpModal';
import AddCardModal from '../components/modals/AddCardModal';

export type QuickActionId = 'note' | 'connection' | 'followup' | 'prayer' | 'card';

export interface QuickActionMeta {
  id: QuickActionId;
  label: string;
  icon: React.ReactNode;
}

/** Shared metadata for the global quick-add actions (label + icon). */
export const QUICK_ACTIONS: QuickActionMeta[] = [
  {
    id: 'note',
    label: 'Log a Leader Note',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    id: 'connection',
    label: 'Log a Connection',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
    label: 'Log Prayer Request',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    id: 'card',
    label: 'Add a Card',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
];

interface QuickActionsContextValue {
  open: (id: QuickActionId) => void;
  actions: QuickActionMeta[];
}

const QuickActionsContext = createContext<QuickActionsContextValue | undefined>(undefined);

export const useQuickActions = () => {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) throw new Error('useQuickActions must be used within a QuickActionsProvider');
  return ctx;
};

/**
 * Owns the five global "quick add" modals and exposes a single `open(id)` so the
 * desktop FAB and the mobile More sheet can trigger them without duplicating the
 * modal wiring.
 */
export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<QuickActionId | null>(null);

  const open = useCallback((id: QuickActionId) => setActive(id), []);
  const close = useCallback(() => setActive(null), []);

  const value = useMemo(() => ({ open, actions: QUICK_ACTIONS }), [open]);

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <AddNoteModal isOpen={active === 'note'} onClose={close} />
      <QuickConnectionModal isOpen={active === 'connection'} onClose={close} />
      <AddPrayerModal isOpen={active === 'prayer'} onClose={close} />
      <SetFollowUpModal isOpen={active === 'followup'} onClose={close} />
      <AddCardModal isOpen={active === 'card'} onClose={close} />
    </QuickActionsContext.Provider>
  );
}
