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
const CircleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  </svg>
);
const CampaignIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
  </svg>
);
const BulkMessageIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
);
const EmailIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const NavIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
  </svg>
);
const NotebookIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);
const FormIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08C20.155 4.01 21 4.973 21 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  </svg>
);
const AutomationIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
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
      'Combine the Follow-Up Required and Event Summary filters on the Dashboard to surface leaders who haven\'t met recently or need a check-in — before they fade.',
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
    id: 'inviting-circle',
    category: 'As needed',
    title: 'Inviting and connecting people to a circle',
    description:
      'Walk through how to add a new member to a leader\'s circle — from the Roster tab, using Person Lookup to find them in CCB, and making sure they\'re connected and showing up in Radius.',
    youtubeId: null,
    tryIt: { label: 'Person Lookup', href: '/person-lookup' },
    icon: CircleIcon,
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
    id: 'campaigns',
    category: 'As needed',
    title: 'Campaigns — a full walkthrough',
    description:
      'Create a campaign, write a message with merge variables like first name and form link, track who\'s submitted and who hasn\'t, follow up with the unsubmitted group, and close it out.',
    youtubeId: null,
    tryIt: { label: 'Open Campaigns', href: '/campaigns' },
    icon: CampaignIcon,
  },
  {
    id: 'bulk-message',
    category: 'As needed',
    title: 'Bulk messaging a filtered group',
    description:
      'Filter leaders by campus, status, or circle type, then compose one message that goes to everyone in the result. Each send is automatically logged as a connection on every recipient\'s profile.',
    youtubeId: null,
    tryIt: { label: 'Open Bulk Message', href: '/bulk-message' },
    icon: BulkMessageIcon,
  },
  {
    id: 'daily-email',
    category: 'Daily',
    title: 'Your daily digest email',
    description:
      'See what lands in your inbox each morning — overdue follow-ups, due to-dos, and upcoming visits — and how to opt in, adjust your preferences, and act on it before opening Radius.',
    youtubeId: null,
    tryIt: { label: 'Open Settings', href: '/settings' },
    icon: EmailIcon,
  },
  {
    id: 'navbar',
    category: 'Daily',
    title: 'Nav bar orientation',
    description:
      'A ground-level tour of the sidebar and avatar menu — what lives where, what\'s ACPD-only, and how to get to any tool in two taps from anywhere in the app.',
    youtubeId: null,
    icon: NavIcon,
  },
  {
    id: 'notebook',
    category: 'As needed',
    title: 'Notebook — and the power of linking',
    description:
      'Create pages and folders in the Notebook, then link boards, cards, and leaders directly inside a note. Show how a prep doc, a project card, and a leader profile all connect in one place.',
    youtubeId: null,
    tryIt: { label: 'Open Notebook', href: '/notebook' },
    icon: NotebookIcon,
  },
  {
    id: 'forms',
    category: 'As needed',
    title: 'Forms — how to use them',
    description:
      'Create a form tied to a board, share the link with leaders, and watch submissions flow in as cards. Walk through field setup, the public submission view, and reviewing responses.',
    youtubeId: null,
    tryIt: { label: 'Open Forms', href: '/forms' },
    icon: FormIcon,
  },
  {
    id: 'boards-deep-dive',
    category: 'As needed',
    title: 'Boards, lists, and cards — oh my',
    description:
      'A full Boards walkthrough: create a board, build out lists, add cards with checklists and due dates, link leaders to cards, drag between columns, and keep a project moving.',
    youtubeId: null,
    tryIt: { label: 'Open Boards', href: '/boards' },
    icon: BoardIcon,
  },
  {
    id: 'automations',
    category: 'As needed',
    title: 'List automations and quick actions',
    description:
      'Set up column automations so cards move, checklists appear, or due dates clear automatically when a card lands in a list. Show quick actions for bulk-completing or archiving cards.',
    youtubeId: null,
    tryIt: { label: 'Open Boards', href: '/boards' },
    icon: AutomationIcon,
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
];

const CATEGORY_STYLES: Record<UseCase['category'], string> = {
  Daily: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25',
  Weekly: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25',
  'As needed': 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25',
};

// ── Video card ────────────────────────────────────────────────────────

function VideoCard({ uc }: { uc: UseCase }) {
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
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div
                  className="absolute inset-0 opacity-[0.04]"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                />
                <span className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-700/70 text-vc-300 ring-1 ring-zinc-600">
                  <Icon />
                </span>
                <span className="relative z-10 text-xs text-zinc-500 font-medium">Video coming soon</span>
              </div>
            )}

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
        <div className="mb-2">
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

  const daily = USE_CASES.filter(uc => uc.category === 'Daily').length;
  const weekly = USE_CASES.filter(uc => uc.category === 'Weekly').length;
  const asNeeded = USE_CASES.filter(uc => uc.category === 'As needed').length;

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
                  ACPD Video Library
                </h1>
              </div>
            </div>
            <p className="text-sm text-slate-400 max-w-xl ml-8">
              Short video walkthroughs for every workflow an ACPD reaches for — from daily triage to boards, campaigns, and automations.
            </p>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-3 mb-6 ml-8">
            <div className="text-xs text-slate-500">
              <span className="text-white font-semibold">{USE_CASES.length}</span> videos total
              <span className="mx-2 text-slate-700">·</span>
              <span className="text-emerald-400 font-medium">{daily} daily</span>
              <span className="mx-2 text-slate-700">·</span>
              <span className="text-sky-400 font-medium">{weekly} weekly</span>
              <span className="mx-2 text-slate-700">·</span>
              <span className="text-amber-400 font-medium">{asNeeded} as needed</span>
            </div>
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
          <div className="grid gap-5 sm:grid-cols-2">
            {visible.map(uc => (
              <VideoCard key={uc.id} uc={uc} />
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
