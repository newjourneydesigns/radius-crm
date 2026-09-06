-- Toolkit submissions that never showed up as a CCB attendance record. READ ONLY.
--
-- Q5 in attendance-damage-audit.sql found 17 of these across 10 leaders,
-- 2026-08-19 .. 2026-09-03. This splits them by cause, because the fix is
-- different for each:
--
--   push_failed         the CCB write itself errored (ccb_error set) — a push
--                       bug or a CCB outage
--   push_unverified     CCB answered 200 but the read-back could not confirm it
--                       saved — CCB has been seen doing exactly this
--   event_not_tracked   the push succeeded, but the event the leader submitted
--                       under is NOT in circle_leaders.ccb_event_ids, so the
--                       sync never looked for it. An attribution gap, not a
--                       push failure. The sync's own guard ("only stub when
--                       ccb_event_ids is populated") cannot help here because
--                       the list is populated — just incomplete.
--   met_now             a 'met' occurrence exists for that date — nothing
--                       missing (or the 2026-09-04 repair restored it)
--   unexplained         push verified, event tracked, and still no record
--
-- Occurrence -> date is cast in UTC on purpose: the toolkit writes the
-- meeting's local wall-clock time as a naive string, which Postgres stores
-- as UTC, so the UTC calendar date IS the meeting date.

with subs as (
  select
    s.id,
    s.leader_id,
    l.name                                        as leader,
    s.ccb_event_id,
    date(s.occurrence at time zone 'UTC')         as meeting_date,
    s.ccb_submitted_at,
    s.ccb_error,
    s.ccb_response #>> '{verification,status}'    as verification,
    s.ccb_response #>> '{verification,reason}'    as verification_reason,
    coalesce(l.ccb_event_ids, array[]::text[])    as tracked_event_ids
  from circle_event_summaries s
  join circle_leaders l on l.id = s.leader_id
  where s.status = 'submitted'
    and s.did_not_meet = false
    and s.occurrence >= now() - interval '30 days'
),
classified as (
  select
    subs.*,
    o.status as occurrence_status,
    case
      when o.status in ('met', 'did_not_meet')             then 'met_now'
      when subs.ccb_error is not null                       then 'push_failed'
      when subs.verification is distinct from 'verified'    then 'push_unverified'
      when not (subs.ccb_event_id = any(subs.tracked_event_ids)) then 'event_not_tracked'
      else 'unexplained'
    end as cause
  from subs
  left join circle_meeting_occurrences o
    on o.leader_id = subs.leader_id
   and o.meeting_date = subs.meeting_date
)

-- Part A: the tally. Run this first.
select cause, count(*) as submissions, count(distinct leader_id) as leaders
from classified
group by cause
order by submissions desc;


-- Part B: the rows behind anything that is not met_now. Run second, paste
-- what comes back — leader name, event id, date and the CCB error/verification
-- text are what I need. (Select from the same CTEs: re-run the WITH block
-- above with this SELECT in place of Part A.)
--
-- select leader, ccb_event_id, meeting_date, cause,
--        left(coalesce(ccb_error, verification_reason, ''), 140) as detail,
--        occurrence_status
-- from classified
-- where cause <> 'met_now'
-- order by cause, leader, meeting_date;
