'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';

// ────────────────────────────────────────────────────────────────────
// The pathway
//
// This is a deliberate sequence — the order an ACPD should meet Radius,
// from the tool you'll touch every week down to the ones you reach for
// occasionally. Numbered stops earn their numbers: order carries meaning.
// ────────────────────────────────────────────────────────────────────

type Stop = {
  id: string;
  eyebrow: string;
  title: string;
  cadence: 'Weekly' | 'Daily' | 'As needed' | 'Monthly';
  href: string;
  cta: string;
  acpdOnly?: boolean;
  badge?: string;
  lede: string;
  steps: string[];
  Icon: () => JSX.Element;
};

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const BoardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <rect x="3" y="3" width="7" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const TodayIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const UserPlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
);
const MessageIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const STOPS: Stop[] = [
  {
    id: 'events',
    eyebrow: 'Start here · your weekly heartbeat',
    title: 'Events',
    cadence: 'Weekly',
    href: '/event-summary-tracker',
    cta: 'Open Events',
    lede:
      'This is home base. Every week it shows you which circles met, who turned in a summary, and who still owes you one — so no leader quietly slips off your radar.',
    steps: [
      'Land on the current week. Use the arrows to step back or ahead.',
      'Filter to your campus and ACPD so you only see your circles.',
      'Work the three buckets top to bottom: Awaiting Submission, Needs Review, then Complete.',
      'Open a summary to read attendance and notes, mark it Reviewed, or nudge a leader who hasn’t reported.',
    ],
    Icon: CalendarIcon,
  },
  {
    id: 'profile',
    eyebrow: 'Where the care happens',
    title: 'The Circle Profile',
    cadence: 'Daily',
    href: '/search',
    cta: 'Browse leaders',
    lede:
      'Every leader has a profile — the one place their whole story lives. Notes, the calls and texts you’ve logged, circle visits, prayer points, follow-up dates, and their roster all sit here. Most of what you do in Radius ends up landing on a profile, so it’s worth knowing well early.',
    steps: [
      'Open any leader from Events, the Circle List, or search (⌘K) to land on their profile.',
      'Log a connection — call, text, email, or in person — so the touch is on the record.',
      'Add notes (pin the ones you never want to forget) and set a follow-up date when you owe them a check-in.',
      'Explore the tabs: Circle Visits, Prayers, the Roster, and AI Meeting Prep before a 1:1.',
    ],
    Icon: ProfileIcon,
  },
  {
    id: 'boards',
    eyebrow: 'Track tasks — and people',
    title: 'Boards',
    cadence: 'Daily',
    href: '/boards',
    cta: 'Open Boards',
    lede:
      'Boards are where work lives. Each card is one thing to do — and a card can be linked to a circle leader, so following up with a person and tracking a task are the same move.',
    steps: [
      'Create a board per initiative (onboarding, an event, a season of follow-ups).',
      'Add cards and drag them across columns as the work moves.',
      'Inside a card: set a due date, add a checklist, and link the circle leader it’s about.',
      'A linked card shows up on that leader’s profile — and feeds your Today page.',
    ],
    Icon: BoardIcon,
  },
  {
    id: 'today',
    eyebrow: 'Your daily focus',
    title: 'Today',
    cadence: 'Daily',
    href: '/today',
    cta: 'Open Today',
    lede:
      'Open this first thing. Today pulls everything that needs you now — cards due, follow-ups, encouragements, birthdays — into one list you can clear in a sitting.',
    steps: [
      'Scan the scoreboard at the top: overdue, due today, follow-ups, encouragements.',
      'Knock items out in place — Done, Sent, Clear — without leaving the page.',
      'Set your Big 3: the three cards that matter most this week.',
      'Make it a habit. A two-minute morning pass keeps the whole campus current.',
    ],
    Icon: TodayIcon,
  },
  {
    id: 'circle-list',
    eyebrow: 'Find anyone fast',
    title: 'Circle List & Search',
    cadence: 'As needed',
    href: '/search',
    cta: 'Open Circle List',
    lede:
      'The full roster of leaders, with filters for everything. Need one person right now? The search box up top (or ⌘K) jumps straight to them from anywhere.',
    steps: [
      'Press ⌘K (Ctrl K on Windows) anywhere to fuzzy-search a leader by name.',
      'Open Circle List for the whole roster, then filter by campus, status, day, or type.',
      'Filters live in the URL — bookmark a view you check often.',
      'Click any leader to open their profile: notes, connections, visits, and more.',
    ],
    Icon: SearchIcon,
  },
  {
    id: 'add-leader',
    eyebrow: 'Bring someone new in',
    title: 'Add a Leader',
    cadence: 'As needed',
    href: '/add-leader',
    cta: 'Open Add Leader',
    acpdOnly: true,
    lede:
      'When a new circle starts, this is how it enters Radius. Link it to CCB once and roster, attendance, and event data flow in automatically.',
    steps: [
      'Choose Circle (or Host Team) and fill in the leader’s name and contact info.',
      'Set campus, ACPD, circle type, and the meeting day, time, and frequency.',
      'Paste the CCB group link so attendance and rosters sync.',
      'Save — the leader is live and shows up in everyone’s filtered views.',
    ],
    Icon: UserPlusIcon,
  },
  {
    id: 'bulk-message',
    eyebrow: 'Reach a group at once',
    title: 'Bulk Message',
    cadence: 'As needed',
    href: '/bulk-message',
    cta: 'Open Bulk Message',
    acpdOnly: true,
    lede:
      'One message to many leaders — scoped by campus, status, or a list you build. Use it for reminders, invites, or a campus-wide heads-up.',
    steps: [
      'Build your recipient list: add leaders, load a roster, or search CCB.',
      'Write once. Drop in {{first_name}} and it personalizes per person.',
      'Preview the message and the recipient count before you send.',
      'Send — each message is logged as a connection on every recipient.',
    ],
    Icon: MessageIcon,
  },
  {
    id: 'reporting',
    eyebrow: 'See the trends',
    title: 'Circle Reporting',
    cadence: 'Monthly',
    href: '/circle-reporting',
    cta: 'Open Circle Reporting',
    badge: 'In progress',
    lede:
      'The bird’s-eye view: attendance trends, healthy and struggling circles, and breakdowns by campus, day, and type. Still being built out — explore it, and tell me what would help.',
    steps: [
      'Set the campus, type, and date range you want to look at.',
      'Read the trend chart and the breakdown bars for the shape of things.',
      'Check the top and bottom circles, and the declining-attendance alerts.',
      'This one is evolving — send feedback on what numbers you actually need.',
    ],
    Icon: ChartIcon,
  },
];

const CADENCE_STYLE: Record<Stop['cadence'], string> = {
  Weekly: 'bg-vc-500/15 text-vc-300 ring-vc-500/30',
  Daily: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  'As needed': 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  Monthly: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

const STORAGE_KEY = 'radius:get-started:explored';

export default function GetStartedPage() {
  const [explored, setExplored] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setExplored(new Set(JSON.parse(raw)));
    } catch {
      /* ignore unreadable storage */
    }
    setHydrated(true);
  }, []);

  const persist = (next: Set<string>) => {
    setExplored(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* storage may be unavailable; progress just won't persist */
    }
  };

  const toggle = (id: string) => {
    const next = new Set(explored);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(next);
  };

  const reset = () => persist(new Set());

  const done = hydrated ? explored.size : 0;
  const total = STOPS.length;
  const pct = useMemo(() => Math.round((done / total) * 100), [done, total]);
  const allDone = hydrated && done === total;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

          {/* ─── Hero ─── */}
          <header className="mb-10">
            <Link
              href="/help"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-5"
            >
              Looking for the full Help Center?
              <span className="text-vc-400">Open it →</span>
            </Link>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-vc-400 mb-3">
              Welcome to Radius
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-tight">
              Eight stops to find your footing.
            </h1>
            <p className="text-[15px] text-slate-400 mt-4 leading-relaxed max-w-2xl">
              Radius helps you shepherd circle leaders — track who met, who needs a nudge, and
              what you promised to follow up on. Walk these in order. The first few you&apos;ll use
              every week; the rest you&apos;ll reach for as they come up. Tap{' '}
              <span className="text-slate-200 font-medium">Mark as explored</span> as you go.
            </p>

            {/* Progress */}
            <div className="mt-7 rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-4 sm:p-5 shadow-card-glass">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-200">
                  {allDone ? "You've walked the whole path 🎉" : 'Your progress'}
                </span>
                <span className="text-sm tabular-nums text-slate-400">
                  {done} <span className="text-slate-600">/</span> {total}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-vc-fab transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {done > 0 && (
                <button
                  onClick={reset}
                  className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Reset progress
                </button>
              )}
            </div>
          </header>

          {/* ─── The pathway ─── */}
          <ol className="relative">
            {/* connecting spine */}
            <div
              className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-white/[0.04] via-white/[0.10] to-white/[0.04]"
              aria-hidden
            />

            {STOPS.map((stop, i) => {
              const isDone = explored.has(stop.id);
              return (
                <li key={stop.id} className="relative pl-14 pb-5 last:pb-0">
                  {/* node */}
                  <div className="absolute left-0 top-0">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold ring-1 transition-colors ${
                        isDone
                          ? 'bg-vc-fab text-white ring-vc-400/40 shadow-glow-vc'
                          : 'bg-zinc-800 text-slate-300 ring-white/10'
                      }`}
                    >
                      {isDone ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                  </div>

                  {/* card */}
                  <div
                    className={`rounded-2xl border bg-zinc-800/70 p-5 shadow-card-glass transition-colors ${
                      isDone ? 'border-vc-500/25' : 'border-white/[0.07] hover:border-white/[0.14]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-slate-400 shrink-0">
                        <stop.Icon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {stop.eyebrow}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-semibold text-white tracking-tight">{stop.title}</h2>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${CADENCE_STYLE[stop.cadence]}`}>
                            {stop.cadence}
                          </span>
                          {stop.acpdOnly && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 bg-zinc-500/15 text-slate-400 ring-zinc-500/25">
                              ACPD
                            </span>
                          )}
                          {stop.badge && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 bg-amber-500/15 text-amber-300 ring-amber-500/30">
                              {stop.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed mt-3">{stop.lede}</p>

                    <ol className="mt-4 space-y-2">
                      {stop.steps.map((step, si) => (
                        <li key={si} className="flex gap-2.5 text-sm text-slate-400 leading-relaxed">
                          <span className="text-vc-400/70 font-semibold tabular-nums shrink-0">{si + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.06]">
                      <Link
                        href={stop.href}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-vc-fab px-3.5 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-glow-vc"
                      >
                        {stop.cta}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => toggle(stop.id)}
                        className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                          isDone
                            ? 'text-vc-300 hover:text-vc-200'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {isDone ? (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Explored
                          </>
                        ) : (
                          'Mark as explored'
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* ─── Footer ─── */}
          <div className="mt-10 rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-5 sm:p-6 shadow-card-glass">
            <h3 className="text-base font-semibold text-white mb-1">That&apos;s the core loop.</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Once these feel natural, the{' '}
              <Link href="/help" className="text-vc-300 hover:text-vc-200 font-medium">Help Center</Link>{' '}
              covers everything else — notes, scorecards, prayer, the calendar, AI meeting prep, and the
              power-user moves. Stuck on something? Message me directly with what you expected and what you saw.
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
