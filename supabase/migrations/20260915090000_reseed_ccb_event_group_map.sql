-- Catch ccb_event_group_map up with every calendar RADIUS has cached since it
-- was first seeded (2026-09-04).
--
-- The map is what attributes a row in ccb_attendance_facts to a circle, and
-- until this release its only automatic writer was the daily prewarm, which
-- refreshes a group's calendar on its meeting day or when that group's cache
-- row is more than a week stale. The toolkit's own read path stamps
-- `synced_at` fresh on every live calendar fetch, so a group with a blank or
-- wrong `day` whose leaders open the toolkit regularly satisfied neither
-- condition and was never revisited. Events created in CCB after the fact —
-- a circle that met on a holiday and added the event a few days later — stayed
-- unmapped, and every person who attended kept reading "last attended" as of
-- their previous meeting.
--
-- The code fix makes the read paths and the nightly calendar-mode discovery
-- job write the map too. This re-seed applies the same knowledge to what is
-- already on file, so affected rosters correct on the next page load instead
-- of on the next sync cycle.
--
-- Both statements are the original seed verbatim and ON CONFLICT DO NOTHING:
-- an event already mapped keeps its existing group, so re-running is safe.

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
