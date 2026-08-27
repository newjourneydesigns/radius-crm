-- Latest Circle Guide cache
--
-- The Circle Leader Toolkit shows a card linking to the newest Circle Guide on
-- valleycreek.plus. That site is external and its /guides page is 5.8MB, so the
-- Events page must never fetch it during SSR. A scheduled function refreshes
-- this single row and the page reads only from here.
--
-- Singleton shape mirrors touchpoint_settings / leadership_snapshot_settings:
-- id is pinned to 1, RLS is on with no policies (deliberately unreachable from
-- the browser), and every read/write goes through a server route on the
-- service-role client.

CREATE TABLE IF NOT EXISTS circle_guide_cache (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Last known good guide: { title, publishedAt, url }
  guide       JSONB,
  -- Last SUCCESSFUL fetch. Kept separate from checked_at so a run of failures
  -- never makes a stale guide look freshly confirmed.
  fetched_at  TIMESTAMPTZ,
  -- Last attempt, success or failure.
  checked_at  TIMESTAMPTZ,
  last_error  TEXT
);

ALTER TABLE circle_guide_cache ENABLE ROW LEVEL SECURITY;

-- Seeded so the refresh route can always UPDATE rather than branch on insert.
INSERT INTO circle_guide_cache (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
