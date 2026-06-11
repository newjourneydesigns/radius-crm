'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { TodayCoreData } from '../app/api/today/core/route';
import type { TodayCardsData } from '../app/api/today/cards/route';

export type TodayData = TodayCoreData & TodayCardsData;

const CORE_CACHE_KEY  = 'today_core_cache_v2';
const CARDS_CACHE_KEY = 'today_cards_cache_v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const EMPTY_CARDS: TodayCardsData = {
  cards: { dueToday: [], overdue: [] },
  focusCards: [],
  checklistItems: { dueToday: [], overdue: [] },
};

type CacheResult = {
  data: TodayData | null;
  hasCore: boolean;
  hasCards: boolean;
};

function readTodayCache(): CacheResult {
  const empty = { data: null, hasCore: false, hasCards: false };
  if (typeof window === 'undefined') return empty;

  try {
    const rawCore = localStorage.getItem(CORE_CACHE_KEY);
    const rawCards = localStorage.getItem(CARDS_CACHE_KEY);
    let cachedCore: TodayCoreData | null = null;
    let cachedCards: TodayCardsData | null = null;
    let hasCore = false;
    let hasCards = false;

    if (rawCore) {
      const { data, timestamp } = JSON.parse(rawCore);
      if (Date.now() - timestamp < CACHE_TTL) {
        hasCore = true;
        cachedCore = data;
      }
    }

    if (rawCards) {
      const { data, timestamp } = JSON.parse(rawCards);
      if (Date.now() - timestamp < CACHE_TTL) {
        hasCards = true;
        cachedCards = data;
      }
    }

    return {
      data: cachedCore ? { ...cachedCore, ...(cachedCards || EMPTY_CARDS) } : null,
      hasCore,
      hasCards,
    };
  } catch {
    return empty;
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function useTodayData() {
  const [data, setData] = useState<TodayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    setIsFetching(true);

    // Load cached data immediately so the page renders without a spinner
    const cached = readTodayCache();
    const hasCachedCore = cached.hasCore;
    const hasCachedCards = cached.hasCards;
    if (cached.data) setData(cached.data);

    // Only block with a full-page spinner on the very first load (no cache at all)
    if (!hasCachedCore) setIsLoading(true);
    // Show card-section loading when cards aren't cached
    if (!hasCachedCards) setIsCardsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        setIsLoading(false);
        setIsCardsLoading(false);
        setIsFetching(false);
        return;
      }

      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Closure vars so both callbacks can read the latest value from the other
      let freshCore: TodayCoreData | null  = null;
      let freshCards: TodayCardsData | null = null;

      const applyData = () => {
        if (freshCore) setData({ ...freshCore, ...(freshCards || EMPTY_CARDS) });
      };

      // Both fetches start simultaneously
      const corePromise = (async () => {
        try {
          const res = await fetch('/api/today/core', { headers });
          if (!res.ok) {
            const body = await res.json();
            setError(body.error || 'Failed to load today data');
            return;
          }
          freshCore = await res.json();
          setIsLoading(false);
          applyData();
          try { localStorage.setItem(CORE_CACHE_KEY, JSON.stringify({ data: freshCore, timestamp: Date.now() })); } catch {}
        } catch (err: unknown) {
          setIsLoading(false);
          setError(getErrorMessage(err));
        }
      })();

      const cardsPromise = (async () => {
        try {
          const res = await fetch('/api/today/cards', { headers });
          if (!res.ok) { setIsCardsLoading(false); return; }
          freshCards = await res.json();
          setIsCardsLoading(false);
          applyData();
          try { localStorage.setItem(CARDS_CACHE_KEY, JSON.stringify({ data: freshCards, timestamp: Date.now() })); } catch {}
        } catch {
          setIsCardsLoading(false);
        }
      })();

      await Promise.allSettled([corePromise, cardsPromise]);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsLoading(false);
      setIsCardsLoading(false);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // Mark an encouragement as sent — removes from local state optimistically
  const markEncouragementSent = useCallback(async (id: number) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        encouragements: {
          dueToday: prev.encouragements.dueToday.filter(e => e.id !== id),
          overdue: prev.encouragements.overdue.filter(e => e.id !== id),
        },
      };
    });
    try {
      await fetch(`/api/acpd-tracking?type=encourage&id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_type: 'sent' }),
      });
    } catch (err) {
      console.error('Failed to mark encouragement sent:', err);
    }
  }, []);

  // Clear a follow-up — removes from local state optimistically
  const clearFollowUp = useCallback(async (leaderId: number) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        followUps: {
          dueToday: prev.followUps.dueToday.filter(f => f.id !== leaderId),
          overdue: prev.followUps.overdue.filter(f => f.id !== leaderId),
        },
      };
    });
    try {
      await supabase
        .from('circle_leaders')
        .update({ follow_up_required: false })
        .eq('id', leaderId);
    } catch (err) {
      console.error('Failed to clear follow-up:', err);
    }
  }, []);

  // Mark a board card as complete — removes from local state optimistically
  const markCardComplete = useCallback(async (cardId: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: {
          dueToday: prev.cards.dueToday.filter(c => c.id !== cardId),
          overdue: prev.cards.overdue.filter(c => c.id !== cardId),
        },
      };
    });
    try {
      await supabase
        .from('board_cards')
        .update({ is_complete: true })
        .eq('id', cardId);
    } catch (err) {
      console.error('Failed to mark card complete:', err);
    }
  }, []);

  // Mark a checklist item as done — removes from local state optimistically
  const markChecklistDone = useCallback(async (itemId: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        checklistItems: {
          dueToday: prev.checklistItems.dueToday.filter(c => c.id !== itemId),
          overdue: prev.checklistItems.overdue.filter(c => c.id !== itemId),
        },
      };
    });
    try {
      await supabase
        .from('card_checklists')
        .update({ is_completed: true })
        .eq('id', itemId);
    } catch (err) {
      console.error('Failed to mark checklist item done:', err);
    }
  }, []);

  return {
    data,
    isLoading,
    isFetching,
    isCardsLoading,
    error,
    fetchData,
    markEncouragementSent,
    clearFollowUp,
    markCardComplete,
    markChecklistDone,
  };
}
