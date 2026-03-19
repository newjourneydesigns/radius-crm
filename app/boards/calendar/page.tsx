'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { useProjectBoard, FullBoard } from '../../../hooks/useProjectBoard';
import ProtectedRoute from '../../../components/ProtectedRoute';
import type { CardPriority } from '../../../lib/supabase';
import { supabase } from '../../../lib/supabase';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Search,
  X,
  Flag,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  User,
  LayoutDashboard,
  ListBullet,
  Plus,
} from '../../../components/icons/BoardIcons';

/* ═══════════════════════════════════════════════════════════
   Priority config
   ═══════════════════════════════════════════════════════════ */
const PRIORITY_CONFIG: Record<CardPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.18)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.18)' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.18)' },
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.18)' },
};

/* Board color palette — deterministic color per board */
const BOARD_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80',
];

function getBoardColor(index: number) {
  return BOARD_COLORS[index % BOARD_COLORS.length];
}

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */
interface CalendarCard {
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  boardColor: string;
  columnTitle: string;
  priority: CardPriority | null;
  start: Date;
  end: Date; // inclusive
  assignee: string | null;
  type: 'card' | 'checklist';
  parentCardTitle?: string;
  cardId: string;
  isComplete?: boolean;
}

/* ═══════════════════════════════════════════════════════════
   Calendar Page
   ═══════════════════════════════════════════════════════════ */
function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useAuth();
  const { fetchAllBoardsFull } = useProjectBoard();

  const [fullBoards, setFullBoards] = useState<FullBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);

  // Current month
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => today.getFullYear());
  const [month, setMonth] = useState(() => today.getMonth());

  // Pre-filter from ?board= query param
  const initialBoardId = searchParams.get('board');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(
    () => initialBoardId ? new Set([initialBoardId]) : new Set()
  );
  const [showBoardFilter, setShowBoardFilter] = useState(false);
  const boardFilterRef = useRef<HTMLDivElement>(null);

  // View mode
  const [view, setView] = useState<'month' | 'day' | 'agenda'>(() => {
    if (typeof window === 'undefined') return 'month';
    return (localStorage.getItem('boards-calendar-view') as 'month' | 'day' | 'agenda') || 'month';
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => today);

  // Persist calendar state to localStorage
  useEffect(() => { localStorage.setItem('boards-calendar-view', view); }, [view]);
  useEffect(() => { localStorage.setItem('boards-calendar-year', String(year)); }, [year]);
  useEffect(() => { localStorage.setItem('boards-calendar-month', String(month)); }, [month]);
  useEffect(() => { localStorage.setItem('boards-calendar-selected-date', toDateKey(selectedDate)); }, [selectedDate]);
  useEffect(() => { localStorage.setItem('boards-last-route', '/boards/calendar'); }, []);

  // Tooltip
  const [tooltip, setTooltip] = useState<{ card: CalendarCard; x: number; y: number } | null>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Mobile collapsed calendar state
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  // Quick-add card state
  const [showAddCard, setShowAddCard] = useState(false);
  const [addCardBoardId, setAddCardBoardId] = useState('');
  const [addCardColumnId, setAddCardColumnId] = useState('');
  const [addCardTitle, setAddCardTitle] = useState('');
  const [addCardSaving, setAddCardSaving] = useState(false);
  const addCardInputRef = useRef<HTMLInputElement>(null);

  // When board selection changes, default column to first column
  const addCardBoard = fullBoards.find(b => b.id === addCardBoardId);
  const addCardColumns = addCardBoard
    ? [...addCardBoard.columns].sort((a, b) => a.position - b.position)
    : [];

  useEffect(() => {
    if (addCardColumns.length > 0 && !addCardColumns.find(c => c.id === addCardColumnId)) {
      setAddCardColumnId(addCardColumns[0].id);
    }
  }, [addCardBoardId, addCardColumns, addCardColumnId]);

  // Open quick-add modal
  const openAddCard = () => {
    // Default to first board (or the filtered board if only one selected)
    const defaultBoardId = selectedBoardIds.size === 1
      ? Array.from(selectedBoardIds)[0]
      : fullBoards[0]?.id || '';
    setAddCardBoardId(defaultBoardId);
    setAddCardColumnId('');
    setAddCardTitle('');
    setShowAddCard(true);
    setTimeout(() => addCardInputRef.current?.focus(), 100);
  };

  // Save card
  const saveNewCard = async () => {
    if (!addCardTitle.trim() || !addCardBoardId || !addCardColumnId) return;
    setAddCardSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      // Get max position in target column
      const { data: colCards } = await supabase
        .from('board_cards')
        .select('position')
        .eq('column_id', addCardColumnId)
        .order('position', { ascending: false })
        .limit(1);
      const maxPos = colCards && colCards.length > 0 ? colCards[0].position : -1;

      const { error } = await supabase.from('board_cards').insert([{
        board_id: addCardBoardId,
        column_id: addCardColumnId,
        title: addCardTitle.trim(),
        due_date: toDateKey(selectedDate),
        position: maxPos + 1,
        created_by: authUser?.id || null,
      }]);
      if (error) throw error;

      // Refresh boards
      const results = await fetchAllBoardsFull();
      setFullBoards(results);
      setShowAddCard(false);
      setAddCardTitle('');
    } catch (err) {
      console.error('Failed to add card:', err);
    } finally {
      setAddCardSaving(false);
    }
  };

  /* ── Fetch all boards + their cards in one batch ────────── */
  useEffect(() => {
    let cancelled = false;
    setLoadingBoards(true);

    (async () => {
      const results = await fetchAllBoardsFull();
      if (!cancelled) {
        setFullBoards(results);
        setLoadingBoards(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fetchAllBoardsFull]);

  /* ── Close board filter on outside click ───────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boardFilterRef.current && !boardFilterRef.current.contains(e.target as Node)) {
        setShowBoardFilter(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Map cards into calendar events ─────────────────────── */
  const calendarCards = useMemo(() => {
    const cards: CalendarCard[] = [];
    const lowerSearch = search.toLowerCase().trim();

    fullBoards.forEach((board, boardIdx) => {
      // Board filter
      if (selectedBoardIds.size > 0 && !selectedBoardIds.has(board.id)) return;

      const colMap = new Map(board.columns.map(c => [c.id, c.title]));
      const boardColor = getBoardColor(boardIdx);

      board.cards.forEach(card => {
        // Card-level dates
        if (card.start_date || card.due_date) {
          // Search filter
          if (!lowerSearch || `${card.title} ${card.assignee || ''} ${card.description || ''}`.toLowerCase().includes(lowerSearch)) {
            const start = card.start_date ? parseDate(card.start_date) : parseDate(card.due_date!);
            const end = card.due_date ? parseDate(card.due_date) : parseDate(card.start_date!);

            cards.push({
              id: card.id,
              title: card.title,
              boardId: board.id,
              boardTitle: board.title,
              boardColor,
              columnTitle: colMap.get(card.column_id) || '',
              priority: (card.priority as CardPriority) || null,
              start,
              end,
              assignee: card.assignee || null,
              type: 'card',
              cardId: card.id,
              isComplete: card.is_complete,
            });
          }
        }

        // Checklist item due dates
        (card.checklists || []).forEach(cl => {
          if (!cl.due_date) return;
          if (lowerSearch && !`${cl.title} ${card.title}`.toLowerCase().includes(lowerSearch)) return;

          const d = parseDate(cl.due_date);
          cards.push({
            id: cl.id,
            title: cl.title,
            boardId: board.id,
            boardTitle: board.title,
            boardColor,
            columnTitle: colMap.get(card.column_id) || '',
            priority: null,
            start: d,
            end: d,
            assignee: null,
            type: 'checklist',
            parentCardTitle: card.title,
            cardId: card.id,
            isComplete: card.is_complete,
          });
        });
      });
    });

    return cards;
  }, [fullBoards, selectedBoardIds, search]);

  /* ── Build calendar grid ────────────────────────────────── */
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: { date: Date; inMonth: boolean }[] = [];

    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), inMonth: true });
    }
    // Next month padding — fill to complete last row
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        days.push({ date: new Date(year, month + 1, d), inMonth: false });
      }
    }

    return days;
  }, [year, month]);

  /* ── Get events for a specific day ──────────────────────── */
  const getEventsForDay = useCallback((date: Date) => {
    const dk = toDateKey(date);
    return calendarCards.filter(c => {
      const sk = toDateKey(c.start);
      const ek = toDateKey(c.end);
      return dk >= sk && dk <= ek;
    });
  }, [calendarCards]);

  /* ── Check if a card starts on this day ─────────────────── */
  const isStartDay = (card: CalendarCard, date: Date) => isSameDay(card.start, date);
  const isEndDay = (card: CalendarCard, date: Date) => isSameDay(card.end, date);
  const isMultiDay = (card: CalendarCard) => !isSameDay(card.start, card.end);

  /* ── Day view events ─────────────────────────────────────── */
  const dayViewEvents = useMemo(() => {
    return getEventsForDay(selectedDate).sort((a, b) => {
      // Sort by priority (urgent first), then alphabetically
      const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const pa = a.priority ? priOrder[a.priority] ?? 4 : 4;
      const pb = b.priority ? priOrder[b.priority] ?? 4 : 4;
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });
  }, [selectedDate, getEventsForDay]);

  /* ── Weeks for mobile mini-calendar ──────────────────── */
  const mobileWeeks = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const allDays: { date: Date; inMonth: boolean }[] = [];

    for (let i = startDay - 1; i >= 0; i--) {
      allDays.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      allDays.push({ date: new Date(year, month, d), inMonth: true });
    }
    const remaining = 7 - (allDays.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        allDays.push({ date: new Date(year, month + 1, d), inMonth: false });
      }
    }

    // Split into weeks
    const weeks: { date: Date; inMonth: boolean }[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    return weeks;
  }, [year, month]);

  const selectedWeekIndex = useMemo(() => {
    return mobileWeeks.findIndex(week =>
      week.some(d => isSameDay(d.date, selectedDate))
    );
  }, [mobileWeeks, selectedDate]);

  /* ── Navigation ─────────────────────────────────────────── */
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(today);
  };

  const prevDay = () => {
    const d = addDays(selectedDate, -1);
    setSelectedDate(d);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };
  const nextDay = () => {
    const d = addDays(selectedDate, 1);
    setSelectedDate(d);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openDayView = (date: Date) => {
    setSelectedDate(date);
    setView('day');
  };

  const toggleComplete = async (card: CalendarCard) => {
    if (card.type === 'card') {
      const newVal = !card.isComplete;
      await supabase.from('board_cards').update({ is_complete: newVal }).eq('id', card.cardId);
      setFullBoards(prev => prev.map(b => ({
        ...b,
        cards: b.cards.map(c => c.id === card.cardId ? { ...c, is_complete: newVal } : c),
      })));
    } else {
      // checklist item — id is the checklist item's id
      const newVal = !card.isComplete;
      await supabase.from('card_checklists').update({ is_completed: newVal }).eq('id', card.id);
      setFullBoards(prev => prev.map(b => ({
        ...b,
        cards: b.cards.map(c => ({
          ...c,
          checklists: (c.checklists || []).map(cl =>
            cl.id === card.id ? { ...cl, is_completed: newVal } : cl
          ),
        })),
      })));
    }
  };

  /* ── Board filter helpers ───────────────────────────────── */
  const toggleBoard = (id: string) => {
    setSelectedBoardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearBoardFilter = () => setSelectedBoardIds(new Set());

  /* ── Tooltip handlers ───────────────────────────────────── */
  const showTooltip = (card: CalendarCard, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ card, x: rect.left + rect.width / 2, y: rect.top });
  };
  const hideTooltip = () => setTooltip(null);

  const totalCards = calendarCards.filter(c => c.type === 'card').length;
  const totalChecklist = calendarCards.filter(c => c.type === 'checklist').length;
  const boardCount = selectedBoardIds.size > 0 ? selectedBoardIds.size : fullBoards.length;

  /* ── Mobile day select ──────────────────────────────────── */
  const selectMobileDay = (date: Date) => {
    setSelectedDate(date);
    // If tapping a day outside the current month, navigate to that month
    if (date.getMonth() !== month || date.getFullYear() !== year) {
      setMonth(date.getMonth());
      setYear(date.getFullYear());
    }
  };

  /* ── Mobile has-events lookup (for dot indicators) ──────── */
  const eventCountByDay = useMemo(() => {
    const map = new Map<string, number>();
    calendarCards.forEach(c => {
      let d = new Date(c.start);
      const endKey = toDateKey(c.end);
      while (toDateKey(d) <= endKey) {
        const key = toDateKey(d);
        map.set(key, (map.get(key) || 0) + 1);
        d = addDays(d, 1);
      }
    });
    return map;
  }, [calendarCards]);

  /* ═══════════════════════════════════════════════════════════
     Mobile view
     ═══════════════════════════════════════════════════════════ */
  if (isMobile) {
    const visibleWeeks = calendarExpanded
      ? mobileWeeks
      : selectedWeekIndex >= 0
        ? [mobileWeeks[selectedWeekIndex]]
        : [mobileWeeks[0]];

    return (
      <div className="kbc-root">
        <style>{calendarStyles}</style>
        <style>{mobileCalendarStyles}</style>
        <div className="kbm-container">
          {/* Mobile header */}
          <div className="kbm-header">
            <button
              className="kb-btn-icon"
              onClick={() => { localStorage.removeItem('boards-last-route'); router.push('/boards'); }}
            >
              <ArrowLeft size={20} />
            </button>
            <span className="kbm-header-title">Calendar</span>
            <button className="kbc-add-btn-header" onClick={openAddCard} title="Add card">
              <Plus size={20} />
            </button>
          </div>

          {/* Mini calendar card */}
          <div className="kbm-cal-card">
            {/* Month nav row */}
            <div className="kbm-month-row">
              <button className="kb-btn-icon" onClick={prevMonth}><ChevronLeft size={18} /></button>
              <button className="kbm-month-label" onClick={goToday}>
                {MONTH_NAMES[month]} {year}
              </button>
              <button className="kb-btn-icon" onClick={nextMonth}><ChevronRight size={18} /></button>
            </div>

            {/* Day-of-week headers */}
            <div className="kbm-dow-row">
              {DAY_NAMES.map(d => (
                <div key={d} className="kbm-dow">{d}</div>
              ))}
            </div>

            {/* Week rows */}
            <div className={`kbm-weeks ${calendarExpanded ? 'expanded' : ''}`}>
              {visibleWeeks.map((week, wi) => (
                <div key={wi} className="kbm-week-row">
                  {week.map(({ date, inMonth }) => {
                    const isToday = isSameDay(date, today);
                    const isSelected = isSameDay(date, selectedDate);
                    const eventCount = eventCountByDay.get(toDateKey(date)) || 0;

                    return (
                      <button
                        key={toDateKey(date)}
                        className={`kbm-day ${!inMonth ? 'out' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => selectMobileDay(date)}
                      >
                        <span className="kbm-day-num">{date.getDate()}</span>
                        {eventCount > 0 && (
                          <span className="kbm-day-dots">
                            {eventCount <= 3
                              ? Array.from({ length: eventCount }, (_, i) => (
                                  <span key={i} className="kbm-dot" />
                                ))
                              : <>
                                  <span className="kbm-dot" />
                                  <span className="kbm-dot" />
                                  <span className="kbm-dot-plus">+</span>
                                </>
                            }
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Collapse / expand toggle */}
            <button
              className="kbm-expand-btn"
              onClick={() => setCalendarExpanded(p => !p)}
            >
              <ChevronDown
                size={18}
                style={{
                  transition: 'transform 0.2s',
                  transform: calendarExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>
          </div>

          {/* Board filter pills */}
          <div className="kbm-filter-bar">
            <button
              className={`kbm-filter-pill ${selectedBoardIds.size === 0 ? 'active' : ''}`}
              onClick={clearBoardFilter}
            >
              All
            </button>
            {fullBoards.map((b, i) => (
              <button
                key={b.id}
                className={`kbm-filter-pill ${selectedBoardIds.has(b.id) ? 'active' : ''}`}
                onClick={() => toggleBoard(b.id)}
              >
                <span className="kbc-board-dot" style={{ background: getBoardColor(i), width: 8, height: 8 }} />
                {b.title}
              </button>
            ))}
          </div>

          {/* Selected day label */}
          <div className="kbm-day-label">
            <span className="kbm-day-label-text">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            {isSameDay(selectedDate, today) && <span className="kbm-today-pill">Today</span>}
            <span className="kbm-day-label-count">
              {dayViewEvents.length} item{dayViewEvents.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Event list */}
          {loadingBoards ? (
            <div className="kbc-loading">
              <div className="kb-spinner" />
              <p>Loading…</p>
            </div>
          ) : dayViewEvents.length === 0 ? (
            <div className="kbm-empty">
              <CalendarDays size={36} style={{ color: '#4b5563', marginBottom: 8 }} />
              <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>No items on this day</p>
            </div>
          ) : (
            <div className="kbm-event-list">
              {dayViewEvents.map(card => {
                const pri = card.priority ? PRIORITY_CONFIG[card.priority] : null;
                const multi = !isSameDay(card.start, card.end);
                const isOverdue = card.end < today && !isSameDay(card.end, today);

                return (
                  <div
                    key={card.id}
                    className={`kbm-event-card ${card.isComplete ? 'kbm-event-complete' : ''}`}
                    onClick={() => router.push(`/boards/${card.boardId}?card=${card.cardId}`)}
                    style={{ '--event-color': card.boardColor } as React.CSSProperties}
                  >
                    <div className="kbm-event-color" style={{ background: card.boardColor }} />
                    <div className="kbm-event-body">
                      <div className="kbm-event-top">
                        <span className="kbm-event-title">
                          {card.type === 'checklist' && (
                            <CheckSquare size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
                          )}
                          {card.title}
                        </span>
                        {pri && (
                          <span className="kbm-event-priority" style={{ color: pri.color, background: pri.bg }}>
                            <Flag size={10} /> {pri.label}
                          </span>
                        )}
                      </div>
                      {card.type === 'checklist' && card.parentCardTitle && (
                        <div className="kbm-event-parent">Card: {card.parentCardTitle}</div>
                      )}
                      <div className="kbm-event-meta">
                        <span className="kbm-event-board">
                          <span className="kbc-board-dot" style={{ background: card.boardColor }} />
                          {card.boardTitle}
                        </span>
                        <span className="kbm-event-col">{card.columnTitle}</span>
                        {multi && (
                          <span className={`kbm-event-dates ${isOverdue ? 'overdue' : ''}`}>
                            <Clock size={11} />
                            {card.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' → '}
                            {card.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {card.assignee && (
                          <span className="kbm-event-assignee"><User size={11} /> {card.assignee}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: '#4b5563', flexShrink: 0, alignSelf: 'center' }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick-add card modal (mobile) */}
        {showAddCard && (
          <div className="kbc-add-overlay" onClick={() => setShowAddCard(false)}>
            <div className="kbc-add-modal" onClick={e => e.stopPropagation()}>
              <div className="kbc-add-header">
                <span>Add Card</span>
                <button className="kbc-add-close" onClick={() => setShowAddCard(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="kbc-add-body">
                <label className="kbc-add-label">Board</label>
                <select
                  className="kbc-add-select"
                  value={addCardBoardId}
                  onChange={e => setAddCardBoardId(e.target.value)}
                >
                  <option value="">Select board...</option>
                  {fullBoards.map(b => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>

                {addCardColumns.length > 0 && (
                  <>
                    <label className="kbc-add-label">Column</label>
                    <select
                      className="kbc-add-select"
                      value={addCardColumnId}
                      onChange={e => setAddCardColumnId(e.target.value)}
                    >
                      {addCardColumns.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </>
                )}

                <label className="kbc-add-label">Title</label>
                <input
                  ref={addCardInputRef}
                  className="kbc-add-input"
                  placeholder="Card title..."
                  value={addCardTitle}
                  onChange={e => setAddCardTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveNewCard(); }}
                />

                <div className="kbc-add-date-hint">
                  <Clock size={13} />
                  Due: {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div className="kbc-add-footer">
                <button className="kbc-add-cancel" onClick={() => setShowAddCard(false)}>Cancel</button>
                <button
                  className="kbc-add-save"
                  onClick={saveNewCard}
                  disabled={addCardSaving || !addCardTitle.trim() || !addCardBoardId || !addCardColumnId}
                >
                  {addCardSaving ? 'Adding...' : 'Add Card'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="kbc-root">
      <style>{calendarStyles}</style>
      <div className="kbc-container">
        {/* Header */}
        <div className="kbc-header">
          <h1 className="kbc-page-title">Project Boards</h1>
          <div className="kbc-header-row">
            <div className="kbc-view-switcher">
              <button className="kbc-view-btn" onClick={() => { localStorage.removeItem('boards-last-route'); router.push('/boards'); }}>
                <FolderKanban size={15} />
                Boards
              </button>
              <button className="kbc-view-btn active">
                <CalendarDays size={15} />
                Calendar
              </button>
            </div>
            <span className="kbc-card-count">
              {totalCards} card{totalCards !== 1 ? 's' : ''}{totalChecklist > 0 ? `, ${totalChecklist} checklist item${totalChecklist !== 1 ? 's' : ''}` : ''} across {boardCount} board{boardCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="kbc-toolbar">
          {/* Search */}
          <div className="kbc-search-wrap">
            <Search size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
            <input
              className="kbc-search-input"
              placeholder="Search cards..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="kbc-search-clear" onClick={() => setSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Board filter */}
          <div className="kbc-board-filter-wrap" ref={boardFilterRef}>
            <button
              className={`kbc-filter-btn ${selectedBoardIds.size > 0 ? 'active' : ''}`}
              onClick={() => setShowBoardFilter(p => !p)}
            >
              <FolderKanban size={14} />
              {selectedBoardIds.size > 0
                ? `${selectedBoardIds.size} board${selectedBoardIds.size > 1 ? 's' : ''}`
                : 'All Boards'}
              <ChevronDown size={12} />
            </button>
            {selectedBoardIds.size > 0 && (
              <button className="kbc-filter-clear" onClick={clearBoardFilter} title="Clear filter">
                <X size={12} />
              </button>
            )}
            {showBoardFilter && (
              <div className="kbc-board-dropdown">
                {fullBoards.map((b, i) => (
                  <button
                    key={b.id}
                    className={`kbc-board-option ${selectedBoardIds.has(b.id) ? 'selected' : ''}`}
                    onClick={() => toggleBoard(b.id)}
                  >
                    <span className="kbc-board-dot" style={{ background: getBoardColor(i) }} />
                    <span className="kbc-board-option-title">{b.title}</span>
                    {selectedBoardIds.has(b.id) && <Check size={14} style={{ color: '#6366f1', flexShrink: 0 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="kbc-view-toggle">
            <button
              className={`kbc-view-btn ${view === 'month' ? 'active' : ''}`}
              onClick={() => setView('month')}
            >
              <LayoutDashboard size={14} />
              Month
            </button>
            <button
              className={`kbc-view-btn ${view === 'agenda' ? 'active' : ''}`}
              onClick={() => setView('agenda')}
            >
              <ListBullet size={14} />
              Agenda
            </button>
            <button
              className={`kbc-view-btn ${view === 'day' ? 'active' : ''}`}
              onClick={() => { setView('day'); setSelectedDate(today); }}
            >
              <Calendar size={14} />
              Day
            </button>
          </div>

          {/* Add Card */}
          <button className="kbc-add-btn" onClick={openAddCard}>
            <Plus size={15} />
            Add Card
          </button>

          {/* Month/Day nav */}
          <div className="kbc-month-nav">
            <button className="kb-btn-icon" onClick={view === 'day' ? prevDay : prevMonth}><ChevronLeft size={18} /></button>
            <button className={`kbc-today-btn${isSameDay(selectedDate, today) ? ' active' : ''}`} onClick={goToday}>Today</button>
            <button className="kb-btn-icon" onClick={view === 'day' ? nextDay : nextMonth}><ChevronRight size={18} /></button>
            <span className="kbc-month-label">
              {view === 'day'
                ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                : `${MONTH_NAMES[month]} ${year}`
              }
            </span>
          </div>
        </div>

        {/* Calendar */}
        {loadingBoards ? (
          <div className="kbc-loading">
            <div className="kb-spinner" />
            <p>Loading cards…</p>
          </div>
        ) : view === 'day' ? (
          /* ═══════ Day List View ═══════ */
          <div className="kbc-day-view">
            <div className="kbc-day-view-header">
              <span className="kbc-day-event-count">{dayViewEvents.length} event{dayViewEvents.length !== 1 ? 's' : ''}</span>
              {isSameDay(selectedDate, today) && <span className="kbc-day-today-badge">Today</span>}
            </div>
            {dayViewEvents.length === 0 ? (
              <div className="kbc-day-empty">
                <CalendarDays size={40} style={{ color: '#4b5563', marginBottom: 12 }} />
                <p style={{ color: '#9ca3af', fontSize: 14 }}>No events on this day</p>
              </div>
            ) : (
              <div className="kbc-day-list">
                {dayViewEvents.map(card => {
                  const pri = card.priority ? PRIORITY_CONFIG[card.priority] : null;
                  const multi = !isSameDay(card.start, card.end);
                  const isOverdue = card.end < today && !isSameDay(card.end, today);

                  return (
                    <div
                      key={card.id}
                      className={`kbc-day-card ${card.isComplete ? 'kbc-day-card-complete' : ''}`}
                      style={{ '--event-color': card.boardColor } as React.CSSProperties}
                      onClick={() => router.push(`/boards/${card.boardId}?card=${card.cardId}`)}
                    >
                      <div className="kbc-day-card-color" style={{ background: card.boardColor }} />
                      <button
                        className={`kbc-day-card-check ${card.isComplete ? 'done' : ''}`}
                        onClick={e => { e.stopPropagation(); toggleComplete(card); }}
                        title={card.isComplete ? 'Mark incomplete' : 'Mark complete'}
                      >
                        <Check size={12} />
                      </button>
                      <div className="kbc-day-card-body">
                        <div className="kbc-day-card-top">
                          <span className="kbc-day-card-title">
                            {card.type === 'checklist' && <CheckSquare size={13} style={{ color: '#818cf8', flexShrink: 0 }} />}
                            {card.title}
                          </span>
                          {pri && (
                            <span className="kbc-day-card-priority" style={{ color: pri.color, background: pri.bg }}>
                              <Flag size={10} /> {pri.label}
                            </span>
                          )}
                        </div>
                        {card.type === 'checklist' && card.parentCardTitle && (
                          <div className="kbc-day-card-parent">Card: {card.parentCardTitle}</div>
                        )}
                        <div className="kbc-day-card-meta">
                          <span className="kbc-day-card-board">
                            <span className="kbc-board-dot" style={{ background: card.boardColor }} />
                            {card.boardTitle}
                          </span>
                          <span className="kbc-day-card-col">{card.columnTitle}</span>
                          {multi && (
                            <span className={`kbc-day-card-dates ${isOverdue ? 'overdue' : ''}`}>
                              <Clock size={11} />
                              {card.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' → '}
                              {card.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {card.assignee && (
                            <span className="kbc-day-card-assignee">
                              <User size={11} /> {card.assignee}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : view === 'agenda' ? (
          /* ═══════ Agenda View ═══════ */
          <div className="kbc-agenda">
            {/* Left: Mini calendar + board filter */}
            <div className="kbc-agenda-sidebar">
              <div className="kbc-agenda-cal">
                {/* Month nav */}
                <div className="kbc-agenda-month-row">
                  <button className="kb-btn-icon" onClick={prevMonth}><ChevronLeft size={16} /></button>
                  <button className="kbc-agenda-month-label" onClick={goToday}>
                    {MONTH_NAMES[month]} {year}
                  </button>
                  <button className="kb-btn-icon" onClick={nextMonth}><ChevronRight size={16} /></button>
                </div>

                {/* Day-of-week headers */}
                <div className="kbc-agenda-dow-row">
                  {DAY_NAMES.map(d => (
                    <div key={d} className="kbc-agenda-dow">{d}</div>
                  ))}
                </div>

                {/* Weeks */}
                <div className="kbc-agenda-weeks">
                  {mobileWeeks.map((week, wi) => (
                    <div key={wi} className="kbc-agenda-week-row">
                      {week.map(({ date, inMonth }) => {
                        const isToday = isSameDay(date, today);
                        const isSelected = isSameDay(date, selectedDate);
                        const eventCount = eventCountByDay.get(toDateKey(date)) || 0;

                        return (
                          <button
                            key={toDateKey(date)}
                            className={`kbc-agenda-day ${!inMonth ? 'out' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                            onClick={() => selectMobileDay(date)}
                          >
                            <span className="kbc-agenda-day-num">{date.getDate()}</span>
                            {eventCount > 0 && (
                              <span className="kbc-agenda-day-dots">
                                {eventCount <= 3
                                  ? Array.from({ length: eventCount }, (_, i) => (
                                      <span key={i} className="kbc-agenda-dot" />
                                    ))
                                  : <>
                                      <span className="kbc-agenda-dot" />
                                      <span className="kbc-agenda-dot" />
                                      <span className="kbc-agenda-dot-plus">+</span>
                                    </>
                                }
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Board filter pills */}
              <div className="kbc-agenda-filters">
                <button
                  className={`kbc-agenda-pill ${selectedBoardIds.size === 0 ? 'active' : ''}`}
                  onClick={clearBoardFilter}
                >
                  All
                </button>
                {fullBoards.map((b, i) => (
                  <button
                    key={b.id}
                    className={`kbc-agenda-pill ${selectedBoardIds.has(b.id) ? 'active' : ''}`}
                    onClick={() => toggleBoard(b.id)}
                  >
                    <span className="kbc-board-dot" style={{ background: getBoardColor(i), width: 8, height: 8 }} />
                    {b.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Selected day event list */}
            <div className="kbc-agenda-main">
              <div className="kbc-agenda-day-header">
                <span className="kbc-agenda-day-title">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                {isSameDay(selectedDate, today) && <span className="kbc-day-today-badge">Today</span>}
                <span className="kbc-agenda-day-count">
                  {dayViewEvents.length} item{dayViewEvents.length !== 1 ? 's' : ''}
                </span>
              </div>

              {dayViewEvents.length === 0 ? (
                <div className="kbc-day-empty">
                  <CalendarDays size={40} style={{ color: '#4b5563', marginBottom: 12 }} />
                  <p style={{ color: '#9ca3af', fontSize: 14 }}>No items on this day</p>
                </div>
              ) : (
                <div className="kbc-day-list">
                  {dayViewEvents.map(card => {
                    const pri = card.priority ? PRIORITY_CONFIG[card.priority] : null;
                    const multi = !isSameDay(card.start, card.end);
                    const isOverdue = card.end < today && !isSameDay(card.end, today);

                    return (
                      <div
                        key={card.id}
                        className={`kbc-day-card ${card.isComplete ? 'kbc-day-card-complete' : ''}`}
                        style={{ '--event-color': card.boardColor } as React.CSSProperties}
                        onClick={() => router.push(`/boards/${card.boardId}?card=${card.cardId}`)}
                      >
                        <div className="kbc-day-card-color" style={{ background: card.boardColor }} />
                        <button
                          className={`kbc-day-card-check ${card.isComplete ? 'done' : ''}`}
                          onClick={e => { e.stopPropagation(); toggleComplete(card); }}
                          title={card.isComplete ? 'Mark incomplete' : 'Mark complete'}
                        >
                          <span className="kbc-day-card-check-circle">
                            {card.isComplete && <Check size={10} />}
                          </span>
                        </button>
                        <div className="kbc-day-card-body">
                          <div className="kbc-day-card-top">
                            <span className="kbc-day-card-title">
                              {card.type === 'checklist' && <CheckSquare size={13} style={{ color: '#818cf8', flexShrink: 0 }} />}
                              {card.title}
                            </span>
                            {pri && (
                              <span className="kbc-day-card-priority" style={{ color: pri.color, background: pri.bg }}>
                                <Flag size={10} /> {pri.label}
                              </span>
                            )}
                          </div>
                          {card.type === 'checklist' && card.parentCardTitle && (
                            <div className="kbc-day-card-parent">Card: {card.parentCardTitle}</div>
                          )}
                          <div className="kbc-day-card-meta">
                            <span className="kbc-day-card-board">
                              <span className="kbc-board-dot" style={{ background: card.boardColor }} />
                              {card.boardTitle}
                            </span>
                            <span className="kbc-day-card-col">{card.columnTitle}</span>
                            {multi && (
                              <span className={`kbc-day-card-dates ${isOverdue ? 'overdue' : ''}`}>
                                <Clock size={11} />
                                {card.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' → '}
                                {card.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {card.assignee && (
                              <span className="kbc-day-card-assignee">
                                <User size={11} /> {card.assignee}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="kbc-calendar">
            {/* Day headers */}
            <div className="kbc-day-headers">
              {DAY_NAMES.map(d => (
                <div key={d} className="kbc-day-header">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="kbc-grid">
              {calendarDays.map(({ date, inMonth }, idx) => {
                const events = getEventsForDay(date);
                const isToday = isSameDay(date, today);
                const dayNum = date.getDate();

                return (
                  <div
                    key={idx}
                    className={`kbc-cell ${!inMonth ? 'out' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => openDayView(date)}
                    style={{ cursor: 'pointer' }}
                  >
                    <button
                      className={`kbc-day-num ${isToday ? 'today' : ''}`}
                      onClick={(e) => { e.stopPropagation(); openDayView(date); }}
                      title={`View ${date.toLocaleDateString()}`}
                    >{dayNum}</button>
                    <div className="kbc-events">
                      {events.slice(0, 4).map(card => {
                        const start = isStartDay(card, date);
                        const end = isEndDay(card, date);
                        const multi = isMultiDay(card);
                        const pri = card.priority ? PRIORITY_CONFIG[card.priority] : null;

                        // For multi-day: only show title on start day (or first visible day)
                        const colStart = date.getDay();

                        // Show title if it's the start day or the first day of the week (continuation)
                        const showTitle = start || colStart === 0;

                        return (
                          <div
                            key={card.id}
                            className={`kbc-event ${multi ? 'multi' : 'single'} ${start ? 'start' : ''} ${end ? 'end' : ''} ${!start && !end && multi ? 'mid' : ''} ${card.type === 'checklist' ? 'checklist-event' : ''}`}
                            style={{
                              '--event-color': card.type === 'checklist' ? '#818cf8' : card.boardColor,
                              '--event-bg': card.type === 'checklist' ? 'rgba(129,140,248,0.12)' : card.boardColor + '22',
                            } as React.CSSProperties}
                            onMouseEnter={e => showTooltip(card, e)}
                            onMouseLeave={hideTooltip}
                            onClick={() => router.push(`/boards/${card.boardId}`)}
                          >
                            {showTitle && (
                              <span className="kbc-event-title">
                                {card.type === 'checklist'
                                  ? <CheckSquare size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                                  : pri && <span className="kbc-event-priority" style={{ background: pri.color }} />
                                }
                                {card.title}
                              </span>
                            )}
                            {!showTitle && <span className="kbc-event-cont" />}
                          </div>
                        );
                      })}
                      {events.length > 4 && (
                        <div className="kbc-more" onClick={(e) => { e.stopPropagation(); openDayView(date); }}>+{events.length - 4} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="kbc-tooltip"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
            }}
          >
            <div className="kbc-tooltip-board">
              <span className="kbc-board-dot" style={{ background: tooltip.card.boardColor }} />
              {tooltip.card.boardTitle}
            </div>
            <div className="kbc-tooltip-title">
              {tooltip.card.type === 'checklist' && <CheckSquare size={12} style={{ flexShrink: 0, color: '#818cf8' }} />}
              {tooltip.card.title}
            </div>
            {tooltip.card.type === 'checklist' && tooltip.card.parentCardTitle && (
              <div className="kbc-tooltip-parent">Card: {tooltip.card.parentCardTitle}</div>
            )}
            <div className="kbc-tooltip-meta">
              <span>{tooltip.card.columnTitle}</span>
              {tooltip.card.priority && (
                <span className="kbc-tooltip-priority" style={{
                  color: PRIORITY_CONFIG[tooltip.card.priority].color,
                  background: PRIORITY_CONFIG[tooltip.card.priority].bg,
                }}>
                  <Flag size={10} /> {PRIORITY_CONFIG[tooltip.card.priority].label}
                </span>
              )}
            </div>
            <div className="kbc-tooltip-dates">
              {tooltip.card.start && tooltip.card.end && !isSameDay(tooltip.card.start, tooltip.card.end) ? (
                <>
                  {tooltip.card.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' → '}
                  {tooltip.card.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </>
              ) : (
                tooltip.card.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              )}
            </div>
            {tooltip.card.assignee && (
              <div className="kbc-tooltip-assignee">Assigned to: {tooltip.card.assignee}</div>
            )}
          </div>
        )}

        {/* Legend */}
        {fullBoards.length > 0 && (
          <div className="kbc-legend">
            {fullBoards
              .filter(b => selectedBoardIds.size === 0 || selectedBoardIds.has(b.id))
              .map((b) => {
                const originalIdx = fullBoards.indexOf(b);
                return (
                  <button
                    key={b.id}
                    className="kbc-legend-item"
                    onClick={() => toggleBoard(b.id)}
                    title={`Toggle ${b.title}`}
                  >
                    <span className="kbc-board-dot" style={{ background: getBoardColor(originalIdx) }} />
                    <span>{b.title}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Quick-add card modal */}
      {showAddCard && (
        <div className="kbc-add-overlay" onClick={() => setShowAddCard(false)}>
          <div className="kbc-add-modal" onClick={e => e.stopPropagation()}>
            <div className="kbc-add-header">
              <span>Add Card</span>
              <button className="kbc-add-close" onClick={() => setShowAddCard(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="kbc-add-body">
              <label className="kbc-add-label">Board</label>
              <select
                className="kbc-add-select"
                value={addCardBoardId}
                onChange={e => setAddCardBoardId(e.target.value)}
              >
                <option value="">Select board...</option>
                {fullBoards.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>

              {addCardColumns.length > 0 && (
                <>
                  <label className="kbc-add-label">Column</label>
                  <select
                    className="kbc-add-select"
                    value={addCardColumnId}
                    onChange={e => setAddCardColumnId(e.target.value)}
                  >
                    {addCardColumns.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </>
              )}

              <label className="kbc-add-label">Title</label>
              <input
                ref={addCardInputRef}
                className="kbc-add-input"
                placeholder="Card title..."
                value={addCardTitle}
                onChange={e => setAddCardTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNewCard(); }}
              />

              <div className="kbc-add-date-hint">
                <Clock size={13} />
                Due: {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            <div className="kbc-add-footer">
              <button className="kbc-add-cancel" onClick={() => setShowAddCard(false)}>Cancel</button>
              <button
                className="kbc-add-save"
                onClick={saveNewCard}
                disabled={addCardSaving || !addCardTitle.trim() || !addCardBoardId || !addCardColumnId}
              >
                {addCardSaving ? 'Adding...' : 'Add Card'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute>
      <CalendarPage />
    </ProtectedRoute>
  );
}

/* ═══════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════ */
const calendarStyles = `
  .kbc-root {
    min-height: 100vh;
    background: #0f1117 !important;
    color: #e5e7eb !important;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }
  .kbc-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 16px 100px;
  }

  /* Header */
  .kbc-header {
    margin-bottom: 20px;
  }
  .kbc-page-title {
    font-size: 26px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    margin: 0 0 16px 0 !important;
  }
  .kbc-header-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .kbc-view-switcher {
    display: flex;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  .kbc-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    outline: none;
    background: transparent !important;
    color: #6b7280 !important;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .kbc-view-btn:hover {
    color: #d1d5db !important;
    background: rgba(255,255,255,0.04) !important;
  }
  .kbc-view-btn.active {
    background: #2563eb !important;
    color: #fff !important;
    box-shadow: 0 1px 4px rgba(37,99,235,0.3);
  }
  .kbc-card-count {
    font-size: 13px;
    color: #6b7280;
  }

  /* Toolbar */
  .kbc-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  /* Search */
  .kbc-search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    padding: 7px 12px;
    min-width: 200px;
    flex: 1;
    max-width: 320px;
    transition: border-color 0.15s;
  }
  .kbc-search-wrap:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
  }
  .kbc-search-input {
    background: none !important;
    border: none !important;
    outline: none !important;
    color: #e5e7eb !important;
    font-size: 13px !important;
    flex: 1;
    padding: 0 !important;
    min-width: 0;
  }
  .kbc-search-input::placeholder { color: #6b7280 !important; }
  .kbc-search-clear {
    background: none; border: none; cursor: pointer; color: #6b7280; padding: 2px;
    display: flex; align-items: center;
  }
  .kbc-search-clear:hover { color: #e5e7eb; }

  /* Board filter */
  .kbc-board-filter-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .kbc-filter-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a !important;
    border-radius: 10px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .kbc-filter-btn:hover { border-color: #374151 !important; color: #e5e7eb; }
  .kbc-filter-btn.active {
    border-color: #6366f1 !important;
    color: #c7d2fe;
    background: rgba(99,102,241,0.08) !important;
  }
  .kbc-filter-clear {
    background: none; border: none; cursor: pointer; color: #6b7280; padding: 4px;
    display: flex; align-items: center; border-radius: 6px;
  }
  .kbc-filter-clear:hover { background: #1f2937; color: #e5e7eb; }
  .kbc-board-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 260px;
    max-height: 340px;
    overflow-y: auto;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    padding: 6px;
    z-index: 100;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  }
  .kbc-board-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    background: none; border: none; cursor: pointer;
    padding: 9px 10px;
    border-radius: 8px;
    color: #d1d5db;
    font-size: 13px;
    text-align: left;
    transition: background 0.1s;
  }
  .kbc-board-option:hover { background: #252836; }
  .kbc-board-option.selected { background: rgba(99,102,241,0.1); color: #e5e7eb; }
  .kbc-board-option-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kbc-board-dot {
    width: 10px; height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* Month navigation */
  .kbc-month-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .kbc-today-btn {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a !important;
    border-radius: 8px;
    padding: 5px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #c7d2fe;
    cursor: pointer;
    transition: all 0.15s;
  }
  .kbc-today-btn:hover { border-color: #6366f1 !important; }
  .kbc-today-btn.active {
    background: rgba(99, 102, 241, 0.2) !important;
    border-color: #6366f1 !important;
    color: #a5b4fc !important;
  }
  .kbc-month-label {
    font-size: 17px;
    font-weight: 700;
    color: #f9fafb;
    min-width: 170px;
    text-align: center;
  }

  /* Shared icon-button from boards */
  .kb-btn-icon {
    background: none !important;
    border: none;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kb-btn-icon:hover {
    background: #1f2937 !important;
    color: #e5e7eb !important;
  }

  /* Calendar grid */
  .kbc-calendar {
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    overflow: hidden;
    background: #1a1d27;
  }
  .kbc-day-headers {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid #2a2d3a;
  }
  .kbc-day-header {
    padding: 10px 8px;
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: center;
  }
  .kbc-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .kbc-cell {
    min-height: 110px;
    border-right: 1px solid #22252f;
    border-bottom: 1px solid #22252f;
    padding: 4px;
    position: relative;
    transition: background 0.1s;
  }
  .kbc-cell:nth-child(7n) { border-right: none; }
  .kbc-cell:hover { background: #1e2130; }
  .kbc-cell.out { opacity: 0.35; }
  .kbc-cell.today { background: rgba(99,102,241,0.06); }
  .kbc-day-num {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    padding: 2px 7px;
    text-align: right;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 6px;
    display: block;
    margin-left: auto;
    transition: all 0.12s;
  }
  .kbc-day-num:hover {
    background: #2a2d3a;
    color: #e5e7eb;
  }
  .kbc-day-num.today {
    color: #fff;
    background: #6366f1;
    border-radius: 6px;
    padding: 1px 7px;
  }
  .kbc-day-num.today:hover {
    background: #4f46e5;
  }

  /* Events */
  .kbc-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
    clear: both;
  }
  .kbc-event {
    font-size: 11px;
    font-weight: 500;
    color: #e5e7eb;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition: opacity 0.1s;
    min-height: 20px;
    display: flex;
    align-items: center;
    background: var(--event-bg);
    border-left: 3px solid var(--event-color);
  }
  .kbc-event:hover { opacity: 0.85; }
  .kbc-event.checklist-event {
    border-left-style: dashed;
    opacity: 0.85;
  }
  .kbc-event.single {
    border-radius: 4px;
  }
  .kbc-event.multi.start {
    border-radius: 4px 0 0 4px;
    margin-right: -4px;
  }
  .kbc-event.multi.end {
    border-radius: 0 4px 4px 0;
    margin-left: -4px;
    border-left: none;
  }
  .kbc-event.multi.mid {
    border-radius: 0;
    margin-left: -4px;
    margin-right: -4px;
    border-left: none;
  }
  .kbc-event-title {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kbc-event-priority {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .kbc-event-cont {
    min-height: 16px;
  }
  .kbc-more {
    font-size: 10px;
    color: #818cf8;
    padding: 1px 6px;
    font-weight: 600;
    cursor: pointer;
  }
  .kbc-more:hover { text-decoration: underline; }

  /* Tooltip */
  .kbc-tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: #252836;
    border: 1px solid #3a3d4e;
    border-radius: 10px;
    padding: 12px 14px;
    min-width: 200px;
    max-width: 300px;
    z-index: 10000;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    pointer-events: none;
  }
  .kbc-tooltip-board {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 4px;
  }
  .kbc-tooltip-title {
    font-size: 14px;
    font-weight: 600;
    color: #f9fafb;
    margin-bottom: 6px;
    word-break: break-word;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .kbc-tooltip-parent {
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 6px;
    font-style: italic;
  }
  .kbc-tooltip-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 4px;
  }
  .kbc-tooltip-priority {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 600;
  }
  .kbc-tooltip-dates {
    font-size: 11px;
    color: #818cf8;
    margin-bottom: 2px;
  }
  .kbc-tooltip-assignee {
    font-size: 11px;
    color: #6b7280;
  }

  /* Legend */
  .kbc-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 16px;
  }
  .kbc-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 12px;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s;
  }
  .kbc-legend-item:hover {
    border-color: #4b5563;
    color: #e5e7eb;
  }

  /* Loading */
  .kbc-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
  }
  .kb-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #374151;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: kbc-spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes kbc-spin {
    to { transform: rotate(360deg); }
  }

  /* View toggle */
  .kbc-view-toggle {
    display: flex;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    overflow: hidden;
  }
  .kbc-view-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .kbc-view-btn:hover { color: #e5e7eb; background: #252836; }
  .kbc-view-btn.active {
    background: #6366f1 !important;
    color: #fff !important;
  }

  /* Day view */
  .kbc-day-view {
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    background: #1a1d27;
    overflow: hidden;
  }
  .kbc-day-view-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-bottom: 1px solid #2a2d3a;
  }
  .kbc-day-event-count {
    font-size: 13px;
    font-weight: 600;
    color: #9ca3af;
  }
  .kbc-day-today-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6366f1;
    background: rgba(99,102,241,0.12);
    padding: 2px 8px;
    border-radius: 5px;
  }
  .kbc-day-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }
  .kbc-day-list {
    display: flex;
    flex-direction: column;
  }
  .kbc-day-card {
    display: flex;
    cursor: pointer;
    transition: background 0.12s;
    border-bottom: 1px solid #22252f;
  }
  .kbc-day-card:last-child { border-bottom: none; }
  .kbc-day-card:hover { background: #1e2130; }
  .kbc-day-card-color {
    width: 4px;
    flex-shrink: 0;
  }
  .kbc-day-card-check {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 36px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .kbc-day-card-check-circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .kbc-day-card-check:hover .kbc-day-card-check-circle {
    border-color: #22c55e;
    background: rgba(34,197,94,0.1);
  }
  .kbc-day-card-check.done .kbc-day-card-check-circle {
    border-color: #22c55e;
    background: #22c55e;
    color: #fff;
  }
  .kbc-day-card-body {
    flex: 1;
    padding: 14px 18px;
    min-width: 0;
  }
  .kbc-day-card-top {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }
  .kbc-day-card-title {
    font-size: 15px;
    font-weight: 600;
    color: #f9fafb;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .kbc-day-card-complete {
    opacity: 0.5;
  }
  .kbc-day-card-complete .kbc-day-card-title {
    text-decoration: line-through;
    color: #6b7280;
  }
  .kbc-day-card-priority {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .kbc-day-card-parent {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
    margin-bottom: 6px;
  }
  .kbc-day-card-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .kbc-day-card-board {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #9ca3af;
  }
  .kbc-day-card-col {
    font-size: 12px;
    color: #6b7280;
    background: #252836;
    padding: 1px 8px;
    border-radius: 5px;
  }
  .kbc-day-card-dates {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #818cf8;
  }
  .kbc-day-card-dates.overdue {
    color: #ef4444;
  }
  .kbc-day-card-assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #6b7280;
  }

  /* ═══════ Agenda View ═══════ */
  .kbc-agenda {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 0;
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    overflow: hidden;
    background: #1a1d27;
    min-height: 520px;
  }

  /* Sidebar */
  .kbc-agenda-sidebar {
    border-right: 1px solid #2a2d3a;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .kbc-agenda-cal {
    padding: 16px 12px 12px;
    border-bottom: 1px solid #22252f;
  }
  .kbc-agenda-month-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .kbc-agenda-month-label {
    font-size: 15px;
    font-weight: 700;
    color: #f9fafb;
    background: none !important;
    border: none !important;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .kbc-agenda-month-label:hover {
    background: #252836 !important;
  }

  .kbc-agenda-dow-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 4px;
  }
  .kbc-agenda-dow {
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: #4b5563;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 0;
  }

  .kbc-agenda-weeks {
    display: flex;
    flex-direction: column;
  }
  .kbc-agenda-week-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }

  .kbc-agenda-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 5px 0 6px;
    background: none !important;
    border: none !important;
    cursor: pointer;
    transition: background 0.1s;
    border-radius: 8px;
  }
  .kbc-agenda-day:hover {
    background: #252836 !important;
  }
  .kbc-agenda-day.out {
    opacity: 0.25;
  }
  .kbc-agenda-day-num {
    font-size: 14px;
    font-weight: 400;
    color: #9ca3af;
    padding: 2px 0;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }
  .kbc-agenda-day.today .kbc-agenda-day-num {
    color: #818cf8;
    font-weight: 600;
  }
  .kbc-agenda-day.selected .kbc-agenda-day-num {
    color: #f9fafb;
    font-weight: 600;
    border-bottom-color: #6366f1;
  }
  .kbc-agenda-day.today.selected .kbc-agenda-day-num {
    color: #f9fafb;
    border-bottom-color: #6366f1;
  }

  /* Event dot indicators */
  .kbc-agenda-day-dots {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 5px;
  }
  .kbc-agenda-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #6366f1;
    opacity: 0.7;
  }
  .kbc-agenda-day.selected .kbc-agenda-dot {
    background: #c7d2fe;
    opacity: 1;
  }
  .kbc-agenda-dot-plus {
    font-size: 7px;
    font-weight: 700;
    color: #6366f1;
    line-height: 1;
    opacity: 0.7;
  }
  .kbc-agenda-day.selected .kbc-agenda-dot-plus {
    color: #c7d2fe;
    opacity: 1;
  }

  /* Board filter pills */
  .kbc-agenda-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px;
  }
  .kbc-agenda-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    background: none;
    border: 1px solid #2a2d3a;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .kbc-agenda-pill:hover {
    border-color: #4b5563;
    color: #d1d5db;
  }
  .kbc-agenda-pill.active {
    background: rgba(99,102,241,0.12);
    border-color: #6366f1;
    color: #c7d2fe;
  }

  /* Main event panel */
  .kbc-agenda-main {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .kbc-agenda-day-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2d3a;
    position: sticky;
    top: 0;
    background: #1a1d27;
    z-index: 2;
  }
  .kbc-agenda-day-title {
    font-size: 17px;
    font-weight: 700;
    color: #f9fafb;
    flex: 1;
  }
  .kbc-agenda-day-count {
    font-size: 13px;
    color: #6b7280;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .kbc-toolbar { flex-direction: column; align-items: stretch; }
    .kbc-search-wrap { max-width: 100%; }
    .kbc-month-nav { margin-left: 0; justify-content: center; }
    .kbc-cell { min-height: 80px; }
    .kbc-event { font-size: 10px; padding: 1px 4px; }
    .kbc-day-header { font-size: 10px; padding: 8px 2px; }
    .kbc-card-count { display: none; }
    .kbc-month-label { min-width: 130px; font-size: 15px; }
    .kbc-view-toggle { align-self: flex-start; }
    .kbc-day-card-body { padding: 12px 14px; }
    .kbc-day-card-title { font-size: 14px; }
    .kbc-agenda { grid-template-columns: 1fr; }
    .kbc-agenda-sidebar { border-right: none; border-bottom: 1px solid #2a2d3a; }
  }

  /* ── Quick-add buttons ── */
  .kbc-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .kbc-add-btn:hover { background: #2563eb; }

  .kbc-add-btn-header {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kbc-add-btn-header:hover { color: #e2e8f0; background: rgba(255,255,255,0.08); }

  .kbc-add-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kbc-add-modal {
    background: #1a1d2e;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    width: 380px;
    max-width: 92vw;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  }
  .kbc-add-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #2a2d3a;
    font-weight: 600;
    font-size: 15px;
    color: #e2e8f0;
  }
  .kbc-add-close {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
  }
  .kbc-add-close:hover { color: #e2e8f0; background: #2a2d3a; }
  .kbc-add-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kbc-add-label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
    margin-top: 4px;
  }
  .kbc-add-select,
  .kbc-add-input {
    background: #0f1117;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    padding: 9px 12px;
    color: #e2e8f0;
    font-size: 14px;
    outline: none;
    width: 100%;
  }
  .kbc-add-select:focus,
  .kbc-add-input:focus {
    border-color: #3b82f6;
  }
  .kbc-add-date-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }
  .kbc-add-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid #2a2d3a;
  }
  .kbc-add-cancel {
    background: none;
    border: 1px solid #2a2d3a;
    color: #94a3b8;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .kbc-add-cancel:hover { color: #e2e8f0; border-color: #475569; }
  .kbc-add-save {
    background: #3b82f6;
    border: none;
    color: #fff;
    padding: 7px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .kbc-add-save:hover { background: #2563eb; }
  .kbc-add-save:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ═══════════════════════════════════════════════════════════
   Mobile Calendar Styles
   ═══════════════════════════════════════════════════════════ */
const mobileCalendarStyles = `
  .kbm-container {
    padding: 0 0 100px;
    max-width: 100vw;
    overflow-x: hidden;
  }

  /* Header */
  .kbm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
    position: sticky;
    top: 0;
    z-index: 20;
    background: #0f1117;
  }
  .kbm-header-title {
    font-size: 17px;
    font-weight: 700;
    color: #f9fafb;
  }

  /* Calendar card */
  .kbm-cal-card {
    background: none !important;
    border: none !important;
    border-bottom: 1px solid #22252f !important;
    border-radius: 0 !important;
    padding-bottom: 0;
  }

  /* Month nav */
  .kbm-month-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px 4px;
  }
  .kbm-month-label {
    font-size: 15px;
    font-weight: 600;
    color: #e5e7eb;
    background: none !important;
    border: none !important;
    border-radius: 0 !important;
    cursor: pointer;
    padding: 4px 12px;
    letter-spacing: 0.01em;
  }
  .kbm-month-label:active {
    opacity: 0.7;
  }

  /* Day-of-week row */
  .kbm-dow-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    padding: 0 8px;
  }
  .kbm-dow {
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: #4b5563;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 0 6px;
  }

  /* Weeks container */
  .kbm-weeks {
    padding: 0 8px 4px;
    transition: max-height 0.25s ease;
    overflow: hidden;
  }

  /* Week row */
  .kbm-week-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0;
  }

  /* Day cell */
  .kbm-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 0 6px;
    background: none !important;
    border: none !important;
    border-radius: 0 !important;
    cursor: pointer;
    transition: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-appearance: none;
    appearance: none;
  }
  .kbm-day:active {
    background: none !important;
  }
  .kbm-day.out {
    opacity: 0.25;
  }
  .kbm-day-num {
    font-size: 14px;
    font-weight: 400;
    color: #9ca3af;
    padding: 2px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0 !important;
    background: none !important;
    border: none !important;
    border-bottom: 2px solid transparent !important;
    transition: color 0.15s, border-color 0.15s;
  }
  .kbm-day.today .kbm-day-num {
    color: #818cf8;
    font-weight: 600;
    border-bottom-color: transparent !important;
  }
  .kbm-day.selected .kbm-day-num {
    color: #f9fafb;
    font-weight: 600;
    border-bottom-color: #6366f1 !important;
  }
  .kbm-day.today.selected .kbm-day-num {
    color: #f9fafb;
    border-bottom-color: #6366f1 !important;
  }
  .kbm-day.out .kbm-day-num {
    color: #374151;
  }

  /* Dot indicators */
  .kbm-day-dots {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 5px;
  }
  .kbm-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #6366f1;
    opacity: 0.7;
  }
  .kbm-day.selected .kbm-dot {
    background: #c7d2fe;
    opacity: 1;
  }
  .kbm-dot-plus {
    font-size: 7px;
    font-weight: 700;
    color: #6366f1;
    line-height: 1;
    opacity: 0.7;
  }
  .kbm-day.selected .kbm-dot-plus {
    color: #c7d2fe;
    opacity: 1;
  }

  /* Expand / collapse toggle */
  .kbm-expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 6px 0;
    background: none !important;
    border: none !important;
    border-radius: 0 !important;
    border-top: 1px solid rgba(255,255,255,0.04) !important;
    cursor: pointer;
    color: #4b5563;
    -webkit-tap-highlight-color: transparent;
    -webkit-appearance: none;
    appearance: none;
  }
  .kbm-expand-btn:active {
    color: #6b7280;
    background: none !important;
  }

  /* Board filter pill bar */
  .kbm-filter-bar {
    display: flex;
    gap: 6px;
    padding: 10px 14px 2px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .kbm-filter-bar::-webkit-scrollbar {
    display: none;
  }
  .kbm-filter-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition: all 0.15s;
  }
  .kbm-filter-pill:active {
    background: #252836;
  }
  .kbm-filter-pill.active {
    background: rgba(99,102,241,0.12);
    border-color: #6366f1;
    color: #c7d2fe;
  }

  /* Day label below calendar */
  .kbm-day-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px 10px;
  }
  .kbm-day-label-text {
    font-size: 15px;
    font-weight: 700;
    color: #f9fafb;
    flex: 1;
  }
  .kbm-today-pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6366f1;
    background: rgba(99,102,241,0.12);
    padding: 2px 8px;
    border-radius: 5px;
  }
  .kbm-day-label-count {
    font-size: 12px;
    color: #6b7280;
  }

  /* Empty state */
  .kbm-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    text-align: center;
  }

  /* Event list */
  .kbm-event-list {
    display: flex;
    flex-direction: column;
  }
  .kbm-event-card {
    display: flex;
    align-items: stretch;
    cursor: pointer;
    padding-right: 14px;
    border-bottom: 1px solid #1e2130;
    transition: background 0.12s;
    -webkit-tap-highlight-color: transparent;
  }
  .kbm-event-card:active {
    background: #1e2130;
  }
  .kbm-event-card:last-child {
    border-bottom: none;
  }
  .kbm-event-color {
    width: 4px;
    flex-shrink: 0;
  }
  .kbm-event-body {
    flex: 1;
    padding: 14px 14px;
    min-width: 0;
  }
  .kbm-event-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .kbm-event-title {
    font-size: 15px;
    font-weight: 600;
    color: #f9fafb;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .kbm-event-complete {
    opacity: 0.5;
  }
  .kbm-event-complete .kbm-event-title {
    text-decoration: line-through;
    color: #6b7280;
  }
  .kbm-event-priority {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .kbm-event-parent {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
    margin-bottom: 4px;
  }
  .kbm-event-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .kbm-event-board {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #9ca3af;
  }
  .kbm-event-col {
    font-size: 11px;
    color: #6b7280;
    background: #252836;
    padding: 1px 7px;
    border-radius: 5px;
  }
  .kbm-event-dates {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #818cf8;
  }
  .kbm-event-dates.overdue {
    color: #ef4444;
  }
  .kbm-event-assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #6b7280;
  }
`;
