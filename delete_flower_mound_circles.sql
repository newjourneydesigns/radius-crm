-- Delete all Flower Mound campus circles and their related data
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
--
-- This script deletes child records first to satisfy foreign key constraints,
-- then deletes the circle_leaders rows for the Flower Mound campus.
-- Tables with ON DELETE CASCADE (circle_leader_scores, acpd tracking,
-- development_prospects, leader_evaluations, event_summary_followups)
-- will be cleaned up automatically.

BEGIN;

-- 1. Preview: see what will be deleted (optional — comment out after confirming)
SELECT id, name, campus, status
FROM circle_leaders
WHERE campus = 'Flower Mound';

-- 2. Delete child records that do NOT have ON DELETE CASCADE

-- Circle visits
DELETE FROM circle_visits
WHERE leader_id IN (
  SELECT id FROM circle_leaders WHERE campus = 'Flower Mound'
);

-- Communications
DELETE FROM communications
WHERE circle_leader_id IN (
  SELECT id FROM circle_leaders WHERE campus = 'Flower Mound'
);

-- Connections
DELETE FROM connections
WHERE circle_leader_id IN (
  SELECT id FROM circle_leaders WHERE campus = 'Flower Mound'
);

-- Notes
DELETE FROM notes
WHERE circle_leader_id IN (
  SELECT id FROM circle_leaders WHERE campus = 'Flower Mound'
);

-- 3. Delete the circle leaders themselves
--    (cascade-linked tables are cleaned up automatically)
DELETE FROM circle_leaders
WHERE campus = 'Flower Mound';

COMMIT;
