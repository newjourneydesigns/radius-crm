# RADIUS CRM — Project Context

> **Version:** 1.1.2  
> **Repository:** `newjourneydesigns/radius-crm` (branch: `main`)  
> **Last Updated:** 2026-02-07

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
| **Auth**         | Supabase Auth (email/password + Google OAuth, PKCE flow) |
| **Calendar**     | FullCalendar v6                                 |
| **Search**       | Fuse.js (client-side fuzzy search)              |
| **Deployment**   | Netlify (with `@netlify/plugin-nextjs`)         |
| **PWA**          | next-pwa                                        |
| **Node**         | >= 20.19.0                                      |
| **External API** | CCB (Church Community Builder) — XML-based API via `axios` + `fast-xml-parser` |

---

## Environment Variables

| Variable                          | Description                  |
| --------------------------------- | ---------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anonymous API key   |

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
│   ├── calendar/               # Calendar view (FullCalendar)
│   ├── search/                 # Global search page
│   ├── import/                 # Data import page
│   ├── settings/               # Settings page
│   ├── users/                  # User management
│   ├── ccb/                    # CCB integration scripts
│   ├── ccb-events/             # CCB events UI
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
│       ├── reference-data/     # General reference data
│       ├── ccb/                # CCB proxy endpoints
│       │   ├── events/
│       │   ├── event-attendance/
│       │   ├── event-profile/
│       │   ├── event-profiles/
│       │   ├── test-endpoints/
│       │   └── test-groups/
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
│   │   └── CircleVisitsSection.tsx
│   ├── calendar/               # Calendar components
│   ├── settings/               # Settings components
│   ├── modals/                 # Shared modals
│   │   ├── Modal.tsx
│   │   ├── AlertModal.tsx
│   │   ├── ConfirmModal.tsx
│   │   ├── PasswordModal.tsx
│   │   ├── ConnectPersonModal.tsx
│   │   ├── EventExplorerModal.tsx
│   │   └── EventSummaryReminderModal.tsx
│   ├── ui/                     # Generic UI primitives
│   │   └── ScrollToTop.tsx
│   ├── ProtectedRoute.tsx      # Auth guard wrapper
│   └── ServiceWorkerUtils.tsx  # PWA service worker helper
│
├── contexts/
│   └── AuthContext.tsx          # Auth state provider (Supabase session)
│
├── hooks/                       # Custom React hooks
│   ├── useCircleLeaders.ts      # Fetch & manage circle leaders
│   ├── useTodayCircles.ts       # Today's circles filter
│   ├── useNoteTemplates.ts      # Note template management
│   ├── useCircleVisits.ts       # Circle visit CRUD
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

- `circle_leaders.id` → referenced by `notes`, `connections`, `communications`, `circle_visits`
- `users.id` → FK to `auth.users(id)`; referenced by `notes`, `communications`
- `connections.connection_type_id` → FK to `connection_types(id)`
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
11. **User Management** — Admin can manage users, roles, and campus assignments
12. **Import** — Bulk data import capability
13. **PWA** — Installable, mobile-optimized with service worker caching

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

---

## Known Considerations

- Auth is **client-side only** — Edge middleware does not enforce redirects
- `eslint` is disabled during production builds to avoid blocking deploys
- The database schema uses both `text` columns for reference lookups (e.g., `campus`, `acpd`) and FK-linked reference tables — a legacy pattern
- Several backup/old component variants exist (e.g., `CircleLeaderCard-old.tsx`, `AuthContext.tsx.backup`)
- TypeScript strict mode is off (`strict: false`) but `strictNullChecks` is enabled
