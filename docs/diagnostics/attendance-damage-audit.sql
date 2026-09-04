-- Attendance damage audit — READ ONLY. Nothing here writes, locks, or deletes.
--
-- Context: on 2026-09-02 the Circle Leader Toolkit's "last attended" date was
-- rewired to read circle_meeting_occurrences / circle_meeting_attendees. Those
-- rows are the Event Summary Tracker's cache and cannot carry per-person
-- attendance faithfully. These queries measure how much stored data the
-- `no_record` stub overwrite actually destroyed, and settle one open question
-- about CCB's payload.
--
-- Run them ONE AT A TIME in the Supabase SQL editor (it only shows the last
-- result when you run several at once). Paste each result back.


-- ───────────────────────────────────────────────────────────────────────────
-- Q0. Schema sanity. Confirms the column names and types the rest assume.
--     Run this first — if anything looks different from what Q1-Q5 reference,
--     send me this output before running the others.
-- ───────────────────────────────────────────────────────────────────────────
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'circle_meeting_occurrences',
    'circle_meeting_attendees',
    'circle_event_summaries',
    'ccb_group_events_cache'
  )
order by table_name, ordinal_position;


-- ───────────────────────────────────────────────────────────────────────────
-- Q1. THE HEADLINE. Attendee rows sitting under a 'no_record' occurrence.
--
--     'no_record' means "we looked and CCB had nothing", so such a row should
--     have zero attendees by definition. Every row this counts is a meeting
--     that WAS recorded with named attendees and then got flattened by a stub.
--     If this returns 0, the overwrite never fired in practice and cause #2
--     is theoretical.
-- ───────────────────────────────────────────────────────────────────────────
select
  count(*)                        as orphaned_attendee_rows,
  count(distinct o.id)            as flattened_meetings,
  count(distinct o.leader_id)     as leaders_affected,
  count(distinct a.ccb_individual_id) as people_affected,
  min(o.meeting_date)             as earliest_flattened,
  max(o.meeting_date)             as latest_flattened
from circle_meeting_attendees a
join circle_meeting_occurrences o on o.id = a.occurrence_id
where o.status = 'no_record';


-- ───────────────────────────────────────────────────────────────────────────
-- Q2. Which leaders lost the most. Top 25.
-- ───────────────────────────────────────────────────────────────────────────
select
  o.leader_id,
  l.name                              as leader_name,
  count(distinct o.id)                as flattened_meetings,
  count(*)                            as orphaned_attendee_rows,
  min(o.meeting_date)                 as earliest,
  max(o.meeting_date)                 as latest
from circle_meeting_attendees a
join circle_meeting_occurrences o on o.id = a.occurrence_id
left join circle_leaders l         on l.id = o.leader_id
where o.status = 'no_record'
group by 1, 2
order by flattened_meetings desc, orphaned_attendee_rows desc
limit 25;


-- ───────────────────────────────────────────────────────────────────────────
-- Q3. How far back the roster dates were pushed, per person, inside the
--     12-week window the toolkit actually reads.
--
--     `shown`  = what the roster displayed (met / did_not_meet rows only)
--     `actual` = what the stored attendee rows say, flattened rows included
-- ───────────────────────────────────────────────────────────────────────────
with per_person as (
  select
    o.leader_id,
    a.ccb_individual_id,
    max(o.meeting_date) filter (where o.status in ('met', 'did_not_meet')) as shown,
    max(o.meeting_date)                                                    as actual
  from circle_meeting_attendees a
  join circle_meeting_occurrences o on o.id = a.occurrence_id
  where o.meeting_date >= (current_date - interval '12 weeks')::date
  group by 1, 2
)
select
  count(*)                                          as people_with_a_wrong_date,
  count(*) filter (where shown is null)             as people_shown_no_date_at_all,
  round(avg(actual - shown))                        as avg_days_too_old,
  max(actual - shown)                               as worst_days_too_old
from per_person
where shown is distinct from actual;


-- ───────────────────────────────────────────────────────────────────────────
-- Q4. Does CCB actually report attendees with an "absent" status?
--
--     This is the one thing I could not settle from the code. The CCB read
--     path skips status 'absent'/'no' — the table path had nowhere to store a
--     status, so if CCB does emit them, absent people were being counted as
--     present. Reads the most recently cached raw payload; makes no CCB call.
--
--     Assumes attendance_xml is `jsonb`. If Q0 reports `text` or `json`,
--     send me that and I'll rewrite this one — don't fight it.
-- ───────────────────────────────────────────────────────────────────────────
with one_row as (
  select attendance_xml
  from ccb_group_events_cache
  where attendance_xml is not null
  order by synced_at desc nulls last
  limit 1
),
ev as (
  select jsonb_array_elements(
           case jsonb_typeof(attendance_xml #> '{ccb_api,response,events,event}')
             when 'array' then attendance_xml #> '{ccb_api,response,events,event}'
             else jsonb_build_array(attendance_xml #> '{ccb_api,response,events,event}')
           end
         ) as e
  from one_row
  where attendance_xml #> '{ccb_api,response,events,event}' is not null
),
att as (
  select jsonb_array_elements(
           case jsonb_typeof(e #> '{attendees,attendee}')
             when 'array' then e #> '{attendees,attendee}'
             else jsonb_build_array(e #> '{attendees,attendee}')
           end
         ) as a
  from ev
  where e #> '{attendees,attendee}' is not null
)
select
  coalesce(a #>> '{status,#text}', a ->> 'status', '(no status field)') as ccb_reported_status,
  count(*) as attendee_entries
from att
group by 1
order by attendee_entries desc;


-- ───────────────────────────────────────────────────────────────────────────
-- Q5. Independent proof of the overwrite, from a second source.
--
--     A 'no_record' occurrence on a date the leader ALSO submitted a summary
--     for cannot be right — they told us the circle met. Every row here is a
--     stub that overwrote a real meeting.
--
--     The date cast is UTC on purpose: /circle-leader-toolkit/submit writes
--     the meeting's local wall-clock time as a naive string, which Postgres
--     stores as UTC, so the UTC calendar date IS the meeting date.
-- ───────────────────────────────────────────────────────────────────────────
select
  count(*)                    as contradicted_stubs,
  count(distinct o.leader_id) as leaders_affected,
  min(o.meeting_date)         as earliest,
  max(o.meeting_date)         as latest
from circle_meeting_occurrences o
join circle_event_summaries s
  on  s.leader_id = o.leader_id
  and date(s.occurrence at time zone 'UTC') = o.meeting_date
  and s.status = 'submitted'
  and s.did_not_meet = false
where o.status = 'no_record';
