# Port the Campaigns feature from RADIUS into VC Pulse

**Read this whole document before writing code.** You have read access to
`newjourneydesigns/radius-crm` (the RADIUS repo). Every file path below is a real
path in that repo — open the actual source rather than working from the summaries
here. The summaries exist to tell you *what matters* in each file and *what has to
change*; the code itself is the spec.

---

## 1. What you're building

RADIUS has a feature called **Follow-Up Campaigns**. An admin points a campaign at
one or more CCB groups (who was *invited*) plus a CCB form (who actually
*submitted*), and the app reconciles the two lists so you can see exactly who
hasn't responded and text them in bulk.

The whole loop:

```
CCB group(s)  ──┐
                ├─► reconcile ─► per-person status ─► bulk follow-up text ─► mark contacted
CCB form      ──┘                     │
                                      └─► (optional) CCB event check-ins ─► attended
pasted roster ──┘
```

Recreate it in VC Pulse so it works **identically**, against the **same Supabase
tables**, with the **same CCB integration**.

---

## 2. Non-negotiable constraints

Read these first — they shape every decision downstream.

### 2.1 Shared database, shared tables — do NOT create new tables

VC Pulse and RADIUS point at the **same Supabase project**. Campaigns already live
in two tables that already exist:

- `follow_up_campaigns` — one row per campaign
- `follow_up_campaign_people` — one row per person per campaign

**Do not write migrations for these tables. Do not rename them. Do not add columns.**
A campaign created in Pulse must show up in RADIUS and vice versa, fully editable
from both sides. If a column looks missing, it isn't — read every migration listed
in §4 before concluding anything about the schema.

The one thing you may need to verify (not create): both tables have RLS enabled with
a `SELECT` policy for `authenticated`, and **no** write policies. All writes go
through server routes using the service-role key. Keep that model.

### 2.2 Don't break RADIUS

Both apps hit the same rows. That means:

- Preserve the exact `reconcile_status` vocabulary and its CHECK constraint values.
- Preserve the sticky-invite, off-boarding, and fuzzy-match-resolution semantics
  described in §5. If Pulse writes rows that violate those rules, RADIUS's reconcile
  will fight it on the next run and counts will oscillate.
- Cached count columns on `follow_up_campaigns` (`submitted_count`, `missing_count`,
  …) must be recomputed the same way after every mutation — see §6.

### 2.3 Auth is the one place you deliberately diverge

RADIUS gates every campaign **write** on `users.role === 'ACPD'` and every **read**
on "signed in at all." Pulse has its own user base and its own role model.

Keep the *shape*, swap the *check*:

| RADIUS | Pulse |
|---|---|
| `getUserFromAuthHeader(req)` → 401 if no user | Pulse's equivalent session/JWT check → 401 |
| `users.role === 'ACPD'` → else 403 | **Pulse's own admin check** → else 403 |
| Reads open to any authenticated user | Same — any authenticated Pulse user |

Every route in `app/api/campaigns/**` defines a local `requireAdmin(req)` helper with
this shape:

```ts
async function requireAdmin(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  // ← RADIUS checks users.role === 'ACPD' here. Replace this line with Pulse's admin check.
  return { user, response: null };
}
```

Write **one** shared `requireCampaignAdmin()` helper in Pulse and use it everywhere,
rather than copy-pasting the helper into ten route files the way RADIUS does. That's
the one structural improvement worth making during the port.

Note: `created_by` and `contacted_by` on these tables are `UUID REFERENCES users(id)`.
If Pulse users are **not** rows in that same `users` table, writing a Pulse user id
there will violate the FK. Check this early. If they aren't, write `null` for those
columns from Pulse and surface the actor some other way (or ask Trip before adding a
column — that's a schema change and needs his sign-off).

### 2.4 Styling is yours

Pulse is Next.js App Router + Supabase like RADIUS, but has its own design system.
**Port the logic verbatim; rewrite the presentation.** RADIUS's campaign UI is
hardcoded dark-mode Tailwind (`bg-zinc-900/40`, `text-slate-400`, `border-zinc-800`,
`focus:ring-indigo-500`). Don't carry those classes over. Carry over the *structure*:
which stat cards exist, which tabs exist, what each filter does, what each modal
contains. §7 enumerates all of it so you don't have to reverse-engineer intent from
class names.

---

## 3. File manifest — what to read, in order

### Core logic (port nearly verbatim)

| File | Lines | What it is |
|---|---|---|
| `lib/campaigns/reconcile.ts` | 281 | **The heart of the feature.** Matching algorithm + count math. Copy this file with essentially no changes. |
| `lib/campaigns/parseRoster.ts` | 254 | Pasted-spreadsheet parser: delimiter detection, header detection, column mapping, dedupe. Pure functions, zero deps. Copy verbatim. |
| `lib/campaigns/fetchAllRows.ts` | 24 | Pagination helper around PostgREST's 1000-row cap. Copy verbatim. **Use it everywhere** — campaigns routinely exceed 1000 people. |
| `lib/campaigns/campus.ts` | 29 | Guesses campus from a CCB group name (`LVT` → Lewisville, etc.). Copy verbatim; confirm the prefix map matches what Pulse expects. |
| `lib/campaigns/ccbFormUrl.ts` | 15 | Derives the public CCB form URL from a form ID. Server-side only (reads `CCB_SUBDOMAIN`). Copy verbatim — including the `valleycreek` → `valleycreekchurch` normalization, which fixes a real broken-link bug. |
| `lib/campaigns/event-attendance-flag.ts` | 15 | Feature flag for the event-attendance sub-feature. See §9. |

### API routes (port the logic, swap the auth)

All under `app/api/campaigns/`:

| Route | Lines | Purpose |
|---|---|---|
| `route.ts` | 196 | `GET` list (`?archived=true`), `POST` create (accepts CCB group ids **or** a pasted roster) |
| `[id]/route.ts` | 119 | `GET` one, `PATCH` update/archive/restore/favorite, `DELETE` hard-delete |
| `[id]/reconcile/route.ts` | **535** | **The big one.** Pulls CCB, reconciles, upserts, recomputes counts. Read this line by line — §5 walks it. |
| `[id]/attendance/route.ts` | 140 | Pulls CCB event check-ins, flags `attended`. Split out of reconcile because it's slow. |
| `[id]/people/route.ts` | 166 | `GET` people (optional `?status=`), `POST` manually add a CCB individual, `DELETE` remove a manually-added person |
| `[id]/people/[personId]/route.ts` | 108 | `PATCH` inline row edit: name, email, phone, note, contacted date, attributes |
| `[id]/contact/route.ts` | 64 | `POST` mark people contacted (bulk) |
| `[id]/exclude/route.ts` | 74 | `POST` off-board / restore people |
| `[id]/mark-invited/route.ts` | 87 | `POST` promote "Not in Group" submitters onto the invite list |
| `[id]/resolve-matches/route.ts` | 81 | `POST` confirm/reject a fuzzy match |
| `[id]/ccb-search/route.ts` | 29 | `GET` CCB individual search (for manually adding people) |
| `[id]/enrich-phones/route.ts` | 75 | `POST` backfill missing phones from CCB profiles, throttled 300ms/call |

### Client hook + pages (port logic, restyle)

| File | Lines | What it is |
|---|---|---|
| `hooks/useCampaigns.ts` | 179 | Campaign list state + CRUD. **The `Campaign` and `CampaignPerson` interfaces here are the authoritative TypeScript shape of both tables** — start here to understand the data model. |
| `app/campaigns/page.tsx` | 575 | List page: favorites, active, archived, inline edit modal |
| `app/campaigns/new/page.tsx` | 665 | Create page: CCB groups **or** paste-a-roster with column mapping; duplicate-from-existing via `?from=<id>` |
| `app/campaigns/[id]/page.tsx` | **3345** | Detail page: stats, tabs, filters, table, bulk follow-up, all modals. Split this up in Pulse — see §7.9. |
| `app/campaigns/[id]/loading.tsx` | 5 | Route-level loading skeleton |

### CCB client (probably already in Pulse — verify)

| File | What campaigns needs from it |
|---|---|
| `lib/ccb/ccb-client.ts` | `getGroupParticipants(groupId)`, `getGroupName(groupId)`, `getFormResponses(formId)`, `getEventAttendees(eventId)`, `searchIndividuals(query)`, `getIndividualProfile(id)` |
| `lib/ccb/ccb-v2-client.ts` | `getGroupParticipants(groupId)` — used **only** for phone enrichment (v1 XML often omits phones) |
| `lib/ccb/ccb-api-gateway.ts` | `getCCBRequestContext(req, {module, action, direction})` — telemetry + daily budget guard wrapped around every CCB call |

Pulse already has CCB connections. **Check whether these exact methods exist there.**
If Pulse's CCB client is missing any of them, port just those methods from
`lib/ccb/ccb-client.ts` — don't wholesale-replace Pulse's client. `getFormResponses`
in particular handles two different CCB XML response shapes; read its doc comment.

If Pulse has no CCB API telemetry gateway, you can drop the `getCCBRequestContext`
wrapper and call the client directly — but read `ccb-api-gateway.ts` first, because it
also enforces a **daily CCB API budget**. Losing that guard means a runaway reconcile
can burn the org's whole CCB quota. Prefer porting the guard.

### Auto Send (see §8)

| File | Lines |
|---|---|
| `hooks/useMacCompanion.ts` | 164 |
| `components/settings/AutoSendManager.tsx` | 498 |
| `components/companion/CompanionGuideModal.tsx` | 278 |
| `public/companion/server.py` | 333 |
| `public/companion/install.sh` | 51 |

---

## 4. Data model

**Do not run these migrations.** They're already applied to the shared database.
Read them to understand the schema and the *reasoning* — the comments explain why
each column exists, which is exactly the context you need to not break things.

In `supabase/migrations/`, in order:

1. `20260625000000_follow_up_campaigns.sql` — both tables, RLS, indexes, status CHECK
2. `20260625000001_follow_up_campaigns_counts.sql` — `not_in_group_count`, `needs_review_count`, `contacted_count`
3. `20260625000002_follow_up_campaigns_source_group.sql` — `source_group_id`, `source_group_name`
4. `20260626000000_fup_people_nulls_distinct.sql` — fixes the unique constraint to `UNIQUE NULLS DISTINCT (campaign_id, ccb_individual_id)`. **Critical**: multiple rows per campaign may have a null CCB id (pasted rosters, form-only respondents).
5. `20260626100000_fup_people_attributes.sql` — `attributes JSONB` (free-form roster columns)
6. `20260627100000_fup_people_match_resolution.sql` — `match_resolution` ('confirmed' | 'rejected')
7. `20260708000000_fup_people_excluded_status.sql` — adds `'excluded'` to the status CHECK
8. `20260708010000_fup_people_left_group.sql` — `left_group BOOLEAN`
9. `20260708020000_fup_event_attendance.sql` — `ccb_event_ids TEXT[]`, `attended_count`, `attended BOOLEAN`
10. `20260708030000_fup_group_campus_map.sql` — `group_campus_map JSONB`
11. `20260708040000_fup_event_labels.sql` — `ccb_event_labels JSONB`
12. `20260714000000_fix_campaign_form_link_subdomain.sql` — data fix (already applied)
13. `20260721000000_campaign_favorites.sql` — `favorited_at`

Then read the `Campaign` and `CampaignPerson` interfaces at the top of
`hooks/useCampaigns.ts` — that's the whole schema in TypeScript, with comments.

### The status vocabulary — memorize this

`follow_up_campaign_people.reconcile_status` is the canonical bucket:

| Status | Meaning |
|---|---|
| `expected` | In a group, reconcile hasn't run yet |
| `submitted` | Matched — in both the group and the form |
| `missing` | In the group, **not** in the form → this is your follow-up pool |
| `submitted_not_in_group` | In the form but not in any configured group |
| `needs_review` | Name-only fuzzy match — a human must confirm |
| `excluded` | Admin off-boarded them; drops out of **both** the invited denominator and the unsubmitted pool |
| `contacted` | Legacy value in the CHECK constraint — **not used as a bucket.** "Contacted" is derived from `contacted_at IS NOT NULL`, orthogonal to status. Don't write this value. |

---

## 5. The reconcile algorithm

`lib/campaigns/reconcile.ts` + `app/api/campaigns/[id]/reconcile/route.ts`. This is
where every subtle bug lives. Read both files fully; this section is a map, not a
replacement.

### 5.1 Pure matching (`reconcile.ts`)

Takes `(groupParticipants[], formRespondents[])`, returns one `ReconciledPerson` per
unique human across both lists.

**Pass 1** — for each group participant, find a form respondent by, in priority order:

1. CCB individual id → `match_method: 'ccb_id'`
2. Email, lowercased/trimmed → `'email'`
3. Mobile phone, normalized to digits, ≥7 digits → `'phone'`

Match → `submitted`. No match → `missing`.

**Pass 2** — for each *unmatched* form respondent:

- Exact normalized `first|last` name match against an unmatched group participant →
  `needs_review` with `match_method: 'fuzzy'`, storing the form-side name separately
  in `form_first_name` / `form_last_name` so an admin can eyeball both.
- Otherwise → `submitted_not_in_group`.

A name is removed from the index once consumed, so two form entries can't fuzzy-match
the same person.

### 5.2 Count math (`computeCounts`)

```
inGroup        = submitted + missing + needs_review
total          = inGroup + submitted_not_in_group
completion_pct = round(submitted / inGroup * 100, 2)
```

`excluded` people are counted in **none** of those buckets — that's the whole point of
off-boarding. `contacted` counts `contacted_at != null` regardless of status.
`attended` counts `attended === true` regardless of status.

### 5.3 The reconcile route's five preservation rules

The pure function is stateless; the route is what makes reconcile **idempotent and
non-destructive**. Each rule exists because it broke in production once. Preserve all
five:

1. **Manually-added people persist.** Rows with `manually_added = true` are loaded
   from the DB and merged into the group-participant list before reconciling, so they
   get checked against form responses like anyone else. Their pasted `attributes`
   are carried across the upsert (keyed by CCB id, or by normalized name when they
   have no id).

2. **Sticky invite list.** Anyone previously `in_group = true` who is no longer in any
   configured CCB group is carried forward with `left_group = true`. They stay
   invited — their submission still counts and the denominator doesn't quietly shrink.
   Off-boarding is the *only* deliberate way to remove someone.

3. **Fuzzy resolutions are honored.** A stored `match_resolution` of `'confirmed'`
   forces `submitted`; `'rejected'` forces `missing` **and** clears the form link
   (`in_form = false`, `form_response_data = null`, form names nulled). Without this,
   reconcile re-flags the same person as `needs_review` forever.

4. **Off-boarding wins.** `excluded` survives every reconcile until an admin restores
   the person. It also survives the stale-row delete.

5. **Contact + attendance survive.** `contacted_at` / `contacted_by` / `contact_note`
   are read before the upsert and written back into the new rows. `attended` is carried
   forward from previous rows — reconcile **never** clears a check-in (attendance is
   fetched by the separate `/attendance` route, and a failed fetch must not erase data).

### 5.4 Other things in the route that look optional but aren't

- **Phone enrichment via CCB v2.** v1's `group_participants` XML often omits phone
  numbers behind a permission gate. The route makes one v2 `/groups/{id}/members` call
  per group and overlays those phones. Without it your follow-up texts have nowhere
  to go.
- **Circle-leader phone backfill.** For anyone still phone-less, it looks up
  `circle_leaders.phone` by email. **Verify this table exists and is meaningful in
  Pulse's context.** If Pulse's people aren't circle leaders, drop this step or point
  it at Pulse's equivalent people table — don't leave a lookup against a table that
  will never match.
- **Form respondents are deduped by CCB id** before reconciling. Someone submitting a
  form twice produces two entries with the same id, which makes Postgres throw
  `ON CONFLICT DO UPDATE cannot affect row a second time` on the upsert.
- **Split upsert.** Rows *with* a CCB id upsert on `(campaign_id, ccb_individual_id)`.
  Rows *without* one can't conflict-resolve, so **all** null-id rows for the campaign
  are deleted and re-inserted — with contact status already carried forward in the
  new rows.
- **Stale-row delete** removes people no longer in either list, but only when they're
  not contacted, not manually added, and not excluded.
- **Campus stamping.** Each person gets a `Campus` attribute from their invite group:
  `group_campus_map[groupId]` if set, else `guessCampusFromGroupName()`. An explicit
  `Campus` column from a pasted roster wins over the group-derived one.
- **Error contracts.** The route returns typed errors the UI renders as specific
  guidance: `ccb_permission` (403, "grant Group/Form API access in CCB Admin"),
  `ccb_group_fetch_failed` (502), `empty_group` (422), `db_upsert_failed` (500). Keep
  these — they're the difference between "something broke" and "here's the fix."

---

## 6. Route behavior contracts

Beyond auth, three rules apply to every route:

1. **Any route that changes a person's status or contact state must recompute the
   campaign's cached counts** via `computeCounts()` + an `UPDATE` on
   `follow_up_campaigns`. Look at how `exclude`, `mark-invited`, `resolve-matches`,
   `contact`, and `people/[personId]` each do it. Skip this and the list-page cards go
   stale until the next full reconcile.

2. **Use `fetchAllRows()` for every people query.** PostgREST caps at 1000 rows.
   A single `.select()` on a 1,200-person campaign silently returns 1,000 and your
   counts are wrong with no error.

3. **Service-role client only, server-side only.** Never expose the service key to the
   browser. Reads from the client go through these routes (or through RLS-protected
   anon reads), never through a privileged client.

---

## 7. UI specification

Port structure and behavior; restyle to Pulse's design system.

### 7.1 Navigation

RADIUS registers Campaigns in two places:

- `components/layout/AuthenticatedNavigation.tsx:193` — `{ href: '/campaigns', label: 'Campaigns', adminOnly: true }`
- `components/layout/MobileNavigation.tsx:427` — same entry, mobile nav

Add the equivalent entries in Pulse, gated on Pulse's admin role.

### 7.2 List page — `/campaigns`

- **Favorites section pinned at top** (`favorited_at != null`), then everything else.
  Archived campaigns never pin, even if they were favorited before archiving.
- Per campaign: name, due date, last reconciled, completion pill
  (green ≥80% / amber ≥50% / red below), star toggle, edit, archive.
- "Show archived" toggle. Archive is a soft delete (`archived_at`) and is restorable.
- Inline edit modal: name, CCB group ids (repeatable inputs), form id, due date,
  message template.
- Message-template variables: `{{first_name}}`, `{{form_link}}`, `{{campaign_name}}`,
  `{{due_date}}`.

### 7.3 Create page — `/campaigns/new`

Two ways to build the invite list, and **at least one is required**:

**A. CCB groups** — repeatable Group ID inputs, plus an optional per-group campus
override that feeds `group_campus_map`.

**B. Paste a roster** — the differentiator. Paste straight from Excel/Sheets/CSV and:

- `parseTable()` detects the delimiter (tab → comma → 2+ spaces), detects a header
  row, and pads every row to the column count. Quote-aware comma splitting, so
  `"Flower Mound, North"` stays one cell.
- `guessMapping()` pre-selects which column is First / Last / CCB Individual ID /
  Email / Phone, from the header labels. The admin can correct any of it.
- **Every unmapped column becomes a free-form attribute** (Campus, Team, Age, …),
  stored in `attributes` and usable later as a filter and a Summary dimension. This is
  the feature's best trick — don't drop it.
- `dedupePeople()` collapses rows sharing a CCB id into one invite, unioning attribute
  values (so someone on two teams keeps both teams) and backfilling missing
  phone/email from later rows. It reports a duplicate count and names for the import
  notice.
- Pasted people are inserted as `manually_added: true`, `in_group: true`,
  `reconcile_status: 'missing'`, in chunks of 500. If any chunk fails, the
  half-created campaign is **deleted** so the admin can retry cleanly.

Also on this page: **duplicate an existing campaign** via `?from=<campaignId>` —
it rehydrates a pasted roster back into tab-separated text (`peopleToTsv()`) so it
lands in the paste box fully editable and re-parses through the same mapper.

Default template:
`Hey {{first_name}}, just a reminder to complete {{campaign_name}} by {{due_date}}. Here's the link: {{form_link}}`

### 7.4 Detail page — stat cards

Three rows. Cards linked to a tab are clickable and act as filters.

**Row 1:** Unsubmitted (red, → Unsubmitted tab) · Total Submitted (green, = submitted
+ not-in-group, → Submitted tab) · Invited · Completion % (color-coded).

**Row 2:** Submitted in Group · Contacted · Not in Group (→ tab) · Review Matches
(amber, → tab).

**Row 3** (only when the campaign has CCB event ids **and** the feature flag is on):
Checked In · Attendance %.

When filters are active, every card shows the **filtered** number, with a
"Showing stats for: …" line above the row. When the campaign has never been
reconciled, hide the cards entirely and show a "Run reconcile" nudge.

### 7.5 Detail page — tabs

| Tab | Status filter |
|---|---|
| Summary | — (rollup view) |
| **Unsubmitted** (default) | `missing` |
| Submitted | `submitted` |
| Not in Group | `submitted_not_in_group` |
| Review Matches | `needs_review` |
| Off-boarded | `excluded` |

Tabs render as a segmented control on desktop and a `<select>` on mobile.

**Summary tab** builds a "By *dimension*" table for each available dimension —
source group, plus every roster attribute key, plus attendance when enabled. Columns:
Invited · Responded · Resp % · RSVP Yes · RSVP No · No Response (· Attended · Att %).
RSVP yes/no is parsed out of `form_response_data`; read `rsvpAnswer()` and
`formAnswersOf()` in the detail page. A person with multiple values for a dimension
(two teams) counts in **both** rows — grouping works on a set of values, not a string.

### 7.6 Detail page — table, filters, actions

- Columns: Name · Email · Phone · Groups · Last Contacted · (Submitted | Checked In |
  Match, depending on tab). All sortable.
- **Faceted multi-select filters** over every available dimension. Filters apply to
  the table *and* recompute the stat cards.
- **Search across the whole campaign** — finds a person on any tab and jumps to their
  row with a highlight.
- **Row expand** → shows the full CCB form response, formatted readably, plus an
  inline editor for name / email / phone / note / contacted date / attributes.
- **Bulk selection** with a select-all checkbox (respects active filters).
- **CSV export** of the current tab, honoring filters and sort.
- Bulk actions, by tab:
  - Unsubmitted → **Follow Up** (§7.7), **Off-board**
  - Off-boarded → **Restore** (back to `missing`)
  - Not in Group → **Mark as Invited** (promotes submitters onto the invite list,
    optionally re-attributing their source group)
  - Review Matches → **Confirm** / **Reject** match
- **Add a person** — CCB individual search (`/ccb-search`), one-tap add.
- **Reconcile** button → `POST /reconcile`, then auto-fires `POST /enrich-phones` in
  the background to backfill missing numbers.
- **Check Attendance** button (flag-gated) → `POST /attendance`, reports how many were
  newly marked and which events failed.
- **Edit campaign** modal: name, group ids, event ids + labels, campus map, form id,
  due date, message template.

### 7.7 Follow Up modal

1. Editable message template with clickable variable chips that insert at the cursor.
2. Live preview against the first selected person.
3. Single person → "Send Message" button. `sendMessage()` **awaits the clipboard
   write before** launching `sms:` — Messages steals focus and a pending
   `writeText` gets rejected, leaving the *previous* person's message on the
   clipboard. Keep the await.
4. Multiple people → per-person send buttons plus **Auto Send All** (§8).
5. "Mark contacted" with an optional shared note. **People whose message failed
   delivery are excluded from the mark** so they resurface for another attempt.

### 7.8 Empty and error states

Every failure mode has a specific message in RADIUS — CCB permission errors name the
exact CCB admin screen, `empty_group` names the group ids that returned nothing.
Carry these over. They're most of what makes the feature usable by a non-engineer.

### 7.9 One improvement to make while porting

`app/campaigns/[id]/page.tsx` is 3,345 lines and does far too much. Split it in Pulse:
`CampaignHeader`, `CampaignStats`, `CampaignSummary`, `PeopleTable`, `PersonRow`,
`FollowUpModal`, `EditCampaignModal`, `AddPersonModal`, plus a `useCampaignDetail`
hook for data + filter state. Same behavior, readable files.

---

## 8. Auto Send (Mac Messages companion) — full port

Trip wants the **complete** Auto Send feature in Pulse, including a Settings tab that
acts as the installer.

### 8.1 How it works

A tiny Python HTTP server runs on the user's Mac at `http://localhost:5123`, installed
as a LaunchAgent so it starts at login. The web app talks to it directly from the
browser. It drives the Messages app via AppleScript and reads Apple's delivery
receipts out of `~/Library/Messages/chat.db`.

| Endpoint | Purpose |
|---|---|
| `GET /ping` | Is it running |
| `GET /version` | Installed version — app forces reinstall on mismatch |
| `GET /preflight` | Messages open? signed in to iMessage? is Text Message Forwarding on? |
| `GET /verify-capable` | Is Full Disk Access granted (can it read `chat.db`)? Returns the exact `python_path` to authorize. |
| `POST /send` | `{phone, message, delay_ms}` → sends, returns the service actually used |
| `POST /verify` | `{phones[], since_ms}` → per-phone `delivered` / `failed` / `pending` |
| `POST /notify` | Native macOS notification when a batch finishes |

Three details in `server.py` that exist for hard-won reasons:

- **Per-recipient routing.** It reads the `handle` table to learn whether a number is a
  confirmed iMessage user; if not, it prefers the SMS service so Android numbers
  actually get the text. When capability can't be read, it falls back to iMessage
  rather than flipping every send green.
- **Preflight is the only honest signal.** AppleScript exits 0 even when Messages is
  closed or signed out and nothing sends.
- **`chat.db` is opened with `PRAGMA query_only`, not `?mode=ro`** — a strict read-only
  connection can't see the WAL, which is exactly where a just-sent message lives.

### 8.2 Client flow — `hooks/useMacCompanion.ts`

Port as-is: `available`, `needsUpdate`, `ping`, `preflight`, `send`, `verify`,
`verifyCapable`, `notify`, `recheck`. Silent ping + version check on mount.

`handleAutoSendAll()` in the campaign detail page is the batch driver:

1. Block if `needsUpdate` — old companions could report success when nothing sent.
2. `preflight()`; abort with the returned message if not ok. If `sms_available` is
   false, warn (non-iPhone numbers unreachable) but **don't block** — iMessage users
   still go through.
3. Send serially with throttling: `<25 people → 0ms`, `<100 → 1000ms`, else `2000ms`.
4. Track progress as `done / total`.
5. `notify(sent, failed)`.
6. Kick off `verifyDelivery()` in the background — polls every 10s for up to 3 minutes.
   Anything still pending at the deadline becomes `unconfirmed`, never "delivered."
   Failed and unconfirmed people sort to the top of the list so they're easy to
   re-tap on a phone.

### 8.3 Settings tab — the installer

Mirror `components/settings/AutoSendManager.tsx` as a new **Auto Send** tab in Pulse's
settings page, deep-linkable at `?tab=auto_send` (see `app/settings/page.tsx:78-84`
for how RADIUS does tab state + deep links, and `:1514` for where it renders).

The page is itself the health check. On mount it runs a full diagnostic sweep:

**Card 1 — Companion server:** running on this Mac · up to date (version vs.
`COMPANION_VERSION`) · Messages app ready · Text Message Forwarding on (warn, not fail).

**Card 2 — Delivery tracking:** Full Disk Access granted, with a "Show me how to turn
it on" button that opens the guide.

**Overall banner:** all-good (green) / sending-works-but-no-delivery-tracking (amber) /
not-ready (red).

**Setup card:** a "Show me how" button opening `CompanionGuideModal`, plus the raw
install command with a copy button.

**Test send card:** texts your own number through the full pipeline —
app → companion → Messages → delivery receipt — polling up to 60s. Remembers the test
number in `localStorage`.

`CompanionGuideModal` is a 7-step, non-technical walkthrough: open Terminal → copy the
command → paste and press Return → allow Messages access → sign in to iMessage → turn
on Full Disk Access (with the exact `python_path` to authorize) → come back and
re-check. Port it; it's the difference between this feature being usable and not.

### 8.4 The one thing you must get right: don't install a second companion

`server.py` binds **port 5123**. `install.sh` installs to `$HOME/.radius-companion`
with LaunchAgent label `co.radius.imessage-companion`.

If Pulse ships an installer with a different directory and label but the same port,
the second agent **fails to bind** and one app silently stops working.

**Do this:** Pulse serves its own copies of `public/companion/server.py` and
`public/companion/install.sh`, but keeps the **same port, same install dir, same
LaunchAgent label, and byte-identical `server.py`**. Installing from either app then
upgrades the one shared agent rather than creating a rival. Change only the download
URL in `install.sh`:

```bash
RADIUS_URL="https://vccradius.netlify.app"   # → point at Pulse's own domain
```

`COMPANION_VERSION` in `hooks/useMacCompanion.ts` **must stay in lockstep with
`VERSION` in `server.py` across both apps.** If Pulse ships `1.5.0` and RADIUS later
ships `1.6.0`, whichever app installed last wins and the other one shows a permanent
"update required" banner. Coordinate any bump with Trip.

CORS is already `Access-Control-Allow-Origin: *`, so Pulse's origin can talk to an
existing companion with no changes.

Two caveats worth surfacing in Pulse's UI, same as RADIUS does:

- Mac-only, and only for the person whose Mac it is. Everyone else falls back to
  per-person `sms:` links, which work everywhere.
- The page is HTTPS and the companion is `http://localhost`. Chrome and Edge treat
  localhost as trustworthy and allow it; Safari is stricter. Test in Pulse's target
  browser.

---

## 9. Environment variables

Campaigns needs, on the Pulse Netlify site:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same project as RADIUS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only. Every campaign write uses it. |
| `CCB_SUBDOMAIN` | Also feeds the form-link builder. Must be `valleycreekchurch`, not the short `valleycreek` alias — `ccbFormUrl()` normalizes this defensively; keep that. |
| `CCB_API_USERNAME` / `CCB_API_PASSWORD` | Same credentials |
| `NEXT_PUBLIC_EVENT_ATTENDANCE_ENABLED` | Feature flag, **default off** |

### The event-attendance flag

`lib/campaigns/event-attendance-flag.ts` gates, all together:

- the Check Attendance button
- the Checked In / Attendance % stat cards
- the Checked In filter and table column
- the attendance columns on the Summary
- the CCB Event IDs input on the create and edit forms

Off unless the env var is exactly `"true"` — regardless of whether a campaign has
event ids. Ship Pulse with it off and turn it on deliberately.

CCB's API also has a **daily budget guard** in `lib/ccb/ccb-api-gateway.ts`. Two apps
now share one CCB quota. Reconciling large campaigns from both apps on the same day
can exhaust it. Port the guard, and flag this to Trip as an operational note.

---

## 10. Build order

1. **Verify the shared tables.** Query `follow_up_campaigns` and
   `follow_up_campaign_people` from Pulse. Confirm every column in §4 is present.
   Write nothing yet.
2. **Verify Pulse's CCB client** has the six methods in §3. Port only what's missing.
3. **Copy `lib/campaigns/*` verbatim.** Pure logic, no auth, no styling.
4. **Write `requireCampaignAdmin()`** against Pulse's role model. One helper.
5. **Port the API routes**, simplest first: `route.ts` → `[id]/route.ts` → `people` →
   `contact` / `exclude` / `mark-invited` / `resolve-matches` → `ccb-search` →
   `enrich-phones` → **`reconcile`** → `attendance`.
6. **Port `useCampaigns.ts`**, then the list page, then the create page.
7. **Build the detail page** as the split components in §7.9.
8. **Port Auto Send**: hook → companion assets → settings tab → guide modal → wire
   `handleAutoSendAll` into the Follow Up modal.
9. **Add nav entries**, admin-gated.
10. **Log it in Pulse's changelog** if Pulse has one (RADIUS requires a
    `public/changelog.json` entry before every commit — check whether Pulse has the
    same rule).

### Acceptance checklist

- [ ] A campaign created in Pulse appears in RADIUS, and vice versa
- [ ] Reconcile run from Pulse produces the same counts RADIUS produces
- [ ] Reconcile is idempotent — run it twice, counts don't move
- [ ] Contacted status survives a reconcile
- [ ] Off-boarded people survive a reconcile and stay out of both the denominator and the unsubmitted pool
- [ ] A confirmed fuzzy match isn't re-flagged as `needs_review` on the next run
- [ ] Someone removed from a CCB group stays invited, flagged `left_group`
- [ ] A pasted roster's extra columns show up as filters and Summary dimensions
- [ ] A >1000-person campaign returns everyone (pagination works)
- [ ] A non-admin Pulse user gets 403 on every write route and can still read
- [ ] Auto Send: install from Pulse, run checks, send a test, confirm delivery
- [ ] Auto Send from Pulse doesn't break Auto Send from RADIUS (same companion, one agent)

---

## 11. Things not to do

- Don't create or alter the campaign tables. They're shared and already correct.
- Don't copy RADIUS's `bg-zinc-*` / `text-slate-*` dark-mode classes. Restyle to Pulse.
- Don't skip `fetchAllRows()` — silent 1000-row truncation is the worst bug here
  because everything still *looks* fine.
- Don't let the service-role key reach the browser.
- Don't write `reconcile_status: 'contacted'`. Contact state is `contacted_at`.
- Don't install a second Mac companion on a different port or label.
- Don't "simplify" the five preservation rules in §5.3. Each one is a bug that already
  happened.
- Don't hit any AI endpoint or new third-party service — campaigns needs neither.
- Ask Trip before: any schema change, any `COMPANION_VERSION` bump, or turning on
  `NEXT_PUBLIC_EVENT_ATTENDANCE_ENABLED` in production.
