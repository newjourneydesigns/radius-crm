-- Essential database indexes for authentication performance
-- Run this in your Supabase SQL editor or database console

-- Add index to users table for faster authentication lookups (most important)
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- Add indexes to circle_leaders table for dashboard performance  
CREATE INDEX IF NOT EXISTS idx_circle_leaders_status ON circle_leaders(status);
CREATE INDEX IF NOT EXISTS idx_circle_leaders_campus ON circle_leaders(campus);

-- Add index to notes table for faster note queries
CREATE INDEX IF NOT EXISTS idx_notes_circle_leader_id ON notes(circle_leader_id);

-- Update table statistics for query optimization (most important)
ANALYZE users;
