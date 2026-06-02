-- Add 'archived' to the circle_leaders status constraint
--
-- The leader-facing app already treats 'archived' as a real status (Circle
-- Summary access is blocked for archived leaders, archived leaders are excluded
-- from the weekly reset, and their persistent sessions are cleaned up). The
-- "Archived" option also shows in the status dropdown because it exists in the
-- `statuses` table. But circle_leaders_status_check was never updated to allow
-- it, so saving a leader as Archived failed with a check-constraint violation.

-- Make sure the dropdown source has a lowercase 'archived' row (the rest of the
-- codebase compares against lowercase 'archived'). The statuses.value column has
-- no unique constraint in production, so guard with NOT EXISTS rather than
-- ON CONFLICT.
INSERT INTO statuses (value)
SELECT 'archived'
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE value = 'archived');

-- Recreate the constraint with 'archived' included.
ALTER TABLE circle_leaders DROP CONSTRAINT IF EXISTS circle_leaders_status_check;

ALTER TABLE circle_leaders ADD CONSTRAINT circle_leaders_status_check
    CHECK (status = ANY (ARRAY[
      'invited'::text,
      'pipeline'::text,
      'active'::text,
      'paused'::text,
      'off-boarding'::text,
      'archived'::text
    ]));

COMMENT ON CONSTRAINT circle_leaders_status_check ON circle_leaders IS
  'Valid status values: invited, pipeline, active, paused, off-boarding, archived (follow-up is a separate boolean flag)';
