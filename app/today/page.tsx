'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BellRing,
  Cake,
  CalendarDays,
  CalendarRange,
  Check,
  CheckSquare,
  ClipboardList,
  NotebookPen,
  PartyPopper,
  Pin,
  Star,
} from 'lucide-react';
import { useTodayData } from '../../hooks/useTodayData';
import type {
  EncouragementItem,
  FollowUpItem,
  CardDigestItem,
  ChecklistDigestItem,
  VisitItem,
  BirthdayItem,
  NoteItem,
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
function formatTime(t: string) {
  if (!t || t === 'TBD') return 'TBD';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatPhone(p: string) {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p;
}
function methodLabel(m: string) {
  return ({ text:'Text', email:'Email', call:'Call', 'in-person':'In Person', card:'Card', other:'Other' })[m] || m;
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

function Scoreboard({ rows }: {
  rows: { label: string; count: number; color: string; href: string }[];
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div style={{
      background: T.cardBg, border: `1px solid ${T.cardBorder}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: 24,
    }}>
      <div style={{
        padding: '10px 14px 8px', borderBottom: `1px solid ${T.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Today's Snapshot
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
  id, title, icon, count, sectionKey, isOpen, onToggle, accentColor = T.neutral, headerExtra, children,
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

function CardMeta({ card }: { card: CardDigestItem }) {
  const pri = card.priority ? PRIORITY_META[card.priority] : null;
  const hasLabels = (card.labels?.length ?? 0) > 0;
  const hasChecklist = (card.checklist_total ?? 0) > 0;
  const hasAssignees = card.assignees.length > 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = card.due_date ? card.due_date < todayStr : false;

  if (!pri && !hasLabels && !hasChecklist && !hasAssignees) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 5 }}>
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SK = '#252836'; // shimmer element color

function SkEl({ w, h, r = 5, style }: { w: number | string; h: number; r?: number; style?: React.CSSProperties }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />;
}

function TodaySkeleton() {
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
        .sk { background:${SK}; animation: sk-pulse 1.6s ease-in-out infinite; }
      `}</style>

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

export default function TodayPage() {
  const { data, isLoading, isFetching, isCardsLoading, error, fetchData, markEncouragementSent, clearFollowUp, markCardComplete, markChecklistDone } = useTodayData();
  const { isOpen, toggle } = useVisibility();

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Loading ──
  if (isLoading) return <TodaySkeleton />;

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
  const totalCards     = data.cards.dueToday.length + data.cards.overdue.length;
  const totalChecklists = data.checklistItems.dueToday.length + data.checklistItems.overdue.length;
  const totalOverdue   = data.cards.overdue.length + data.checklistItems.overdue.length + data.encouragements.overdue.length + data.followUps.overdue.length;
  const totalFocus     = (data.focusCards ?? []).length;
  const hasAnything    = data.birthdays.length + data.circleVisits.today.length + totalEncs + totalFU + totalCards + totalChecklists + totalFocus > 0 || isCardsLoading;

  return (
    <>
      <style>{`
        .today-page-bg { position: fixed; inset: 0; background: ${T.pageBg}; z-index: 0; pointer-events: none; }
        .today-page-content { position: relative; z-index: 1; }
        .today-item:last-child { border-bottom: none !important; }
        .today-leader-link:hover { color: ${T.textMuted} !important; }
        .today-action-btn:hover { filter: brightness(1.1); }
        .today-score-row:hover .today-score-inner { background: rgba(255,255,255,0.02); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="today-page-bg" />

      <div className="today-page-content" style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 100px', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f9fafb', margin: 0, lineHeight: 1.1 }}>Today</h1>
            <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{formatDate(data.today)}</p>
          </div>
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
        </div>

        {/* ── Scoreboard ── */}
        <Scoreboard
          rows={[
            { label: 'Focus Cards',     count: totalFocus,                     color: T.amber,   href: '#focus-cards' },
            { label: 'Birthdays',       count: data.birthdays.length,          color: T.violet,  href: '#birthdays' },
            { label: 'Overdue Items',   count: totalOverdue,                   color: T.red,     href: '#overdue-cards' },
            { label: 'Follow-Ups',      count: totalFU,                        color: T.amber,   href: '#follow-ups' },
            { label: 'Cards Due',       count: totalCards,                     color: T.amber,   href: '#cards-today' },
            { label: 'Encouragements',  count: totalEncs,                      color: T.amber,   href: '#encs-today' },
            { label: 'Checklist Tasks', count: totalChecklists,                color: T.amber,   href: '#checklists-today' },
            { label: 'Circle Visits',   count: data.circleVisits.today.length, color: T.neutral, href: '#visits-today' },
          ]}
        />

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
                <Link href={`/boards/${c.board_id}?card=${c.id}`}
                  style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
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
                <Link href={`/boards/${c.board_id}?card=${c.id}`} style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
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
                <Link href={`/boards/${c.board_id}?card=${c.id}`} style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
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
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.text}</p>
                <Sub>
                  <Link href={`/boards/${cl.board_id}?card=${cl.card_id}`} style={{ color: T.textMuted, textDecoration: 'none' }} className="today-leader-link">
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
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.text}</p>
                <Sub><Link href={`/boards/${cl.board_id}?card=${cl.card_id}`} style={{ color: 'inherit', textDecoration: 'none' }} className="today-leader-link">{cl.card_title} · {cl.board_name}</Link></Sub>
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
                  {n.content}
                </p>
              </div>
              <span style={{ fontSize: 10, color: T.textFaint, whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>
                {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </Item>
          ))}
        </Section>

      </div>
    </>
  );
}
