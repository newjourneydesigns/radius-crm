'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useTodayData } from '../../hooks/useTodayData';
import type {
  EncouragementItem,
  FollowUpItem,
  CardDigestItem,
  ChecklistDigestItem,
  VisitItem,
  CircleMeetingItem,
  BirthdayItem,
  NoteItem,
} from '../../lib/emailService';

// ─── Theme ───────────────────────────────────────────────────────────────────

const T = {
  pageBg:     '#0f1117',
  cardBg:     '#1a1d27',
  cardBorder: '#2a2d3a',
  text:       '#e5e7eb',
  textMuted:  '#9ca3af',
  textFaint:  '#4b5563',
  red:        '#ef4444',
  amber:      '#f59e0b',
  green:      '#22c55e',
  blue:       '#3b82f6',
  indigo:     '#6366f1',
  purple:     '#a855f7',
  cyan:       '#06b6d4',
  pink:       '#ec4899',
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

type ScoreRowData =
  | { label: string; count: number; color: string; href: string; kind?: 'count' }
  | { label: string; sublabel?: string; value: string; color: string; href?: string; kind: 'weather' };

function ScoreRow({ row }: { row: ScoreRowData }) {
  const active = row.kind === 'weather' ? true : (row as any).count > 0;
  const inner = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 14px', height: '100%',
      borderLeft: `3px solid ${active ? row.color : 'transparent'}`,
    }} className="today-score-inner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {row.kind === 'weather'
          ? <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{(row as any).value.split(' ')[0]}</span>
          : <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: active ? row.color : T.textFaint, opacity: active ? 1 : 0.35,
            }} />
        }
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? T.text : T.textMuted, display: 'block' }}>
            {row.label}
          </span>
          {row.kind === 'weather' && (row as any).sublabel && (
            <span style={{ fontSize: 10, color: T.textFaint, display: 'block', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {(row as any).sublabel}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
        {row.kind === 'weather' ? (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, color: row.color, display: 'block', lineHeight: 1 }}>
              {(row as any).value.split(' ').slice(1).join(' ')}
            </span>
          </>
        ) : (
          <span style={{
            fontSize: 15, fontWeight: 700, lineHeight: 1,
            color: active ? row.color : T.textFaint, opacity: active ? 1 : 0.45,
          }}>
            {(row as any).count}
          </span>
        )}
      </div>
    </div>
  );

  return row.href
    ? <a href={row.href} style={{ textDecoration: 'none', display: 'block', height: '100%' }} className="today-score-row">{inner}</a>
    : <div style={{ height: '100%' }} className="today-score-row">{inner}</div>;
}

function Scoreboard({ rows, weather }: {
  rows: { label: string; count: number; color: string; href: string }[];
  weather?: import('../api/today/route').TodayData['weather'];
}) {
  const allRows: ScoreRowData[] = [...rows];
  if (weather) {
    allRows.push({
      kind: 'weather',
      label: weather.description,
      sublabel: `${weather.location} · H:${Math.round(weather.highTemp)}° L:${Math.round(weather.lowTemp)}°`,
      value: `${weather.emoji} ${Math.round(weather.temperature)}°F`,
      color: '#60a5fa',
    });
  }

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
        {allRows.map((row, i) => {
          const isWeather = row.kind === 'weather';
          // Weather spans both columns; treat it as its own row for border logic
          const countRows = allRows.filter(r => r.kind !== 'weather');
          const isRightCol = !isWeather && i % 2 === 1;
          const isLastCountRow = !isWeather && i >= (countRows.length % 2 === 0 ? countRows.length - 2 : countRows.length - 1);
          return (
            <div key={row.label} style={{
              gridColumn: isWeather ? '1 / -1' : undefined,
              borderTop: isWeather && countRows.length > 0 ? `1px solid ${T.cardBorder}` : undefined,
              borderBottom: (!isWeather && !isLastCountRow) ? `1px solid ${T.cardBorder}` : 'none',
              borderLeft: isRightCol ? `1px solid ${T.cardBorder}` : 'none',
            }}>
              <ScoreRow row={row} />
            </div>
          );
        })}
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  id, title, icon, count, sectionKey, isOpen, onToggle, accentColor = T.indigo, children,
}: {
  id: string; title: string; icon: string; count: number; sectionKey: string;
  isOpen: boolean; onToggle: () => void; accentColor?: string; children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div id={id} style={{
      background: T.cardBg, border: `1px solid ${T.cardBorder}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: isOpen ? `1px solid ${T.cardBorder}` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
            background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}30`,
          }}>
            {count}
          </span>
        </div>
        <span style={{ color: T.textFaint }}>
          <ChevronDown open={isOpen} />
        </span>
      </button>

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { data, isLoading, error, fetchData, markEncouragementSent, clearFollowUp, markCardComplete, markChecklistDone } = useTodayData();
  const { isOpen, toggle } = useVisibility();

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="animate-spin" style={{
            width: 28, height: 28, borderRadius: '50%',
            border: `2px solid ${T.cardBorder}`, borderTopColor: T.blue,
          }} />
          <p style={{ fontSize: 13, color: T.textMuted }}>Loading your day…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: T.textMuted, marginBottom: 8 }}>{error || 'No data available.'}</p>
          <button onClick={fetchData} style={{ fontSize: 12, color: T.blue, background: 'none', border: 'none', cursor: 'pointer' }}>
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
  const hasAnything    = data.birthdays.length + data.circleVisits.today.length + totalEncs + totalFU + totalCards + totalChecklists > 0;

  return (
    <>
      <style>{`
        .today-item:last-child { border-bottom: none !important; }
        .today-leader-link:hover { color: ${T.blue} !important; }
        .today-action-btn:hover { filter: brightness(1.1); }
        .today-score-row:hover .today-score-inner { background: rgba(255,255,255,0.03); }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 100px', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f9fafb', margin: 0, lineHeight: 1.1 }}>Today</h1>
            <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{formatDate(data.today)}</p>
          </div>
          <button
            onClick={fetchData}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBorder}`,
              color: T.textMuted, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <RefreshIcon /> Refresh
          </button>
        </div>

        {/* ── Scoreboard ── */}
        <Scoreboard
          weather={data.weather ?? undefined}
          rows={[
            { label: 'Birthdays',       count: data.birthdays.length,          color: T.pink,   href: '#birthdays' },
            { label: 'Circle Visits',   count: data.circleVisits.today.length, color: T.cyan,   href: '#visits-today' },
            { label: 'Encouragements',  count: totalEncs,                      color: T.purple, href: '#encs-today' },
            { label: 'Follow-Ups',      count: totalFU,                        color: T.amber,  href: '#follow-ups' },
            { label: 'Cards',           count: totalCards,                     color: T.indigo, href: '#cards-today' },
            { label: 'Checklist Tasks', count: totalChecklists,                color: T.blue,   href: '#checklists-today' },
            { label: 'Overdue Items',   count: totalOverdue,                   color: T.red,    href: '#overdue-cards' },
          ]}
        />

        {/* ── All clear ── */}
        {!hasAnything && (
          <div style={{
            background: `${T.green}0f`, border: `1px solid ${T.green}25`,
            borderRadius: 14, padding: '32px 24px', textAlign: 'center', marginBottom: 16,
          }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>✅</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: T.green, margin: 0 }}>You&apos;re all caught up!</p>
            <p style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>Nothing urgent for today.</p>
          </div>
        )}

        {/* ── Birthdays ── */}
        <Section id="birthdays" title="Birthdays" icon="🎂" count={data.birthdays.length}
          sectionKey="birthdays" isOpen={isOpen('birthdays')} onToggle={() => toggle('birthdays')} accentColor={T.pink}>
          {data.birthdays.map((b: BirthdayItem) => (
            <Item key={b.id} accentColor={T.pink}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={b.id} name={b.name} />
                {b.campus && <Sub>{b.campus}</Sub>}
              </div>
              {b.phone && (
                <a href={`tel:${b.phone}`} style={{ fontSize: 11, fontWeight: 600, color: T.blue, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  {formatPhone(b.phone)}
                </a>
              )}
            </Item>
          ))}
        </Section>

        {/* ── Circle Visits Today ── */}
        <Section id="visits-today" title="Circle Visits Today" icon="📅" count={data.circleVisits.today.length}
          sectionKey="circleVisitsToday" isOpen={isOpen('circleVisitsToday')} onToggle={() => toggle('circleVisitsToday')} accentColor={T.cyan}>
          {data.circleVisits.today.map((v: VisitItem) => (
            <Item key={v.id} accentColor={T.cyan}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={v.leader_id} name={v.leader_name} />
                <Sub>{[v.leader_campus, v.previsit_note].filter(Boolean).join(' · ')}</Sub>
              </div>
            </Item>
          ))}
        </Section>

        {/* ── Encouragements Due Today ── */}
        <Section id="encs-today" title="Encouragements Due Today" icon="💌" count={data.encouragements.dueToday.length}
          sectionKey="encouragementsToday" isOpen={isOpen('encouragementsToday')} onToggle={() => toggle('encouragementsToday')} accentColor={T.purple}>
          {data.encouragements.dueToday.map((e: EncouragementItem) => (
            <Item key={e.id} accentColor={T.purple}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={e.circle_leader_id} name={e.leader_name} />
                <Sub>{[e.leader_campus, methodLabel(e.encourage_method), e.note].filter(Boolean).join(' · ')}</Sub>
              </div>
              <ActionBtn onClick={() => markEncouragementSent(e.id)} color={T.green}>Sent</ActionBtn>
            </Item>
          ))}
        </Section>

        {/* ── Follow-Ups Due Today ── */}
        <Section id="follow-ups" title="Follow-Ups Due Today" icon="🔄" count={data.followUps.dueToday.length}
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
        <Section id="cards-today" title="Cards Due Today" icon="📋" count={data.cards.dueToday.length}
          sectionKey="cardsToday" isOpen={isOpen('cardsToday')} onToggle={() => toggle('cardsToday')} accentColor={T.indigo}>
          {data.cards.dueToday.map((c: CardDigestItem) => (
            <Item key={c.id} accentColor={T.indigo}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <Link href={`/boards/${c.board_id}`} style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  className="today-leader-link">
                  {c.title}
                </Link>
                <Sub>{c.board_name} · {c.column_name}</Sub>
              </div>
              <ActionBtn onClick={() => markCardComplete(c.id)} color={T.green}>Done</ActionBtn>
            </Item>
          ))}
        </Section>

        {/* ── Overdue Cards ── */}
        <Section id="overdue-cards" title="Overdue Cards" icon="⚠️" count={data.cards.overdue.length}
          sectionKey="overdueCards" isOpen={isOpen('overdueCards')} onToggle={() => toggle('overdueCards')} accentColor={T.red}>
          {data.cards.overdue.map((c: CardDigestItem) => (
            <Item key={c.id} accentColor={T.red}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <Link href={`/boards/${c.board_id}`} style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  className="today-leader-link">
                  {c.title}
                </Link>
                <Sub>{c.board_name}</Sub>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {c.due_date && <DateBadge date={`Due ${formatShort(c.due_date)}`} color={T.red} />}
                <ActionBtn onClick={() => markCardComplete(c.id)} color={T.green}>Done</ActionBtn>
              </div>
            </Item>
          ))}
        </Section>

        {/* ── Checklist Items Due Today ── */}
        <Section id="checklists-today" title="Checklist Items Due Today" icon="✅" count={data.checklistItems.dueToday.length}
          sectionKey="checklistsToday" isOpen={isOpen('checklistsToday')} onToggle={() => toggle('checklistsToday')} accentColor={T.blue}>
          {data.checklistItems.dueToday.map((cl: ChecklistDigestItem) => (
            <Item key={cl.id} accentColor={T.blue}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.text}</p>
                <Sub>
                  <Link href={`/boards/${cl.board_id}`} style={{ color: T.textMuted, textDecoration: 'none' }} className="today-leader-link">
                    {cl.card_title} · {cl.board_name}
                  </Link>
                </Sub>
              </div>
              <ActionBtn onClick={() => markChecklistDone(cl.id)} color={T.green}>Done</ActionBtn>
            </Item>
          ))}
        </Section>

        {/* ── Overdue Checklist Items ── */}
        <Section id="overdue-checklists" title="Overdue Checklist Items" icon="🚨" count={data.checklistItems.overdue.length}
          sectionKey="overdueChecklists" isOpen={isOpen('overdueChecklists')} onToggle={() => toggle('overdueChecklists')} accentColor={T.red}>
          {data.checklistItems.overdue.map((cl: ChecklistDigestItem) => (
            <Item key={cl.id} accentColor={T.red}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.text}</p>
                <Sub>{cl.card_title}</Sub>
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
          sectionKey="overdueEncouragements" isOpen={isOpen('overdueEncouragements')} onToggle={() => toggle('overdueEncouragements')} accentColor={T.amber}>
          {data.encouragements.overdue.map((e: EncouragementItem) => (
            <Item key={e.id} accentColor={T.amber}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={e.circle_leader_id} name={e.leader_name} />
                <Sub>{methodLabel(e.encourage_method)}</Sub>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {e.message_date && <DateBadge date={`Due ${formatShort(e.message_date)}`} color={T.amber} />}
                <ActionBtn onClick={() => markEncouragementSent(e.id)} color={T.green}>Sent</ActionBtn>
              </div>
            </Item>
          ))}
        </Section>

        {/* ── Overdue Follow-Ups ── */}
        <Section id="overdue-followups" title="Overdue Follow-Ups" icon="📌" count={data.followUps.overdue.length}
          sectionKey="overdueFollowUps" isOpen={isOpen('overdueFollowUps')} onToggle={() => toggle('overdueFollowUps')} accentColor={T.amber}>
          {data.followUps.overdue.map((f: FollowUpItem) => (
            <Item key={f.id} accentColor={T.amber}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={f.id} name={f.name} />
                <Sub>{f.campus || 'No campus'}</Sub>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.follow_up_date
                  ? <DateBadge date={`Due ${formatShort(f.follow_up_date)}`} color={T.amber} />
                  : <DateBadge date="No due date" color={T.textFaint} />}
                <ActionBtn onClick={() => clearFollowUp(f.id)} color={T.green}>Clear</ActionBtn>
              </div>
            </Item>
          ))}
        </Section>

        {/* ── Circle Visits This Week ── */}
        <Section id="visits-week" title="Circle Visits This Week" icon="🗓️" count={data.circleVisits.thisWeek.length}
          sectionKey="circleVisitsWeek" isOpen={isOpen('circleVisitsWeek')} onToggle={() => toggle('circleVisitsWeek')} accentColor={T.cyan}>
          {data.circleVisits.thisWeek.map((v: VisitItem) => (
            <Item key={v.id} accentColor={T.cyan}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={v.leader_id} name={v.leader_name} />
                {v.leader_campus && <Sub>{v.leader_campus}</Sub>}
              </div>
              <DateBadge date={formatShort(v.visit_date)} color={T.cyan} />
            </Item>
          ))}
        </Section>

        {/* ── Upcoming Circles ── */}
        {(data.upcomingCircles.today.length + data.upcomingCircles.tomorrow.length) > 0 && (
          <Section
            id="upcoming-circles"
            title="Upcoming Circles"
            icon="🔵"
            count={data.upcomingCircles.today.length + data.upcomingCircles.tomorrow.length}
            sectionKey="upcomingCircles"
            isOpen={isOpen('upcomingCircles')}
            onToggle={() => toggle('upcomingCircles')}
            accentColor={T.blue}
          >
            {data.upcomingCircles.today.length > 0 && (
              <>
                <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Today
                </div>
                {data.upcomingCircles.today.map((c: CircleMeetingItem) => (
                  <Item key={c.leader_id} accentColor={T.blue}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <LeaderLink id={c.leader_id} name={c.leader_name} />
                      <Sub>{[c.campus, c.circle_type].filter(Boolean).join(' · ')}</Sub>
                    </div>
                    <DateBadge date={formatTime(c.time)} color={T.blue} />
                  </Item>
                ))}
              </>
            )}
            {data.upcomingCircles.tomorrow.length > 0 && (
              <>
                <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase', borderTop: `1px solid ${T.cardBorder}` }}>
                  Tomorrow
                </div>
                {data.upcomingCircles.tomorrow.map((c: CircleMeetingItem) => (
                  <Item key={c.leader_id} accentColor={T.indigo}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <LeaderLink id={c.leader_id} name={c.leader_name} />
                      <Sub>{[c.campus, c.circle_type].filter(Boolean).join(' · ')}</Sub>
                    </div>
                    <DateBadge date={formatTime(c.time)} color={T.indigo} />
                  </Item>
                ))}
              </>
            )}
          </Section>
        )}

        {/* ── Upcoming Scheduled Visits ── */}
        <Section id="upcoming-visits" title="Upcoming Scheduled Visits" icon="📆" count={data.upcomingVisits.length}
          sectionKey="upcomingVisits" isOpen={isOpen('upcomingVisits')} onToggle={() => toggle('upcomingVisits')} accentColor={T.indigo}>
          {data.upcomingVisits.map((v: VisitItem) => (
            <Item key={v.id} accentColor={T.indigo}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LeaderLink id={v.leader_id} name={v.leader_name} />
                {v.leader_campus && <Sub>{v.leader_campus}</Sub>}
              </div>
              <DateBadge date={formatShort(v.visit_date)} color={T.indigo} />
            </Item>
          ))}
        </Section>

        {/* ── Recent Notes ── */}
        <Section id="recent-notes" title="Recent Notes" icon="📝" count={data.recentNotes.length}
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
