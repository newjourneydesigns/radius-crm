-- Attendance repair — restores the meetings the `no_record` stub flattened.
--
-- Measured on production 2026-09-04:
--   404 meetings, 2,633 attendance records, 124 leaders, 1,076 people,
--   2026-01-18 (SEMESTER_START) through 2026-09-02.
--   0 of those rows still carried a head count, confirming every one was
--   flattened rather than merely never filled.
--
-- Why this is safe to infer: `no_record` means "CCB had no record", so such a
-- row should carry no attendees at all. One that has named attendees was
-- written as a real meeting by an earlier sync and later overwritten. The rows
-- are keyed (leader_id, meeting_date) and never reassigned, so the surviving
-- attendees belong to that leader on that date.
--
-- What comes back: who attended, and when. What does not: each meeting's
-- off-roster guest count, notes, topic and prayer requests — the overwrite
-- nulled raw_payload and no surviving row carries them. A meeting of 9 named
-- people plus 2 untracked guests returns as 9.
--
-- Run steps 1-3 in order. Step 4 is the undo, only if something looks wrong.


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 1. Snapshot the rows about to change, so the repair is reversible.
--
-- RLS is enabled with no policies on purpose: this table holds attendance
-- data, and every table in the public schema is reachable through PostgREST.
-- No policies means no anon/authenticated access; the SQL editor and the
-- service role bypass RLS and can still read it.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists circle_meeting_occurrences_repair_backup_20260904 as
select o.*
from circle_meeting_occurrences o
where o.status = 'no_record'
  and exists (select 1 from circle_meeting_attendees a where a.occurrence_id = o.id);

alter table circle_meeting_occurrences_repair_backup_20260904
  enable row level security;

-- Expect 404.
select count(*) as rows_backed_up
from circle_meeting_occurrences_repair_backup_20260904;


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 2. The repair.
--
-- Naturally idempotent: it only matches status = 'no_record', so a second run
-- touches nothing. synced_at is deliberately NOT bumped — that column means
-- "CCB confirmed this row", and CCB has confirmed nothing here.
-- ───────────────────────────────────────────────────────────────────────────
update circle_meeting_occurrences o
set
  status        = 'met',
  headcount     = r.attendees_on_file,
  regular_count = nullif(r.regulars, 0),
  visitor_count = nullif(r.visitors, 0)
from (
  select
    a.occurrence_id,
    count(*)                                                             as attendees_on_file,
    count(*) filter (where a.attendance_type = 'visitor')                as visitors,
    count(*) filter (where a.attendance_type is distinct from 'visitor') as regulars
  from circle_meeting_attendees a
  group by a.occurrence_id
) r
where o.id = r.occurrence_id
  and o.status = 'no_record';


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 3. Verify. Expect orphans_remaining = 0 and restored_meetings = 404.
-- ───────────────────────────────────────────────────────────────────────────
select
  (select count(*)
     from circle_meeting_attendees a
     join circle_meeting_occurrences o on o.id = a.occurrence_id
    where o.status = 'no_record')                       as orphans_remaining,
  (select count(*)
     from circle_meeting_occurrences o
     join circle_meeting_occurrences_repair_backup_20260904 b on b.id = o.id
    where o.status = 'met')                             as restored_meetings,
  (select sum(o.headcount)
     from circle_meeting_occurrences o
     join circle_meeting_occurrences_repair_backup_20260904 b on b.id = o.id) as attendance_restored;


-- ───────────────────────────────────────────────────────────────────────────
-- STEP 4. UNDO — only if step 3 looks wrong. Puts every touched row back
--         exactly as it was.
-- ───────────────────────────────────────────────────────────────────────────
-- update circle_meeting_occurrences o
-- set status        = b.status,
--     headcount     = b.headcount,
--     regular_count = b.regular_count,
--     visitor_count = b.visitor_count
-- from circle_meeting_occurrences_repair_backup_20260904 b
-- where o.id = b.id;
