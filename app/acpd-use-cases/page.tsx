'use client';

import { useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';

type UseCase = {
  id: string;
  category: 'Daily' | 'Weekly' | 'As needed';
  title: string;
  description: string;
  youtubeId: string | null;
  tryIt?: { label: string; href: string };
  icon: () => JSX.Element;
};

// ── Icons ─────────────────────────────────────────────────────────────

const TodayIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const FilterIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
  </svg>
);
const ProfileIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);
const AIIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>
);
const CircleSummaryIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  </svg>
);
const VisitIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V12zm0 3h.008v.008H12V15zm0 3h.008v.008H12V18z" />
  </svg>
);
const ScorecardIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.040.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);
const EncourageIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);
const ProgressIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);
const BoardIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <rect x="3" y="3" width="7" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Use case data ─────────────────────────────────────────────────────

const USE_CASES: UseCase[] = [
  {
    id: 'morning-triage',
    category: 'Daily',
    title: 'Morning triage with Today',
    description:
      'Start every workday on the Today page to see overdue follow-ups, to-dos due today, and upcoming circle visits — all filtered to your campus so nothing slips.',
    youtubeId: null,
    tryIt: { label: 'Open Today', href: '/today' },
    icon: TodayIcon,
  },
  {
    id: 'spot-at-risk',
    category: 'Weekly',
    title: 'Spot at-risk leaders fast',
    description:
      'Combine the Follow-Up Required filter and the Event Summary filter on the Dashboard to surface leaders who haven\'t met recently or need a check-in — before they fade.',
    youtubeId: null,
    tryIt: { label: 'Open Dashboard', href: '/dashboard' },
    icon: FilterIcon,
  },
  {
    id: 'leader-profile',
    category: 'Daily',
    title: 'Open a profile and log a connection',
    description:
      'Pull up any leader\'s full history in seconds — pinned notes, recent interactions, open to-dos — then log a call, text, or in-person visit without leaving the profile.',
    youtubeId: null,
    icon: ProfileIcon,
  },
  {
    id: 'ai-meeting-prep',
    category: 'As needed',
    title: 'AI Meeting Prep before a 1:1',
    description:
      'Before every conversation, hit AI Meeting Prep on the leader\'s profile. It aggregates months of notes, connections, and circle health into a structured two-minute briefing.',
    youtubeId: null,
    icon: AIIcon,
  },
  {
    id: 'circle-summary',
    category: 'Weekly',
    title: 'Submit a Circle Summary',
    description:
      'After a circle meets, walk through the dynamic questions and submit. Attendance and narrative land in Progress charts so leadership has rolled-up data in real time.',
    youtubeId: null,
    tryIt: { label: 'Circle Leader Toolkit', href: '/circle-leader-toolkit' },
    icon: CircleSummaryIcon,
  },
  {
    id: 'circle-visit',
    category: 'As needed',
    title: 'Schedule and log a circle visit',
    description:
      'Plan a pastoral visit to a circle from the Calendar or leader profile, then log what you observed afterward. Visits surface on the leader\'s timeline and your campus progress view.',
    youtubeId: null,
    tryIt: { label: 'Open Calendar', href: '/calendar' },
    icon: VisitIcon,
  },
  {
    id: 'scorecard',
    category: 'As needed',
    title: 'Run a Scorecard evaluation',
    description:
      'Open any leader\'s Scorecard tab and rate them across every development dimension. Color-coded scores make gaps visible immediately; historical evaluations track growth over time.',
    youtubeId: null,
    icon: ScorecardIcon,
  },
  {
    id: 'encourage',
    category: 'Daily',
    title: 'Log an encouragement',
    description:
      'Record an intentional pastoral touch — method, optional scripture, short note. Each encouragement feeds the Connections log and your scorecard, so care is both given and tracked.',
    youtubeId: null,
    icon: EncourageIcon,
  },
  {
    id: 'progress',
    category: 'Weekly',
    title: 'Review campus progress',
    description:
      'The Progress page shows aggregate engagement stats, event summary trends, and scorecard averages across your campus — everything you need for a weekly self-check or director report.',
    youtubeId: null,
    tryIt: { label: 'Open Progress', href: '/progress' },
    icon: ProgressIcon,
  },
  {
    id: 'boards',
    category: 'As needed',
    title: 'Run a project on Boards',
    description:
      'Use a kanban board to coordinate anything that spans multiple leaders — a new-leader onboarding wave, a semester kickoff, a paused-leader re-engagement campaign.',
    youtubeId: null,
    tryIt: { label: 'Open Boards', href: '/boards' },
    icon: BoardIcon,
  },
];

const CATEGORY_STYLES: Record<UseCase['category'], string> = {
  Daily: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25',
  Weekly: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25',
  'As needed': 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25',
};

// ── Video card ────────────────────────────────────────────────────────

function VideoCard({ uc, index }: { uc: UseCase; index: number }) {
  const [playing, setPlaying] = useState(false);
  const Icon = uc.icon;
  const thumb = uc.youtubeId
    ? `https://img.youtube.com/vi/${uc.youtubeId}/maxresdefault.jpg`
    : null;

  return (
    <div className="flex flex-col bg-zinc-800/80 border border-zinc-700 rounded-2xl overflow-hidden shadow-card-glass hover:border-zinc-600 transition-all duration-150 group">

      {/* Video / placeholder area */}
      <div className="relative aspect-video bg-zinc-900 overflow-hidden">
        {playing && uc.youtubeId ? (
          <iframe
            src={`https://www.youtube.com/embed/${uc.youtubeId}?autoplay=1&rel=0`}
            title={uc.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <>
            {/* Thumbnail or placeholder */}
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                {/* Subtle grid background */}
                <div
                  className="absolute inset-0 opacity-[0.04]"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                />
                {/* Large faded index */}
                <span
                  className="absolute right-4 bottom-2 text-[80px] font-black leading-none text-white/5 select-none pointer-events-none"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                {/* Icon */}
                <span className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-700/70 text-vc-300 ring-1 ring-zinc-600">
                  <Icon />
                </span>
                <span className="relative z-10 text-xs text-zinc-500 font-medium">Video coming soon</span>
              </div>
            )}

            {/* Play button overlay — only shown when there's a real video */}
            {uc.youtubeId && (
              <button
                onClick={() => setPlaying(true)}
                aria-label={`Play ${uc.title}`}
                className="absolute inset-0 flex items-center justify-center group/play"
              >
                <span className="flex items-center justify-center w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white group-hover/play:bg-white/20 transition-colors">
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${CATEGORY_STYLES[uc.category]}`}
          >
            {uc.category}
          </span>
        </div>
        <h3 className="text-base font-semibold text-white leading-snug mb-2 group-hover:text-vc-200 transition-colors">
          {uc.title}
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed flex-1">{uc.description}</p>

        {uc.tryIt && (
          <Link
            href={uc.tryIt.href}
            className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-vc-300 hover:text-vc-200 transition-colors self-start"
          >
            {uc.tryIt.label}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

const CATEGORIES: UseCase['category'][] = ['Daily', 'Weekly', 'As needed'];
const ALL = 'All' as const;
type Filter = typeof ALL | UseCase['category'];

export default function ACPDUseCasesPage() {
  const [filter, setFilter] = useState<Filter>(ALL);

  const visible = filter === ALL ? USE_CASES : USE_CASES.filter(uc => uc.category === filter);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <Link
                href="/help"
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Back to Help"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-vc-400 mb-0.5">Radius</p>
                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight">
                  Top 10 ACPD Use Cases
                </h1>
              </div>
            </div>
            <p className="text-sm text-slate-400 max-w-xl ml-8">
              Short video walkthroughs for every workflow an ACPD reaches for most — from the daily morning triage to the occasional scorecard evaluation.
            </p>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-8">
            {([ALL, ...CATEGORIES] as Filter[]).map(cat => {
              const count = cat === ALL ? USE_CASES.length : USE_CASES.filter(uc => uc.category === cat).length;
              const active = filter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-vc-500 text-white'
                      : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700 border border-zinc-700'
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[10px] ${active ? 'text-vc-100' : 'text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Grid */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
            {visible.map((uc, i) => (
              <VideoCard key={uc.id} uc={uc} index={USE_CASES.indexOf(uc)} />
            ))}
          </div>

          {/* Footer note */}
          <p className="mt-10 text-center text-xs text-slate-600">
            Videos are added as each walkthrough is recorded.{' '}
            <Link href="/help" className="text-vc-500 hover:text-vc-400 transition-colors">
              Browse the Help Center
            </Link>{' '}
            for written guides on each topic.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
