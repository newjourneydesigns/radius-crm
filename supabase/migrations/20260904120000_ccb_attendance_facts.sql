-- Durable per-person attendance, straight from CCB.
--
-- Why this exists: "when did this person last attend?" was being answered from
-- circle_meeting_occurrences / circle_meeting_attendees. Those are the Event
-- Summary Tracker's cache for a different question, eleven jobs upsert them on
-- (leader_id, meeting_date), and a `no_record` placeholder could overwrite a
-- real meeting. On 2026-09-04 that had erased 404 meetings holding 2,633
-- attendance records across 124 leaders, back to semester start.
--
-- The design point is the split below. CCB's attendance payload names an event
-- and its attendees but NOT the group, so a meeting only becomes "this circle's
-- meeting" through an event -> group mapping we hold ourselves. Every version of
-- that mapping we have had — circle_leaders.ccb_event_ids, and the calendars in
-- ccb_group_events_cache — is derived from a sliding 12-week window, so it
-- decays: an event that ran in February is no longer on any cached calendar
-- today. The old code let that decay reach the DATA, stubbing and then erasing
-- meetings it could no longer attribute.
--
-- So the fact and the attribution are separated:
--
--   ccb_attendance_facts   — immutable. A person attended an event on a date.
--                            True regardless of what we know about groups, so
--                            it is written unattributed and kept forever.
--   ccb_event_group_map    — accumulating. Which group an event belongs to,
--                            unioned from every source as we learn it, never
--                            removed.
--
-- Attribution happens at READ time, joining the two. A mapping learned next
-- month retroactively corrects every historical answer with no rewrite, and a
-- mapping we never learn costs us one event's attribution — never the record
-- that someone attended.
--
-- Cost: zero additional CCB calls. `attendance_profiles?start_date&end_date` is
-- ONE call for the entire church over any range, and /api/ccb/sync-attendance
-- already makes it hourly (14 days) and daily (semester to date). The daily run
-- backfills this table across the whole semester on its first pass after
-- deploy, so no separate backfill job is needed.

-- ───────────────────────────────────────────────────────────────────────────
-- Facts
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ccb_attendance_facts (
  ccb_event_id      TEXT NOT NULL,
  occurrence_date   DATE NOT NULL,
  ccb_individual_id TEXT NOT NULL,
  attendee_name     TEXT,
  -- CCB's own status string, kept verbatim. As of 2026-09-04 its
  -- attendance_profiles payload carries no status at all (24,226 attendee
  -- entries, none with the field) — it only lists people who were there. The
  -- column exists so that if CCB ever starts reporting absences we capture
  -- them instead of silently recording an absent person as present, which is
  -- exactly the mistake circle_meeting_attendees made by having nowhere to
  -- put one.
  ccb_status        TEXT,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ccb_event_id, occurrence_date, ccb_individual_id)
);

-- The roster read: every fact for a set of event ids, newest first.
CREATE INDEX IF NOT EXISTS ccb_attendance_facts_event_date_idx
  ON ccb_attendance_facts (ccb_event_id, occurrence_date DESC);

-- "When did this person last attend anything?" — used by coaching and for
-- reconciling a member who moved between circles.
CREATE INDEX IF NOT EXISTS ccb_attendance_facts_individual_idx
  ON ccb_attendance_facts (ccb_individual_id, occurrence_date DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- Attribution
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ccb_event_group_map (
  ccb_event_id  TEXT PRIMARY KEY,
  ccb_group_id  TEXT NOT NULL,
  -- Where we learned it, for debugging a wrong attribution later.
  source        TEXT NOT NULL DEFAULT 'calendar',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ccb_event_group_map_group_idx
  ON ccb_event_group_map (ccb_group_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Seed the map from what we already know.
--
-- Two independent sources, unioned. Neither is complete on its own — that
-- incompleteness is what caused the erasure — but together they cover
-- everything RADIUS has ever seen, and the writer keeps adding to it.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Every group calendar we have cached.
INSERT INTO ccb_event_group_map (ccb_event_id, ccb_group_id, source)
SELECT DISTINCT ON (e.event_id)
  e.event_id,
  c.group_id::TEXT,
  'calendar'
FROM ccb_group_events_cache c
CROSS JOIN LATERAL (
  SELECT NULLIF(TRIM(elem ->> 'eventId'), '') AS event_id
  FROM jsonb_array_elements(
         CASE jsonb_typeof(c.calendar_events)
           WHEN 'array' THEN c.calendar_events
           ELSE '[]'::jsonb
         END
       ) AS elem
) e
WHERE e.event_id IS NOT NULL
ORDER BY e.event_id, c.synced_at DESC NULLS LAST
ON CONFLICT (ccb_event_id) DO NOTHING;

-- 2. Every event id cached on a leader, mapped through that leader's group.
INSERT INTO ccb_event_group_map (ccb_event_id, ccb_group_id, source)
SELECT DISTINCT ON (e.event_id)
  e.event_id,
  l.ccb_group_id::TEXT,
  'leader_event_ids'
FROM circle_leaders l
CROSS JOIN LATERAL (
  SELECT NULLIF(TRIM(eid), '') AS event_id
  FROM unnest(COALESCE(l.ccb_event_ids, ARRAY[]::TEXT[])) AS eid
) e
WHERE e.event_id IS NOT NULL
  AND l.ccb_group_id IS NOT NULL
ORDER BY e.event_id, l.id
ON CONFLICT (ccb_event_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS. Both tables are written by the service role and read only from
-- server-side loaders, so no policy is needed — and without one, PostgREST
-- exposes nothing to anon or authenticated keys.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE ccb_attendance_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccb_event_group_map  ENABLE ROW LEVEL SECURITY;
