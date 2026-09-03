-- Allow 'on-boarding' as a Circle Leader status.
--
-- Every layer of the app already treats 'on-boarding' as a real status: it is
-- in the `statuses` table that feeds the status dropdown, in the TypeScript
-- CircleLeader type, in the /api/circle-leaders validators, in the dashboard
-- filters and card dropdowns, and in the CSV importers. The only thing that
-- disagreed was circle_leaders_status_check, so picking "On-boarding" on a
-- leader and saving always failed with a check-constraint violation.
--
-- 20260602000000_add_archived_status.sql treated 'on-boarding' as a legacy bad
-- value and rewrote the one production row holding it to 'invited'. That was
-- wrong; this migration puts the value back in the constraint.

-- Make sure the dropdown source has the row (the codebase compares against
-- lowercase 'on-boarding'). statuses.value has no unique constraint in
-- production, so guard with NOT EXISTS rather than ON CONFLICT.
INSERT INTO statuses (value)
SELECT 'on-boarding'
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE lower(value) = 'on-boarding');

-- The circle detail page renders one dropdown option per `statuses` row, so any
-- row outside the constraint list is an option that cannot be saved. 'follow-up'
-- stopped being a status in modify_follow_up_system.sql (Aug 2025) — it is a
-- boolean flag now — but populate-statuses.js still seeded it. Drop any such
-- stragglers. circle_leaders.status is plain text with no FK to statuses, so
-- nothing references these rows.
DELETE FROM statuses
WHERE lower(value) NOT IN (
  'invited', 'pipeline', 'on-boarding', 'active', 'paused', 'off-boarding', 'archived'
);

ALTER TABLE circle_leaders DROP CONSTRAINT IF EXISTS circle_leaders_status_check;

ALTER TABLE circle_leaders ADD CONSTRAINT circle_leaders_status_check
    CHECK (status = ANY (ARRAY[
      'invited'::text,
      'pipeline'::text,
      'on-boarding'::text,
      'active'::text,
      'paused'::text,
      'off-boarding'::text,
      'archived'::text
    ]));

COMMENT ON CONSTRAINT circle_leaders_status_check ON circle_leaders IS
  'Valid status values: invited, pipeline, on-boarding, active, paused, off-boarding, archived (follow-up is a separate boolean flag). Keep in sync with CIRCLE_LEADER_STATUSES in lib/statuses.ts.';
