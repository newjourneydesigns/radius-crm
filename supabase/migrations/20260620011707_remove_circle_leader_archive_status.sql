-- Remove the legacy 'archive' value while keeping 'archived' as the real
-- Circle Leader lifecycle status.
-- Board/card/inbox archiving remains separate and continues to use is_archived/archived_at.

UPDATE circle_leaders
SET status = 'archived'
WHERE lower(coalesce(status, '')) = 'archive';

DELETE FROM statuses
WHERE lower(value) = 'archive';

INSERT INTO statuses (value)
SELECT 'archived'
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE lower(value) = 'archived');

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
