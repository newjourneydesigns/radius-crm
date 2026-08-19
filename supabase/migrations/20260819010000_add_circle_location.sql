-- Where a circle meets, as a category: Campus Circle / City Circle / Online Circle.
--
-- Mirrors the CCB group classification pulldown labeled "Circle Location", the
-- field staff already maintain in CCB. RADIUS needs it so Find a Circle can
-- filter for online circles (and the others) — the street address in
-- `location` can't answer "which circles meet online?".
--
-- TEXT rather than an enum because the option list is defined by the church in
-- CCB's admin UI and could be renamed/extended there; the app treats the value
-- as display text and never branches on it.
--
-- Populated three ways, never blanked by any of them when CCB has no value:
--   * the CCB import (app/api/ccb/import-circles)
--   * per-circle Re-sync / Mass Update bulk sync (lib/ccb/circle-sync.ts)
--   * the one-shot backfill (app/api/admin/backfill-circle-location)

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS circle_location TEXT;

COMMENT ON COLUMN circle_leaders.circle_location IS
  'CCB "Circle Location" classification: Campus Circle / City Circle / Online Circle. Distinct from `location`, the meeting street address.';
