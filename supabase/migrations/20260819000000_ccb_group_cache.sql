-- CCB group cache — nightly snapshot of every CCB group's profile header
--
-- Powers POST /api/ccb/group-search (consumed by the Valley Creek Toolkit).
-- Rebuilt by lib/ccb/group-cache-sync.ts, which pages through CCB v1's
-- `group_profiles` service with include_participants=false once a night
-- (netlify/functions/sync-group-cache.ts → POST /api/ccb/sync-group-cache).
-- Searches read ONLY this table — a group search never spends a CCB API call.
--
-- Sweep contract: rows are upserted with the sweep's start timestamp, and rows
-- whose synced_at predates a sweep are deleted ONLY after that sweep finished
-- every page. A partial sweep (budget guard tripped, CCB down) leaves
-- yesterday's rows serving and never deletes anything.

CREATE TABLE IF NOT EXISTS ccb_group_cache (
  id           TEXT PRIMARY KEY,          -- CCB group id
  name         TEXT NOT NULL,
  campus       TEXT,
  group_type   TEXT,
  main_leader  TEXT,                      -- display name, for disambiguation
  member_count INT,                       -- null: group_profiles has no count without participants
  inactive     BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at    TIMESTAMPTZ NOT NULL
);

-- Search filters on name (ILIKE) and active-only by default.
CREATE INDEX IF NOT EXISTS ccb_group_cache_name_idx ON ccb_group_cache (lower(name));
CREATE INDEX IF NOT EXISTS ccb_group_cache_inactive_idx ON ccb_group_cache (inactive);
-- Stale-row cleanup after a complete sweep deletes by synced_at.
CREATE INDEX IF NOT EXISTS ccb_group_cache_synced_at_idx ON ccb_group_cache (synced_at);

-- Single-row sweep state. last_full_sync_at is stamped ONLY when a sweep
-- covered every page — it is the `syncedAt` the search endpoint reports, and
-- null means the cache has never completed a full sweep.
CREATE TABLE IF NOT EXISTS ccb_group_cache_state (
  id                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_full_sync_at TIMESTAMPTZ,
  last_attempt_at   TIMESTAMPTZ,
  last_error        TEXT
);

-- Server-side only: RLS enabled with NO policies, so the anon/authenticated
-- roles can't touch these tables. All reads and writes go through API routes
-- using the service role (which bypasses RLS).
ALTER TABLE ccb_group_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccb_group_cache_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ccb_group_cache IS
  'Nightly snapshot of CCB group_profiles headers (no rosters). Read by /api/ccb/group-search; rebuilt by /api/ccb/sync-group-cache. Server-side access only.';
COMMENT ON COLUMN ccb_group_cache.member_count IS
  'Null when CCB''s group_profiles response carries no membership count (it omits one when include_participants=false).';
COMMENT ON TABLE ccb_group_cache_state IS
  'Single-row sweep state for ccb_group_cache. last_full_sync_at is only stamped by sweeps that finished every page.';
