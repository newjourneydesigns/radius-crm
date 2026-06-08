'use client';

import { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import ProtectedRoute from '../../components/ProtectedRoute';

type Level = 'beginner' | 'intermediate' | 'power';
type Category =
  | 'Getting Started'
  | 'Daily Workflow'
  | 'Leaders'
  | 'Notes & To-Dos'
  | 'Boards & Projects'
  | 'Circle Summary'
  | 'Scorecards'
  | 'CCB & Lookup'
  | 'Communication'
  | 'AI Tools'
  | 'Mobile & PWA'
  | 'Admin'
  | 'FAQ';

type Article = {
  id: string;
  title: string;
  category: Category;
  level: Level;
  tags: string[];
  snippet: string;
  body: ReactNode;
  tryIt?: { label: string; href: string };
};

type ChangelogEntry = {
  date: string;
  type: 'feature' | 'improvement' | 'fix';
  description: string;
  page?: string;
};

const CATEGORIES: Category[] = [
  'Getting Started',
  'Daily Workflow',
  'Leaders',
  'Notes & To-Dos',
  'Boards & Projects',
  'Circle Summary',
  'Scorecards',
  'CCB & Lookup',
  'Communication',
  'AI Tools',
  'Mobile & PWA',
  'Admin',
  'FAQ',
];

const LEVEL_STYLES: Record<Level, string> = {
  beginner: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  intermediate: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  power: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
};

const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Newcomer',
  intermediate: 'Regular',
  power: 'Power user',
};

// ────────────────────────────────────────────────────────────────────
// Article content
// ────────────────────────────────────────────────────────────────────

const Para = ({ children }: { children: ReactNode }) => (
  <p className="text-sm leading-relaxed text-slate-300 mb-3">{children}</p>
);
const H = ({ children }: { children: ReactNode }) => (
  <h4 className="text-sm font-semibold text-white mt-4 mb-2 tracking-tight">{children}</h4>
);
const UL = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc list-outside pl-5 space-y-1 text-sm text-slate-300 mb-3 marker:text-slate-500">{children}</ul>
);
const OL = ({ children }: { children: ReactNode }) => (
  <ol className="list-decimal list-outside pl-5 space-y-1 text-sm text-slate-300 mb-3 marker:text-slate-500">{children}</ol>
);
const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="px-1.5 py-0.5 rounded bg-zinc-700/80 text-slate-100 border border-zinc-600/80 text-[11px] font-mono">{children}</kbd>
);
const Callout = ({ tone = 'tip', title, children }: { tone?: 'tip' | 'warn' | 'pro'; title: string; children: ReactNode }) => {
  const styles =
    tone === 'warn'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
      : tone === 'pro'
      ? 'bg-vc-500/10 border-vc-500/30 text-vc-100'
      : 'bg-sky-500/10 border-sky-500/30 text-sky-100';
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-xs my-3 ${styles}`}>
      <div className="font-semibold mb-0.5">{title}</div>
      <div className="text-[12px] leading-relaxed opacity-90">{children}</div>
    </div>
  );
};

const ARTICLES: Article[] = [
  // ─── Getting Started ───
  {
    id: 'what-is-radius',
    title: 'What is Radius?',
    category: 'Getting Started',
    level: 'beginner',
    tags: ['intro', 'overview', 'first time'],
    snippet: "The pastoral CRM for tracking circle leaders, conversations, prayers, and circle health across campuses.",
    body: (
      <>
        <Para>
          Radius is Valley Creek&apos;s internal tool for caring for <strong>Circle Leaders</strong> — the people running our
          small groups. It pulls roster and event data from <strong>CCB</strong>, layers on pastoral context (notes,
          prayers, to-dos, encouragements, scorecards), and surfaces what needs your attention this week.
        </Para>
        <H>What you can do here</H>
        <UL>
          <li>See every leader on your campus and where they stand right now</li>
          <li>Log calls, texts, emails, in-person, and encouragements in one tap</li>
          <li>Pull live CCB rosters and event summaries without leaving the app</li>
          <li>Run scorecard evaluations to track leader development</li>
          <li>Plan visits and follow-ups on a shared calendar</li>
          <li>Use AI to summarize circle notes, prep for meetings, and dictate updates</li>
        </UL>
        <Callout tone="tip" title="One-minute tour">
          Open the <strong>Dashboard</strong> → pick your campus → tap any leader card. Everything flows from there.
        </Callout>
      </>
    ),
    tryIt: { label: 'Open Dashboard', href: '/dashboard' },
  },
  {
    id: 'first-login',
    title: 'Logging in for the first time',
    category: 'Getting Started',
    level: 'beginner',
    tags: ['login', 'magic link', 'auth', 'sign in', 'password'],
    snippet: 'Radius uses passwordless magic-link login. Enter your email, click the link, you’re in.',
    body: (
      <>
        <OL>
          <li>Go to the login page and enter the email your admin added you with.</li>
          <li>Check your inbox — you&apos;ll get a one-time magic link from Radius.</li>
          <li>Click the link on the device you want to be signed in on. Done.</li>
        </OL>
        <Callout tone="warn" title="No link arriving?">
          Check spam, then make sure your email matches exactly what your admin set up. If you have multiple Google
          accounts, open the link in the same browser profile you requested it from.
        </Callout>
      </>
    ),
    tryIt: { label: 'Go to login', href: '/login' },
  },
  {
    id: 'navigation',
    title: 'Finding your way around',
    category: 'Getting Started',
    level: 'beginner',
    tags: ['navigation', 'menu', 'sidebar', 'layout'],
    snippet: 'The left sidebar covers the daily tools. The avatar menu (top right) holds settings and admin tools.',
    body: (
      <>
        <H>Left sidebar (everyday)</H>
        <UL>
          <li><strong>Dashboard</strong> — campus-filtered list of leaders, your home base</li>
          <li><strong>Today</strong> — what needs you today: follow-ups, due to-dos, upcoming visits</li>
          <li><strong>Progress</strong> — aggregate engagement stats and your scorecard</li>
          <li><strong>Calendar</strong> — month/week/day view of visits, to-dos, meeting days</li>
          <li><strong>Prayer</strong> — general + per-leader prayer points</li>
          <li><strong>Boards</strong> — kanban projects for cross-leader work</li>
          <li><strong>Notebook</strong> — your private notes scratchpad</li>
          <li><strong>Search</strong> / <Kbd>⌘K</Kbd> — find any leader instantly</li>
        </UL>
        <H>Avatar menu (top right)</H>
        <UL>
          <li>Profile, Settings, Logout</li>
          <li>Person Lookup, CCB Explorer, Manage Users, Add Leader (Admin only)</li>
        </UL>
      </>
    ),
  },

  // ─── Daily Workflow ───
  {
    id: 'workflow-monday-morning',
    title: 'Workflow — Monday morning triage',
    category: 'Daily Workflow',
    level: 'power',
    tags: ['workflow', 'weekly', 'monday', 'triage', 'routine'],
    snippet: "The fifteen-minute routine that keeps every leader on your campus from slipping through the cracks.",
    body: (
      <>
        <OL>
          <li>Open <strong>Today</strong>. Knock out any follow-ups whose date already passed.</li>
          <li>Go to <strong>Progress</strong>. Look at the &quot;Event Summary&quot; chart — anyone red?</li>
          <li>On <strong>Leaders</strong>, filter <em>Status = Follow-Up Required</em> + your campus. Work the list.</li>
          <li>Filter <em>Event Summary = Not Received</em>. Text those leaders a quick check-in.</li>
          <li>Open <strong>Calendar</strong> to see visits scheduled this week. Confirm them.</li>
        </OL>
        <Callout tone="pro" title="Bookmark this view">
          Filter state lives in the URL. After you set up the Follow-Up + Campus filter, bookmark the page — that&apos;s
          your one-click Monday view forever.
        </Callout>
      </>
    ),
    tryIt: { label: 'Open Today', href: '/today' },
  },
  {
    id: 'workflow-after-circle',
    title: 'Workflow — After a circle meets',
    category: 'Daily Workflow',
    level: 'intermediate',
    tags: ['workflow', 'circle summary', 'event', 'after meeting'],
    snippet: 'Within 24 hours of a circle meeting, capture the summary so trends stay accurate.',
    body: (
      <>
        <OL>
          <li>Open <strong>Circle Summary</strong> from the leader profile or the Circle Summary page.</li>
          <li>Pick the event date — Radius pulls attendees and any CCB notes automatically.</li>
          <li>Answer the dynamic questions. The form auto-saves a draft as you type.</li>
          <li>Submit — the event marks as &quot;Received&quot; and updates the Progress charts.</li>
        </OL>
        <Callout tone="tip" title="Notes from your last summary">
          The reference card at the top is read-only — it&apos;s context, not something to retype. Click
          &quot;Edit these notes&quot; only if you actually want to update what was said last time.
        </Callout>
      </>
    ),
  },
  {
    id: 'workflow-1on1',
    title: 'Workflow — Prepping a 1:1 with a leader',
    category: 'Daily Workflow',
    level: 'power',
    tags: ['1:1', 'meeting prep', 'workflow', 'ai'],
    snippet: 'Open the profile, hit AI Meeting Prep, and walk in knowing every recent thread.',
    body: (
      <>
        <OL>
          <li>Open the leader&apos;s profile.</li>
          <li>Skim pinned notes — they&apos;re the &quot;don&apos;t forget this&quot; surface.</li>
          <li>Click <strong>AI Meeting Prep</strong>. It summarizes recent notes, encouragements, and circle health into talking points.</li>
          <li>Check the <strong>Circle Visits</strong> tab — anything you promised follow-up on?</li>
          <li>After the meeting, log a connection + add a note. Add a follow-up date if needed.</li>
        </OL>
        <Callout tone="warn" title="AI uses quota">
          Meeting Prep calls Gemini. It&apos;s cheap but not free — use it for actual prep, not curiosity.
        </Callout>
      </>
    ),
  },

  // ─── Leaders ───
  {
    id: 'leader-profile',
    title: 'The leader profile, end to end',
    category: 'Leaders',
    level: 'intermediate',
    tags: ['profile', 'leader', 'tabs'],
    snippet: 'Everything about a leader lives on the profile: contact, notes, to-dos, visits, connections, prayers.',
    body: (
      <>
        <H>Header strip</H>
        <UL>
          <li>Tap-to-call / text / email buttons next to the contact details</li>
          <li>Status pill — click to change (Invited → On-boarding → Active → Paused → Off-boarding)</li>
          <li>Follow-up toggle, Event Summary toggle, Encourage button</li>
          <li>CCB profile link opens their record in CCB in a new tab</li>
        </UL>
        <H>Tabs</H>
        <UL>
          <li><strong>Notes</strong> — full history, pinned notes float to top, templates and follow-up dates supported</li>
          <li><strong>To-Do</strong> — leader-scoped tasks with optional repeat cadence</li>
          <li><strong>Circle Visits</strong> — schedule, log, and review in-circle visits</li>
          <li><strong>Connections</strong> — chronological log of every interaction</li>
          <li><strong>Prayers</strong> — prayer points specific to this leader</li>
          <li><strong>Roster</strong> — CCB group members with one-tap text/call/email (if a CCB Group ID is set)</li>
        </UL>
      </>
    ),
  },
  {
    id: 'statuses-explained',
    title: 'Leader statuses, explained',
    category: 'Leaders',
    level: 'beginner',
    tags: ['status', 'invited', 'active', 'paused', 'offboarding'],
    snippet: 'Six statuses describe where a leader is in the lifecycle. Use them as filters, not labels.',
    body: (
      <>
        <UL>
          <li><strong>Invited</strong> — someone we&apos;ve asked to lead but haven&apos;t fully onboarded</li>
          <li><strong>On-boarding</strong> — in training/setup, not yet running a circle</li>
          <li><strong>Active</strong> — running a circle right now</li>
          <li><strong>Paused</strong> — temporarily not meeting (vacation, life season)</li>
          <li><strong>Off-boarding</strong> — winding down, exit conversations in progress</li>
          <li><strong>Archived</strong> — no longer leading; kept for history</li>
        </UL>
        <Callout tone="tip" title="Find Leaders shows Active only">
          The public-facing leader search hides everything but Active so visitors don&apos;t see in-flight statuses.
        </Callout>
      </>
    ),
  },
  {
    id: 'filters-and-search',
    title: 'Filtering and search across the app',
    category: 'Leaders',
    level: 'intermediate',
    tags: ['filter', 'search', 'fuse', 'cmd k', 'find'],
    snippet: 'Filters are URL-stateful. Search is fuzzy. Combine them aggressively.',
    body: (
      <>
        <H>Global search</H>
        <Para>
          <Kbd>⌘K</Kbd> on Mac, <Kbd>Ctrl K</Kbd> on Windows. Fuzzy-matches name, email, campus, circle type — no exact
          spelling needed.
        </Para>
        <H>Leaders page filters</H>
        <UL>
          <li>Status (incl. &quot;Follow-Up Required&quot;), Campus, Circle Type, Meeting Day, AM/PM</li>
          <li>Connected recently (yes/no), Event Summary (received/not received)</li>
          <li>Active chips show what&apos;s applied — ✕ to drop one, Clear All to reset</li>
        </UL>
        <Callout tone="pro" title="URL is the truth">
          Every filter is encoded in the URL. Bookmark the &quot;needs attention&quot; view, share a link in Slack, or
          paste it into a doc — it all works.
        </Callout>
      </>
    ),
  },

  // ─── Notes & To-Dos ───
  {
    id: 'notes-deep-dive',
    title: 'Notes, pinning, and templates',
    category: 'Notes & To-Dos',
    level: 'intermediate',
    tags: ['notes', 'template', 'pin', 'follow up'],
    snippet: "Notes are the soul of the system. Pin what matters, template what repeats, follow-up what's pending.",
    body: (
      <>
        <H>Three ways to add a note</H>
        <UL>
          <li>Quick add from any leader card on Dashboard / Leaders</li>
          <li>From the leader profile → Notes tab → New Note</li>
          <li>Auto-generated when you complete a to-do (optional)</li>
        </UL>
        <H>Pin sparingly</H>
        <Para>
          Pinned notes always stay at the top. Use it for context that should hit your eyes <em>every time</em> you open
          the profile — health concerns, ongoing prayer needs, key relational background.
        </Para>
        <H>Templates</H>
        <UL>
          <li>Manage at <strong>Settings → Note Templates</strong></li>
          <li>While writing a note: <strong>Save as Template</strong> turns it into one for future use</li>
          <li>Good templates: &quot;Initial Contact&quot;, &quot;Monthly Check-In&quot;, &quot;Difficult Conversation Recap&quot;</li>
        </UL>
        <Callout tone="tip" title="Follow-up dates are smart">
          Attach a date to any note and it shows up on the Calendar AND the Today page when due.
        </Callout>
      </>
    ),
  },
  {
    id: 'todos-power',
    title: 'To-Dos: repeating tasks, calendar sync, note links',
    category: 'Notes & To-Dos',
    level: 'power',
    tags: ['todo', 'task', 'repeat', 'recurring'],
    snippet: 'Repeating to-dos auto-reset. Due dates land on the calendar. Completion can auto-generate a note.',
    body: (
      <>
        <UL>
          <li>Create on leader profile or via global to-do widget</li>
          <li>Daily, weekly, biweekly, monthly, quarterly cadences supported</li>
          <li>Toggle the &quot;show completed&quot; switch at the top of any to-do list</li>
          <li>Linking a to-do to a note keeps the action and the record together</li>
        </UL>
        <Callout tone="pro" title="Standing rituals">
          Create a monthly-repeating to-do called &quot;Check in&quot; on each Active leader. The first of the month becomes
          a clean, ready-made worklist.
        </Callout>
      </>
    ),
  },

  // ─── Boards & Projects ───
  {
    id: 'boards-intro',
    title: 'Boards & Projects (kanban)',
    category: 'Boards & Projects',
    level: 'intermediate',
    tags: ['boards', 'projects', 'kanban', 'cards'],
    snippet: 'Drag-and-drop kanban for work that spans leaders or campuses — onboarding, events, initiatives.',
    body: (
      <>
        <UL>
          <li>Columns are customizable (To do / Doing / Done is the default)</li>
          <li>Cards support checklists, due dates, linked leaders, and assignees</li>
          <li>Drag between columns; reorder within a column</li>
          <li>Each board is its own project — keep them focused (one initiative each)</li>
        </UL>
      </>
    ),
    tryIt: { label: 'Open Boards', href: '/boards' },
  },

  // ─── Circle Summary ───
  {
    id: 'circle-summary-flow',
    title: 'Circle Summary — the full picture',
    category: 'Circle Summary',
    level: 'intermediate',
    tags: ['circle summary', 'event summary', 'attendance', 'submit'],
    snippet: 'Submit what happened at a circle meeting so leadership has rolled-up data and the leader has a record.',
    body: (
      <>
        <OL>
          <li>Pick the event date — Radius pulls attendees and CCB notes automatically.</li>
          <li>The dynamic questions adapt to your campus configuration.</li>
          <li>The form auto-saves a draft every few seconds.</li>
          <li>Submit to mark the summary received — Progress page updates immediately.</li>
        </OL>
        <H>Previous notes card</H>
        <Para>
          A reference card shows notes from the last summary so you have context. You don&apos;t need to retype them —
          they live forever in history. If you want to edit and reuse them, the &quot;Edit these notes&quot; button drops
          them into the form for revision.
        </Para>
        <H>Persistent sessions</H>
        <Para>
          Circle Summary keeps you signed in across visits so you can step away and finish later. Drafts are
          per-event, per-device.
        </Para>
      </>
    ),
    tryIt: { label: 'Open Circle Summary', href: '/circle-leader-toolkit' },
  },

  // ─── Scorecards ───
  {
    id: 'scorecards-overview',
    title: 'Scorecards — evaluating leader development',
    category: 'Scorecards',
    level: 'power',
    tags: ['scorecard', 'evaluation', 'rubric'],
    snippet: 'A multi-dimension rubric for assessing where a leader is — and where they have room to grow.',
    body: (
      <>
        <UL>
          <li>Open a leader profile → Scorecard tab to start an evaluation</li>
          <li>Each dimension scores 1–5; overall is averaged automatically</li>
          <li>Color-coded cells make low scores immediately visible</li>
          <li>Historical evaluations are retained so you can see growth over time</li>
        </UL>
        <Callout tone="tip" title="When to score">
          Quarterly is a good cadence for Active leaders. After every major conversation for On-boarding leaders.
        </Callout>
      </>
    ),
  },

  // ─── CCB & Lookup ───
  {
    id: 'ccb-explorer',
    title: 'CCB Explorer (admin)',
    category: 'CCB & Lookup',
    level: 'power',
    tags: ['ccb', 'church community builder', 'admin'],
    snippet: 'Browse CCB profiles without leaving Radius. Admin-only.',
    body: (
      <>
        <UL>
          <li>Search CCB by name, group, or leader ID</li>
          <li>Cross-reference CCB data when onboarding</li>
          <li>Jump to the full CCB record in a new tab when you need the full view</li>
        </UL>
        <Callout tone="warn" title="Admin only">
          Restricted to ACPD/Admin accounts. Ask your site admin if you need this.
        </Callout>
      </>
    ),
  },
  {
    id: 'person-lookup',
    title: 'Person Lookup — find anyone in CCB',
    category: 'CCB & Lookup',
    level: 'intermediate',
    tags: ['lookup', 'person', 'phone', 'ccb', 'search'],
    snippet: 'Search CCB by name or phone, then text/call/email in one tap. Great for spot-checks.',
    body: (
      <>
        <UL>
          <li>Avatar menu → Person Lookup (mobile: More menu)</li>
          <li>Type a name OR a phone (7+ digits) — results auto-load</li>
          <li>Selecting a person shows Text / Call / Email actions</li>
          <li>Clear & Search Again to look up the next person</li>
        </UL>
      </>
    ),
    tryIt: { label: 'Open Person Lookup', href: '/person-lookup' },
  },
  {
    id: 'circle-roster',
    title: 'Circle Roster — the people in a circle',
    category: 'CCB & Lookup',
    level: 'intermediate',
    tags: ['roster', 'circle', 'members', 'group'],
    snippet: 'View and contact the members of a leader’s circle, cached so it works offline.',
    body: (
      <>
        <UL>
          <li>Open a leader profile (must have a CCB Group ID) → tap <strong>View Roster</strong></li>
          <li>Members are pulled from CCB and cached locally</li>
          <li>Search/filter members by name or email</li>
          <li>Each member has Text / Call / Email buttons</li>
          <li><strong>Refresh</strong> re-syncs from CCB; the page shows the last sync time</li>
        </UL>
      </>
    ),
  },

  // ─── Communication ───
  {
    id: 'log-connection',
    title: 'Logging connections',
    category: 'Communication',
    level: 'beginner',
    tags: ['connection', 'log', 'call', 'text', 'email'],
    snippet: "If it happened and it isn't logged, it didn't happen. Make this reflexive.",
    body: (
      <>
        <OL>
          <li>From any leader card or profile, tap <strong>Log Connection</strong>.</li>
          <li>Pick type: Call, Text, Email, In-Person.</li>
          <li>Add a short note about the conversation if it matters.</li>
          <li>Save — it lands in the connection log and the scorecard counts it.</li>
        </OL>
      </>
    ),
  },
  {
    id: 'encourage',
    title: 'Encourage — intentional pastoral touch',
    category: 'Communication',
    level: 'intermediate',
    tags: ['encourage', 'scripture', 'pastoral'],
    snippet: 'Log an encouragement with method and (optional) scripture. Feeds your scorecard.',
    body: (
      <>
        <OL>
          <li>Open the leader profile and tap <strong>Encourage</strong>.</li>
          <li>Choose method: Text / Call / Email / In-Person.</li>
          <li>Optionally add a scripture reference and a personal note.</li>
          <li>Save — appears in the connection log and counts on the Progress scorecard.</li>
        </OL>
      </>
    ),
  },
  {
    id: 'bulk-message',
    title: 'Bulk messaging',
    category: 'Communication',
    level: 'power',
    tags: ['bulk', 'message', 'mass', 'sms', 'email'],
    snippet: 'Send a message to many leaders at once — filtered by status, campus, or circle type.',
    body: (
      <>
        <UL>
          <li>Open <strong>Bulk Message</strong> from the sidebar</li>
          <li>Apply filters to scope your audience (campus, status, etc.)</li>
          <li>Compose once; Radius handles the send</li>
          <li>Each send is logged as a connection on every recipient</li>
        </UL>
        <Callout tone="warn" title="Send carefully">
          Bulk sends are not reversible. Preview the recipient count and contents before hitting send.
        </Callout>
      </>
    ),
    tryIt: { label: 'Open Bulk Message', href: '/bulk-message' },
  },

  // ─── AI Tools ───
  {
    id: 'ai-summary',
    title: 'AI note summarization',
    category: 'AI Tools',
    level: 'intermediate',
    tags: ['ai', 'summary', 'gemini', 'groq'],
    snippet: 'Long thread of notes? Turn it into a clean briefing in one click.',
    body: (
      <>
        <UL>
          <li>Available on leader profiles and the Circle Summary form</li>
          <li>Primary model: Google Gemini 2.0 Flash. Fallback: Groq Llama 3.3</li>
          <li>Summaries are advisory — always review before passing along</li>
        </UL>
        <Callout tone="warn" title="AI uses quota">
          Free tier on Gemini is generous but finite. Don&apos;t batch-summarize for fun — use it where it earns its keep.
        </Callout>
      </>
    ),
  },
  {
    id: 'ai-meeting-prep',
    title: 'AI meeting prep',
    category: 'AI Tools',
    level: 'power',
    tags: ['ai', 'meeting prep', '1:1'],
    snippet: 'Aggregates recent notes, encouragements, and visits into a talking-point briefing for your 1:1.',
    body: (
      <>
        <Para>
          Open a leader profile and click <strong>AI Meeting Prep</strong>. Radius pulls the last several months of
          notes, recent connections, open to-dos, and pending follow-ups, then drafts a structured prep doc you can
          skim in two minutes.
        </Para>
        <Callout tone="tip" title="Edit before you trust">
          The model is good, not infallible. Re-read it against the source before walking in.
        </Callout>
      </>
    ),
  },
  {
    id: 'ai-dictation',
    title: 'Dictating notes',
    category: 'AI Tools',
    level: 'intermediate',
    tags: ['ai', 'dictation', 'voice', 'transcribe'],
    snippet: 'Talk; Radius transcribes. Faster than typing on a phone after a circle visit.',
    body: (
      <>
        <UL>
          <li>Look for the microphone icon on note fields</li>
          <li>Speak naturally; the result is editable before save</li>
          <li>Works best in a quiet environment with a single speaker</li>
        </UL>
      </>
    ),
  },

  // ─── Mobile & PWA ───
  {
    id: 'pwa-install',
    title: 'Install Radius on your phone or desktop',
    category: 'Mobile & PWA',
    level: 'beginner',
    tags: ['pwa', 'install', 'iphone', 'android', 'home screen'],
    snippet: 'Radius is a Progressive Web App — install it for a native-feeling experience and offline basics.',
    body: (
      <>
        <H>iPhone (Safari)</H>
        <OL>
          <li>Open <strong>vccradius.netlify.app</strong> in Safari</li>
          <li>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong></li>
        </OL>
        <H>Android (Chrome)</H>
        <OL>
          <li>Open the site in Chrome</li>
          <li>Tap ⋮ → <strong>Add to Home Screen</strong> (or accept the install banner)</li>
        </OL>
        <H>Desktop (Chrome / Edge)</H>
        <OL>
          <li>Open the site</li>
          <li>Click the install icon in the address bar → <strong>Install</strong></li>
        </OL>
      </>
    ),
  },
  {
    id: 'offline-behavior',
    title: 'What works offline',
    category: 'Mobile & PWA',
    level: 'intermediate',
    tags: ['offline', 'pwa', 'service worker'],
    snippet: 'Read works mostly offline. Writes queue and sync when you reconnect.',
    body: (
      <>
        <UL>
          <li>Previously viewed leaders and rosters are cached — view them anywhere</li>
          <li>New notes / to-dos created offline sync when connection returns</li>
          <li>CCB-backed searches require a live connection</li>
        </UL>
      </>
    ),
  },

  // ─── Admin ───
  {
    id: 'add-leader',
    title: 'Adding a new leader (admin)',
    category: 'Admin',
    level: 'power',
    tags: ['add leader', 'create', 'new', 'admin', 'onboarding'],
    snippet: 'Create a leader from scratch or pull from CCB — Add Leader handles both.',
    body: (
      <>
        <OL>
          <li>Avatar menu → <strong>Add Leader</strong></li>
          <li>Search CCB to auto-fill contact info, or enter manually</li>
          <li>Set campus, circle type, meeting day/time, and initial status</li>
          <li>Save — the profile is live and shows up in everyone&apos;s filtered views</li>
        </OL>
      </>
    ),
    tryIt: { label: 'Add Leader', href: '/add-leader' },
  },
  {
    id: 'manage-users',
    title: 'Managing Radius users (admin)',
    category: 'Admin',
    level: 'power',
    tags: ['users', 'admin', 'roles', 'acpd'],
    snippet: 'Create accounts, assign roles, audit logins. Only the ACPD role gets admin power.',
    body: (
      <>
        <UL>
          <li>Avatar menu → <strong>Manage Users</strong></li>
          <li>Roles: <strong>ACPD</strong> (admin) vs. anything else (viewer/standard)</li>
          <li>Create, edit, or delete user accounts</li>
          <li>Last-login column helps spot stale accounts</li>
        </UL>
      </>
    ),
  },
  {
    id: 'daily-digest',
    title: 'Daily digest email',
    category: 'Admin',
    level: 'intermediate',
    tags: ['email', 'digest', 'daily', 'summary'],
    snippet: 'A morning email summarizing follow-ups, due to-dos, and upcoming visits.',
    body: (
      <>
        <UL>
          <li>Opt in via <strong>Settings → Email Preferences</strong></li>
          <li>Sent each morning by a scheduled job</li>
          <li>Scoped to your campus + assignments</li>
        </UL>
      </>
    ),
  },
  {
    id: 'export-data',
    title: 'Exporting leader data',
    category: 'Admin',
    level: 'power',
    tags: ['export', 'csv', 'download'],
    snippet: 'Export the current filtered Leaders view as CSV for spreadsheets or reporting.',
    body: (
      <>
        <OL>
          <li>Go to <strong>Leaders</strong>, apply your filters</li>
          <li>Click <strong>Export</strong> in the top-right</li>
          <li>CSV downloads — exactly the rows you saw, with all profile fields</li>
        </OL>
      </>
    ),
  },

  // ─── FAQ ───
  {
    id: 'faq-no-magic-link',
    title: "I'm not getting my magic link email",
    category: 'FAQ',
    level: 'beginner',
    tags: ['login', 'magic link', 'email', 'troubleshoot'],
    snippet: 'Check spam, confirm the email matches what your admin set up, open the link in the same browser.',
    body: (
      <>
        <OL>
          <li>Check your spam / junk folder — Resend sometimes lands there first time</li>
          <li>Confirm the email you typed exactly matches what your admin added</li>
          <li>Open the link in the same browser profile that requested it</li>
          <li>Request a new link if it&apos;s older than ~15 minutes</li>
        </OL>
      </>
    ),
  },
  {
    id: 'faq-cant-see-page',
    title: "Why can't I see [page] / [feature]?",
    category: 'FAQ',
    level: 'beginner',
    tags: ['permissions', 'access', 'hidden', 'admin'],
    snippet: 'Most likely you need the ACPD/Admin role. CCB Explorer, Manage Users, and Add Leader are admin-only.',
    body: (
      <>
        <Para>
          If a menu item shows up for your colleague but not you, you&apos;re probably not in the ACPD role. Ask a site
          admin to update your account under <strong>Manage Users</strong>.
        </Para>
      </>
    ),
  },
  {
    id: 'faq-ccb-data-stale',
    title: 'A roster or CCB profile looks out of date',
    category: 'FAQ',
    level: 'intermediate',
    tags: ['ccb', 'sync', 'stale', 'roster', 'refresh'],
    snippet: 'Hit Refresh on the roster page. CCB Explorer fetches live every time.',
    body: (
      <>
        <UL>
          <li>Roster: tap <strong>Refresh</strong> on the Circle Roster page — it re-pulls from CCB and updates the sync time</li>
          <li>CCB Explorer always fetches live; nothing is cached there</li>
          <li>If a person genuinely missing from CCB, fix it in CCB first — Radius will sync next time</li>
        </UL>
      </>
    ),
  },
  {
    id: 'faq-wrong-data',
    title: "A leader's contact info is wrong",
    category: 'FAQ',
    level: 'beginner',
    tags: ['contact', 'phone', 'email', 'edit', 'update'],
    snippet: 'Edit on the leader profile. If they exist in CCB, update CCB too so the source of truth stays clean.',
    body: (
      <>
        <Para>
          Open the leader profile and edit directly. If the leader is in CCB, also update them in CCB — Radius treats
          CCB as the long-term source of truth for contact info.
        </Para>
      </>
    ),
  },
  {
    id: 'faq-feedback',
    title: 'How do I request a feature or report a bug?',
    category: 'FAQ',
    level: 'beginner',
    tags: ['feedback', 'bug', 'request', 'feature'],
    snippet: "Send a note to your site admin — they're the channel into the dev side.",
    body: (
      <Para>
        For now, message your site admin directly with the request or bug. Include what you expected, what you saw,
        and (if possible) the URL you were on.
      </Para>
    ),
  },
];

// ────────────────────────────────────────────────────────────────────
// Glossary
// ────────────────────────────────────────────────────────────────────

const GLOSSARY: { term: string; def: string }[] = [
  { term: 'ACPD', def: 'Associate Campus Pastor / Director — the staff member assigned to coach a circle leader. In Radius, the ACPD role is the admin role.' },
  { term: 'Active', def: 'A leader currently running a circle. The default audience for most filtered views.' },
  { term: 'Archived', def: 'A leader who is no longer leading but is kept in the system for historical record.' },
  { term: 'Board', def: 'A kanban project — columns of cards used for tracking cross-leader work like onboarding or events.' },
  { term: 'Bulk Message', def: 'A message sent to a filtered group of leaders at once. Each recipient gets it logged as a connection.' },
  { term: 'Campus', def: 'A physical Valley Creek location used as the primary geographic filter.' },
  { term: 'CCB', def: 'Church Community Builder — the church management system. Radius reads roster, attendance, and event data from CCB via XML API.' },
  { term: 'Circle', def: 'A small group. Has a leader, members, a meeting day/time, and (usually) a CCB group ID.' },
  { term: 'Circle Leader', def: 'The person running a circle. The primary entity in Radius.' },
  { term: 'Circle Summary', def: 'A submitted summary of what happened at a specific circle meeting — attendees, notes, dynamic question answers.' },
  { term: 'Circle Visit', def: 'A pastoral visit to a circle while it&apos;s meeting. Scheduled and logged in Radius.' },
  { term: 'Connection', def: 'Any logged interaction with a leader — call, text, email, or in-person.' },
  { term: 'Encouragement', def: 'A specific kind of intentional pastoral touch, optionally including scripture. Tracked separately on the scorecard.' },
  { term: 'Event Summary', def: 'The CCB-side concept that maps to a Circle Summary — &quot;Received&quot;, &quot;Skipped&quot;, or &quot;Did Not Meet&quot;.' },
  { term: 'Follow-Up Required', def: 'A flag on a leader (or a note&apos;s follow-up date) marking them as needing pastoral attention.' },
  { term: 'Invited', def: 'Status for someone who has been asked to lead but hasn&apos;t fully onboarded yet.' },
  { term: 'Magic Link', def: 'The passwordless email link used to sign in to Radius. Single use, time-limited.' },
  { term: 'Off-boarding', def: 'Status for a leader who is winding down — exit conversations in progress.' },
  { term: 'On-boarding', def: 'Status for a leader in training/setup, not yet leading.' },
  { term: 'Paused', def: 'Status for a leader temporarily not meeting (sabbatical, vacation, life season).' },
  { term: 'PWA', def: 'Progressive Web App — install Radius on your phone or desktop for a native-feeling experience.' },
  { term: 'Roster', def: 'The list of members in a circle, pulled from CCB.' },
  { term: 'Scorecard', def: 'A rubric-based evaluation of a leader&apos;s development across multiple dimensions.' },
  { term: 'Status', def: 'Where a leader is in their lifecycle: Invited, On-boarding, Active, Paused, Off-boarding, Archived.' },
];

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load changelog teaser
  useEffect(() => {
    fetch('/changelog.json')
      .then(r => r.json())
      .then((entries: ChangelogEntry[]) => setChangelog(entries.slice(0, 4)))
      .catch(() => setChangelog([]));
  }, []);

  // Keyboard shortcut for search focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(ARTICLES, {
        keys: [
          { name: 'title', weight: 3 },
          { name: 'snippet', weight: 2 },
          { name: 'tags', weight: 2 },
          { name: 'category', weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    []
  );

  const filtered = useMemo(() => {
    let list: Article[] = ARTICLES;
    if (query.trim()) {
      list = fuse.search(query.trim()).map(r => r.item);
    }
    if (activeCategory !== 'All') {
      list = list.filter(a => a.category === activeCategory);
    }
    return list;
  }, [query, activeCategory, fuse]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(filtered.map(a => a.id)));
  const collapseAll = () => setExpanded(new Set());

  const articleCount = filtered.length;
  const totalCount = ARTICLES.length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

          {/* ─── Header ─── */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/dashboard"
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Back to dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Help Center</h1>
            </div>
            <p className="text-sm text-slate-400">
              Everything you need to use Radius — from the first login to the deep-cut power moves.
              <span className="hidden sm:inline"> Press <Kbd>/</Kbd> to jump to search.</span>
            </p>
          </div>

          {/* ─── Search ─── */}
          <div className="relative mb-5">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search help — try “follow-up”, “bulk”, “magic link”, “scorecard”…"
              className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent transition-colors shadow-card-glass"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1.5 rounded-md hover:bg-zinc-700 transition-colors"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* ─── Category chips ─── */}
          <div className="flex flex-wrap gap-2 mb-6">
            <CategoryChip
              label="All"
              count={ARTICLES.length}
              active={activeCategory === 'All'}
              onClick={() => setActiveCategory('All')}
            />
            {CATEGORIES.map(cat => {
              const c = ARTICLES.filter(a => a.category === cat).length;
              if (!c) return null;
              return (
                <CategoryChip
                  key={cat}
                  label={cat}
                  count={c}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                />
              );
            })}
          </div>

          {/* ─── What's New ─── */}
          {changelog.length > 0 && (
            <div className="mb-8 bg-gradient-to-br from-vc-500/10 via-zinc-800 to-zinc-800 border border-vc-500/20 rounded-xl p-5 shadow-card-glass">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vc-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-vc-500" />
                  </span>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wide">What&apos;s new</h2>
                </div>
                <Link href="/update-log" className="text-xs text-vc-300 hover:text-vc-200">
                  Full update log →
                </Link>
              </div>
              <ul className="space-y-2.5">
                {changelog.map((entry, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        entry.type === 'feature'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : entry.type === 'improvement'
                          ? 'bg-sky-500/15 text-sky-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {entry.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span>{entry.date}</span>
                        {entry.page && (
                          <>
                            <span>·</span>
                            <Link href={entry.page} className="text-vc-400 hover:text-vc-300">
                              View page
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ─── Result count + expand/collapse ─── */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {articleCount === totalCount
                ? `${totalCount} articles`
                : `${articleCount} of ${totalCount} articles`}
            </p>
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={expandAll}
                  className="text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors"
                >
                  Expand all
                </button>
                <span className="text-slate-700">·</span>
                <button
                  onClick={collapseAll}
                  className="text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors"
                >
                  Collapse all
                </button>
              </div>
            )}
          </div>

          {/* ─── Articles ─── */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-zinc-800/40 border border-zinc-700/60 rounded-xl">
              <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              <p className="text-slate-400 text-sm">No articles match that search.</p>
              <p className="text-slate-500 text-xs mt-1">Try a different keyword or clear the filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(article => {
                const isOpen = expanded.has(article.id);
                return (
                  <article
                    key={article.id}
                    id={article.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-card-glass transition-colors hover:border-zinc-600"
                  >
                    <button
                      onClick={() => toggle(article.id)}
                      className="w-full text-left p-5 flex items-start gap-4 group"
                      aria-expanded={isOpen}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {article.category}
                          </span>
                          <span className="text-slate-700">·</span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${LEVEL_STYLES[article.level]}`}
                          >
                            {LEVEL_LABEL[article.level]}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-white group-hover:text-vc-200 transition-colors">
                          {article.title}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">{article.snippet}</p>
                      </div>
                      <svg
                        className={`w-5 h-5 text-slate-500 flex-shrink-0 mt-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.8}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 -mt-1 border-t border-zinc-700/60 pt-4">
                        {article.body}
                        {article.tryIt && (
                          <Link
                            href={article.tryIt.href}
                            className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-vc-300 hover:text-vc-200 transition-colors"
                          >
                            {article.tryIt.label}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* ─── Glossary ─── */}
          <section id="glossary" className="mt-12">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl font-semibold text-white tracking-tight">Glossary</h2>
              <span className="text-xs text-slate-500">{GLOSSARY.length} terms</span>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-card-glass overflow-hidden">
              <dl className="divide-y divide-zinc-700/60">
                {GLOSSARY.map(({ term, def }) => (
                  <div key={term} className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 px-5 py-3.5 hover:bg-zinc-700/20 transition-colors">
                    <dt className="text-sm font-semibold text-white">{term}</dt>
                    <dd className="text-sm text-slate-300 sm:col-span-3 leading-relaxed">{def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* ─── Footer / contact ─── */}
          <div className="mt-10 mb-6 bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-5">
            <h3 className="text-base font-semibold text-white mb-1">Still stuck?</h3>
            <p className="text-sm text-slate-400">
              Message your site admin with the URL you were on, what you expected, and what happened. That&apos;s the
              fastest path to a fix.
            </p>
          </div>
        </div>

        {/* Back to top */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 bg-btn-primary text-white rounded-full p-3 shadow-glow-brand hover:opacity-90 transition-opacity"
          aria-label="Back to top"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      </div>
    </ProtectedRoute>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
        active
          ? 'bg-vc-500 text-white'
          : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700 border border-zinc-700'
      }`}
    >
      <span>{label}</span>
      <span className={`text-[10px] ${active ? 'text-vc-100' : 'text-slate-500'}`}>{count}</span>
    </button>
  );
}
