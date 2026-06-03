# RADIUS & CCB — Assessment for Leadership

**Prepared for:** Valley Creek leadership
**Subject:** How RADIUS relates to Church Community Builder (CCB)
**Date:** June 3, 2026

---

## Bottom line up front

**RADIUS does not replace CCB. It augments it.**

CCB remains the church's official system of record — the place where people, groups, attendance, and giving officially live. RADIUS sits *on top* of CCB and turns that data into a focused tool for one job CCB was never built to do well: **developing and shepherding Circle Leaders.**

Think of it this way:

> **CCB is the database. RADIUS is the coaching workflow built around it.**

Removing CCB would break RADIUS — RADIUS reads its people, groups, and attendance from CCB. Removing RADIUS would not break CCB — but it would take away the layer that makes Circle Leader development visible, proactive, and consistent across ACPDs. The two are designed to run together.

---

## The core distinction

| | **CCB (Church Community Builder)** | **RADIUS** |
|---|---|---|
| **What it is** | Full church management system (ChMS) | Internal Circle Leader development app |
| **Primary job** | Run the church's operations | Coach and track Circle Leaders |
| **Scope** | The whole congregation | The ~Circle Leaders and their ACPDs |
| **Role with data** | **System of record** (source of truth) | **System of engagement** (acts on the truth) |
| **Audience** | Staff, admins, congregation | ACPDs/directors + the leaders themselves |
| **Built by** | Third-party vendor | In-house, tailored to Valley Creek's model |

CCB answers *"who is in our church and what are the facts about them."*
RADIUS answers *"how is each Circle Leader doing, and what should their ACPD do next."*

---

## How they work together

RADIUS treats CCB as the source of truth and pulls from it continuously:

**RADIUS reads from CCB:**
- Individual profiles (names, contact info, birthdays)
- Groups and their rosters / participants
- Attendance records and event occurrences
- Event "summaries" (received / skipped / did not meet)
- Process queues and the public calendar

**RADIUS writes back to CCB — narrowly and on purpose:**
- Notes on individuals
- Attendance records
- Adding/removing people from a group roster

Everything else RADIUS produces — coaching notes, scorecards, follow-up tracking, boards, messages — lives in RADIUS's own database. **CCB stays clean; the development workflow stays out of CCB.** This is deliberate: it keeps the system of record uncluttered while giving ACPDs a workspace of their own.

---

## What RADIUS adds that CCB does not do

These are capabilities CCB was never designed for. They're the reason RADIUS exists:

| Capability | What it does | Why it matters |
|---|---|---|
| **Circle Leader CRM** | A profile per leader with status (invited → onboarding → active → paused → off-boarding), campus, ACPD, and contact info | One screen that answers "how is this leader doing?" |
| **ACPD dashboard** | Campus/status filters + follow-up tracking across a director's whole portfolio | Nothing falls through the cracks |
| **Scorecards** | Structured evaluations of leader development over time | Makes "how is this leader growing?" measurable |
| **Event Summary Tracker** | Surfaces which leaders submitted/skipped their weekly circle report | Turns CCB attendance data into a weekly accountability view |
| **Circle Leader Dashboard (PWA)** | A separate installable app the leaders themselves use — submit weekly summaries, manage their roster, get messages, see resources, receive push notifications | Two-way engagement; leaders aren't just data points |
| **Boards & forms** | Kanban + project boards with checklists and due dates; public intake forms that create cards | Manages the *work* of leadership development, not just the people |
| **AI assist** | Meeting prep, note summarization, dictation, weekly summaries | Cuts the admin time per leader |
| **Messaging + daily emails** | Targeted leader messages with push delivery, plus scheduled daily summary emails to ACPDs | Proactive, not "log in and go look" |
| **Prayer, birthdays, search** | Quick-access shepherding tools built on the same data | Pastoral care, not just record-keeping |

CCB *can* store a note or run a basic report. It cannot run a Circle Leader development program. That gap is exactly what RADIUS fills.

---

## What stays in CCB (and should)

RADIUS intentionally does **not** try to take over:

- Congregation-wide people management
- Online giving and financial records
- Event registration and check-in
- Official attendance of record
- Anything outside the Circle Leader program

Trying to move these into RADIUS would be a mistake — CCB already does them well, the whole church depends on them, and they're outside RADIUS's purpose. The augmentation model keeps each system doing what it's best at.

---

## Dependencies & risks (honest view)

Because RADIUS builds on CCB, leadership should understand the dependency:

- **RADIUS needs CCB's API.** People, groups, and attendance flow in through CCB's XML API. If CCB access were lost or the API changed significantly, the synced parts of RADIUS would degrade until reconnected. (RADIUS's own data — notes, scorecards, boards — would be unaffected.)
- **Data freshness depends on sync.** RADIUS reflects CCB as of its last pull, not live to the second. This is fine for coaching workflows but worth knowing.
- **CCB stays primary.** Any decision about church-wide data should be made in CCB terms; RADIUS follows it, not the other way around.

None of these are reasons to avoid RADIUS — they're the normal trade-offs of a tool that *augments* a system of record rather than duplicating it.

---

## Recommendation

**Keep both. Run them together as designed.**

- **CCB** = the system of record. Authoritative, church-wide, vendor-maintained.
- **RADIUS** = the development layer. Focused, in-house, built around the exact way Valley Creek coaches Circle Leaders.

The right mental model for leadership is not *"CCB or RADIUS"* — it's *"CCB, plus RADIUS to make the Circle Leader program actually work."* The investment in RADIUS pays off precisely because it leans on CCB instead of trying to recreate it.
