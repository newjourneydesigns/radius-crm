# Student Leader Toolkit — Spec (WIP)

A toolkit for student-ministry leaders, mirroring the **Teams Toolkit**
(`app/teams-toolkit/`) and **Circle Leader Toolkit** patterns, but adapted to the
fact that **students do not use CCB groups/circles** for rosters or attendance.

## Current student model (context)
- No CCB groups. Students check into a **general Wednesday event**; table
  assignments are flexible and change week to week.
- Leaders run their own **GroupMe** groups; student directors help assign
  students to tables and leaders add students to GroupMe manually.
- Because attendance isn't tied to a persistent CCB circle, the Teams/Circle
  attendance model (group-based) does **not** map directly.

## Must-haves

1. **Student Leader Toolkit app** — fork of Teams Toolkit pattern.
   - Uses the **VCC White** logo (not the Circles logo).
   - Keep the **splash page** idea.
   - New **OG image** matching the Circle toolkit's, with the new logo.
2. **Homepage with message center.**
3. **Message Inbox + push notifications** (reuse Web Push / VAPID).
4. **Resources Page** (new — no direct equivalent in existing toolkits yet).
5. **Simple roster / visibility** showing each student's **last attended date**.
6. **Import students into RADIUS** via GroupMe → CCB → roster:
   - Pull the leader's GroupMe group member list (GroupMe API).
   - Match each member to a **CCB v2 individual** (search-by-name, human-confirmed
     — GroupMe exposes only nicknames, not phone/email).
   - Persist the chosen `ccb_individual_id` to a new `student_roster` table as the
     durable join key (no CCB group exists to source it).
7. **Weekly attendance check** — for each rostered student, look up check-ins to
   the **Wednesday students event** via CCB v2
   (`getGroupAttendanceInRange`) to drive "last attended date."

## Open decisions (blocking the import build)
- **GroupMe auth model:** single admin/service account added to every leader
  group (recommended — one token) vs. per-leader OAuth.
- **CCB Wednesday "Students" event/group id** that represents check-in.
- Toolkit as its own host/manifest (like teams-toolkit) vs. a mode within Teams
  Toolkit. (Leaning: its own fork.)

## Reuse map (Teams Toolkit → Student)
| Need | Existing pattern |
|---|---|
| Home + message center | `app/teams-toolkit/[categoryId]/` + messages API |
| Inbox + push | `app/teams-toolkit/[categoryId]/inbox` + Web Push (VAPID) |
| Roster | `app/teams-toolkit/[categoryId]/roster` + `lib/teams-toolkit/roster-data.ts` |
| Person profile | `app/teams-toolkit/[categoryId]/people/[personId]` |
| Person search | `app/teams-toolkit/[categoryId]/TeamPersonSearch.tsx` |
| Auth (magic link / code) | `app/api/teams-toolkit/auth/*` |
| CCB attendance | `lib/ccb/ccb-v2-client.ts` `getGroupAttendanceInRange` |

## Known technical constraint
GroupMe's `GET /groups/:id` returns members as `{ user_id, nickname, image_url,
roles }` — **no phone or email**. So GroupMe→CCB cannot auto-join on a reliable
key; a one-time human-confirmed match per student is required, after which the
stored `ccb_individual_id` is the source of truth.
