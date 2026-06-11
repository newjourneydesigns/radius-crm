'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  AlertTriangle,
  BellRing,
  Cake,
  CalendarDays,
  CalendarRange,
  Check,
  CheckSquare,
  ClipboardList,
  Heart,
  NotebookPen,
  PartyPopper,
  Pin,
  Plus,
  Star,
  Target,
  X,
} from 'lucide-react';
import { useBigThree } from '../../hooks/useBigThree';
import type { BigThreeBoard, BigThreeCard, BigThreeSlot } from '../../hooks/useBigThree';
import { useRandomLoadingMessage } from '../../hooks/useRandomLoadingMessage';
import { useTodayData } from '../../hooks/useTodayData';
import { useTodayCalendars } from '../../hooks/useTodayCalendars';
import DayTimeline, { type TimelineEvent } from '../../components/today/DayTimeline';
import TodayCardModal from '../../components/today/TodayCardModal';
import type { TodayData } from '../../hooks/useTodayData';
import type {
  EncouragementItem,
  FollowUpItem,
  CardDigestItem,
  ChecklistDigestItem,
  VisitItem,
  BirthdayItem,
  NoteItem,
  PrayerRequestItem,
} from '../../lib/emailService';

// ─── Theme ───────────────────────────────────────────────────────────────────

const T = {
  pageBg:     '#0d0f14',
  cardBg:     '#13151c',
  cardBorder: '#1e2029',
  text:       '#e2e4ec',
  textMuted:  '#8b8fa8',
  textFaint:  '#3d4155',
  red:        '#ef4444',  // overdue — missed deadline
  amber:      '#f59e0b',  // actionable today — due today / needs action
  green:      '#22c55e',  // success / done states
  neutral:    '#5b6070',  // informational — circles, visits
  violet:     '#8b5cf6',  // birthdays
};

// ─── localStorage visibility ──────────────────────────────────────────────────

const STORAGE_KEY = 'today_section_visibility_v2';

function useVisibility() {
  const [vis, setVis] = useState<Record<string, boolean>>({});
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setVis(JSON.parse(stored));
    } catch {}
  }, []);

  const toggle = (key: string) => {
    setVis(prev => {
      const next = { ...prev, [key]: !(prev[key] ?? true) };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const isOpen = (key: string) => vis[key] ?? true;
  return { isOpen, toggle };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);
const ChevronDown = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);
const CheckIcon = () => (
  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const LinkIcon = () => (
  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ opacity: 0.35 }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatShort(s: string) {
  return s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}
function methodLabel(m: string) {
  return ({ text:'Text', email:'Email', call:'Call', 'in-person':'In Person', card:'Card', other:'Other' })[m] || m;
}

/** Tolerant time-of-day parser: "18:30", "18:30:00", "6:30 PM", "6pm" → minutes since midnight */
function parseTimeToMin(s?: string | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3]?.toLowerCase();
  if (period?.startsWith('p') && h < 12) h += 12;
  if (period?.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

function scrollToSection(href: string) {
  const id = href.replace('#', '');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ScoreRow({ row }: { row: { label: string; count: number; color: string; href: string } }) {
  const active = row.count > 0;
  return (
    <div
      onClick={() => scrollToSection(row.href)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 14px', height: '100%', cursor: 'pointer',
        borderLeft: `3px solid ${active ? row.color : 'transparent'}`,
      }}
      className="today-score-inner"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: active ? row.color : T.textFaint, opacity: active ? 1 : 0.35,
        }} />
        <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? T.text : T.textMuted }}>
          {row.label}
        </span>
      </div>
      <span style={{
        fontSize: 15, fontWeight: 700, lineHeight: 1,
        color: active ? row.color : T.textFaint, opacity: active ? 1 : 0.45,
      }}>
        {row.count}
      </span>
    </div>
  );
}

function Scoreboard({ rows, flush = false }: {
  rows: { label: string; count: number; color: string; href: string }[];
  flush?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div style={{
      background: T.cardBg, border: `1px solid ${T.cardBorder}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: flush ? 0 : 24,
    }}>
      <div style={{
        padding: '10px 14px 8px', borderBottom: `1px solid ${T.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Today&apos;s Snapshot
        </span>
        <span style={{ fontSize: 11, color: T.textFaint }}>{total} items</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {rows.map((row, i) => {
          const isRightCol = i % 2 === 1;
          const isLastRow = i >= (rows.length % 2 === 0 ? rows.length - 2 : rows.length - 1);
          return (
            <div key={row.label} className="today-score-row" style={{
              borderBottom: !isLastRow ? `1px solid ${T.cardBorder}` : 'none',
              borderLeft: isRightCol ? `1px solid ${T.cardBorder}` : 'none',
            }}>
              <ScoreRow row={row} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  id, title, icon, count, isOpen, onToggle, accentColor = T.neutral, headerExtra, children,
}: {
  id: string; title: string; icon: React.ReactNode; count: number; sectionKey: string;
  isOpen: boolean; onToggle: () => void; accentColor?: string;
  headerExtra?: React.ReactNode; children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div id={id} style={{
      background: T.cardBg, border: `1px solid ${T.cardBorder}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: isOpen ? `1px solid ${T.cardBorder}` : 'none',
      }}>
        <button onClick={onToggle} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', color: accentColor }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
            background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}30`,
          }}>
            {count}
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {headerExtra}
          <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textFaint, padding: 0 }}>
            <ChevronDown open={isOpen} />
          </button>
        </div>
      </div>

      {isOpen && <div>{children}</div>}
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function Item({ accentColor, children }: { accentColor?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 16px 10px 14px',
      borderBottom: `1px solid ${T.cardBorder}`,
      borderLeft: accentColor ? `3px solid ${accentColor}` : '3px solid transparent',
    }}
      className="today-item"
    >
      {children}
    </div>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionBtn({ onClick, color, children }: { onClick: () => void; color?: string; children: React.ReactNode }) {
  const c = color || T.green;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        borderRadius: 7, border: `1px solid ${c}30`, background: `${c}10`,
        color: c, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      <CheckIcon />{children}
    </button>
  );
}

// ─── Leader link ─────────────────────────────────────────────────────────────

function LeaderLink({ id, name }: { id: number | string; name: string }) {
  return (
    <Link href={`/circle/${id}`} style={{
      color: T.text, fontSize: 13, fontWeight: 600, textDecoration: 'none',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}
      className="today-leader-link"
    >
      {name} <LinkIcon />
    </Link>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{children}</p>;
}

// ─── Card metadata chip (mirrors KanbanCard metadata row) ────────────────────

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#22c55e' },
  medium: { label: 'Medium', color: '#f59e0b' },
  high:   { label: 'High',   color: '#f97316' },
  urgent: { label: 'Urgent', color: '#ef4444' },
};

function CardMeta({ card, inline = false }: { card: CardDigestItem; inline?: boolean }) {
  const pri = card.priority ? PRIORITY_META[card.priority] : null;
  const hasLabels = (card.labels?.length ?? 0) > 0;
  const hasChecklist = (card.checklist_total ?? 0) > 0;
  const hasAssignees = card.assignees.length > 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = card.due_date ? card.due_date < todayStr : false;

  if (!pri && !hasLabels && !hasChecklist && !hasAssignees) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: inline ? 0 : 5 }}>
      {/* Labels — colored dot for identity, neutral chip to reduce noise */}
      {hasLabels && card.labels!.map((l, i) => (
        <span key={i} style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
          background: 'rgba(255,255,255,0.05)', color: T.textMuted, border: `1px solid rgba(255,255,255,0.08)`,
          whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
          {l.name}
        </span>
      ))}
      {/* Priority — only highlight urgent/high; mute low/medium */}
      {pri && (
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
          background: (card.priority === 'urgent' || card.priority === 'high') ? pri.color + '15' : 'rgba(255,255,255,0.05)',
          color: (card.priority === 'urgent' || card.priority === 'high') ? pri.color : T.textFaint,
          border: `1px solid ${(card.priority === 'urgent' || card.priority === 'high') ? pri.color + '28' : 'rgba(255,255,255,0.08)'}`,
          whiteSpace: 'nowrap',
        }}>{pri.label}</span>
      )}
      {/* Checklist progress */}
      {hasChecklist && (
        <span style={{
          fontSize: 10, fontWeight: 500,
          color: card.checklist_done === card.checklist_total ? T.green : T.textMuted,
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {card.checklist_done}/{card.checklist_total}
        </span>
      )}
      {/* Due date (overdue only — due-today cards already shown via DateBadge) */}
      {isOverdue && card.due_date && (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
          background: T.red + '18', color: T.red, border: `1px solid ${T.red}30`,
        }}>Overdue</span>
      )}
      {/* Assignees */}
      {hasAssignees && (
        <span style={{ fontSize: 10, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
          {card.assignees.join(', ')}
        </span>
      )}
    </div>
  );
}

function DateBadge({ date, color }: { date: string; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: `${color || T.amber}18`, color: color || T.amber,
      border: `1px solid ${color || T.amber}28`, whiteSpace: 'nowrap',
    }}>
      {date}
    </span>
  );
}

// ─── Big 3 ──────────────────────────────────────────────────────────────────

const BIG_THREE_LAST_BOARD_KEY = 'today_big_three_last_board_id';

function BigThreeSection({
  slots,
  boards,
  isLoading,
  isSaving,
  error,
  onCreate,
  onSearch,
  onAssignExisting,
  onDone,
  onClear,
  onOpenCard,
}: {
  slots: BigThreeSlot[];
  boards: BigThreeBoard[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onCreate: (slotNumber: 1 | 2 | 3, title: string, boardId: string) => Promise<boolean>;
  onSearch: (query: string) => Promise<BigThreeCard[]>;
  onAssignExisting: (slotNumber: 1 | 2 | 3, card: BigThreeCard) => Promise<boolean>;
  onDone: (cardId: string) => Promise<void>;
  onClear: (slotNumber: 1 | 2 | 3) => Promise<void>;
  onOpenCard?: (boardId: string, cardId: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, { title: string; boardId: string }>>({});
  const [searches, setSearches] = useState<Record<number, { query: string; results: BigThreeCard[]; isSearching: boolean; hasSearched: boolean }>>({});
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = searchTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const defaultBoardId = (() => {
    if (boards.length === 0) return '';
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(BIG_THREE_LAST_BOARD_KEY) : null;
      if (saved && boards.some(board => board.id === saved)) return saved;
    } catch {}
    return boards[0].id;
  })();

  const setDraft = (slotNumber: number, updates: Partial<{ title: string; boardId: string }>) => {
    setDrafts(prev => ({
      ...prev,
      [slotNumber]: {
        title: prev[slotNumber]?.title ?? '',
        boardId: prev[slotNumber]?.boardId ?? defaultBoardId,
        ...updates,
      },
    }));
  };

  const submit = async (slotNumber: 1 | 2 | 3) => {
    const draft = drafts[slotNumber] ?? { title: '', boardId: defaultBoardId };
    const ok = await onCreate(slotNumber, draft.title, draft.boardId || defaultBoardId);
    if (ok) setDrafts(prev => ({ ...prev, [slotNumber]: { title: '', boardId: draft.boardId || defaultBoardId } }));
  };

  const setSearch = (slotNumber: number, updates: Partial<{ query: string; results: BigThreeCard[]; isSearching: boolean; hasSearched: boolean }>) => {
    setSearches(prev => ({
      ...prev,
      [slotNumber]: {
        query: prev[slotNumber]?.query ?? '',
        results: prev[slotNumber]?.results ?? [],
        isSearching: prev[slotNumber]?.isSearching ?? false,
        hasSearched: prev[slotNumber]?.hasSearched ?? false,
        ...updates,
      },
    }));
  };

  const runSearch = async (slotNumber: 1 | 2 | 3, rawQuery?: string) => {
    const query = rawQuery ?? searches[slotNumber]?.query ?? '';
    if (query.trim().length < 2) {
      setSearch(slotNumber, { results: [], hasSearched: false });
      return;
    }

    setSearch(slotNumber, { isSearching: true, hasSearched: true });
    const results = await onSearch(query);
    setSearches(prev => {
      const current = prev[slotNumber];
      if (!current || current.query.trim() !== query.trim()) return prev;
      return {
        ...prev,
        [slotNumber]: { ...current, results, isSearching: false, hasSearched: true },
      };
    });
  };

  const updateSearchQuery = (slotNumber: 1 | 2 | 3, query: string) => {
    setSearch(slotNumber, { query, hasSearched: false, results: [], isSearching: query.trim().length >= 2 });
    if (searchTimers.current[slotNumber]) clearTimeout(searchTimers.current[slotNumber]);
    if (query.trim().length < 2) return;
    searchTimers.current[slotNumber] = setTimeout(() => {
      runSearch(slotNumber, query);
    }, 250);
  };

  const assignExisting = async (slotNumber: 1 | 2 | 3, card: BigThreeCard) => {
    const ok = await onAssignExisting(slotNumber, card);
    if (ok) setSearches(prev => ({ ...prev, [slotNumber]: { query: '', results: [], isSearching: false, hasSearched: false } }));
  };

  // Display order: filled cards sorted by due date (soonest first, no-date last),
  // then empty slots. The underlying slotNumber is preserved for create/clear actions.
  const orderedSlots = [...slots].sort((a, b) => {
    if (!a.card || !b.card) {
      if (a.card) return -1;
      if (b.card) return 1;
      return a.slotNumber - b.slotNumber;
    }
    const aDate = a.card.due_date;
    const bDate = b.card.due_date;
    if (!aDate && !bDate) return a.slotNumber - b.slotNumber;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.localeCompare(bDate);
  });

  return (
    <div id="big-three" style={{
      background: T.cardBg, border: `1px solid ${T.cardBorder}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        padding: '13px 16px',
        borderBottom: `1px solid ${T.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ color: T.green, display: 'inline-flex' }}><Target className="h-4 w-4" /></span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: T.text, fontSize: 14, fontWeight: 700 }}>Big 3</h2>
            <p style={{ margin: '2px 0 0', color: T.textMuted, fontSize: 11 }}>Weekly priorities</p>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: T.green,
          padding: '2px 7px', borderRadius: 5,
          background: `${T.green}18`, border: `1px solid ${T.green}30`,
          whiteSpace: 'nowrap',
        }}>
          {slots.filter(slot => slot.card).length}/3
        </span>
      </div>

      <div style={{ display: 'grid', gap: 0 }}>
        {orderedSlots.map((slot, index) => {
          const draft = drafts[slot.slotNumber] ?? { title: '', boardId: defaultBoardId };
          const search = searches[slot.slotNumber] ?? { query: '', results: [], isSearching: false, hasSearched: false };
          const card = slot.card;
          const slotLabel = `Big ${slot.slotNumber}`;

          return (
            <div key={slot.slotNumber} style={{
              padding: '13px 16px',
              borderBottom: index < orderedSlots.length - 1 ? `1px solid ${T.cardBorder}` : 'none',
              borderLeft: `3px solid ${card ? T.green : 'transparent'}`,
            }}>
              <div className="today-big3-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {card ? (
                  <>
                    <Link
                      href={`/boards/${card.board_id}?card=${card.id}`}
                      onClick={e => {
                        if (!onOpenCard || e.metaKey || e.ctrlKey) return;
                        e.preventDefault();
                        onOpenCard(card.board_id, card.id);
                      }}
                      style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
                      className="today-big3-card"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <p style={{
                          margin: 0, color: card.is_complete ? T.textMuted : T.text,
                          fontSize: 13, fontWeight: 650,
                          textDecoration: card.is_complete ? 'line-through' : 'none',
                          overflowWrap: 'anywhere', wordBreak: 'break-word',
                        }}>
                          {card.title}
                        </p>
                        {card.is_complete && <DateBadge date="Done" color={T.green} />}
                      </div>
                      <Sub>{card.board_name}{card.column_name ? ` · ${card.column_name}` : ''}</Sub>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 5 }}>
                        {card.due_date && <DateBadge date={formatShort(card.due_date)} color={card.is_complete ? T.green : T.amber} />}
                        <CardMeta card={card} inline />
                      </div>
                    </Link>
                    <div className="today-big3-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {!card.is_complete && (
                        <ActionBtn onClick={() => onDone(card.id)} color={T.green}>Done</ActionBtn>
                      )}
                      <button
                        type="button"
                        onClick={() => onClear(slot.slotNumber)}
                        title={`Clear ${slotLabel}`}
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: `1px solid ${T.cardBorder}`, background: 'rgba(255,255,255,0.03)',
                          color: T.textMuted, cursor: 'pointer',
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="today-big3-empty-form" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(120px, 0.8fr) auto', gap: 8 }}>
                      <input
                        value={draft.title}
                        onChange={e => setDraft(slot.slotNumber, { title: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') submit(slot.slotNumber); }}
                        placeholder={isLoading ? 'Loading...' : `Add ${slotLabel} priority`}
                        disabled={isLoading || isSaving || boards.length === 0}
                        style={{
                          minWidth: 0, height: 32, borderRadius: 7,
                          border: `1px solid ${T.cardBorder}`, background: 'rgba(255,255,255,0.04)',
                          color: T.text, padding: '0 10px', fontSize: 12, outline: 'none',
                        }}
                      />
                      <select
                        value={draft.boardId || defaultBoardId}
                        onChange={e => setDraft(slot.slotNumber, { boardId: e.target.value })}
                        disabled={isLoading || isSaving || boards.length === 0}
                        style={{
                          minWidth: 0, height: 32, borderRadius: 7,
                          border: `1px solid ${T.cardBorder}`, background: '#171a23',
                          color: T.textMuted, padding: '0 8px', fontSize: 12, outline: 'none',
                        }}
                      >
                        {boards.length === 0
                          ? <option value="">No boards</option>
                          : boards.map(board => <option key={board.id} value={board.id}>{board.title}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => submit(slot.slotNumber)}
                        disabled={isLoading || isSaving || !draft.title.trim() || !(draft.boardId || defaultBoardId)}
                        style={{
                          height: 32, borderRadius: 7,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          border: `1px solid ${T.green}30`, background: `${T.green}12`,
                          color: T.green, padding: '0 10px', fontSize: 11, fontWeight: 700,
                          cursor: isLoading || isSaving || !draft.title.trim() ? 'default' : 'pointer',
                          opacity: isLoading || isSaving || !draft.title.trim() ? 0.55 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div className="today-big3-empty-form" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                        <input
                          value={search.query}
                          onChange={e => updateSearchQuery(slot.slotNumber, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') runSearch(slot.slotNumber); }}
                          placeholder="Search existing cards"
                          disabled={isLoading || isSaving || boards.length === 0}
                          style={{
                            minWidth: 0, height: 32, borderRadius: 7,
                            border: `1px solid ${T.cardBorder}`, background: 'rgba(255,255,255,0.025)',
                            color: T.text, padding: '0 10px', fontSize: 12, outline: 'none',
                          }}
                        />
                      </div>
                      {search.results.length > 0 && (
                        <div style={{
                          marginTop: 6, border: `1px solid ${T.cardBorder}`, borderRadius: 8,
                          background: 'rgba(0,0,0,0.12)', overflow: 'hidden',
                        }}>
                          {search.results.map(result => (
                            <button
                              type="button"
                              key={result.id}
                              onClick={() => assignExisting(slot.slotNumber, result)}
                              disabled={isSaving}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                padding: '8px 10px', border: 0, borderBottom: `1px solid ${T.cardBorder}`,
                                background: 'transparent', color: T.text, cursor: isSaving ? 'default' : 'pointer',
                                textAlign: 'left',
                              }}
                              className="today-big3-result"
                            >
                              <span style={{ minWidth: 0 }}>
                                <span style={{
                                  display: 'block', fontSize: 12, fontWeight: 650,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  textDecoration: result.is_complete ? 'line-through' : 'none',
                                  color: result.is_complete ? T.textMuted : T.text,
                                }}>
                                  {result.title}
                                </span>
                                <span style={{
                                  display: 'block', marginTop: 1, fontSize: 10, color: T.textMuted,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {result.board_name}{result.column_name ? ` · ${result.column_name}` : ''}{result.is_complete ? ' · Done' : ''}
                                </span>
                              </span>
                              <span style={{ color: T.green, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                Add
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {search.hasSearched && search.query.trim().length >= 2 && !search.isSearching && search.results.length === 0 && (
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: T.textFaint }}>No matching cards yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{
          padding: '9px 16px', borderTop: `1px solid ${T.cardBorder}`,
          color: T.red, fontSize: 12, background: `${T.red}0f`,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SK = '#252836'; // shimmer element color

function SkEl({ w, h, r = 5, style }: { w: number | string; h: number; r?: number; style?: React.CSSProperties }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

function TodaySkeleton() {
  const loadingMessage = useRandomLoadingMessage();
  const sectionRows = [3, 2, 4, 2];
  return (
    <div style={{
      maxWidth: 720, margin: '0 auto',
      padding: '20px 16px 100px', position: 'relative', zIndex: 1,
      minHeight: 'calc(100vh - 60px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes sk-pulse { 0%,100% { opacity:.45 } 50% { opacity:.8 } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sk { background:${SK}; animation: sk-pulse 1.6s ease-in-out infinite; }
      `}</style>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        margin: '8px 0 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: `2px solid ${T.cardBorder}`,
          borderTopColor: '#33B233',
          animation: 'spin 1s linear infinite',
        }} />
        <p
          key={loadingMessage}
          suppressHydrationWarning
          className="loading-message-build-in"
          style={{
            minHeight: 22,
            margin: 0,
            color: T.textMuted,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
          }}
        >
          {loadingMessage}
        </p>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkEl w={72} h={28} r={8} />
          <SkEl w={160} h={13} />
        </div>
        <SkEl w={80} h={34} r={9} />
      </div>

      {/* Scoreboard */}
      <div style={{
        background: T.cardBg, border: `1px solid ${T.cardBorder}`,
        borderRadius: 14, overflow: 'hidden', marginBottom: 24,
      }}>
        <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${T.cardBorder}` }}>
          <SkEl w={120} h={11} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const isRight   = i % 2 === 1;
            const isLastRow = i >= 6;
            return (
              <div key={i} style={{
                padding: '11px 14px',
                borderBottom: !isLastRow ? `1px solid ${T.cardBorder}` : 'none',
                borderLeft: isRight ? `1px solid ${T.cardBorder}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SkEl w={7} h={7} r={99} />
                  <SkEl w={70 + (i * 13) % 35} h={12} />
                </div>
                <SkEl w={14} h={18} r={4} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Section cards */}
      {sectionRows.map((rows, si) => (
        <div key={si} style={{
          background: T.cardBg, border: `1px solid ${T.cardBorder}`,
          borderRadius: 14, overflow: 'hidden', marginBottom: 12,
        }}>
          {/* Section header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${T.cardBorder}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <SkEl w={16} h={16} r={4} />
            <SkEl w={120 + (si * 23) % 60} h={13} />
            <SkEl w={24} h={18} r={5} style={{ marginLeft: 2 }} />
          </div>
          {/* Rows */}
          {Array.from({ length: rows }).map((_, ri) => (
            <div key={ri} style={{
              padding: '11px 16px 11px 19px',
              borderBottom: ri < rows - 1 ? `1px solid ${T.cardBorder}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                <SkEl w={`${50 + (ri * 19 + si * 11) % 35}%`} h={13} />
                <SkEl w={`${28 + (ri * 13 + si * 7) % 22}%`} h={11} />
              </div>
              <SkEl w={54} h={28} r={7} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Sections (shared between mobile list and desktop rail) ───────────────────

function TodaySections({
  data, hasAnything, isOpen, toggle,
  markEncouragementSent, clearFollowUp, markCardComplete, markChecklistDone,
  onOpenCard,
}: {
  data: TodayData;
  hasAnything: boolean;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  markEncouragementSent: (id: number) => void;
  clearFollowUp: (id: number) => void;
  markCardComplete: (id: string) => void;
  markChecklistDone: (id: string) => void;
  onOpenCard: (boardId: string, cardId: string) => void;
}) {
  const totalFocus = (data.focusCards ?? []).length;

  const cardClick = (boardId: string, cardId: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    onOpenCard(boardId, cardId);
  };

  return (
    <>
      {/* ── All clear ── */}
      {!hasAnything && (
        <div style={{
          background: `${T.green}0f`, border: `1px solid ${T.green}25`,
          borderRadius: 14, padding: '32px 24px', textAlign: 'center', marginBottom: 16,
        }}>
          <p style={{ fontSize: 28, marginBottom: 8, display: 'flex', justifyContent: 'center' }}><Check className="h-7 w-7" /></p>
          <p style={{ fontSize: 15, fontWeight: 600, color: T.green, margin: 0 }}>You&apos;re all caught up!</p>
          <p style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>Nothing urgent for today.</p>
        </div>
      )}

      {/* ── Focus Cards ── */}
      <Section id="focus-cards" title="Focus Cards" icon={<Star className="h-4 w-4" />} count={totalFocus}
        sectionKey="focusCards" isOpen={isOpen('focusCards')} onToggle={() => toggle('focusCards')} accentColor="#f59e0b">
        {(data.focusCards ?? []).map((c: CardDigestItem) => (
          <Item key={c.id} accentColor="#f59e0b">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/boards/${c.board_id}?card=${c.id}`} onClick={cardClick(c.board_id, c.id)}
                style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                className="today-leader-link">
                {c.title}
              </Link>
              <Sub>{c.board_name}{c.column_name ? ` · ${c.column_name}` : ''}</Sub>
              <CardMeta card={c} />
            </div>
            {c.due_date && <DateBadge date={formatShort(c.due_date)} color="#f59e0b" />}
          </Item>
        ))}
      </Section>

      {/* ── Birthdays ── */}
      <Section id="birthdays" title="Birthdays" icon={<Cake className="h-4 w-4" />} count={data.birthdays.length}
        sectionKey="birthdays" isOpen={isOpen('birthdays')} onToggle={() => toggle('birthdays')} accentColor={T.violet}>
        {data.birthdays.map((b: BirthdayItem) => (
          <Item key={b.id} accentColor={T.violet}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={b.id} name={b.name} />
              {b.campus && <Sub>{b.campus}</Sub>}
            </div>
            {b.phone && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <a href={`tel:${b.phone}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: `${T.violet}15`, color: T.violet,
                  border: `1px solid ${T.violet}30`, textDecoration: 'none', whiteSpace: 'nowrap',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .18h3a2 2 0 012 1.72c.13 1.05.39 2.08.76 3.07a2 2 0 01-.45 2.11L6.09 8.3a16 16 0 006.61 6.61l1.22-1.22a2 2 0 012.11-.45c.99.37 2.02.63 3.07.76A2 2 0 0122 16.92z" />
                  </svg>
                  Call
                </a>
                <a href={`sms:${b.phone}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: `${T.violet}15`, color: T.violet,
                  border: `1px solid ${T.violet}30`, textDecoration: 'none', whiteSpace: 'nowrap',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  Text
                </a>
              </div>
            )}
          </Item>
        ))}
      </Section>

      {/* ── Circle Visits Today ── */}
      <Section id="visits-today" title="Circle Visits Today" icon={<CalendarDays className="h-4 w-4" />} count={data.circleVisits.today.length}
        sectionKey="circleVisitsToday" isOpen={isOpen('circleVisitsToday')} onToggle={() => toggle('circleVisitsToday')} accentColor={T.neutral}>
        {data.circleVisits.today.map((v: VisitItem) => (
          <Item key={v.id} accentColor={T.neutral}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={v.leader_id} name={v.leader_name} />
              <Sub>{[v.leader_campus, v.previsit_note].filter(Boolean).join(' · ')}</Sub>
            </div>
          </Item>
        ))}
      </Section>

      {/* ── Encouragements Due Today ── */}
      <Section id="encs-today" title="Encouragements Due Today" icon={<PartyPopper className="h-4 w-4" />} count={data.encouragements.dueToday.length}
        sectionKey="encouragementsToday" isOpen={isOpen('encouragementsToday')} onToggle={() => toggle('encouragementsToday')} accentColor={T.amber}>
        {data.encouragements.dueToday.map((e: EncouragementItem) => (
          <Item key={e.id} accentColor={T.amber}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={e.circle_leader_id} name={e.leader_name} />
              <Sub>{[e.leader_campus, methodLabel(e.encourage_method), e.note].filter(Boolean).join(' · ')}</Sub>
            </div>
            <ActionBtn onClick={() => markEncouragementSent(e.id)} color={T.green}>Sent</ActionBtn>
          </Item>
        ))}
      </Section>

      {/* ── Follow-Ups Due Today ── */}
      <Section id="follow-ups" title="Follow-Ups Due Today" icon={<BellRing className="h-4 w-4" />} count={data.followUps.dueToday.length}
        sectionKey="followUps" isOpen={isOpen('followUps')} onToggle={() => toggle('followUps')} accentColor={T.amber}>
        {data.followUps.dueToday.map((f: FollowUpItem) => (
          <Item key={f.id} accentColor={T.amber}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={f.id} name={f.name} />
              <Sub>{f.campus}</Sub>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {f.follow_up_date && <DateBadge date={`Due ${formatShort(f.follow_up_date)}`} color={T.amber} />}
              <ActionBtn onClick={() => clearFollowUp(f.id)} color={T.green}>Clear</ActionBtn>
            </div>
          </Item>
        ))}
      </Section>

      {/* ── Cards Due Today ── */}
      <Section id="cards-today" title="Cards Due Today" icon={<ClipboardList className="h-4 w-4" />} count={data.cards.dueToday.length}
        sectionKey="cardsToday" isOpen={isOpen('cardsToday')} onToggle={() => toggle('cardsToday')} accentColor={T.amber}>
        {data.cards.dueToday.map((c: CardDigestItem) => (
          <Item key={c.id} accentColor={T.amber}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Link href={`/boards/${c.board_id}?card=${c.id}`} onClick={cardClick(c.board_id, c.id)}
                style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                className="today-leader-link">
                {c.title}
              </Link>
              <Sub>{c.board_name} · {c.column_name}</Sub>
              <CardMeta card={c} />
            </div>
            <ActionBtn onClick={() => markCardComplete(c.id)} color={T.green}>Done</ActionBtn>
          </Item>
        ))}
      </Section>

      {/* ── Overdue Cards ── */}
      <Section id="overdue-cards" title="Overdue Cards" icon={<AlertTriangle className="h-4 w-4" />} count={data.cards.overdue.length}
        sectionKey="overdueCards" isOpen={isOpen('overdueCards')} onToggle={() => toggle('overdueCards')} accentColor={T.red}>
        {data.cards.overdue.map((c: CardDigestItem) => (
          <Item key={c.id} accentColor={T.red}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Link href={`/boards/${c.board_id}?card=${c.id}`} onClick={cardClick(c.board_id, c.id)}
                style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                className="today-leader-link">
                {c.title}
              </Link>
              <Sub>{c.board_name} · {c.column_name}</Sub>
              <CardMeta card={c} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {c.due_date && <DateBadge date={formatShort(c.due_date)} color={T.red} />}
              <ActionBtn onClick={() => markCardComplete(c.id)} color={T.green}>Done</ActionBtn>
            </div>
          </Item>
        ))}
      </Section>

      {/* ── Checklist Items Due Today ── */}
      <Section id="checklists-today" title="Checklist Items Due Today" icon={<CheckSquare className="h-4 w-4" />} count={data.checklistItems.dueToday.length}
        sectionKey="checklistsToday" isOpen={isOpen('checklistsToday')} onToggle={() => toggle('checklistsToday')} accentColor={T.amber}>
        {data.checklistItems.dueToday.map((cl: ChecklistDigestItem) => (
          <Item key={cl.id} accentColor={T.amber}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{cl.text}</p>
              <Sub>
                <Link href={`/boards/${cl.board_id}?card=${cl.card_id}`} onClick={cardClick(cl.board_id, cl.card_id)}
                  style={{ color: T.textMuted, textDecoration: 'none' }} className="today-leader-link">
                  {cl.card_title} · {cl.board_name}
                </Link>
              </Sub>
            </div>
            <ActionBtn onClick={() => markChecklistDone(cl.id)} color={T.green}>Done</ActionBtn>
          </Item>
        ))}
      </Section>

      {/* ── Overdue Checklist Items ── */}
      <Section id="overdue-checklists" title="Overdue Checklist Items" icon={<AlertTriangle className="h-4 w-4" />} count={data.checklistItems.overdue.length}
        sectionKey="overdueChecklists" isOpen={isOpen('overdueChecklists')} onToggle={() => toggle('overdueChecklists')} accentColor={T.red}>
        {data.checklistItems.overdue.map((cl: ChecklistDigestItem) => (
          <Item key={cl.id} accentColor={T.red}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{cl.text}</p>
              <Sub><Link href={`/boards/${cl.board_id}?card=${cl.card_id}`} onClick={cardClick(cl.board_id, cl.card_id)}
                style={{ color: 'inherit', textDecoration: 'none' }} className="today-leader-link">{cl.card_title} · {cl.board_name}</Link></Sub>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {cl.due_date && <DateBadge date={`Due ${formatShort(cl.due_date)}`} color={T.red} />}
              <ActionBtn onClick={() => markChecklistDone(cl.id)} color={T.green}>Done</ActionBtn>
            </div>
          </Item>
        ))}
      </Section>

      {/* ── Overdue Encouragements ── */}
      <Section id="overdue-encs" title="Overdue Encouragements" icon="⏰" count={data.encouragements.overdue.length}
        sectionKey="overdueEncouragements" isOpen={isOpen('overdueEncouragements')} onToggle={() => toggle('overdueEncouragements')} accentColor={T.red}>
        {data.encouragements.overdue.map((e: EncouragementItem) => (
          <Item key={e.id} accentColor={T.red}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={e.circle_leader_id} name={e.leader_name} />
              <Sub>{methodLabel(e.encourage_method)}</Sub>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {e.message_date && <DateBadge date={`Due ${formatShort(e.message_date)}`} color={T.red} />}
              <ActionBtn onClick={() => markEncouragementSent(e.id)} color={T.green}>Sent</ActionBtn>
            </div>
          </Item>
        ))}
      </Section>

      {/* ── Overdue Follow-Ups ── */}
      <Section id="overdue-followups" title="Overdue Follow-Ups" icon={<Pin className="h-4 w-4" />} count={data.followUps.overdue.length}
        sectionKey="overdueFollowUps" isOpen={isOpen('overdueFollowUps')} onToggle={() => toggle('overdueFollowUps')} accentColor={T.red}>
        {data.followUps.overdue.map((f: FollowUpItem) => (
          <Item key={f.id} accentColor={T.red}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={f.id} name={f.name} />
              <Sub>{f.campus || 'No campus'}</Sub>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {f.follow_up_date
                ? <DateBadge date={`Due ${formatShort(f.follow_up_date)}`} color={T.red} />
                : <DateBadge date="No due date" color={T.textFaint} />}
              <ActionBtn onClick={() => clearFollowUp(f.id)} color={T.green}>Clear</ActionBtn>
            </div>
          </Item>
        ))}
      </Section>

      {/* ── Prayer Requests Today ── */}
      <Section id="prayers-today" title="Prayer Requests Today" icon={<Heart className="h-4 w-4" />} count={data.prayerRequests?.dueToday?.length || 0}
        sectionKey="prayersToday" isOpen={isOpen('prayersToday')} onToggle={() => toggle('prayersToday')} accentColor={T.amber}>
        {(data.prayerRequests?.dueToday || []).map((p: PrayerRequestItem) => (
          <Item key={p.id} accentColor={T.amber}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {p.circle_leader_id && p.leader_name
                ? <><LeaderLink id={p.circle_leader_id} name={p.leader_name} />{p.leader_campus && <Sub>{p.leader_campus}</Sub>}</>
                : <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>General Prayer</span>
              }
              <p style={{ margin: '4px 0 0', fontSize: 13, color: T.text, lineHeight: 1.5 }}>{p.content}</p>
            </div>
            <DateBadge date={`Pray ${formatShort(p.pray_date)}`} color={T.amber} />
          </Item>
        ))}
      </Section>

      {/* ── Overdue Prayer Requests ── */}
      <Section id="prayers-overdue" title="Overdue Prayer Requests" icon={<Heart className="h-4 w-4" />} count={data.prayerRequests?.overdue?.length || 0}
        sectionKey="prayersOverdue" isOpen={isOpen('prayersOverdue')} onToggle={() => toggle('prayersOverdue')} accentColor={T.red}>
        {(data.prayerRequests?.overdue || []).map((p: PrayerRequestItem) => (
          <Item key={p.id} accentColor={T.red}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {p.circle_leader_id && p.leader_name
                ? <><LeaderLink id={p.circle_leader_id} name={p.leader_name} />{p.leader_campus && <Sub>{p.leader_campus}</Sub>}</>
                : <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>General Prayer</span>
              }
              <p style={{ margin: '4px 0 0', fontSize: 13, color: T.text, lineHeight: 1.5 }}>{p.content}</p>
            </div>
            <DateBadge date={`Due ${formatShort(p.pray_date)}`} color={T.red} />
          </Item>
        ))}
      </Section>

      {/* ── Circle Visits This Week ── */}
      <Section id="visits-week" title="Circle Visits This Week" icon={<CalendarRange className="h-4 w-4" />} count={data.circleVisits.thisWeek.length}
        sectionKey="circleVisitsWeek" isOpen={isOpen('circleVisitsWeek')} onToggle={() => toggle('circleVisitsWeek')} accentColor={T.neutral}>
        {data.circleVisits.thisWeek.map((v: VisitItem) => (
          <Item key={v.id} accentColor={T.neutral}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={v.leader_id} name={v.leader_name} />
              {v.leader_campus && <Sub>{v.leader_campus}</Sub>}
            </div>
            <DateBadge date={formatShort(v.visit_date)} color={T.neutral} />
          </Item>
        ))}
      </Section>

      {/* ── Upcoming Scheduled Visits ── */}
      <Section id="upcoming-visits" title="Upcoming Scheduled Visits" icon={<CalendarRange className="h-4 w-4" />} count={data.upcomingVisits.length}
        sectionKey="upcomingVisits" isOpen={isOpen('upcomingVisits')} onToggle={() => toggle('upcomingVisits')} accentColor={T.neutral}>
        {data.upcomingVisits.map((v: VisitItem) => (
          <Item key={v.id} accentColor={T.neutral}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={v.leader_id} name={v.leader_name} />
              {v.leader_campus && <Sub>{v.leader_campus}</Sub>}
            </div>
            <DateBadge date={formatShort(v.visit_date)} color={T.neutral} />
          </Item>
        ))}
      </Section>

      {/* ── Recent Notes ── */}
      <Section id="recent-notes" title="Recent Notes" icon={<NotebookPen className="h-4 w-4" />} count={data.recentNotes.length}
        sectionKey="recentNotes" isOpen={isOpen('recentNotes')} onToggle={() => toggle('recentNotes')} accentColor={T.textMuted}>
        {data.recentNotes.map((n: NoteItem) => (
          <Item key={n.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LeaderLink id={n.circle_leader_id} name={n.leader_name} />
              <p style={{ fontSize: 11, color: T.textMuted, margin: '3px 0 0', lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                {n.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
              </p>
            </div>
            <span style={{ fontSize: 10, color: T.textFaint, whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>
              {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </Item>
        ))}
      </Section>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
const MOBILE_TAB_KEY = 'today_mobile_tab';

export default function TodayPage() {
  const { data, isLoading, isFetching, isCardsLoading, error, fetchData, markEncouragementSent, clearFollowUp, markCardComplete, markChecklistDone } = useTodayData();
  const bigThree = useBigThree();
  const calendars = useTodayCalendars();
  const { isOpen, toggle } = useVisibility();

  const [isDesktop, setIsDesktop] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [mobileTab, setMobileTabState] = useState<'list' | 'day'>('list');
  const [openCard, setOpenCard] = useState<{ boardId: string; cardId: string } | null>(null);

  const { fetchAll: fetchCalendars } = calendars;

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCalendars(); }, [fetchCalendars]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    setLayoutReady(true);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(MOBILE_TAB_KEY);
      if (stored === 'day' || stored === 'list') setMobileTabState(stored);
    } catch {}
  }, []);

  const setMobileTab = (tab: 'list' | 'day') => {
    setMobileTabState(tab);
    try { localStorage.setItem(MOBILE_TAB_KEY, tab); } catch {}
  };

  const handleOpenCard = useCallback((boardId: string, cardId: string) => {
    setOpenCard({ boardId, cardId });
  }, []);

  const handleModalClose = useCallback((didChange: boolean) => {
    setOpenCard(null);
    if (didChange) {
      fetchData();
      bigThree.load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // ── Timeline events (must be computed before early returns) ──
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!data) return [];
    const evts: TimelineEvent[] = [];
    const open = (boardId: string, cardId: string) => () => setOpenCard({ boardId, cardId });

    const pushCard = (c: CardDigestItem, overdue: boolean) => {
      evts.push({
        key: `card-${c.id}`, kind: 'card',
        title: c.title,
        subtitle: `${c.board_name}${c.column_name ? ` · ${c.column_name}` : ''}`,
        // An overdue card's time belongs to a past day — keep it in the all-day strip
        startMin: overdue ? null : parseTimeToMin(c.due_time),
        color: overdue ? T.red : T.amber, overdue,
        onOpen: open(c.board_id, c.id),
      });
    };
    data.cards.dueToday.forEach(c => pushCard(c, false));
    data.cards.overdue.forEach(c => pushCard(c, true));

    const pushChecklist = (cl: ChecklistDigestItem, overdue: boolean) => {
      evts.push({
        key: `cl-${cl.id}`, kind: 'checklist',
        title: cl.text,
        subtitle: `${cl.card_title} · ${cl.board_name}`,
        startMin: null,
        color: overdue ? T.red : T.amber, overdue,
        onOpen: open(cl.board_id, cl.card_id),
      });
    };
    data.checklistItems.dueToday.forEach(cl => pushChecklist(cl, false));
    data.checklistItems.overdue.forEach(cl => pushChecklist(cl, true));

    const pushFollowUp = (f: FollowUpItem, overdue: boolean) => {
      evts.push({
        key: `fu-${f.id}`, kind: 'followup',
        title: `Follow up · ${f.name}`,
        subtitle: f.campus || undefined,
        startMin: overdue ? null : parseTimeToMin(f.follow_up_time),
        color: overdue ? T.red : T.amber, overdue,
        href: `/circle/${f.id}`,
      });
    };
    data.followUps.dueToday.forEach(f => pushFollowUp(f, false));
    data.followUps.overdue.forEach(f => pushFollowUp(f, true));

    const pushEnc = (e: EncouragementItem, overdue: boolean) => {
      evts.push({
        key: `enc-${e.id}`, kind: 'encouragement',
        title: `Encourage · ${e.leader_name}`,
        subtitle: methodLabel(e.encourage_method),
        startMin: null,
        color: overdue ? T.red : T.amber, overdue,
        href: `/circle/${e.circle_leader_id}`,
      });
    };
    data.encouragements.dueToday.forEach(e => pushEnc(e, false));
    data.encouragements.overdue.forEach(e => pushEnc(e, true));

    data.circleVisits.today.forEach((v: VisitItem) => {
      const startMin = parseTimeToMin(v.circle_time);
      evts.push({
        key: `visit-${v.id}`, kind: 'visit',
        title: `Circle visit · ${v.leader_name}`,
        subtitle: [v.leader_campus, v.previsit_note].filter(Boolean).join(' · ') || undefined,
        startMin,
        endMin: startMin !== null ? startMin + 90 : null,
        color: '#60a5fa',
        href: `/circle/${v.leader_id}`,
      });
    });

    data.birthdays.forEach((b: BirthdayItem) => {
      evts.push({
        key: `bday-${b.id}`, kind: 'birthday',
        title: `🎂 ${b.name}`,
        subtitle: b.campus || undefined,
        startMin: null,
        color: T.violet,
        href: `/circle/${b.id}`,
      });
    });

    const pushPrayer = (p: PrayerRequestItem, overdue: boolean) => {
      evts.push({
        key: `prayer-${p.id}-${p.is_general ? 'g' : 'l'}`, kind: 'prayer',
        title: p.leader_name ? `Pray · ${p.leader_name}` : 'Pray · General',
        subtitle: p.content,
        startMin: null,
        color: overdue ? T.red : T.amber, overdue,
        href: p.circle_leader_id ? `/circle/${p.circle_leader_id}` : '/prayer',
      });
    };
    (data.prayerRequests?.dueToday || []).forEach(p => pushPrayer(p, false));
    (data.prayerRequests?.overdue || []).forEach(p => pushPrayer(p, true));

    calendars.events.forEach(ev => {
      if (ev.all_day) {
        evts.push({
          key: `evt-${ev.subscription_id}-${ev.id}`, kind: 'calendar',
          title: ev.title,
          subtitle: ev.calendar_name,
          startMin: null,
          color: ev.color,
        });
        return;
      }
      // setZone keeps the feed's wall-clock time (API returns America/Chicago
      // offsets) so events land at the right hour regardless of device timezone
      const start = DateTime.fromISO(ev.start, { setZone: true });
      const end = DateTime.fromISO(ev.end, { setZone: true });
      if (!start.isValid) return;
      const startsBeforeToday = start.toISODate() !== data.today && start < DateTime.fromISO(data.today);
      const endsAfterToday = end.isValid && end.toISODate() !== data.today && end > start;
      const startMin = startsBeforeToday ? 0 : start.hour * 60 + start.minute;
      const endMin = !end.isValid ? null : (endsAfterToday ? 24 * 60 : end.hour * 60 + end.minute);
      evts.push({
        key: `evt-${ev.subscription_id}-${ev.id}`, kind: 'calendar',
        title: ev.title,
        subtitle: [ev.calendar_name, ev.location].filter(Boolean).join(' · '),
        startMin, endMin,
        color: ev.color,
      });
    });

    return evts;
  }, [data, calendars.events]);

  // ── Loading ──
  if (isLoading || !layoutReady) return <TodaySkeleton />;

  if (error || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 60px)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: T.textMuted, marginBottom: 8 }}>{error || 'No data available.'}</p>
          <button onClick={fetchData} style={{ fontSize: 12, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const totalEncs      = data.encouragements.dueToday.length + data.encouragements.overdue.length;
  const totalFU        = data.followUps.dueToday.length + data.followUps.overdue.length;
  const totalPrayers   = (data.prayerRequests?.dueToday?.length || 0) + (data.prayerRequests?.overdue?.length || 0);
  const totalCards     = data.cards.dueToday.length + data.cards.overdue.length;
  const totalChecklists = data.checklistItems.dueToday.length + data.checklistItems.overdue.length;
  const totalOverdue   = data.cards.overdue.length + data.checklistItems.overdue.length + data.encouragements.overdue.length + data.followUps.overdue.length;
  const totalFocus     = (data.focusCards ?? []).length;
  const totalBigThree  = bigThree.slots.filter(slot => slot.card).length;
  const hasAnything    = data.birthdays.length + data.circleVisits.today.length + totalEncs + totalFU + totalCards + totalChecklists + totalFocus + totalPrayers > 0 || isCardsLoading;

  const scoreboardRows = [
    { label: 'Big 3',           count: totalBigThree,                  color: T.green,   href: '#big-three' },
    { label: 'Focus Cards',     count: totalFocus,                     color: T.amber,   href: '#focus-cards' },
    { label: 'Birthdays',       count: data.birthdays.length,          color: T.violet,  href: '#birthdays' },
    { label: 'Overdue Items',   count: totalOverdue,                   color: T.red,     href: '#overdue-cards' },
    { label: 'Follow-Ups',      count: totalFU,                        color: T.amber,   href: '#follow-ups' },
    { label: 'Prayers',         count: totalPrayers,                   color: T.amber,   href: '#prayers-today' },
    { label: 'Cards Due',       count: totalCards,                     color: T.amber,   href: '#cards-today' },
    { label: 'Encouragements',  count: totalEncs,                      color: T.amber,   href: '#encs-today' },
    { label: 'Checklist Tasks', count: totalChecklists,                color: T.amber,   href: '#checklists-today' },
    { label: 'Circle Visits',   count: data.circleVisits.today.length, color: T.neutral, href: '#visits-today' },
  ];

  const bigThreeEl = (
    <BigThreeSection
      slots={bigThree.slots}
      boards={bigThree.boards}
      isLoading={bigThree.isLoading}
      isSaving={bigThree.isSaving}
      error={bigThree.error}
      onCreate={bigThree.createCard}
      onSearch={bigThree.searchExistingCards}
      onAssignExisting={bigThree.assignExistingCard}
      onDone={bigThree.markDone}
      onClear={bigThree.clearSlot}
      onOpenCard={handleOpenCard}
    />
  );

  const sectionsEl = (
    <TodaySections
      data={data}
      hasAnything={hasAnything}
      isOpen={isOpen}
      toggle={toggle}
      markEncouragementSent={markEncouragementSent}
      clearFollowUp={clearFollowUp}
      markCardComplete={markCardComplete}
      markChecklistDone={markChecklistDone}
      onOpenCard={handleOpenCard}
    />
  );

  const dayViewEl = (
    <DayTimeline
      events={timelineEvents}
      subscriptions={calendars.subscriptions}
      calendarsSaving={calendars.isSaving}
      calendarsError={calendars.error}
      feedErrors={calendars.feedErrors}
      onAddCalendar={calendars.addSubscription}
      onToggleCalendar={calendars.toggleSubscription}
      onRemoveCalendar={calendars.removeSubscription}
      hourHeight={isDesktop ? 64 : 56}
    />
  );

  const refreshBtn = (
    <button
      onClick={fetchData}
      disabled={isFetching}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBorder}`,
        color: isFetching ? T.textFaint : T.textMuted,
        cursor: isFetching ? 'default' : 'pointer', transition: 'all 0.15s',
      }}
    >
      <span style={{ display: 'inline-flex', animation: isFetching ? 'spin 1s linear infinite' : 'none' }}>
        <RefreshIcon />
      </span>
      {isFetching ? 'Refreshing…' : 'Refresh'}
    </button>
  );

  const globalCss = `
    .today-page-bg { position: fixed; inset: 0; background: ${T.pageBg}; z-index: 0; pointer-events: none; }
    .today-page-content { position: relative; z-index: 1; }
    .today-item:last-child { border-bottom: none !important; }
    .today-leader-link:hover { color: ${T.textMuted} !important; }
    .today-action-btn:hover { filter: brightness(1.1); }
    .today-score-row:hover .today-score-inner { background: rgba(255,255,255,0.02); }
    .today-big3-card:hover p { color: ${T.textMuted} !important; }
    .today-rail::-webkit-scrollbar { width: 6px; }
    .today-rail::-webkit-scrollbar-thumb { background: ${T.cardBorder}; border-radius: 3px; }
    @media (max-width: 560px) {
      .today-big3-empty-form { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 440px) {
      .today-big3-row { flex-direction: column !important; align-items: stretch !important; gap: 8px !important; }
      .today-big3-actions { justify-content: flex-end !important; }
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;

  // ── Desktop: full-screen two-pane layout ──
  if (isDesktop) {
    return (
      <>
        <style>{globalCss}</style>
        <div className="today-page-bg" />
        {openCard && (
          <TodayCardModal boardId={openCard.boardId} cardId={openCard.cardId} onClose={handleModalClose} />
        )}

        <div className="today-page-content" style={{
          height: 'calc(100vh - 56px)',
          display: 'grid', gridTemplateColumns: 'minmax(380px, 440px) 1fr', gap: 16,
          padding: '16px 20px', fontFamily: FONT,
        }}>
          {/* ── Left rail: today's work ── */}
          <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f9fafb', margin: 0, lineHeight: 1.1 }}>Today</h1>
                <p style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>{formatDate(data.today)}</p>
              </div>
              {refreshBtn}
            </div>

            <div className="today-rail" style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 2 }}>
              {bigThreeEl}
              {sectionsEl}
            </div>

            <div style={{ flexShrink: 0 }}>
              <Scoreboard rows={scoreboardRows} flush />
            </div>
          </aside>

          {/* ── Right pane: chronological day ── */}
          <main style={{ minHeight: 0, minWidth: 0 }}>
            {dayViewEl}
          </main>
        </div>
      </>
    );
  }

  // ── Mobile / tablet: tabbed list + day views ──
  return (
    <>
      <style>{globalCss}</style>
      <div className="today-page-bg" />
      {openCard && (
        <TodayCardModal boardId={openCard.boardId} cardId={openCard.cardId} onClose={handleModalClose} />
      )}

      <div className="today-page-content" style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 100px', fontFamily: FONT }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f9fafb', margin: 0, lineHeight: 1.1 }}>Today</h1>
            <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{formatDate(data.today)}</p>
          </div>
          {refreshBtn}
        </div>

        {/* ── View toggle ── */}
        <div style={{
          display: 'flex', background: T.cardBg, border: `1px solid ${T.cardBorder}`,
          borderRadius: 10, padding: 3, marginBottom: 16,
        }}>
          {([['list', 'List'], ['day', 'Day']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              style={{
                flex: 1, height: 32, borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: mobileTab === key ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: mobileTab === key ? T.text : T.textFaint,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mobileTab === 'list' ? (
          <>
            <Scoreboard rows={scoreboardRows} />
            {bigThreeEl}
            {sectionsEl}
          </>
        ) : (
          <div style={{ height: 'calc(100vh - 250px)', minHeight: 480 }}>
            {dayViewEl}
          </div>
        )}
      </div>
    </>
  );
}
