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
  callout?: { title: string; points: string[] };
  Icon: () => JSX.Element;
};

type SetupItem = {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  groups: { label: string; steps: string[] }[];
  note?: string;
  ctaHref?: string;
  ctaLabel?: string;
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
const NotebookIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);
const MassUpdateIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-6L12 15m0 0l4.5-4.5M12 15V3" />
  </svg>
);
const BellAlertIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);

const STOPS: Stop[] = [
  {
    id: 'events',
    eyebrow: 'Start here · your home base',
    title: 'Events',
    cadence: 'Daily',
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
      'Every leader has a profile — the one place their whole story lives. Notes, the calls and texts you’ve logged, prayer points, follow-up dates, and their care and development all sit here. Most of what you do in Radius ends up landing on a profile, so it’s worth knowing well early.',
    steps: [
      'Open any leader from Events, the Circle List, or search (⌘K) to land on their profile.',
      'Log a connection — call, text, email, or in person — so the touch is on the record.',
      'Add notes (pin the ones you never want to forget) and set a follow-up date when you owe them a check-in.',
      'Use the tabs across the top — Notes, Care, and Scorecard — to see their full history and track development.',
    ],
    callout: {
      title: 'Onboarding a leader to the Circle Leader Toolkit',
      points: [
        'Leader Access — the master switch. On lets the leader sign in to their own toolkit and submit Circle Summaries; off and they can’t get in.',
        'Email Reminders — turn on to email the leader a weekly nudge to fill out their Circle Summary.',
        'Open Toolkit — step into the leader’s toolkit yourself to see exactly what they see.',
        'Text Circle Toolkit link — texts the leader a one-tap magic link to their toolkit, no password needed. No phone on file? Add one to the profile, then click Text Circle Toolkit link again.',
      ],
    },
    Icon: ProfileIcon,
  },
  {
    id: 'circle-list',
    eyebrow: 'Find anyone fast',
    title: 'Circle List & Search',
    cadence: 'As needed',
    href: '/search',
    cta: 'Open Circle List',
    lede:
      'The full roster of leaders, with filters for everything. And the search box up top (or ⌘K) reaches further than leaders — it finds boards and cards too, from anywhere in Radius.',
    steps: [
      'Press ⌘K (Ctrl K on Windows) anywhere to search — results include leaders, boards, and cards.',
      'Open Circle List for the whole roster, then filter by campus, status, day, or type.',
      'Filters live in the URL — bookmark a view you check often.',
      'Click any leader to open their profile — notes, connections, the Care tab, and more.',
    ],
    Icon: SearchIcon,
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
    id: 'notebook',
    eyebrow: 'Your private workspace',
    title: 'Notebook',
    cadence: 'As needed',
    href: '/notebook',
    cta: 'Open Notebook',
    lede:
      'A personal scratchpad for everything that isn’t tied to one leader — meeting notes, planning, running lists. Organize pages into folders, and link a page to a leader or board when it connects.',
    steps: [
      'Create a page and just start writing — it saves as you go.',
      'Group pages into folders, and pin the ones you reach for often.',
      'Add checklists inside a page to track loose to-dos.',
      'Link a page to a leader or a board when it belongs to that work.',
    ],
    Icon: NotebookIcon,
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
    id: 'mass-update',
    eyebrow: 'Change many at once',
    title: 'Mass Update',
    cadence: 'As needed',
    href: '/import-circles/#mass-update',
    cta: 'Open Mass Update',
    acpdOnly: true,
    lede:
      'Need to move a batch of circles to a new campus or ACPD, or flip their status together? Mass Update edits one field across many leaders in a single pass — no opening profiles one at a time.',
    steps: [
      'Search for leaders, then narrow by campus or ACPD if you need to.',
      'Select the rows you want — shift-click to grab a whole range.',
      'Pick the field to change (campus, ACPD, status, day, time, type, and more) and set the new value.',
      'Apply — every selected leader updates at once.',
    ],
    Icon: MassUpdateIcon,
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

// One-time setup, done before the pathway. Kept separate from the numbered
// stops on purpose — these are install/permission steps, not daily tools.
const SETUP: SetupItem[] = [
  {
    id: 'setup-install',
    eyebrow: 'Do this once',
    title: 'Install Radius',
    lede:
      'Radius runs in your browser, but installing it gives you an app icon, a full-screen window, and — on phones — the alerts below. It’s the same Radius either way; installing just makes it feel native.',
    groups: [
      {
        label: 'Desktop (Chrome or Edge) — your main setup',
        steps: [
          'Open Radius at vccradius.netlify.app.',
          'Look at the right end of the address bar for the install icon — a small monitor with a down-arrow, or an “App available” chip.',
          'Click it, then Install. Radius opens in its own window and pins to your taskbar or dock.',
        ],
      },
      {
        label: 'iPhone & iPad (Safari)',
        steps: [
          'Open Radius in Safari.',
          'Tap the Share button (the square with an up-arrow), then Add to Home Screen, then Add.',
          'From now on, open Radius from the new home-screen icon. This step is required for alerts to work.',
        ],
      },
      {
        label: 'Android (Chrome)',
        steps: [
          'Open Radius in Chrome.',
          'Tap the ⋮ menu (top right), then Install app (or Add to Home screen) and confirm.',
          'Open Radius from the new icon.',
        ],
      },
    ],
    Icon: DownloadIcon,
  },
  {
    id: 'setup-alerts',
    eyebrow: 'Do this once',
    title: 'Turn on alerts',
    lede:
      'Radius can remind you about timed items on your Today page — and ping you even when it’s closed. You switch alerts on right from Today, and they follow you across the app.',
    groups: [
      {
        label: 'On any device',
        steps: [
          'Open Today and tap the bell (Reminders) toggle near the top.',
          'When your browser or phone asks permission, choose Allow.',
          'Done — timed items on Today will now notify you, even with Radius closed.',
        ],
      },
      {
        label: 'iPhone & iPad — one extra rule',
        steps: [
          'Install Radius to your Home Screen first (the step above). Apple only allows alerts from the installed app, never a Safari tab.',
          'Open Radius from the home-screen icon, then turn on the bell on Today and tap Allow.',
        ],
      },
    ],
    note:
      'Prefer email? Settings → Daily Summary sends a morning email of everything on your plate — separate from these alerts, and on by your choice.',
    ctaHref: '/today',
    ctaLabel: 'Open Today',
    Icon: BellAlertIcon,
  },
];

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
  const total = SETUP.length + STOPS.length;
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
              Find your footing in Radius.
            </h1>
            <p className="text-[15px] text-slate-400 mt-4 leading-relaxed max-w-2xl">
              Radius helps you shepherd circle leaders — track who met, who needs a nudge, and
              what you promised to follow up on. First, two quick setup steps. Then walk the ten
              stops in order: the first few you&apos;ll use every week, the rest as they come up. Tap{' '}
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

          {/* ─── Setup (one-time) ─── */}
          <div className="mb-9">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">First — set up</h2>
              <span className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="space-y-3">
              {SETUP.map((item) => {
                const isDone = explored.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border bg-zinc-800/70 p-5 shadow-card-glass transition-colors ${
                      isDone ? 'border-vc-500/25' : 'border-white/[0.07] hover:border-white/[0.14]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex items-center justify-center w-10 h-10 rounded-full ring-1 shrink-0 transition-colors ${
                          isDone ? 'bg-vc-fab text-white ring-vc-400/40 shadow-glow-vc' : 'bg-zinc-800 text-slate-300 ring-white/10'
                        }`}
                      >
                        {isDone ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <item.Icon />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.eyebrow}</span>
                        <h3 className="text-lg font-semibold text-white tracking-tight">{item.title}</h3>
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed mt-3">{item.lede}</p>

                    <div className="mt-4 space-y-4">
                      {item.groups.map((g) => (
                        <div key={g.label}>
                          <p className="text-xs font-semibold text-slate-200 mb-2">{g.label}</p>
                          <ol className="space-y-1.5">
                            {g.steps.map((s, si) => (
                              <li key={si} className="flex gap-2.5 text-sm text-slate-400 leading-relaxed">
                                <span className="text-vc-400/70 font-semibold tabular-nums shrink-0">{si + 1}.</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>

                    {item.note && (
                      <p className="mt-4 text-xs text-slate-500 leading-relaxed border-l-2 border-white/[0.08] pl-3">{item.note}</p>
                    )}

                    <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.06]">
                      {item.ctaHref && (
                        <Link
                          href={item.ctaHref}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold !text-white bg-vc-fab px-3.5 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-glow-vc"
                        >
                          {item.ctaLabel}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </Link>
                      )}
                      <button
                        onClick={() => toggle(item.id)}
                        className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                          isDone ? 'text-vc-300 hover:text-vc-200' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {isDone ? (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Done
                          </>
                        ) : (
                          'Mark as done'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── The pathway ─── */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">The pathway</h2>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>
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

                    {stop.callout && (
                      <div className="mt-4 rounded-xl border border-vc-500/20 bg-vc-500/[0.06] p-3.5">
                        <p className="text-xs font-semibold text-vc-200 uppercase tracking-wider mb-2.5">{stop.callout.title}</p>
                        <ul className="space-y-2">
                          {stop.callout.points.map((point, pi) => (
                            <li key={pi} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                              <span className="mt-[7px] w-1 h-1 rounded-full bg-vc-400 shrink-0" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.06]">
                      <Link
                        href={stop.href}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold !text-white bg-vc-fab px-3.5 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-glow-vc"
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
