'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { TodayCoreData } from '../app/api/today/core/route';
import type { TodayCardsData } from '../app/api/today/cards/route';
import type { CardDigestItem, ChecklistDigestItem } from '../lib/emailService';

export type TodayData = TodayCoreData & TodayCardsData;

// Session-only record of items completed on the Today page this visit.
// Completed items stay visible (struck-through with an Undo) instead of
// vanishing; this resets on refresh, when the freshly-fetched data no longer
// includes them (cards/checklists are filtered to incomplete server-side).
export interface TodayCompleted {
  cards: Set<string>;
  checklists: Set<string>;
  followUps: Set<number>;
  encouragements: Set<number>;
}

const emptyCompleted = (): TodayCompleted => ({
  cards: new Set(),
  checklists: new Set(),
  followUps: new Set(),
  encouragements: new Set(),
});

const CORE_CACHE_KEY  = 'today_core_cache_v2';
const CARDS_CACHE_KEY = 'today_cards_cache_v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const EMPTY_CARDS: TodayCardsData = {
  cards: { dueToday: [], overdue: [] },
  focusCards: [],
  checklistItems: { dueToday: [], overdue: [] },
};

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeTodayCardsData(value: unknown): TodayCardsData {
  const data = value && typeof value === 'object' ? value as Partial<TodayCardsData> : {};
  return {
    cards: {
      dueToday: arrayOrEmpty<CardDigestItem>(data.cards?.dueToday),
      overdue: arrayOrEmpty<CardDigestItem>(data.cards?.overdue),
    },
    focusCards: arrayOrEmpty<CardDigestItem>(data.focusCards),
    checklistItems: {
      dueToday: arrayOrEmpty<ChecklistDigestItem>(data.checklistItems?.dueToday),
      overdue: arrayOrEmpty<ChecklistDigestItem>(data.checklistItems?.overdue),
    },
  };
}

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
        cachedCards = normalizeTodayCardsData(data);
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
  const [completed, setCompleted] = useState<TodayCompleted>(emptyCompleted);

  const fetchData = useCallback(async () => {
    setError(null);
    setIsFetching(true);
    // A refresh clears the session's done-marks; the fresh data won't include
    // truly-completed cards/checklists, so there's nothing left to strike out.
    setCompleted(emptyCompleted());

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
            setIsLoading(false);
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
          freshCards = normalizeTodayCardsData(await res.json());
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

  // Completion handlers keep the item in place (the page strikes it through and
  // offers Undo) rather than removing it, so you can see what you've finished.
  // Each mark/undo pair writes the underlying flag both ways.

  // Encouragement: planned ⇄ sent
  const markEncouragementSent = useCallback((id: number) => {
    setCompleted(prev => ({ ...prev, encouragements: new Set(prev.encouragements).add(id) }));
    fetch(`/api/acpd-tracking?type=encourage&id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_type: 'sent' }),
    }).catch(err => console.error('Failed to mark encouragement sent:', err));
  }, []);

  const undoEncouragementSent = useCallback((id: number) => {
    setCompleted(prev => {
      const next = new Set(prev.encouragements);
      next.delete(id);
      return { ...prev, encouragements: next };
    });
    fetch(`/api/acpd-tracking?type=encourage&id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_type: 'planned' }),
    }).catch(err => console.error('Failed to undo encouragement:', err));
  }, []);

  // Follow-up: follow_up_required false (cleared) ⇄ true
  const clearFollowUp = useCallback(async (leaderId: number) => {
    setCompleted(prev => ({ ...prev, followUps: new Set(prev.followUps).add(leaderId) }));
    try {
      await supabase.from('circle_leaders').update({ follow_up_required: false }).eq('id', leaderId);
    } catch (err) {
      console.error('Failed to clear follow-up:', err);
    }
  }, []);

  const undoFollowUp = useCallback(async (leaderId: number) => {
    setCompleted(prev => {
      const next = new Set(prev.followUps);
      next.delete(leaderId);
      return { ...prev, followUps: next };
    });
    try {
      await supabase.from('circle_leaders').update({ follow_up_required: true }).eq('id', leaderId);
    } catch (err) {
      console.error('Failed to undo follow-up:', err);
    }
  }, []);

  // Board card: is_complete ⇄
  const markCardComplete = useCallback(async (cardId: string) => {
    setCompleted(prev => ({ ...prev, cards: new Set(prev.cards).add(cardId) }));
    try {
      await supabase.from('board_cards').update({ is_complete: true }).eq('id', cardId);
    } catch (err) {
      console.error('Failed to mark card complete:', err);
    }
  }, []);

  const undoCardComplete = useCallback(async (cardId: string) => {
    setCompleted(prev => {
      const next = new Set(prev.cards);
      next.delete(cardId);
      return { ...prev, cards: next };
    });
    try {
      await supabase.from('board_cards').update({ is_complete: false }).eq('id', cardId);
    } catch (err) {
      console.error('Failed to undo card:', err);
    }
  }, []);

  // Checklist item: is_completed ⇄
  const markChecklistDone = useCallback(async (itemId: string) => {
    setCompleted(prev => ({ ...prev, checklists: new Set(prev.checklists).add(itemId) }));
    try {
      await supabase.from('card_checklists').update({ is_completed: true }).eq('id', itemId);
    } catch (err) {
      console.error('Failed to mark checklist item done:', err);
    }
  }, []);

  const undoChecklistDone = useCallback(async (itemId: string) => {
    setCompleted(prev => {
      const next = new Set(prev.checklists);
      next.delete(itemId);
      return { ...prev, checklists: next };
    });
    try {
      await supabase.from('card_checklists').update({ is_completed: false }).eq('id', itemId);
    } catch (err) {
      console.error('Failed to undo checklist item:', err);
    }
  }, []);

  // Schedule (or reschedule) a board card — sets due_date + due_time.
  // `cardInfo` lets callers schedule cards that aren't in today's lists yet
  // (e.g. a Big 3 card with no due date dragged onto the timeline).
  const scheduleCard = useCallback(async (cardId: string, dueDate: string, dueTime: string | null, cardInfo?: CardDigestItem) => {
    setData(prev => {
      if (!prev) return prev;
      const existing =
        prev.cards.dueToday.find(c => c.id === cardId) ||
        prev.cards.overdue.find(c => c.id === cardId) ||
        (prev.focusCards || []).find(c => c.id === cardId) ||
        cardInfo;
      const strip = (list: CardDigestItem[]) => list.filter(c => c.id !== cardId);
      const dueToday = strip(prev.cards.dueToday);
      if (existing && dueDate === prev.today) {
        dueToday.push({ ...existing, due_date: dueDate, due_time: dueTime });
      }
      return {
        ...prev,
        cards: { dueToday, overdue: strip(prev.cards.overdue) },
        focusCards: (prev.focusCards || []).map(c =>
          c.id === cardId ? { ...c, due_date: dueDate, due_time: dueTime } : c),
      };
    });
    try {
      await supabase
        .from('board_cards')
        .update({ due_date: dueDate, due_time: dueTime })
        .eq('id', cardId);
    } catch (err) {
      console.error('Failed to schedule card:', err);
    }
  }, []);

  // Schedule (or reschedule) a follow-up — sets follow_up_date + follow_up_time.
  const scheduleFollowUp = useCallback(async (leaderId: number, date: string, time: string | null) => {
    setData(prev => {
      if (!prev) return prev;
      const existing =
        prev.followUps.dueToday.find(f => f.id === leaderId) ||
        prev.followUps.overdue.find(f => f.id === leaderId);
      const dueToday = prev.followUps.dueToday.filter(f => f.id !== leaderId);
      if (existing && date === prev.today) {
        dueToday.push({ ...existing, follow_up_date: date, follow_up_time: time });
      }
      return {
        ...prev,
        followUps: { dueToday, overdue: prev.followUps.overdue.filter(f => f.id !== leaderId) },
      };
    });
    try {
      await supabase
        .from('circle_leaders')
        .update({ follow_up_date: date, follow_up_time: time })
        .eq('id', leaderId);
    } catch (err) {
      console.error('Failed to schedule follow-up:', err);
    }
  }, []);

  // Create a card directly from the timeline (click an empty slot), appended
  // to the selected board list.
  const quickAddCard = useCallback(async (
    title: string,
    boardId: string,
    boardName: string,
    columnId: string,
    columnName: string,
    dueDate: string,
    dueTime: string
  ): Promise<boolean> => {
    const cleanTitle = title.trim();
    if (!cleanTitle || !boardId || !columnId) return false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: latestCard, error: positionError } = await supabase
        .from('board_cards')
        .select('position')
        .eq('column_id', columnId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (positionError) throw positionError;

      const { data: card, error: cardError } = await supabase
        .from('board_cards')
        .insert({
          title: cleanTitle,
          board_id: boardId,
          column_id: columnId,
          priority: 'medium',
          position: (latestCard?.position ?? -1) + 1,
          created_by: user.id,
          due_date: dueDate,
          due_time: dueTime,
        })
        .select('id')
        .single();
      if (cardError) throw cardError;

      setData(prev => {
        if (!prev || dueDate !== prev.today) return prev;
        const item: CardDigestItem = {
          id: card.id,
          title: cleanTitle,
          due_date: dueDate,
          due_time: dueTime,
          board_name: boardName,
          board_id: boardId,
          column_name: columnName,
          assignees: [],
          priority: 'medium',
          labels: [],
          checklist_total: 0,
          checklist_done: 0,
        };
        return { ...prev, cards: { ...prev.cards, dueToday: [...prev.cards.dueToday, item] } };
      });
      return true;
    } catch (err) {
      console.error('Failed to quick-add card:', err);
      return false;
    }
  }, []);

  return {
    data,
    completed,
    isLoading,
    isFetching,
    isCardsLoading,
    error,
    fetchData,
    markEncouragementSent,
    undoEncouragementSent,
    clearFollowUp,
    undoFollowUp,
    markCardComplete,
    undoCardComplete,
    markChecklistDone,
    undoChecklistDone,
    scheduleCard,
    scheduleFollowUp,
    quickAddCard,
  };
}
