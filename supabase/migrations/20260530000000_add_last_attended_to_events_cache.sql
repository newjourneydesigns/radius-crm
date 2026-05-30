-- Tier 3 read-path optimization for the Circle Summary roster page.
--
-- Previously the roster "last attended" feature re-parsed the entire global
-- `attendance_xml` blob (every group, 12 weeks) on every roster load just to
-- extract one group's last-attended-per-person map. That blob is duplicated
-- onto every group's cache row, so each read pulled and parsed a large payload.
--
-- This column stores the small, already-derived per-group map
-- ({ "<ccb_individual_id>": "YYYY-MM-DD", ... }) so reads can skip the parse
-- entirely. It is populated by the daily prewarm job and self-healed by the
-- roster/attendance loader on a cache miss. Nullable + backward compatible:
-- the loader falls back to parsing attendance_xml when this is absent.
alter table public.ccb_group_events_cache
  add column if not exists last_attended jsonb;
