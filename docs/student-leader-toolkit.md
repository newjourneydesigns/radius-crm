# Student Leader Toolkit — Spec (WIP)

A toolkit for student-ministry leaders, mirroring the **Teams Toolkit**
(`app/teams-toolkit/`) and **Circle Leader Toolkit** patterns, but adapted to the
fact that **students do not use CCB groups/circles** for rosters or attendance.

## Current student model (context)
- No CCB groups. Students check into a **general Wednesday event**; table
  assignments are flexible and change week to week.
- Leaders run their own **GroupMe** groups for communication. **GroupMe stays
  entirely outside RADIUS** — all messaging lives in GroupMe and the app does not
  read, sync, or mirror it.
- Because attendance isn't tied to a persistent CCB circle, the Teams/Circle
  attendance model (group-based) does **not** map directly.

## Decision log
- **2026-06-22 — GroupMe integration dropped.** Earlier drafts pulled leader
  GroupMe rosters via the GroupMe API to seed the roster. Scrapped: communication
  stays in GroupMe and RADIUS doesn't track it. The GroupMe client/scripts/env
  were removed.
- **2026-06-22 — Roster + attendance deferred.** With no GroupMe import and no
  persistent CCB roster, there's no durable source for "which students belong to
  which leader." Shipping the toolkit without the roster/attendance features for
  now; revisit the roster source later (likely manual CCB person search, reusing
  the Teams Toolkit pattern).

## Must-haves (current scope)

1. **Student Leader Toolkit app** — fork of Teams Toolkit pattern.
   - Uses the **VCC White** logo (not the Circles logo).
   - Keep the **splash page** idea.
   - New **OG image** matching the Circle toolkit's, with the new logo.
2. **Homepage with message center.**
3. **Message Inbox + push notifications** (reuse Web Push / VAPID).
4. **Resources Page** (new — no direct equivalent in existing toolkits yet).

## Deferred (not in current scope)
- **Roster / "last attended date" visibility.** Needs a per-leader roster source
  we don't have yet without GroupMe. Revisit with manual CCB person search.
- **Weekly attendance check** via CCB v2 (`getGroupAttendanceInRange`) against the
  Wednesday students event — depends on a roster existing.
- **GroupMe import** — dropped entirely (see decision log).

## Open decisions
- Toolkit as its own host/manifest (like teams-toolkit) vs. a mode within Teams
  Toolkit. (Leaning: its own fork.)
- When roster comes back: confirm the CCB Wednesday "Students" event/group id that
  represents check-in.

## Reuse map (Teams Toolkit → Student)
| Need | Existing pattern |
|---|---|
| Home + message center | `app/teams-toolkit/[categoryId]/` + messages API |
| Inbox + push | `app/teams-toolkit/[categoryId]/inbox` + Web Push (VAPID) |
| Auth (magic link / code) | `app/api/teams-toolkit/auth/*` |
| Person search (for future roster) | `app/teams-toolkit/[categoryId]/TeamPersonSearch.tsx` |
| CCB attendance (for future roster) | `lib/ccb/ccb-v2-client.ts` `getGroupAttendanceInRange` |
