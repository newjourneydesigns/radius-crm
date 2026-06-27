'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import type { RealtimeSubscriptionConfig } from './useRealtimeSubscription';
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
  // Birthdays and prayers have no completion field of their own, so their done
  // state is persisted in today_done_marks and seeded back here on load.
  // Prayer keys are `${kind}:${id}` (leader | general).
  birthdays: Set<number>;
  prayers: Set<string>;
}

const emptyCompleted = (): TodayCompleted => ({
  cards: new Set(),
  checklists: new Set(),
  followUps: new Set(),
  encouragements: new Set(),
  birthdays: new Set(),
  prayers: new Set(),
});

export const prayerKey = (id: number, isGeneral: boolean | undefined): string =>
  `${isGeneral ? 'general' : 'leader'}:${id}`;

// Today's date in America/Chicago, matching the server's getTodayDate so
// done-marks line up with the day the digest is computed for.
function todayCST(): string {
  const cst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const y = cst.getFullYear();
  const m = String(cst.getMonth() + 1).padStart(2, '0');
  const d = String(cst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const CORE_CACHE_KEY  = 'today_core_cache_v2';
const CARDS_CACHE_KEY = 'today_cards_cache_v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Call this after any mutation that would affect Today page data (logging a
// connection, completing a follow-up from another page, etc.) so the next visit
// to Today fetches fresh rather than showing stale localStorage data.
export function clearTodayCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CORE_CACHE_KEY);
    localStorage.removeItem(CARDS_CACHE_KEY);
  } catch {}
}

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

function setCardCompleteFlag(data: TodayData, cardId: string, isComplete: boolean): TodayData {
  const update = (card: CardDigestItem) => card.id === cardId ? { ...card, is_complete: isComplete } : card;
  return {
    ...data,
    cards: {
      dueToday: data.cards.dueToday.map(update),
      overdue: data.cards.overdue.map(update).filter(card => !card.is_complete),
    },
    focusCards: (data.focusCards || []).map(update),
  };
}

type FetchTodayOptions = {
  fresh?: boolean;
  useCache?: boolean;
};

export function useTodayData() {
  const [data, setData] = useState<TodayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<TodayCompleted>(emptyCompleted);
  const dataRef = useRef<TodayData | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic id for each fetchData call. The page fires fetches from several
  // triggers (mount, focus/visibility, realtime refetch, view-date effects), and
  // on slow connections a fetch issued *before* a mutation can resolve *after* it.
  // Only the latest fetch may apply its results, so a stale in-flight response
  // can't clobber freshly-completed state (e.g. revert a just-marked card to undone).
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Today defaults to a fresh read because stale task/follow-up state is worse
  // than a slower load here. `fresh` bypasses the server's per-user response
  // cache via ?fresh=1; `cache: 'no-store'` also prevents the browser from
  // replaying a stale response for the identical URL.
  const fetchData = useCallback(async (opts?: FetchTodayOptions) => {
    const fresh = opts?.fresh ?? true;
    const useCache = opts?.useCache ?? false;
    // Claim this fetch's slot. Any later fetchData call bumps the counter, which
    // marks this one stale so its (possibly out-of-order) response is ignored.
    const seq = ++fetchSeqRef.current;
    const isLatest = () => seq === fetchSeqRef.current;
    setError(null);
    setIsFetching(true);
    // NOTE: we intentionally do NOT clear the session's done-marks here.
    // A refetch can momentarily read pre-commit state (especially on mobile,
    // where the write may still be in flight and realtime is unreliable), so
    // wiping the marks let a just-completed card flash back to undone. Keeping
    // them makes completion sticky: done = is_complete (server) || marked this
    // session. Birthday/prayer marks are re-seeded from today_done_marks below;
    // card/checklist/follow-up/encouragement marks are cleared only by Undo.

    // Cached data is opt-in only; the default Today path favors fresh state.
    const cached = useCache
      ? readTodayCache()
      : { data: null, hasCore: false, hasCards: false };
    const hasCachedCore = cached.hasCore;
    const hasCachedCards = cached.hasCards;
    if (cached.data) setData(cached.data);

    // Only block with a full-page spinner on the very first load (no cache at all)
    if (!hasCachedCore && !dataRef.current) setIsLoading(true);
    // Show card-section loading when cards aren't cached
    if (!hasCachedCards && !dataRef.current) setIsCardsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isLatest()) return;
      if (!session?.access_token) {
        setError('Not authenticated');
        setIsLoading(false);
        setIsCardsLoading(false);
        setIsFetching(false);
        return;
      }

      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Seed persisted birthday/prayer done-marks for today so those rows show
      // as done (struck through with Undo) after a refresh or reload.
      void (async () => {
        const { data: marks } = await supabase
          .from('today_done_marks')
          .select('item_type, item_key')
          .eq('done_on', todayCST());
        if (!marks) return;
        const birthdays = new Set<number>();
        const prayers = new Set<string>();
        for (const m of marks as { item_type: string; item_key: string }[]) {
          if (m.item_type === 'birthday') birthdays.add(Number(m.item_key));
          else if (m.item_type === 'prayer') prayers.add(m.item_key);
        }
        if (isLatest()) setCompleted(prev => ({ ...prev, birthdays, prayers }));
      })();

      // Closure vars so both callbacks can read the latest value from the other
      let freshCore: TodayCoreData | null  = null;
      let freshCards: TodayCardsData | null = null;

      const applyData = () => {
        if (!isLatest()) return;
        if (freshCore) setData({ ...freshCore, ...(freshCards || EMPTY_CARDS) });
      };

      // Both fetches start simultaneously
      const corePromise = (async () => {
        try {
          const res = await fetch(fresh ? '/api/today/core?fresh=1' : '/api/today/core', { headers, cache: 'no-store' });
          // A newer fetch superseded us — drop this response so it can't overwrite fresher state.
          if (!isLatest()) return;
          if (!res.ok) {
            const body = await res.json();
            setError(body.error || 'Failed to load today data');
            setIsLoading(false);
            return;
          }
          freshCore = await res.json();
          if (!isLatest()) return;
          setIsLoading(false);
          applyData();
          try { localStorage.setItem(CORE_CACHE_KEY, JSON.stringify({ data: freshCore, timestamp: Date.now() })); } catch {}
        } catch (err: unknown) {
          if (!isLatest()) return;
          setIsLoading(false);
          setError(getErrorMessage(err));
        }
      })();

      const cardsPromise = (async () => {
        try {
          const cardsUrl = fresh ? '/api/today/cards?fresh=1' : '/api/today/cards';
          const res = await fetch(cardsUrl, { headers, cache: 'no-store' });
          if (!isLatest()) return;
          if (!res.ok) { setIsCardsLoading(false); return; }
          freshCards = normalizeTodayCardsData(await res.json());
          if (!isLatest()) return;
          setIsCardsLoading(false);
          applyData();
          try { localStorage.setItem(CARDS_CACHE_KEY, JSON.stringify({ data: freshCards, timestamp: Date.now() })); } catch {}
        } catch {
          if (isLatest()) setIsCardsLoading(false);
        }
      })();

      await Promise.allSettled([corePromise, cardsPromise]);
    } catch (err: unknown) {
      if (!isLatest()) return;
      setError(getErrorMessage(err));
      setIsLoading(false);
      setIsCardsLoading(false);
    } finally {
      if (isLatest()) setIsFetching(false);
    }
  }, []);

  // Invalidate any fetch that's currently in flight. Called at the start of every
  // optimistic mutation so a response that was already on the wire — reflecting
  // pre-mutation state — can't land afterwards and revert what the user just did.
  // Only a fetch issued *after* the write (which reads the committed value) wins.
  const invalidateInFlightFetches = useCallback(() => {
    fetchSeqRef.current += 1;
  }, []);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
    }

    realtimeRefreshTimerRef.current = setTimeout(() => {
      fetchData({ fresh: true, useCache: false });
    }, 450);
  }, [fetchData]);

  const userId = data?.user.id ?? null;

  const realtimeSubscriptions: RealtimeSubscriptionConfig[] = useMemo(() => {
    if (!userId) return [];

    return [
      { table: 'circle_visits', filter: `scheduled_by=eq.${userId}` },
      { table: 'acpd_encouragements', filter: `user_id=eq.${userId}` },
      { table: 'notes', filter: `created_by=eq.${userId}` },
      { table: 'acpd_prayer_points', filter: `user_id=eq.${userId}` },
      { table: 'general_prayer_points', filter: `user_id=eq.${userId}` },
      { table: 'project_boards', filter: `user_id=eq.${userId}` },
      { table: 'card_assignments', filter: `user_id=eq.${userId}` },

      // These tables do not have a direct user_id on every relevant row. The
      // debounced fresh refetch re-applies ownership/RLS and keeps Today correct
      // when cards, checklist items, labels, columns, or leader details change.
      { table: 'circle_leaders' },
      { table: 'board_cards' },
      { table: 'card_checklists' },
      { table: 'card_label_assignments' },
      { table: 'board_labels' },
      { table: 'board_columns' },
    ];
  }, [userId]);

  useRealtimeSubscription(
    userId ? `today-${userId}` : 'today-pending',
    realtimeSubscriptions,
    scheduleRealtimeRefresh,
    Boolean(userId),
  );

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }
    };
  }, []);

  // Completion handlers keep the item in place (the page strikes it through and
  // offers Undo) rather than removing it, so you can see what you've finished.
  // Each mark/undo pair writes the underlying flag both ways.

  // Encouragement: planned ⇄ sent
  const markEncouragementSent = useCallback((id: number) => {
    invalidateInFlightFetches();
    setCompleted(prev => ({ ...prev, encouragements: new Set(prev.encouragements).add(id) }));
    fetch(`/api/acpd-tracking?type=encourage&id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_type: 'sent' }),
    }).catch(err => console.error('Failed to mark encouragement sent:', err));
  }, [invalidateInFlightFetches]);

  const undoEncouragementSent = useCallback((id: number) => {
    invalidateInFlightFetches();
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
  }, [invalidateInFlightFetches]);

  // Follow-up: follow_up_required false (cleared) ⇄ true
  const clearFollowUp = useCallback(async (leaderId: number) => {
    invalidateInFlightFetches();
    setCompleted(prev => ({ ...prev, followUps: new Set(prev.followUps).add(leaderId) }));
    try {
      await supabase.from('circle_leaders').update({ follow_up_required: false }).eq('id', leaderId);
    } catch (err) {
      console.error('Failed to clear follow-up:', err);
    }
  }, [invalidateInFlightFetches]);

  const undoFollowUp = useCallback(async (leaderId: number) => {
    invalidateInFlightFetches();
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
  }, [invalidateInFlightFetches]);

  // Board card: is_complete ⇄
  const markCardComplete = useCallback(async (cardId: string) => {
    invalidateInFlightFetches();
    setCompleted(prev => ({ ...prev, cards: new Set(prev.cards).add(cardId) }));
    setData(prev => prev ? setCardCompleteFlag(prev, cardId, true) : prev);
    try {
      await supabase.from('board_cards').update({ is_complete: true }).eq('id', cardId);
    } catch (err) {
      console.error('Failed to mark card complete:', err);
    }
  }, [invalidateInFlightFetches]);

  const undoCardComplete = useCallback(async (cardId: string) => {
    invalidateInFlightFetches();
    setCompleted(prev => {
      const next = new Set(prev.cards);
      next.delete(cardId);
      return { ...prev, cards: next };
    });
    setData(prev => prev ? setCardCompleteFlag(prev, cardId, false) : prev);
    try {
      await supabase.from('board_cards').update({ is_complete: false }).eq('id', cardId);
    } catch (err) {
      console.error('Failed to undo card:', err);
    }
  }, [invalidateInFlightFetches]);

  // Checklist item: is_completed ⇄
  const markChecklistDone = useCallback(async (itemId: string) => {
    invalidateInFlightFetches();
    setCompleted(prev => ({ ...prev, checklists: new Set(prev.checklists).add(itemId) }));
    try {
      await supabase.from('card_checklists').update({ is_completed: true }).eq('id', itemId);
    } catch (err) {
      console.error('Failed to mark checklist item done:', err);
    }
  }, [invalidateInFlightFetches]);

  const undoChecklistDone = useCallback(async (itemId: string) => {
    invalidateInFlightFetches();
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
  }, [invalidateInFlightFetches]);

  // Birthday: persisted per-day in today_done_marks (no field of its own).
  const markBirthdayDone = useCallback(async (leaderId: number) => {
    invalidateInFlightFetches();
    setCompleted(prev => ({ ...prev, birthdays: new Set(prev.birthdays).add(leaderId) }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('today_done_marks').upsert({
        user_id: user.id, item_type: 'birthday', item_key: String(leaderId), done_on: todayCST(),
      }, { onConflict: 'user_id,item_type,item_key,done_on' });
    } catch (err) {
      console.error('Failed to mark birthday done:', err);
    }
  }, [invalidateInFlightFetches]);

  const undoBirthdayDone = useCallback(async (leaderId: number) => {
    invalidateInFlightFetches();
    setCompleted(prev => {
      const next = new Set(prev.birthdays);
      next.delete(leaderId);
      return { ...prev, birthdays: next };
    });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('today_done_marks').delete()
        .eq('user_id', user.id).eq('item_type', 'birthday')
        .eq('item_key', String(leaderId)).eq('done_on', todayCST());
    } catch (err) {
      console.error('Failed to undo birthday:', err);
    }
  }, [invalidateInFlightFetches]);

  // Prayer: persisted per-day in today_done_marks, keyed by `${kind}:${id}`.
  const markPrayerDone = useCallback(async (id: number, isGeneral: boolean) => {
    const key = prayerKey(id, isGeneral);
    invalidateInFlightFetches();
    setCompleted(prev => ({ ...prev, prayers: new Set(prev.prayers).add(key) }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('today_done_marks').upsert({
        user_id: user.id, item_type: 'prayer', item_key: key, done_on: todayCST(),
      }, { onConflict: 'user_id,item_type,item_key,done_on' });
    } catch (err) {
      console.error('Failed to mark prayer done:', err);
    }
  }, [invalidateInFlightFetches]);

  const undoPrayerDone = useCallback(async (id: number, isGeneral: boolean) => {
    const key = prayerKey(id, isGeneral);
    invalidateInFlightFetches();
    setCompleted(prev => {
      const next = new Set(prev.prayers);
      next.delete(key);
      return { ...prev, prayers: next };
    });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('today_done_marks').delete()
        .eq('user_id', user.id).eq('item_type', 'prayer')
        .eq('item_key', key).eq('done_on', todayCST());
    } catch (err) {
      console.error('Failed to undo prayer:', err);
    }
  }, [invalidateInFlightFetches]);

  // Schedule (or reschedule) a board card — sets due_date + due_time.
  // `cardInfo` lets callers schedule cards that aren't in today's lists yet
  // (e.g. a Big 3 card with no due date dragged onto the timeline).
  const scheduleCard = useCallback(async (cardId: string, dueDate: string, dueTime: string | null, cardInfo?: CardDigestItem) => {
    invalidateInFlightFetches();
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
  }, [invalidateInFlightFetches]);

  // Schedule (or reschedule) a follow-up — sets follow_up_date + follow_up_time.
  const scheduleFollowUp = useCallback(async (leaderId: number, date: string, time: string | null) => {
    invalidateInFlightFetches();
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
  }, [invalidateInFlightFetches]);

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

      invalidateInFlightFetches();
      setData(prev => {
        if (!prev || dueDate !== prev.today) return prev;
        const item: CardDigestItem = {
          id: card.id,
          title: cleanTitle,
          due_date: dueDate,
          due_time: dueTime,
          is_complete: false,
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
  }, [invalidateInFlightFetches]);

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
    markBirthdayDone,
    undoBirthdayDone,
    markPrayerDone,
    undoPrayerDone,
    scheduleCard,
    scheduleFollowUp,
    quickAddCard,
  };
}
