# Known Issues

## Database Issues

### Notes Table Permissions Issue
**Status**: In Progress  
**Date Reported**: July 30, 2025  
**Priority**: Medium

**Problem**: Notes are not saving to the database due to Row Level Security (RLS) policy restrictions.

**Symptoms**:
- Insert operations on the `notes` table fail
- Error logs show permission-related errors
- Notes read operations work fine (empty array returned)
- Circle Leader verification succeeds

**Root Cause**: 
The `notes` table likely has RLS enabled but no policies configured to allow anonymous users to insert records.

**Temporary Workaround**: 
- Local notes are created and stored in component state when database insert fails
- Users can still add notes, but they won't persist across page refreshes
- Notes display "Local User" as the creator

**Required Fix**:
1. Access Supabase dashboard as project administrator
2. Navigate to Authentication > Policies for the `notes` table
3. Create appropriate RLS policies to allow:
   - INSERT operations for authenticated/anonymous users
   - SELECT operations for reading notes
   - UPDATE/DELETE operations for note management

**SQL Commands Needed**:
```sql
-- Enable RLS if not already enabled
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy to allow anyone to read notes
CREATE POLICY "Allow read access to notes" ON notes
FOR SELECT TO anon, authenticated
USING (true);

-- Policy to allow anyone to insert notes
CREATE POLICY "Allow insert access to notes" ON notes
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Policy to allow anyone to update their own notes
CREATE POLICY "Allow update access to notes" ON notes
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Policy to allow anyone to delete notes
CREATE POLICY "Allow delete access to notes" ON notes
FOR DELETE TO anon, authenticated
USING (true);
```

**Testing Steps**:
1. Apply the RLS policies in Supabase dashboard
2. Refresh the application
3. Navigate to a Circle Leader profile
4. Try adding a note
5. Verify the note saves to database and persists on page refresh

---

## Migration Issues

### Follow-up Status Migration
**Status**: Pending  
**Date Reported**: July 30, 2025  
**Priority**: Low

**Problem**: The follow-up status migration in `supabase/migrations/add_follow_up_status.sql` needs to be executed.

**Required Action**: Run the migration via Supabase dashboard or CLI with appropriate permissions.

---

## Scheduled Functions

### Scheduled functions rely on a 308 redirect to reach their API routes
**Status**: Pending  
**Date Reported**: September 2, 2026  
**Priority**: Low (works today; latent)

**Problem**: `next.config.js` sets `trailingSlash: true`, so the canonical form of every API route ends in `/` and a request without it gets a `308` redirect. Every scheduled function except `netlify/functions/discover-events.ts` posts to its route *without* the trailing slash (`/api/ccb/sync-attendance`, `/api/circle-leader-toolkit/prewarm`, `/api/student-toolkit/sync`, etc. — see `grep -rn 'fetch(\`\${appUrl}/api' netlify/ lib/netlify/`). They only work because Node's `fetch` follows the 308 and preserves `POST`. That is one extra hop per cron run, and a single point of failure: any client that does not follow redirects (or a change to `trailingSlash`) would break every scheduled job at once. The same trap already cost a debugging round when a hand-run `curl` returned the redirect body instead of JSON.

**Required Action**: Sweep every `fetch(\`\${appUrl}/api/...\`)` in `netlify/functions/` and `lib/netlify/` to the canonical trailing-slash form, matching `discover-events.ts`. No behaviour change on the happy path; removes the redirect hop and the dependency on redirect-following. Deferred until the Ashley Bates `ccb_event_ids` fix is confirmed (Sep 2026).

### Long-running API routes are cut off by Netlify's synchronous function timeout
**Status**: Partially addressed (discover-events); prewarm + full-semester sync unverified  
**Date Reported**: September 2, 2026  
**Priority**: High — may be the underlying cause of "the toolkit is slow to open"

**Problem**: Netlify terminates synchronous function invocations at 10s (free) / 26s (paid). Next.js's `export const maxDuration` does **not** raise that ceiling on this runtime. Observed directly on Sep 2: `POST /api/ccb/discover-events/?force=true` with `maxDuration = 300` deployed returned `504 (Gateway Timeout)` with an HTML body after ~26s from a browser.

Every scheduled job in `netlify/functions/` is a thin wrapper that `fetch`es an API route and is therefore subject to the same limit. The ones whose routes plausibly exceed 26s:

- `prewarm-circle-summary` → `/api/circle-leader-toolkit/prewarm` (`maxDuration = 600`; 50–70 groups × 1.6s pacing ≈ 80–110s, doubled since Aug 31 by the roster warm). If truncated, only the first ~15 groups are warmed each night; every other leader falls through to a live CCB call on open. `ccb_group_events_cache` would still look populated, because the events page's read-path write-back fills rows on live fetches — which is exactly the slow path.
- `sync-attendance` (nightly, `lookbackDays=null` = full semester since Jan 18) → thousands of upserts; almost certainly truncated. The hourly `sync-attendance-recent` (14-day window) is small enough to finish and keeps recent data correct, which would mask the nightly failure.

**How to confirm**: Netlify → vccradius → Logs → Functions → `prewarm-circle-summary` and `sync-attendance`. A truncated run logs `API error` / a 504, and the prewarm response's `warmed` count would be far below `groupsThisRun`. Also check the timing log line for `calSource: "ccb"` on leaders whose day was warmed — that means prewarm didn't reach them.

**Required Action**: Stop doing multi-minute work inside a single synchronous invocation. Options, best first: (1) move the loop *into* the scheduled function (import the lib logic directly rather than `fetch`ing a route) so it runs under the scheduled/background limit; (2) chunk the route (`?limit=&offset=` with a cursor) and have the scheduled function iterate; (3) derive from already-cached data where possible, as `discover-events?source=calendar` now does (no CCB calls, seconds). `discover-events` is fixed via (3). `prewarm` and the full-semester `sync-attendance` are **not yet** addressed.

### Six "week summary" routes write `circle_meeting_occurrences` rows with no `ccb_event_id`
**Status**: Read side mitigated (toolkit); write side open  
**Date Reported**: September 2, 2026  
**Priority**: Medium

**Problem**: `circle_meeting_occurrences` is keyed `(leader_id, meeting_date)` and has two families of writers. `/api/ccb/sync-attendance` writes full rows (`ccb_event_id`, `raw_payload`). Six others upsert on the same key with only `status`, `headcount`, `has_notes`, `guest_count`, `source: 'ccb'` and **no `ccb_event_id` or `raw_payload`**: `ccb/sync-week-summaries`, `ccb/pull-week-summaries`, `ccb/auto-update-summaries`, `circle-leader-toolkit/leader-week-summary`, `event-summary-tracker/sync`, `event-summary-tracker/bulk-review`. Whichever writer creates the row first decides whether it carries an event id. On 2026-09-02 a census found **124 `met` rows with `ccb_event_id IS NULL` across 95 leaders in a 14-day window** — roughly a third of active leaders. Example: leader 555's 2026-08-23 (`headcount 10, has_notes true, raw_payload {}`) sat between an 8/16 and 8/30 that both carried `17718`.

**Impact**: Any reader that keys on `(ccb_event_id, date)` — the toolkit's table-backed attendance did — silently misses these meetings. For the toolkit that rendered a Lead-app submission as PENDING (fixed read-side: `lookupOccurrenceStatus` falls back to a date-only key, and `statusFromRow` honors the `has_notes` column). Other consumers that assume `ccb_event_id` is populated on `met` rows have the same blind spot.

**Required Action**: Either (a) have the six week-summary writers resolve and set `ccb_event_id` (they match by group/name today), or (b) have `sync-attendance` run *after* them and be the only writer of `ccb_event_id`, or (c) treat `ccb_event_id` as optional everywhere and key on `(leader_id, meeting_date)`, which is the table's actual primary key. (c) is the honest one — the id was never guaranteed.
