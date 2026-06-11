'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { Plus, Trash2, X, CalendarDays, Check, Bell, BellOff, ChevronLeft, ChevronRight, MapPin, AlignLeft } from 'lucide-react';
import type { CalendarSubscription } from '../../lib/supabase';
import type { CalendarEventItem } from '../../hooks/useTodayCalendars';

// ─── Theme (mirrors app/today/page.tsx) ──────────────────────────────────────

const T = {
  cardBg:     '#13151c',
  cardBorder: '#1e2029',
  text:       '#e2e4ec',
  textMuted:  '#8b8fa8',
  textFaint:  '#3d4155',
  red:        '#ef4444',
  green:      '#22c55e',
};

// ─── Public types ─────────────────────────────────────────────────────────────

export type TimelineKind =
  | 'card' | 'checklist' | 'followup' | 'encouragement'
  | 'visit' | 'birthday' | 'prayer' | 'calendar';

/** Payload carried by drag-to-schedule drags (rail cards, all-day chips, timed blocks). */
export type ScheduleDragPayload =
  | { type: 'card'; cardId: string }
  | { type: 'followup'; leaderId: number };

export const SCHEDULE_DRAG_MIME = 'application/x-radius-schedule';

export function readScheduleDragPayload(dt: DataTransfer): ScheduleDragPayload | null {
  try {
    const raw = dt.getData(SCHEDULE_DRAG_MIME) || dt.getData('text/plain');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.type === 'card' && typeof parsed.cardId === 'string') return parsed;
    if (parsed?.type === 'followup' && typeof parsed.leaderId === 'number') return parsed;
    return null;
  } catch { return null; }
}

export function setScheduleDragPayload(dt: DataTransfer, payload: ScheduleDragPayload) {
  const raw = JSON.stringify(payload);
  dt.setData(SCHEDULE_DRAG_MIME, raw);
  dt.setData('text/plain', raw);
  dt.effectAllowed = 'move';
}

export interface TimelineEvent {
  key: string;
  kind: TimelineKind;
  title: string;
  subtitle?: string;
  /** Minutes since midnight; null = all-day */
  startMin: number | null;
  endMin?: number | null;
  color: string;
  overdue?: boolean;
  onOpen?: () => void;
  href?: string;
  /** Present when the item can be dragged onto an hour to (re)schedule it */
  dragPayload?: ScheduleDragPayload;
  /** Present on calendar-feed events — opens the detail popover */
  calendarEvent?: CalendarEventItem;
}

const KIND_LABELS: Record<TimelineKind, string> = {
  card: 'Cards',
  checklist: 'Tasks',
  followup: 'Follow-ups',
  encouragement: 'Encouragements',
  visit: 'Visits',
  birthday: 'Birthdays',
  prayer: 'Prayers',
  calendar: 'Calendars',
};

const KIND_ORDER: TimelineKind[] = ['card', 'checklist', 'followup', 'encouragement', 'visit', 'birthday', 'prayer', 'calendar'];

// ─── Layout constants ─────────────────────────────────────────────────────────

const WORK_START_MIN = 8 * 60 + 30;   // 8:30 AM
const WORK_END_MIN   = 17 * 60 + 30;  // 5:30 PM
const MIN_BLOCK_MIN  = 30;            // visual floor for point-in-time items

const FILTERS_KEY = 'today_timeline_filters_v1';
const REMINDERS_KEY = 'today_timeline_reminders_v1';
const REMINDERS_FIRED_KEY = 'today_timeline_reminders_fired_v1';
const QUICK_ADD_BOARD_KEY = 'today_quick_add_board_id';
const REMINDER_LEAD_MIN = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function fmtUntil(minutes: number): string {
  if (minutes < 1) return 'now';
  if (minutes < 60) return `in ${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

function snapToHour(min: number): number {
  return Math.min(23 * 60, Math.max(0, Math.floor(min / 60) * 60));
}

/** Greedy column packing for overlapping events. Returns col index + count per event key. */
function packColumns(events: { key: string; start: number; end: number }[]): Map<string, { col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, { col: number; cols: number }>();
  let cluster: { key: string; start: number; end: number; col: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const cols = Math.max(...cluster.map(e => e.col)) + 1;
    cluster.forEach(e => result.set(e.key, { col: e.col, cols }));
    cluster = [];
  };

  for (const ev of sorted) {
    if (ev.start >= clusterEnd) { flush(); clusterEnd = ev.end; }
    else clusterEnd = Math.max(clusterEnd, ev.end);
    const used = new Set(cluster.filter(c => c.end > ev.start).map(c => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...ev, col });
  }
  flush();
  return result;
}

function useNowMinutes(): number {
  const [now, setNow] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => {
    const t = setInterval(() => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()); }, 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ─── Reminders ────────────────────────────────────────────────────────────────

function showReminder(title: string, body: string, tag: string) {
  const fallback = () => { try { new Notification(title, { body }); } catch {} };
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, { body, tag }))
        .catch(fallback);
    } else {
      fallback();
    }
  } catch { fallback(); }
}

function useEventReminders(events: TimelineEvent[], enabled: boolean, isToday: boolean) {
  useEffect(() => {
    if (!enabled || !isToday) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const dateKey = now.toDateString();

    let firedToday: string[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(REMINDERS_FIRED_KEY) || '{}');
      if (stored.date === dateKey) firedToday = stored.keys || [];
    } catch {}
    const fired = new Set(firedToday);

    const markFired = (key: string) => {
      fired.add(key);
      try { localStorage.setItem(REMINDERS_FIRED_KEY, JSON.stringify({ date: dateKey, keys: Array.from(fired) })); } catch {}
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ev of events) {
      if (ev.startMin === null || fired.has(ev.key)) continue;
      const fireAtMin = ev.startMin - REMINDER_LEAD_MIN;
      if (fireAtMin <= nowMin) continue;
      timers.push(setTimeout(() => {
        markFired(ev.key);
        showReminder(ev.title, `${fmtMin(ev.startMin!)}${ev.subtitle ? ` · ${ev.subtitle}` : ''}`, `today-${ev.key}`);
      }, (fireAtMin - nowMin) * 60_000));
    }
    return () => timers.forEach(clearTimeout);
  }, [events, enabled, isToday]);
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterChip({ label, color, active, onToggle }: {
  label: string; color: string; active: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: active ? `${color}16` : 'rgba(255,255,255,0.03)',
        color: active ? T.text : T.textFaint,
        border: `1px solid ${active ? `${color}38` : T.cardBorder}`,
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? color : T.textFaint, opacity: active ? 1 : 0.4, flexShrink: 0,
      }} />
      {label}
    </button>
  );
}

// ─── Small header buttons ─────────────────────────────────────────────────────

function HeaderBtn({ onClick, title, active, disabled, children }: {
  onClick: () => void; title?: string; active?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        height: 26, minWidth: 26, padding: '0 7px', borderRadius: 7,
        fontSize: 11, fontWeight: 600,
        background: active ? `${T.green}14` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? `${T.green}35` : T.cardBorder}`,
        color: disabled ? T.textFaint : active ? T.green : T.textMuted,
        cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─── Calendar manager popover ─────────────────────────────────────────────────

const CALENDAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

function CalendarManager({
  subscriptions, isSaving, error, onAdd, onToggle, onRemove, onClose,
}: {
  subscriptions: CalendarSubscription[];
  isSaving: boolean;
  error: string | null;
  onAdd: (name: string, url: string, color: string) => Promise<boolean>;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState(CALENDAR_COLORS[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const submit = async () => {
    const ok = await onAdd(name, url, color);
    if (ok) { setName(''); setUrl(''); }
  };

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
      width: 320, maxWidth: 'calc(100vw - 32px)',
      background: '#171a23', border: `1px solid ${T.cardBorder}`, borderRadius: 12,
      boxShadow: '0 16px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${T.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Subscribed calendars</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {subscriptions.length === 0 && (
        <p style={{ margin: 0, padding: '12px 14px', fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
          Paste a calendar&apos;s secret iCal address (Google, Outlook, or Apple) to lay its events onto your day.
        </p>
      )}

      {subscriptions.map(sub => (
        <div key={sub.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          borderBottom: `1px solid ${T.cardBorder}`,
        }}>
          <button
            onClick={() => onToggle(sub.id, !sub.is_enabled)}
            title={sub.is_enabled ? 'Hide this calendar' : 'Show this calendar'}
            style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
              border: `1.5px solid ${sub.color}`,
              background: sub.is_enabled ? sub.color : 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#0d0f14', padding: 0,
            }}
          >
            {sub.is_enabled && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600,
            color: sub.is_enabled ? T.text : T.textMuted,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {sub.name}
          </span>
          <button
            onClick={() => onRemove(sub.id)}
            title="Remove calendar"
            style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', padding: 2, display: 'inline-flex' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div style={{ padding: '10px 14px', display: 'grid', gap: 7 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Calendar name"
          style={{
            height: 30, borderRadius: 7, border: `1px solid ${T.cardBorder}`,
            background: 'rgba(255,255,255,0.04)', color: T.text, padding: '0 9px', fontSize: 12, outline: 'none',
          }}
        />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="iCal address (https://… or webcal://…)"
          style={{
            height: 30, borderRadius: 7, border: `1px solid ${T.cardBorder}`,
            background: 'rgba(255,255,255,0.04)', color: T.text, padding: '0 9px', fontSize: 12, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {CALENDAR_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                  border: color === c ? '2px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </div>
          <button
            onClick={submit}
            disabled={isSaving || !name.trim() || !url.trim()}
            style={{
              height: 28, borderRadius: 7, padding: '0 10px',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              border: `1px solid ${T.green}30`, background: `${T.green}12`, color: T.green,
              fontSize: 11, fontWeight: 700,
              cursor: isSaving || !name.trim() || !url.trim() ? 'default' : 'pointer',
              opacity: isSaving || !name.trim() || !url.trim() ? 0.5 : 1,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
        {error && <p style={{ margin: 0, fontSize: 11, color: T.red }}>{error}</p>}
      </div>
    </div>
  );
}

// ─── Calendar event detail popover ────────────────────────────────────────────

function CalendarEventPopover({ event, onClose }: { event: CalendarEventItem; onClose: () => void }) {
  // Keep the feed's wall-clock time (offsets come from the app timezone),
  // matching how the grid positions these events.
  const start = DateTime.fromISO(event.start, { setZone: true });
  const end = DateTime.fromISO(event.end, { setZone: true });
  const fmt = (d: DateTime) => d.toFormat(d.minute === 0 ? 'h a' : 'h:mm a');
  const timeLabel = event.all_day ? 'All day' : `${fmt(start)} – ${fmt(end)}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,8,12,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '100%', maxHeight: '70vh', overflowY: 'auto',
          background: '#171a23', border: `1px solid ${T.cardBorder}`, borderRadius: 14,
          borderTop: `3px solid ${event.color}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, overflowWrap: 'anywhere' }}>
              {event.title}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: event.color, flexShrink: 0 }} />
              {event.calendar_name} · {timeLabel}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0 }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {(event.location || event.description) && (
          <div style={{ padding: '0 16px 14px', display: 'grid', gap: 10 }}>
            {event.location && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: T.textFaint, display: 'inline-flex', paddingTop: 1 }}><MapPin className="h-3.5 w-3.5" /></span>
                <p style={{ margin: 0, fontSize: 12, color: T.text, overflowWrap: 'anywhere' }}>{event.location}</p>
              </div>
            )}
            {event.description && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: T.textFaint, display: 'inline-flex', paddingTop: 1 }}><AlignLeft className="h-3.5 w-3.5" /></span>
                <p style={{
                  margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                }}>
                  {event.description}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quick-add dialog ─────────────────────────────────────────────────────────

function QuickAddDialog({ minutes, dateLabel, boards, onCreate, onClose }: {
  minutes: number;
  dateLabel: string;
  boards: { id: string; title: string }[];
  onCreate: (title: string, boardId: string, minutes: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const defaultBoardId = (() => {
    try {
      const saved = localStorage.getItem(QUICK_ADD_BOARD_KEY);
      if (saved && boards.some(b => b.id === saved)) return saved;
    } catch {}
    return boards[0]?.id || '';
  })();

  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState(defaultBoardId);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    if (!title.trim() || !boardId || saving) return;
    setSaving(true);
    const ok = await onCreate(title, boardId, minutes);
    setSaving(false);
    if (ok) {
      try { localStorage.setItem(QUICK_ADD_BOARD_KEY, boardId); } catch {}
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,8,12,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '100%',
          background: '#171a23', border: `1px solid ${T.cardBorder}`, borderRadius: 14,
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>New card</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.green }}>
            {dateLabel} · {fmtMin(minutes)} – {fmtMin(minutes + 60)}
          </span>
        </div>
        <div style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
            placeholder="What needs to happen?"
            style={{
              height: 34, borderRadius: 8, border: `1px solid ${T.cardBorder}`,
              background: 'rgba(255,255,255,0.04)', color: T.text, padding: '0 10px', fontSize: 13, outline: 'none',
            }}
          />
          <select
            value={boardId}
            onChange={e => setBoardId(e.target.value)}
            style={{
              height: 32, borderRadius: 8, border: `1px solid ${T.cardBorder}`,
              background: '#1c1f2a', color: T.textMuted, padding: '0 8px', fontSize: 12, outline: 'none',
            }}
          >
            {boards.length === 0
              ? <option value="">No boards</option>
              : boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
            <button
              onClick={onClose}
              style={{
                height: 30, borderRadius: 7, padding: '0 12px', fontSize: 12, fontWeight: 600,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBorder}`,
                color: T.textMuted, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || !title.trim() || !boardId}
              style={{
                height: 30, borderRadius: 7, padding: '0 12px', fontSize: 12, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: `${T.green}14`, border: `1px solid ${T.green}35`, color: T.green,
                cursor: saving || !title.trim() ? 'default' : 'pointer',
                opacity: saving || !title.trim() || !boardId ? 0.5 : 1,
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {saving ? 'Adding…' : 'Add card'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event chip / block ───────────────────────────────────────────────────────

function eventInner(ev: TimelineEvent, compact: boolean) {
  return (
    <>
      <span style={{
        fontSize: 11, fontWeight: 650, color: T.text, lineHeight: 1.25,
        display: '-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      } as React.CSSProperties}>
        {ev.title}
      </span>
      {!compact && ev.subtitle && (
        <span style={{
          fontSize: 10, color: T.textMuted, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
        }}>
          {ev.subtitle}
        </span>
      )}
    </>
  );
}

function dragProps(ev: TimelineEvent) {
  if (!ev.dragPayload) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => setScheduleDragPayload(e.dataTransfer, ev.dragPayload!),
  };
}

function EventBlock({ ev, top, height, leftPct, widthPct, onOpen }: {
  ev: TimelineEvent; top: number; height: number; leftPct: number; widthPct: number;
  onOpen?: () => void;
}) {
  const compact = height < 38;
  const style: React.CSSProperties = {
    position: 'absolute',
    top, height: height - 2,
    left: `calc(${leftPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
    borderRadius: 7,
    background: `${ev.color}14`,
    border: `1px solid ${ev.color}30`,
    borderLeft: `3px solid ${ev.color}`,
    padding: compact ? '2px 8px' : '4px 8px',
    overflow: 'hidden',
    cursor: ev.dragPayload ? 'grab' : 'pointer',
    textAlign: 'left',
    display: 'flex', flexDirection: 'column', justifyContent: compact ? 'center' : 'flex-start',
    textDecoration: 'none',
  };
  const open = onOpen || ev.onOpen;
  if (ev.href && !open) {
    return <Link href={ev.href} className="today-tl-block" style={style} {...dragProps(ev)}>{eventInner(ev, compact)}</Link>;
  }
  return (
    <button className="today-tl-block" onClick={open} style={style} {...dragProps(ev)}>
      {eventInner(ev, compact)}
    </button>
  );
}

function AllDayChip({ ev, onOpen }: { ev: TimelineEvent; onOpen?: () => void }) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 999, maxWidth: '100%',
    background: `${ev.color}12`, border: `1px solid ${ev.color}2e`,
    cursor: ev.dragPayload ? 'grab' : 'pointer', textDecoration: 'none',
  };
  const inner = (
    <>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
      <span style={{
        fontSize: 11, fontWeight: 600, color: T.text,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {ev.title}
      </span>
      {ev.overdue && (
        <span style={{ fontSize: 9, fontWeight: 700, color: T.red, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          overdue
        </span>
      )}
    </>
  );
  const open = onOpen || ev.onOpen;
  if (ev.href && !open) return <Link href={ev.href} className="today-tl-chip" style={style} {...dragProps(ev)}>{inner}</Link>;
  return <button className="today-tl-chip" onClick={open} style={style} {...dragProps(ev)}>{inner}</button>;
}

// ─── Next-up ribbon ───────────────────────────────────────────────────────────

function NextUpRibbon({ ev, nowMin }: { ev: TimelineEvent; nowMin: number }) {
  const inner = (
    <>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.green, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
        Next up
      </span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
      <span style={{
        fontSize: 12, fontWeight: 650, color: T.text, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {ev.title}
      </span>
      <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
        {fmtMin(ev.startMin!)} · {fmtUntil(ev.startMin! - nowMin)}
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '7px 14px',
    background: `${T.green}0a`, borderBottom: `1px solid ${T.cardBorder}`,
    border: 'none', borderBottomStyle: 'solid', borderBottomWidth: 1, borderBottomColor: T.cardBorder,
    cursor: 'pointer', textAlign: 'left', textDecoration: 'none',
  };
  if (ev.href && !ev.onOpen) return <Link href={ev.href} style={style} className="today-tl-ribbon">{inner}</Link>;
  return <button onClick={ev.onOpen} style={style} className="today-tl-ribbon">{inner}</button>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DayTimeline({
  events,
  subscriptions,
  calendarsSaving,
  calendarsError,
  feedErrors,
  onAddCalendar,
  onToggleCalendar,
  onRemoveCalendar,
  hourHeight = 64,
  dateLabel,
  isToday,
  dayLoading = false,
  onPrevDay,
  onNextDay,
  onGoToday,
  boards,
  onScheduleDrop,
  onQuickAdd,
}: {
  events: TimelineEvent[];
  subscriptions: CalendarSubscription[];
  calendarsSaving: boolean;
  calendarsError: string | null;
  feedErrors: string[];
  onAddCalendar: (name: string, url: string, color: string) => Promise<boolean>;
  onToggleCalendar: (id: string, enabled: boolean) => void;
  onRemoveCalendar: (id: string) => void;
  hourHeight?: number;
  dateLabel: string;
  isToday: boolean;
  dayLoading?: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onGoToday: () => void;
  boards: { id: string; title: string }[];
  onScheduleDrop: (payload: ScheduleDragPayload, minutes: number) => void;
  onQuickAdd: (title: string, boardId: string, minutes: number) => Promise<boolean>;
}) {
  const [filters, setFilters] = useState<Record<string, boolean>>({});
  const [showCalendars, setShowCalendars] = useState(false);
  const [popoverEvent, setPopoverEvent] = useState<CalendarEventItem | null>(null);
  const [quickAddMin, setQuickAddMin] = useState<number | null>(null);
  const [dropHoverMin, setDropHoverMin] = useState<number | null>(null);
  const [remindersOn, setRemindersOn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const nowMin = useNowMinutes();
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const stored = localStorage.getItem(FILTERS_KEY);
      if (stored) setFilters(JSON.parse(stored));
      if (localStorage.getItem(REMINDERS_KEY) === 'true'
        && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        setRemindersOn(true);
      }
    } catch {}
  }, []);

  const isOn = (kind: TimelineKind) => filters[kind] ?? true;
  const toggleFilter = (kind: TimelineKind) => {
    setFilters(prev => {
      const next = { ...prev, [kind]: !(prev[kind] ?? true) };
      try { localStorage.setItem(FILTERS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const remindersSupported = typeof window !== 'undefined' && 'Notification' in window;
  const toggleReminders = async () => {
    if (!remindersSupported) return;
    if (remindersOn) {
      setRemindersOn(false);
      try { localStorage.setItem(REMINDERS_KEY, 'false'); } catch {}
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setRemindersOn(true);
      try { localStorage.setItem(REMINDERS_KEY, 'true'); } catch {}
    }
  };

  // Kinds present in today's data — only show chips that matter
  const presentKinds = useMemo(() => {
    const kinds = new Set(events.map(e => e.kind));
    if (subscriptions.length > 0) kinds.add('calendar');
    return KIND_ORDER.filter(k => kinds.has(k));
  }, [events, subscriptions]);

  const visible = useMemo(() => events.filter(e => isOn(e.kind)), [events, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const allDay = visible.filter(e => e.startMin === null);
  const timed = visible.filter(e => e.startMin !== null) as (TimelineEvent & { startMin: number })[];

  const nextUp = useMemo(() => {
    if (!isToday) return null;
    return timed
      .filter(e => e.startMin >= nowMin)
      .sort((a, b) => a.startMin - b.startMin)[0] || null;
  }, [timed, nowMin, isToday]);

  useEventReminders(timed, remindersOn, isToday);

  // Pack overlapping events into columns
  const packed = useMemo(() => packColumns(
    timed.map(e => ({
      key: e.key,
      start: e.startMin,
      end: Math.max((e.endMin ?? e.startMin + MIN_BLOCK_MIN), e.startMin + MIN_BLOCK_MIN),
    }))
  ), [timed]);

  // Auto-scroll: work hours front and center (or the first earlier event)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstEvent = timed.length > 0 ? Math.min(...timed.map(e => e.startMin)) : WORK_START_MIN;
    const target = Math.min(WORK_START_MIN, firstEvent);
    el.scrollTop = Math.max(0, (target / 60) * hourHeight - 24);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourHeight, dateLabel]);

  const totalH = 24 * hourHeight;
  const toPx = (min: number) => (min / 60) * hourHeight;

  const minutesFromPointer = (clientY: number): number => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return WORK_START_MIN;
    return snapToHour(((clientY - rect.top) / hourHeight) * 60);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].some(t => t === SCHEDULE_DRAG_MIME || t === 'text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHoverMin(minutesFromPointer(e.clientY));
  };

  const handleDrop = (e: React.DragEvent) => {
    const payload = readScheduleDragPayload(e.dataTransfer);
    setDropHoverMin(null);
    if (!payload) return;
    e.preventDefault();
    onScheduleDrop(payload, minutesFromPointer(e.clientY));
  };

  const handleGridClick = (e: React.MouseEvent) => {
    // Only open quick-add for clicks on empty grid space, not on event blocks
    if (e.target !== e.currentTarget) return;
    setQuickAddMin(minutesFromPointer(e.clientY));
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, overflow: 'hidden',
      position: 'relative',
    }}>
      {/* ── Header row 1: date nav + reminders + calendars ── */}
      <div style={{
        padding: '10px 14px 8px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <HeaderBtn onClick={onPrevDay} title="Previous day"><ChevronLeft className="h-3.5 w-3.5" /></HeaderBtn>
          <HeaderBtn onClick={onNextDay} title="Next day"><ChevronRight className="h-3.5 w-3.5" /></HeaderBtn>
          {!isToday && <HeaderBtn onClick={onGoToday} title="Back to today" active>Today</HeaderBtn>}
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, color: isToday ? T.text : '#60a5fa',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1,
        }}>
          {dateLabel}{dayLoading ? ' · loading…' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {remindersSupported && (
            <HeaderBtn
              onClick={toggleReminders}
              active={remindersOn}
              title={remindersOn ? 'Reminders on — 10 min before each timed item' : 'Turn on reminders (10 min before timed items)'}
            >
              {remindersOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            </HeaderBtn>
          )}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowCalendars(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 26, padding: '0 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBorder}`,
                color: T.textMuted, cursor: 'pointer',
              }}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendars
              {subscriptions.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: T.textFaint }}>{subscriptions.length}</span>
              )}
            </button>
            {showCalendars && (
              <CalendarManager
                subscriptions={subscriptions}
                isSaving={calendarsSaving}
                error={calendarsError}
                onAdd={onAddCalendar}
                onToggle={onToggleCalendar}
                onRemove={onRemoveCalendar}
                onClose={() => setShowCalendars(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Header row 2: filter chips ── */}
      <div style={{ padding: '0 14px 9px', borderBottom: `1px solid ${T.cardBorder}` }}>
        <div className="today-tl-chips" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {presentKinds.map(kind => {
            const sample = kind === 'calendar'
              ? (subscriptions.find(s => s.is_enabled)?.color || '#3b82f6')
              : (events.find(e => e.kind === kind)?.color || T.textMuted);
            return (
              <FilterChip
                key={kind}
                label={KIND_LABELS[kind]}
                color={sample}
                active={isOn(kind)}
                onToggle={() => toggleFilter(kind)}
              />
            );
          })}
        </div>
      </div>

      {feedErrors.length > 0 && (
        <div style={{ padding: '6px 14px', borderBottom: `1px solid ${T.cardBorder}`, fontSize: 11, color: T.red, background: `${T.red}0c` }}>
          Couldn&apos;t reach {feedErrors.join(', ')} — check the feed address.
        </div>
      )}

      {/* ── Next up ── */}
      {nextUp && <NextUpRibbon ev={nextUp} nowMin={nowMin} />}

      {/* ── All-day strip ── */}
      {allDay.length > 0 && (
        <div className="today-tl-allday" style={{
          padding: '9px 14px', borderBottom: `1px solid ${T.cardBorder}`,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 6, flexShrink: 0 }}>
            All day
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
            {allDay.map(ev => (
              <AllDayChip
                key={ev.key}
                ev={ev}
                onOpen={ev.calendarEvent ? () => setPopoverEvent(ev.calendarEvent!) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Hour field ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, position: 'relative' }}>
        <div
          ref={gridRef}
          style={{ position: 'relative', height: totalH }}
          onDragOver={handleDragOver}
          onDragLeave={() => setDropHoverMin(null)}
          onDrop={handleDrop}
        >

          {/* Off-hours shading: the work band reads as the lit part of the field */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: toPx(WORK_START_MIN), background: 'rgba(0,0,0,0.22)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: toPx(WORK_END_MIN), bottom: 0, background: 'rgba(0,0,0,0.22)', pointerEvents: 'none' }} />

          {/* Work band boundary lines */}
          {[{ min: WORK_START_MIN, label: `${fmtMin(WORK_START_MIN)} · start of day` },
            { min: WORK_END_MIN, label: `${fmtMin(WORK_END_MIN)} · end of day` }].map(b => (
            <div key={b.min} style={{ position: 'absolute', left: 0, right: 0, top: toPx(b.min), zIndex: 2, pointerEvents: 'none' }}>
              <div style={{ borderTop: `1px solid ${T.green}45` }} />
              <span style={{
                position: 'absolute', top: 2, right: 8,
                fontSize: 9, fontWeight: 700, color: `${T.green}90`,
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                {b.label}
              </span>
            </div>
          ))}

          {/* Hour lines + labels */}
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: h * hourHeight, pointerEvents: 'none' }}>
              {h > 0 && <div style={{ borderTop: `1px solid ${T.cardBorder}`, marginLeft: 52 }} />}
              <span style={{
                position: 'absolute', top: h === 0 ? 4 : -7, left: 0, width: 46, textAlign: 'right',
                fontSize: 10, color: T.textFaint, fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtMin(h * 60)}
              </span>
              {/* half-hour tick */}
              <div style={{ position: 'absolute', left: 52, right: 0, top: hourHeight / 2, borderTop: `1px dashed rgba(255,255,255,0.03)` }} />
            </div>
          ))}

          {/* Drop target highlight — locked to one-hour blocks */}
          {dropHoverMin !== null && (
            <div style={{
              position: 'absolute', left: 58, right: 6, top: toPx(dropHoverMin), height: hourHeight,
              borderRadius: 7, border: `1.5px dashed ${T.green}70`, background: `${T.green}0d`,
              zIndex: 4, pointerEvents: 'none',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '3px 8px',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.green, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMin(dropHoverMin)} – {fmtMin(dropHoverMin + 60)}
              </span>
            </div>
          )}

          {/* Now line */}
          {isToday && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: toPx(nowMin), zIndex: 5, pointerEvents: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#fff', background: T.red,
                  borderRadius: 4, padding: '1px 5px', marginLeft: 4, fontVariantNumeric: 'tabular-nums',
                  transform: 'translateY(-50%)',
                }}>
                  {fmtMin(nowMin)}
                </span>
                <div style={{ flex: 1, borderTop: `1.5px solid ${T.red}`, opacity: 0.85 }} />
              </div>
            </div>
          )}

          {/* Events — clicking empty space here quick-adds a card at that hour */}
          <div
            style={{ position: 'absolute', top: 0, bottom: 0, left: 58, right: 6, cursor: 'copy' }}
            onClick={handleGridClick}
            title="Click an empty slot to add a card"
          >
            {timed.map(ev => {
              const start = ev.startMin;
              const end = Math.max(ev.endMin ?? start + MIN_BLOCK_MIN, start + MIN_BLOCK_MIN);
              const pos = packed.get(ev.key) || { col: 0, cols: 1 };
              const w = 100 / pos.cols;
              return (
                <EventBlock
                  key={ev.key}
                  ev={ev}
                  top={toPx(start)}
                  height={Math.max(toPx(end - start), 24)}
                  leftPct={pos.col * w}
                  widthPct={w}
                  onOpen={ev.calendarEvent ? () => setPopoverEvent(ev.calendarEvent!) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      {timed.length === 0 && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.cardBorder}` }}>
          <p style={{ margin: 0, fontSize: 11, color: T.textFaint }}>
            Nothing scheduled at a specific time — drag an item onto an hour, or click an empty slot to add a card.
          </p>
        </div>
      )}

      {popoverEvent && <CalendarEventPopover event={popoverEvent} onClose={() => setPopoverEvent(null)} />}
      {quickAddMin !== null && (
        <QuickAddDialog
          minutes={quickAddMin}
          dateLabel={dateLabel}
          boards={boards}
          onCreate={onQuickAdd}
          onClose={() => setQuickAddMin(null)}
        />
      )}

      <style>{`
        .today-tl-block:hover { filter: brightness(1.25); }
        .today-tl-chip:hover { filter: brightness(1.25); }
        .today-tl-ribbon:hover { filter: brightness(1.2); }
        .today-tl-block, .today-tl-chip { font-family: inherit; }
        button.today-tl-block, button.today-tl-chip { background-clip: padding-box; }
        .today-tl-block[draggable="true"]:active { cursor: grabbing; }
        .today-tl-chips { flex-wrap: wrap; }
        .today-tl-allday { max-height: 132px; overflow-y: auto; }
        @media (max-width: 700px) {
          .today-tl-chips {
            flex-wrap: nowrap; overflow-x: auto;
            scrollbar-width: none; -webkit-overflow-scrolling: touch;
            margin: 0 -4px; padding: 0 4px;
          }
          .today-tl-chips::-webkit-scrollbar { display: none; }
          .today-tl-allday { max-height: 96px; }
        }
      `}</style>
    </div>
  );
}
