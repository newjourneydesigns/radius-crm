# RADIUS CRM — Project Context

> **Version:** 1.7.0  
> **Repository:** `newjourneydesigns/radius-crm` (branch: `main`)  
> **Last Updated:** 2026-03-01

---

## Overview

RADIUS is a **Circle Leader Management System** — a CRM-style web application for managing church circle group leaders, tracking connections, scheduling visits, managing event summaries, and enabling follow-up workflows. It is a mobile-first Progressive Web App (PWA) with a dark-themed UI.

---

## Tech Stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| **Framework**    | Next.js 14 (App Router)                         |
| **Language**     | TypeScript                                      |
| **UI**           | React 18, Tailwind CSS 3, DaisyUI 5             |
| **Database**     | Supabase (PostgreSQL) with Row-Level Security    |
| **Auth**         | Supabase Auth (magic link / passwordless, PKCE flow) |
| **Calendar**     | FullCalendar v6                                 || **Charts**     | Chart.js 4 + react-chartjs-2 5                  || **Search**       | Fuse.js (client-side fuzzy search)              |
| **Deployment**   | Netlify (with `@netlify/plugin-nextjs`)         |
| **PWA**          | next-pwa                                        |
| **Node**         | >= 20.19.0                                      |
| **AI Providers**  | Google Gemini 2.0 Flash (primary), Groq Llama 3.3 70B (fallback) — dual-provider with automatic failover |
| **Speech**        | Browser Web Speech API (`webkitSpeechRecognition`) — no npm dependency |
| **External API** | CCB (Church Community Builder) — XML-based API via `axios` + `fast-xml-parser` |

---

## Environment Variables

| Variable                          | Description                  |
| --------------------------------- | ---------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anonymous API key   |
| `GEMINI_API_KEY`                  | Google Gemini API key (AI summarization & meeting prep) |
| `GROQ_API_KEY`                    | Groq API key (fallback AI provider) |

Set in `.env.local` for development, Netlify dashboard for production.

---

## Project Structure

```
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout (AuthProvider, navigation, PWA meta)
│   ├── page.tsx                # Landing / home page
│   ├── login/                  # Login page
│   ├── auth/                   # OAuth callback & error handling
│   │   ├── callback/
│   │   └── auth-code-error/
│   ├── dashboard/              # Main dashboard with leader cards & filters
│   │   ├── page.tsx
│   │   └── event-summaries/    # Event summary management
│   ├── leaders/                # Leader listing page
│   ├── circle/[id]/            # Individual circle leader detail page
│   ├── add-leader/             # Add new leader form
│   ├── progress/               # Progress Dashboard (aggregate scores, trends, top/low performers)
│   ├── calendar/               # Calendar view (FullCalendar)
│   ├── search/                 # Global search page
│   ├── import/                 # Data import page
│   ├── settings/               # Settings page
│   ├── users/                  # User management
│   ├── ccb/                    # CCB integration scripts
│   ├── ccb-events/             # CCB events UI
│   ├── person-lookup/          # CCB person search with text/call/email actions
│   ├── ccb-explorer/           # Standalone CCB Event Explorer (date range search)
│   ├── func/                   # Function test page
│   ├── help/                   # Help page
│   ├── privacy-policy/         # Privacy policy
│   ├── terms/                  # Terms of service
│   ├── logout/                 # Logout handler
│   └── api/                    # API routes (Next.js Route Handlers)
│       ├── circle-leaders/     # CRUD for circle leaders
│       ├── users/              # User management API
│       │   └── [id]/
│       ├── campuses/           # Campus reference data
│       ├── scorecard/          # Scorecard ratings CRUD (GET/POST/PATCH/DELETE)
│       ├── acpd-tracking/      # ACPD tracking CRUD: prayer, encourage, coach
│       ├── reference-data/     # General reference data
│       ├── ccb/                # CCB proxy endpoints
│       │   ├── events/
│       │   ├── event-attendance/
│       │   ├── event-profile/
│       │   ├── event-profiles/
│       │   ├── person-search/   # CCB individual search (name or phone)
│       │   ├── test-endpoints/
│       │   └── test-groups/
│       ├── ai-summarize/       # AI summarization & meeting prep API (Gemini→Groq fallback)
│       ├── ccb/                # CCB proxy endpoints (continued)
│       │   ├── summarize/      # CCB Explorer AI analysis — 10-section ministry report (Gemini→Groq)
│       │   └── chat/           # CCB Explorer follow-up chat — multi-turn AI conversation
│       ├── debug-users/        # Debug endpoint
│       └── test/               # Test endpoint
│
├── components/                 # Reusable React components
│   ├── layout/                 # App shell components
│   │   ├── AuthenticatedNavigation.tsx
│   │   ├── PublicNavigation.tsx
│   │   ├── MobileNavigation.tsx
│   │   ├── Footer.tsx
│   │   └── GlobalSearch.tsx
│   ├── dashboard/              # Dashboard-specific components
│   │   ├── CircleLeaderCard.tsx
│   │   ├── FilterPanel.tsx
│   │   ├── SearchFilterPanel.tsx
│   │   ├── SimpleCampusFilter.tsx
│   │   ├── ConnectionsProgress.tsx
│   │   ├── LogConnectionModal.tsx
│   │   ├── BulkStatusUpdate.tsx
│   │   ├── FollowUpDateModal.tsx
│   │   ├── ClearFollowUpModal.tsx
│   │   ├── ContactModal-new.tsx
│   │   ├── NoteTemplateModal.tsx
│   │   ├── CircleVisitsDashboard.tsx
│   │   ├── DashboardFilterAdapter.tsx
│   │   └── Navigation.tsx
│   ├── circle/                 # Circle detail page components
│   │   ├── NotesSection.tsx
│   │   ├── QuickActions.tsx
│   │   ├── CircleVisitsSection.tsx
│   │   ├── ScorecardSection.tsx    # 1-5 rating UI for Reach/Connect/Disciple/Develop
│   │   ├── ProgressTimeline.tsx    # Chart.js line chart of scores over time
│   │   └── ACPDTrackingSection.tsx # Pray/Encourage/Coach collapsible accordion sections
│   ├── charts/                 # Data visualization components
│   │   ├── CategoryTrendChart.tsx   # Single-category weekly trend line chart (Chart.js)
│   │   └── CategoryTrendCharts.tsx  # Container: renders 4 trend charts with range selector (4w/8w/12w/All)
│   ├── calendar/               # Calendar components
│   ├── settings/               # Settings components
│   ├── modals/                 # Shared modals
│   │   ├── Modal.tsx
│   │   ├── AlertModal.tsx
│   │   ├── ConfirmModal.tsx
│   │   ├── PasswordModal.tsx
│   │   ├── ConnectPersonModal.tsx
│   │   ├── EventExplorerModal.tsx
│   │   ├── EventSummaryReminderModal.tsx
│   │   └── CircleSummaryModal.tsx  # CCB Explorer AI analysis modal with inline follow-up chat
│   ├── notes/                  # AI-powered note tools
│   │   ├── DictateAndSummarize.tsx  # Voice dictation toolbar + AI summarize with preview/approve UX
│   │   └── MeetingPrepAssistant.tsx # AI meeting prep briefing generator (Big 4 coaching, admin-only)
│   ├── ui/                     # Generic UI primitives
│   │   ├── CCBPersonLookup.tsx  # Reusable CCB person search component (name/phone)
│   │   └── ScrollToTop.tsx
│   ├── ProtectedRoute.tsx      # Auth guard wrapper
│   └── ServiceWorkerUtils.tsx  # PWA service worker helper
│
├── contexts/
│   └── AuthContext.tsx          # Auth state provider (Supabase session)
│
├── hooks/                       # Custom React hooks
│   ├── useSpeechRecognition.ts  # Browser speech-to-text with auto-restart, elapsed timer, reconnection detection
│   ├── useCircleLeaders.ts      # Fetch & manage circle leaders
│   ├── useTodayCircles.ts       # Today's circles filter
│   ├── useNoteTemplates.ts      # Note template management
│   ├── useCircleVisits.ts       # Circle visit CRUD
│   ├── useScorecard.ts          # Scorecard rating CRUD + trend calculations
│   ├── useACPDTracking.ts       # Prayer points, encouragements, coaching notes CRUD
│   ├── useProgressDashboard.ts  # Aggregate dashboard data across all leaders
│   ├── useDashboardFilters.ts   # Dashboard filter state
│   └── useLeaderFilters.ts      # Leader page filter state
│
├── lib/                         # Shared utilities & clients
│   ├── supabase.ts              # Supabase client initialization
│   ├── auth-middleware.ts       # Server-side auth helpers
│   ├── ccb/ccb-client.ts        # CCB API client
│   ├── ccb-types.ts             # CCB TypeScript types
│   ├── dateUtils.ts             # Date formatting helpers
│   ├── timeUtils.ts             # Time utilities
│   ├── frequencyUtils.ts        # Meeting frequency helpers
│   ├── validationUtils.ts       # Form validation
│   ├── todoRecurrence.ts        # Todo repeat/recurrence logic
│   ├── event-summary-utils.ts   # Event summary helpers
│   ├── weeklyTrends.ts           # Weekly trend bucketing (Sun→Sat CST), slope calculation, trend labels
│   ├── evaluationQuestions.ts   # Evaluation question definitions, suggested score calculation
│   └── circleLeaderConstants.ts # Shared constants
│
├── styles/
│   └── globals.css              # Global Tailwind / custom CSS
│
├── middleware.ts                # Next.js Edge middleware (API passthrough)
├── next.config.js               # Next.js configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
├── netlify.toml                 # Netlify build & header config
├── postcss.config.js            # PostCSS config
└── package.json                 # Dependencies & scripts
```

---

## Database Schema (Supabase / PostgreSQL)

### Core Tables

| Table               | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `circle_leaders`    | Primary entity — leader profiles, status, follow-up info, CCB link |
| `users`             | App users (linked to `auth.users`); roles: `ACPD`, `Viewer` |
| `notes`             | Notes attached to circle leaders                  |
| `user_notes`        | Personal notes per user (pinnable)                |
| `connections`       | Connection log entries (linked to leader + type)  |
| `connection_types`  | Reference: connection type definitions            |
| `communications`    | Communication log (type, date, notes)             |
| `circle_visits`     | Scheduled/completed/canceled visit records        |
| `circle_leader_scores` | Progress scorecard ratings (1-5 per dimension) |
| `acpd_prayer_points`   | Prayer points per leader (content, answered status) |
| `acpd_encouragements`  | Encouragement message tracking (sent/planned)    |
| `acpd_coaching_notes`  | Coaching notes by dimension with resolved status  |
| `scorecard_questions`  | Configurable evaluation questions per category (reach/connect/disciple/develop) |
| `leader_category_evaluations` | Per-leader evaluation results by category with optional manual override score |
| `leader_category_answers`     | Per-question Yes/No answers linked to an evaluation, with question_text snapshot |
| `development_prospects`        | People identified for leadership development per circle leader (name, notes, active status) |

### Reference Tables

| Table            | Purpose                        |
| ---------------- | ------------------------------ |
| `campus_list`    | Campus reference data          |
| `campuses`       | Legacy campus values           |
| `acpd_list`      | ACPD reference data            |
| `circle_types`   | Circle type values             |
| `frequencies`    | Meeting frequency values       |
| `statuses`       | Leader status values           |

### Key Relationships

- `circle_leaders.id` → referenced by `notes`, `connections`, `communications`, `circle_visits`, `circle_leader_scores`, `acpd_prayer_points`, `acpd_encouragements`, `acpd_coaching_notes`, `leader_category_evaluations`
- `users.id` → FK to `auth.users(id)`; referenced by `notes`, `communications`
- `connections.connection_type_id` → FK to `connection_types(id)`
- `leader_category_evaluations.id` → referenced by `leader_category_answers`
- `scorecard_questions.(category, question_key)` → unique per category; referenced logically by `leader_category_answers.question_key`
- Row-Level Security (RLS) is enabled across tables

---

## Authentication & Authorization

- **Provider:** Supabase Auth (client-side session via `localStorage`)
- **Methods:** Email/password, Google OAuth (PKCE flow)
- **Roles:** `ACPD` (admin/manager) and `Viewer` (read-focused)
- **Guard:** `<ProtectedRoute>` component wraps authenticated pages
- **Context:** `AuthContext` provides `user`, `signIn`, `signOut`, `isAdmin()` globally
- **Middleware:** Edge middleware is passthrough only (no server-side redirect)

---

## Key Features

1. **Dashboard** — Filterable card grid of circle leaders with status badges, follow-up indicators, and quick actions
2. **Circle Leader Detail** (`/circle/[id]`) — Full profile with notes, connections, visits, and event summaries
3. **Connections Tracking** — Log and view connection history per leader
4. **Circle Visits** — Schedule, complete, and cancel visit records
5. **Event Summaries** — Track event summary submissions with 4-state workflow
6. **Follow-Up Workflow** — Set follow-up dates/notes, mark as required, clear with modal
7. **Notes & Templates** — Rich note system with templates, pinning support
8. **Calendar View** — FullCalendar integration showing meetings and visits
9. **Global Search** — Fuse.js fuzzy search across leaders
10. **CCB Integration** — Pull attendance data, event profiles, and group info from Church Community Builder API
11. **CCB Event Explorer** (`/ccb-explorer`) — Standalone tool to search CCB events by date range and group name, with per-day API fetching, progress indicator, and copy-all-content button
25. **Person Lookup** (`/person-lookup`) — Dedicated CCB person search page accessible from the navigation menu. Search by name or phone, view contact details, and take immediate action via Text (sms:), Call (tel:), or Email (mailto:) buttons. Uses the shared `CCBPersonLookup` component and `/api/ccb/person-search` endpoint.
26. **CCB Person Search** — Reusable search component (`CCBPersonLookup.tsx`) for looking up individuals in CCB by name or phone. Used across ConnectPersonModal, Circle Leader edit form, Add Leader page, and the Person Lookup page. API route: `POST /api/ccb/person-search`. CCB client method: `searchIndividuals()` in `lib/ccb/ccb-client.ts`.
12. **User Management** — Admin can manage users, roles, and campus assignments
12. **Import** — Bulk data import capability
13. **PWA** — Installable, mobile-optimized with service worker caching
14. **Progress Scorecard** — 1-5 rating system for Circle Leaders across four dimensions: Reach, Connect, Disciple, Develop. ACPDs can rate, edit, and delete scores with full CRUD.
15. **Progress Timeline** — Chart.js line chart plotting dimension scores over time with colored lines (blue=Reach, green=Connect, purple=Disciple, orange=Develop)
16. **Progress Dashboard** (`/progress`) — Aggregated view with dimension averages, top/low performers, movers vs stagnant circles, trend indicators, filterable by campus/ACPD/status. Filters (campus, ACPD, status, active tab) persist in `localStorage`.
17. **ACPD Tracking** — Per-leader tracking with collapsible accordion sections (Pray, Encourage, Coach). Pray: prayer points with answered toggle. Encourage: sent/planned message tracking. Coach: growth opportunities by dimension with resolved toggle.19. **Development Prospects** — Track people identified for leadership development inside the Develop scorecard category evaluation. Stores name + notes per prospect with active/inactive toggle. Active prospects are summarized below the Progress Scorecard grid. Adds and edits create system notes in the leader's notes (`created_by: 'System'`). Hook: `useDevelopmentProspects.ts`. Table: `development_prospects`. UI: embedded in `CategoryEvaluation.tsx` (Develop category) + summary in `ScorecardSection.tsx`.18. **Weekly Category Trend Charts** — Chart.js line charts showing per-category (Reach/Connect/Disciple/Develop) score trends bucketed by week (Sun→Sat, CST). Features: configurable time range selector (4w/8w/12w/All), goal line at score 4, week-over-week delta badges, trend slope indicators (↑ rising / → steady / ↓ falling), optional min/max range shading for aggregate views. Displayed on both the Circle Leader Profile page (single leader) and the Progress Dashboard (aggregate across all scored leaders). Evaluation-based scores are synthesized into scorecard ratings for chart rendering when no manual scores exist.
20. **AI Voice Dictation** — Browser-native speech-to-text via Web Speech API (`webkitSpeechRecognition`). Features: visible recording timer with no artificial time cap, auto-restart on silence, reconnection detection. Available in both Circle Leader Notes and Dashboard Personal Notes. Component: `DictateAndSummarize.tsx`, Hook: `useSpeechRecognition.ts`.
21. **AI Note Summarization** — Summarize dictated or typed notes using AI (Gemini primary, Groq fallback). Word-count-aware prompting: brief inputs get concise summaries, brain dumps get thorough multi-paragraph summaries. Preview & approve UX: shows summary card with "Use Summary" (replace), "Keep Both" (append), or "Discard" options. API: `app/api/ai-summarize/route.ts`.
22. **AI Meeting Prep Assistant** — Admin-only feature on Circle Leader detail page. Generates a structured coaching briefing for one-on-one meetings organized around the Big 4 framework (Reach, Connect, Disciple, Develop). Sends leader profile, latest scorecard ratings (1-5), and recent notes to AI. Output includes: Leader Snapshot, per-dimension status/coaching questions/ideas, Conversation Starters, and Watch Items. Can be saved directly as a note. Component: `MeetingPrepAssistant.tsx`.
23. **CCB Explorer AI Analysis** — "Analyze" button (purple, sparkles icon) on the CCB Event Explorer page. Appears once events are loaded. Sends all fetched events (title, date, status, headcount, attendees, topic, notes, prayer requests) to `/api/ccb/summarize`, which generates a 10-section ministry strategist report: (1) Snapshot, (2) Major Spiritual Themes with embedded quotes, (3) Themes by Circle Type, (4) Cultural Indicators with quotes, (5) Prayer Request Categories listing all circles per category, (6) High-Weight Pastoral Moments, (7) Follow-Up Urgency (`Person — Circle — Reason`), (8) Leadership Development, (9) Strategic Recommendations, (10) Executive Summary. Rendered in `CircleSummaryModal` with a custom lightweight markdown renderer (no external library). Includes Copy Summary button. API: `app/api/ccb/summarize/route.ts` (8192 Gemini tokens, 8000 Groq tokens).
24. **CCB Explorer Follow-Up Chat** — Inline chat panel within `CircleSummaryModal`. Available after analysis loads. AI is seeded with the full analysis as system context and responds with specific circle references, names, and quotes. Full conversation history is passed on every turn (2048 tokens/turn, Gemini→Groq fallback). Features: message bubbles (user=blue-right, AI=gray-left), animated 3-dot typing indicator, Enter to send (Shift+Enter for newline), AI replies rendered with the same markdown renderer, Copy conversation button (formats as `You: ...\n\nAI: ...` transcript), Clear button. API: `app/api/ccb/chat/route.ts`. Component: `components/modals/CircleSummaryModal.tsx`.

---

## Scripts

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Start Next.js dev server                         |
| `npm run build`      | Production build                                 |
| `npm run start`      | Start production server                          |
| `npm run lint`       | Run ESLint                                       |
| `npm run version:*`  | Bump version (patch/minor/major)                 |
| `npm run ccb:test`   | Test CCB integration (attendance events)         |
| `npm run ccb:test-notes` | Test CCB with notes                          |
| `npm run ccb:test-full`  | Full CCB test (notes + attendees)            |

---

## Deployment

- **Platform:** Netlify
- **Build Command:** `npm run build`
- **Publish Directory:** `.next`
- **Node Version:** 20.19.0
- **Plugin:** `@netlify/plugin-nextjs`
- **ESLint:** Skipped during builds (`ignoreDuringBuilds: true`)
- **Security Headers:** X-Frame-Options, X-XSS-Protection, X-Content-Type-Options, Referrer-Policy

---

## SQL Migration Files

The project root contains numerous `.sql` and `.js` migration/fix scripts for evolving the database schema. These are run manually or via helper JS scripts and include:

- Table creation: `create_circle_visits_table.sql`, `create_todo_items_table.sql`, `add_user_notes_table.sql`
- Column additions: `add_follow_up_required.sql`, `add_meeting_start_date.sql`, `add_notes_pinned_column.sql`, `add_onboarding_status.sql`, `add_todo_due_date.sql`
- RLS fixes: `fix_rls_security_issues.sql`, `emergency_rls_fix.sql`, `fix_reference_tables_rls.sql`
- Performance: `fix_database_performance.sql`, `essential_indexes.sql`
- Migration runners: `run-migration.js`, `run-todo-migration.js`, `run-circle-visits-migration.js`, etc.
- Progress tracking: `create_circle_leader_scores_table.sql` (scorecard ratings), `create_acpd_tracking_tables.sql` (prayer points, encouragements, coaching notes), `create_scorecard_questions_table.sql` (configurable evaluation questions per category), `create_leader_evaluations_tables.sql` (evaluation results & per-question answers), `create_development_prospects_table.sql` (people being developed)

---

## Known Considerations

- Auth is **client-side only** — Edge middleware does not enforce redirects
- `eslint` is disabled during production builds to avoid blocking deploys
- The database schema uses both `text` columns for reference lookups (e.g., `campus`, `acpd`) and FK-linked reference tables — a legacy pattern
- Several backup/old component variants exist (e.g., `CircleLeaderCard-old.tsx`, `AuthContext.tsx.backup`)
- TypeScript strict mode is off (`strict: false`) but `strictNullChecks` is enabled
- Global CSS (`styles/globals.css`) forces `background-color !important` on all `button` elements — use the `.score-btn` class with CSS custom properties (`--score-bg`, `--score-color`, `--score-border`, `--score-shadow`) to override for buttons needing custom colors
- The `Encouragement`, `PrayerPoint`, and `CoachingNote` TypeScript interfaces in `lib/supabase.ts` must match the actual DB column names (`user_id` not `created_by`, `content` not `opportunity`, `message_type`/`message_date` not `message`/`sent_at`)
- Future planned feature: **Circle Health Assessment** (Mission, Relationship, Transformation, Development) — reserved the "Health" naming for this; current scoring uses "Progress" naming throughout
- **Global CSS aggressively overrides** `bg-white`, `bg-gray-50`, all `button`, `input`, `select`, `textarea`, and text color classes with `!important`. New components should use **inline styles** or **injected `<style>` tags via `createPortal`** to reliably control appearance — Tailwind classes alone will be overridden. The `search-trigger-btn` class pattern (CSS injected into `<head>`) is the recommended workaround.
- `tailwind.config.ts` now includes `darkMode: 'class'` — added to support conditional dark mode styling; the app is always dark-themed via global CSS but this enables `dark:` variants in Tailwind
- **GlobalSearch component** (`components/layout/GlobalSearch.tsx`) uses `createPortal` to render into `document.body` and injects a `<style>` block into `document.head` to override global button/bg styles within the search modal. It features keyboard navigation (↑↓ + Enter), Fuse.js fuzzy search, status dot indicators, and animated entry. The modal uses inline styles heavily to escape the global CSS `!important` overrides.
- **Auth was migrated to passwordless magic link** — email/password login was removed in favor of Supabase magic link authentication. See `PASSWORDLESS_AUTH_MIGRATION.md` for details.
- **AI dual-provider architecture** — The `ai-summarize` API route tries Gemini first, then automatically falls back to Groq on rate limit (429) or error. Both free tiers have rate limits (Gemini: 15 req/min, Groq: 30 req/min). The route accepts a `mode` parameter: omitted or default uses note summarization prompts; `mode: 'meeting-prep'` uses a coaching assistant system prompt with 4096 max tokens. Environment variables `GEMINI_API_KEY` and `GROQ_API_KEY` must be set in Netlify for production.
- **CCB Explorer AI routes use the same dual-provider pattern** — `/api/ccb/summarize` requests 8192 output tokens (Gemini hard cap) and 8000 (Groq). `/api/ccb/chat` requests 2048 tokens per turn. For typical weekly usage (~15–25 circles), the 8192 token ceiling is sufficient. Larger date ranges with 40+ circles may truncate the Executive Summary section; Groq fallback has a much higher output ceiling.
- **`CircleSummaryModal` uses no external markdown library** — all parsing is done inline in a `MarkdownContent` component. Quote detection handles `"`, `“`, `‘`, `> ` prefixes and bullet items beginning with quote characters or `Example:`. Section header regex uses `\d{1,2}` with a ≤50-char title length guard and parenthesis exclusion to avoid false positives on attendance lines like `1. Greg and Danita Moulin's circle (20 attendees)`.
- **Web Speech API is Chrome/Edge only** — `webkitSpeechRecognition` is not supported in Firefox or Safari. The `useSpeechRecognition` hook exposes an `isSupported` flag; the dictation button is hidden when unsupported.
