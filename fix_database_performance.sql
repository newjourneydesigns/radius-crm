-- Fix database performance issues by adding missing indexes
-- This will resolve the authentication timeout problems

-- Add indexes to users table for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add indexes to circle_leaders table for better performance
CREATE INDEX IF NOT EXISTS idx_circle_leaders_id ON circle_leaders(id);
CREATE INDEX IF NOT EXISTS idx_circle_leaders_status ON circle_leaders(status);
CREATE INDEX IF NOT EXISTS idx_circle_leaders_campus ON circle_leaders(campus);
CREATE INDEX IF NOT EXISTS idx_circle_leaders_created_at ON circle_leaders(created_at);

-- Add indexes to notes table for better performance
CREATE INDEX IF NOT EXISTS idx_notes_circle_leader_id ON notes(circle_leader_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE circle_leaders;
ANALYZE notes;

-- Verify indexes were created using standard SQL
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE indexname LIKE 'idx_users_%' 
   OR indexname LIKE 'idx_circle_leaders_%' 
   OR indexname LIKE 'idx_notes_%'
ORDER BY tablename, indexname;
