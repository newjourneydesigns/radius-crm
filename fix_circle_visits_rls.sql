-- ============================================================
-- Fix Circle Visits RLS Policies
-- Replaces placeholder policies with proper authentication-based access
-- ============================================================

-- Drop the existing placeholder policies
DROP POLICY IF EXISTS "Directors can manage circle visits" ON circle_visits;
DROP POLICY IF EXISTS "Viewers can read circle visits" ON circle_visits;

-- Create comprehensive RLS policies that work with your auth system

-- 1. Allow authenticated users to view all circle visits
CREATE POLICY "Authenticated users can view circle visits" ON circle_visits
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- 2. Allow authenticated users to insert circle visits
CREATE POLICY "Authenticated users can create circle visits" ON circle_visits
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
  );

-- 3. Allow authenticated users to update circle visits
CREATE POLICY "Authenticated users can update circle visits" ON circle_visits
  FOR UPDATE USING (
    auth.role() = 'authenticated'
  );

-- 4. Allow authenticated users to delete circle visits
CREATE POLICY "Authenticated users can delete circle visits" ON circle_visits
  FOR DELETE USING (
    auth.role() = 'authenticated'
  );

-- Verify RLS is enabled
ALTER TABLE circle_visits ENABLE ROW LEVEL SECURITY;

-- Add helpful comments
COMMENT ON POLICY "Authenticated users can view circle visits" ON circle_visits IS 
  'Allows all authenticated users to view circle visits';
COMMENT ON POLICY "Authenticated users can create circle visits" ON circle_visits IS 
  'Allows all authenticated users to schedule circle visits';
COMMENT ON POLICY "Authenticated users can update circle visits" ON circle_visits IS 
  'Allows all authenticated users to update circle visits (complete, reschedule, etc.)';
COMMENT ON POLICY "Authenticated users can delete circle visits" ON circle_visits IS 
  'Allows all authenticated users to delete circle visits';
