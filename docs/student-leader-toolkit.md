# Student Leader Toolkit — Spec

A toolkit for student-ministry leaders. Third fork of the leader-portal pattern,
after the **Circle Leader Toolkit** (`app/circle-leader-toolkit/`) and the
**Teams Toolkit** (`app/teams-toolkit/`).

## Why it exists

The Circle Leader Toolkit is in beta with adult circle leaders and rolls out
broadly at Circle Leader One Night in October. The condition on that rollout is
that student circle leaders launch alongside it, not after.

## Decision log

- **2026-06-22 — GroupMe integration dropped.** Earlier drafts pulled leader
  GroupMe rosters via the GroupMe API to seed the roster. Scrapped: communication
  stays in GroupMe and RADIUS doesn't track it. The GroupMe client/scripts/env
  were removed. **Still true.**
- **2026-06-22 — Roster + attendance deferred.** With no GroupMe import and — as
  understood then — no persistent CCB group behind a student circle, there was no
  durable source for "which students belong to which leader." **Superseded, see
  below.** This deferral is why the toolkit stalled: what was left only pushed
  information down, which the student coaches dashboard already did, so there was
  no reason for a leader to open it.
- **2026-08-31 — The premise was wrong; roster is back and is the point.**
  Students *are* checked into CCB groups each week. Staff map those groups per
  campus and term in an admin screen (`student_ministry_groups`), and a nightly
  sync fills the directory and attendance caches. Stakeholders were unanimous
  that the roster is what gives a leader a reason to return: opening the app to
  see that a student hasn't been to circle in 41 days, and going after them.
- **2026-08-31 — Content reuses the `audience` discriminator.** `'student'` joins
  `'circle'` and `'host_team'` on `circle_summary_messages`,
  `circle_summary_inbox_messages`, `circle_leader_resources`,
  `circle_leader_resource_pages` and `leader_pro_tips`, so staff compose in the
  Message Center / Leader Messages / Resources screens they already know.
  `student_messages` is retired unused.
- **2026-08-31 — Identity stays decoupled.** Student leaders keep their own
  `student_leaders` table, `student_sessions`, and the `radius_student_session`
  cookie. Unlike team leaders — who are `circle_leaders` rows and so reuse the
  circle session module — a student session must never satisfy the circle or
  teams host.

## Scope

**September beta (one campus):** roster, home (message center), inbox with web
push and read receipts, resources.

**Before October:** onboarding wizard, branding (VCC White logo, splash, OG
image), calendar block on home, optionally a student-director roll-up across a
campus's rosters.

## Hard constraints

- **Pull-only from CCB.** The adult roster's add/remove writes back to CCB
  (`app/api/circle-leader-toolkit/roster/{add,remove}/route.ts`). The student
  roster must not — a leader's roster is a private list in Supabase.
- **Minors: no contact information.** The roster shows first name, last name,
  birthday, and two attendance dates. No phone, email, or address, and no
  call/text buttons — a deliberate departure from the adult roster, which leads
  with them. This is enforced structurally: `student_directory_cache` has no
  column to put contact information in, and the sync drops those fields before
  the upsert. Leaders reach students through GroupMe, outside the app.
- **Roster is leader-curated.** A leader picks their ~10 students from the union
  of their campus's mapped groups. A student in the movement group but not the
  circle group is exactly who a leader most wants on the list, so the candidate
  search spans both.
- **Candidate search is campus-scoped**, against `student_directory_cache` — not
  CCB's global `searchIndividuals`, which the adult roster uses. A volunteer
  student leader has no business searching the whole church directory.
- **Term-aware.** Student CCB groups are rebuilt every semester. Group config,
  directory rows, roster membership and attendance all carry a term. The active
  term follows what staff have configured, not the calendar — a hardcoded
  August flip would silently empty every roster on a date nobody chose.
- **Nightly sync, never per-request.** Unlike `loadLeaderAttendance`, which falls
  through to live CCB when its cache is stale, the student read path is
  cache-only. A room of leaders opening the app on a Wednesday night must not
  stampede CCB, which enforces a shared daily budget.
- **Feature-flagged off** via `NEXT_PUBLIC_STUDENT_TOOLKIT_ENABLED`.

## Attendance pipeline

Two dates per student: last at their **circle**, last at the **movement** (the
main student gathering).

`lib/student-toolkit/attendance-sync.ts` walks the active rows in
`student_ministry_groups` and, per group, calls two CCB v2 methods that had no
caller before this feature:

- `getGroupParticipants(groupId)` — names and birthdays inline. v1 needs a
  profile call per person, the N+1 that makes `/api/ccb/group-roster` time out
  past ~18 people.
- `getGroupAttendanceInRange(groupId, start, end)` — one call per group,
  replacing v1's global `attendance_profiles` blob.

Roughly 2 calls per mapped group per night — negligible against the ~9500/day
budget in `lib/ccb/ccb-api-gateway.ts`.

The fold rule is ported from `computeLastAttended` in
`lib/circle-leader-toolkit/roster-data.ts`: a did-not-meet occurrence counts for
nobody, and an attendee marked `absent`/`no` didn't attend.

> **Unverified upstream shape.** `getGroupAttendanceInRange`'s attendee mapper
> (`mapAttendees`, `lib/ccb/ccb-v2-client.ts:920`) reads a `people_information`
> key that has never been checked against a live v2 response. If it's wrong,
> every occurrence parses and every attendee list comes back empty — the roster
> would confidently report that nobody has ever attended. The sync guards this:
> occurrences with zero attendees across the board is treated as a mapping
> failure and recorded on `student_ministry_groups.last_sync_error` rather than
> written to the cache. **Confirm the shape against a real student group before
> trusting the dates.**

## Degrading before group IDs are configured

This is the day-one state, and it's expected — student ministry is still
tracking the group IDs down. With no `student_ministry_groups` rows the sync
no-ops, the directory stays empty, and the roster reports that attendance isn't
connected rather than rendering a silent blank. Wiring the IDs in later is a
config change in the admin screen, not a deploy.

## Reuse map

| Need | Existing pattern |
|---|---|
| Host routing | `rewriteToolkitHost()` in `middleware.ts` — already generic |
| Session crypto | `lib/leader-tokens.ts` (not `SESSION_COOKIE_NAME`) |
| Resources admin | `components/admin/LeaderResourcesAdmin.tsx`, already audience-driven |
| Inbox / message composer | `app/leader-messages/`, `app/admin/message-center/` via `audience` |
| Push | `lib/circle-leader-toolkit/push.ts` — the Teams Toolkit has none, so this is a port, not a copy |
| Service worker | `public/sw.js`, already generic over push payloads |
| Import screen | `app/import-team/page.tsx` |
| Age gate | `lib/messaging/minorGuard.ts` |
