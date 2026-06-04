# RADIUS — Detailed Feature List

**Companion to:** RADIUS & CCB Assessment
**Date:** June 3, 2026
**Purpose:** A complete inventory of what RADIUS does today, organized by area.

> RADIUS is actually **two connected apps**:
> 1. **The ACPD / Admin app** — used by directors and coaches to track and develop Circle Leaders.
> 2. **The Circle Leader Toolkit** — a separate installable app the leaders themselves use to submit weekly summaries, manage their roster, and stay connected.
>
> Both run on the same data and both build on top of CCB (see the Assessment doc).

---

## 1. Core navigation & app shell

- **Today page** — the daily home screen for ACPDs: a focused view of what needs attention right now.
- **Global search** — fast, fuzzy search across Circle Leaders from anywhere in the app.
- **Quick Actions button** — a floating shortcut menu for common actions (add a note, log a connection, set a follow-up).
- **Mobile-first navigation** — bottom tab bar on phones (Today, Circle List, Boards, Events, Notebook, Prayer), full nav on desktop.
- **Update Log** — an in-app changelog so users can see what's new (200+ tracked changes to date).
- **Help & Support** — in-app help, plus links to terms, privacy, and a feedback form.
- **Role-based access** — ACPDs/directors get full admin; everyone else gets a read-focused view.

---

## 2. Today page

- **Big 3 priorities** — surfaces a director's top priority cards, sorted by due date with the soonest at top.
- **Today's circles** — which circles are meeting today and their status at a glance.
- **Follow-ups due** — leaders who need a touch today.
- **Quick completion** — finishing a priority from the Today page routes the underlying board card to the right place automatically.

---

## 3. Circle Leader CRM (the core)

### Circle List / Dashboard
- **Leader directory** — every Circle Leader as a card with status, campus, ACPD, and contact info.
- **Filters** — by campus, status, ACPD, and more; filters persist as you work.
- **Status pipeline** — invited → onboarding → active → paused → off-boarding → archived, each with a colored badge.
- **Bulk status update** — change status on many leaders at once ("Mass Update").
- **Export** — pull the filtered list out to a file.

### Circle Leader profile
- **Profile tabs** — Profile / Notes / Scorecard / Care.
- **Circle info** — campus, ACPD, meeting details, CCB group link, optional CCB group-name override.
- **Contact actions** — call / text / email a leader (and co-leader) directly from the profile.
- **Quick actions** — log a connection, add a note, set a follow-up without leaving the page.
- **ACPD tracking** — record and review director touchpoints with the leader.
- **Attendance trends** — a chart of the circle's attendance over time, pulled from CCB.
- **Check-in cadence** — visualizes how regularly the leader is being connected with.
- **Progress timeline** — a chronological view of the leader's development.
- **Suggested next steps** — recommended actions based on the leader's current state.
- **Link to Circle Leader Toolkit** — jump to the leader-facing app for that person.

---

## 4. Follow-ups & connections

- **Set follow-up** — schedule a future touchpoint for a leader, with optional date *and* time of day.
- **Follow-up table** — a sortable view of all upcoming/overdue follow-ups.
- **Clear / complete follow-up** — mark a follow-up done.
- **Log connection** — record a contact you've had with a leader (call, text, meeting).
- **Connections progress** — track how consistently leaders are being connected with.
- **Quick connection** — a one-tap logging flow.

---

## 5. Notes

- **Per-leader notes** — timestamped notes on each leader's profile.
- **Note templates** — reusable note formats; managed in Settings.
- **Public vs. private notes** — a notes section that distinguishes shared from private.
- **AI note summarization** — condense long notes into a summary.
- **Dictation** — speak notes instead of typing (speech-to-text).
- **CCB note write-back** — notes can be pushed to the individual's record in CCB.

---

## 6. Scorecards & leader development

- **Scorecard evaluations** — structured assessments of a leader across categories.
- **Category evaluation** — score and comment per development category.
- **Scorecard trend chart** — track a leader's scores over time.
- **Score history** — full history of past evaluations.
- **Configurable questions** — admins define the scorecard questions ("Scorecard Questions" manager).

---

## 7. Progress dashboard

- **Program-wide progress view** — roll-up of leader development across the whole portfolio.
- **Development prospects** — surfaces leaders who are candidates for next steps.
- **Event-summary progress** — how the program is doing on weekly summary submissions.

---

## 8. Boards (Kanban)

- **Boards** — columns + cards with drag-and-drop.
- **Card checklists** — sub-tasks inside a card.
- **Linked leaders** — attach Circle Leaders to a card.
- **Due dates** — per card, with overdue surfacing.
- **Snooze** — one click pushes a card's due date to the next business day (Mon–Thu).
- **List rules / auto-routing** — completing a card moves it to the correct column automatically.
- **Board calendar** — a calendar view of cards with due dates.
- **Calendar feed (ICS)** — subscribe to board due dates from an external calendar app.
- **Add to board** — drop a leader or item onto a board from elsewhere in the app.

---

## 9. Project boards

- **Projects** — a separate project-board surface for longer-running initiatives (distinct from the Circle Leader boards).

---

## 10. Public intake Forms → cards (newest feature)

- **Form builder** — build a public form and map its fields to a card's title, description, priority, due date, and assignee.
- **Public link** — share a `/f/your-form` link anyone can fill out **without logging in**.
- **Auto card creation** — each submission creates a card in the column you choose.
- **Submission review** — see every submission, jump to the card it created, search submissions.
- **CSV export** — export all submissions.

---

## 11. Calendar & circle visits

- **Visit calendar** — schedule and track circle visits.
- **CCB events view** — see circle meeting events sourced from CCB.
- **Attendance trends** — turnout over time, per circle and across the program.

---

## 12. Event Summary Tracker

- **Weekly summary tracking** — which leaders submitted their weekly circle report vs. skipped vs. "did not meet" — sourced from CCB.
- **Bulk review** — process many event summaries at once.
- **Sync** — pull the latest event/attendance data from CCB on demand.
- **Snapshots** — historical record of summary states.
- **Follow-up & reminder modals** — act on a missing summary (nudge the leader or set a follow-up).
- **Timezone-correct week matching** — meetings late on the last night of a week are matched to the correct week.

---

## 13. CCB tools (admin)

- **CCB Explorer** — browse CCB data (groups, events, individuals) from inside RADIUS.
- **CCB Usage dashboard** — monitor API usage, rate limits, and daily status/alerts (RADIUS tracks its own CCB API consumption).
- **Person Lookup** — search CCB individuals and view profiles.
- **Import Circles** — pull circles/groups from CCB into RADIUS.
- **Event discovery & profiles** — find and inspect CCB events and their attendance.

---

## 14. Circle Leader Toolkit (the leader-facing app)

A separate, installable PWA used by the Circle Leaders themselves.

### Access
- **Passwordless sign-in** — leaders sign in with a one-time code (request code → verify), no password.
- **Magic-link / admin link** — admins can generate access links.
- **Sessions** — leaders can see and revoke their active sessions.

### Events tab
- **Weekly summary submission** — leaders submit a summary for each circle meeting.
- **Dynamic questions** — the summary form's questions are configurable by admins.
- **Attendance marking** — mark who was present; writes attendance back to CCB.
- **Draft saving** — start a summary and finish later.
- **Edit & resubmit** — revise a submitted summary without wiping prior attendance.
- **Per-event turnout** — each meeting shows attendance count next to "Summary on file."

### Roster tab
- **Circle roster** — the leader's current CCB roster, with contact lines (phone, email, birthday).
- **Add / remove members** — manage roster membership (writes back to CCB).
- **Member search & profiles** — search people and view profiles.
- **Attendance context** — "last attended" tags and absent-member surfacing.
- **Absence alerts + snooze** — "hasn't attended" alerts you can snooze for 7 days (or all at once), with a quick "remove from roster" option.

### Resources tab
- **Leader resources** — curated resources/links pushed to leaders (admin-managed).

### Inbox tab
- **Messages inbox** — leaders receive messages from ACPDs/staff here.
- **Smart badges** — unread counts only show when there's actually something to see.

### Notifications & settings
- **Push notifications** — for new messages and summary reminders.
- **Notification settings** — granular preference toggles.
- **Summary reminders** — automated nudges to submit the weekly summary.
- **Help & Guide** — step-by-step in-app instructions for everything in the leader app.

---

## 15. Messaging

- **Leader Messages** — send targeted messages to leaders, with a recipient preview showing who gets a **push** vs. **in-app only**, filtering, counts, and a "nudge to enable push" action.
- **Bulk Message** — message many leaders at once; "Add Circle Roster" pulls everyone on a circle's current CCB roster as recipients in one click.
- **Message Center (admin)** — manage and review outbound messaging.
- **Circle Summary inbox/messages (admin)** — the staff side of the leader inbox.

---

## 16. Prayer

- **Prayer page** — pray for Circle Leaders, one tap to log a prayer.
- **A–Z quick-jump rail** — tap or drag a letter to jump to a leader.
- **Answered prayers** — mark a prayer answered; optionally save it as a note on the leader's profile.
- **Contact from prayer** — call/text a leader (and co-leader) directly.
- **Prayer session logging** — tracked prayer sessions.

---

## 17. Birthday list

- **Birthdays** — upcoming leader/member birthdays, sourced from CCB.
- **Backfill** — admin tool to backfill birthday data from CCB.

---

## 18. Notebook

- **Notebook** — a personal multi-page workspace for ACPDs.
- **Pages** — individual notebook pages with their own content.
- **AI checklist suggestions** — AI proposes checklist items for a page.

---

## 19. AI features

- **AI meeting prep** — generate prep for a leader meeting.
- **Note summarization** — condense notes into summaries.
- **Dictation** — speech-to-text for notes and summaries.
- **Weekly AI summary** — an AI-generated weekly roll-up.
- **AI assistant / chat** — ask questions about the data (including a CCB-aware chat).
- **Model strategy** — Gemini 2.0 Flash primary, Groq (Llama 3.3) fallback; all routed through a central AI endpoint.

---

## 20. Email & automation

- **Daily summary email** — a scheduled digest emailed to ACPDs (via Netlify cron).
- **Subscriptions** — control who receives the daily summary.
- **Automated summary reminders** — scheduled nudges to leaders to submit summaries.
- **Auto-update summaries** — background sync of event-summary state from CCB.

---

## 21. Admin tools

- **Manage Users** — create/manage users, set roles, verify emails, reset passwords, resend access.
- **Dynamic Questions** — configure the Circle Summary form questions.
- **Circle Leader Resources** — manage the resources shown to leaders.
- **Submission Log** — audit log of form/summary submissions.
- **Info Update Requests** — handle leader-submitted info-change requests.
- **Reference data & campuses** — manage campuses and other reference lists.
- **Reminder templates** — manage the templates used for reminders.

---

## 22. Settings & profile

- **Profile** — the user's own profile and preferences.
- **Settings** — app management, including:
  - **Note templates manager**
  - **Scorecard questions manager**
  - **Haptic feedback** toggle + a "Test buzz" button
  - **Notification preferences**
- **Test email** — send a test of the daily summary to yourself.

---

## 23. Platform / PWA

- **Installable PWA** — add to home screen on phone or desktop.
- **Offline-capable** — service worker enabled.
- **Haptic feedback** — tactile taps on buttons, nav, toggles; a stronger buzz on completing a checklist item (Android + iOS 17.4+ in Safari; no-op on desktop).
- **Push notifications** — for messages and reminders.
- **Branded loading screens** — steady, branded splash with pulsing rings.
- **Valley Creek green** theming throughout.

---

## 24. Authentication & security

- **Passwordless magic-link** sign-in (admin app).
- **One-time code** sign-in (leader app).
- **Supabase Row-Level Security** — data access enforced at the database layer.
- **Role model** — `ACPD` = admin; anything else = viewer.
- **Server-side secrets** — service-role keys and external credentials never reach the client.

---

## At a glance

| Area | Count |
|---|---|
| App pages / routes | ~30 |
| API endpoints | ~90 |
| Custom data hooks | ~22 |
| Component areas | 18 |
| Tracked changes (changelog) | 200+ |

Two app surfaces (ACPD admin + Circle Leader Toolkit), one shared data layer, all built on top of CCB.
