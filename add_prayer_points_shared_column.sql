-- Add is_shared column to prayer points tables
-- Prayer points are private by default (only visible to the ACPD who created them)
-- Setting is_shared = true makes them visible to all authenticated users

-- Add column to acpd_prayer_points
ALTER TABLE acpd_prayer_points ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

-- Add column to general_prayer_points
ALTER TABLE general_prayer_points ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;

-- Update RLS SELECT policy for acpd_prayer_points:
-- Users can see their own prayers OR shared prayers
DROP POLICY IF EXISTS "Authenticated users can view prayer points" ON acpd_prayer_points;
CREATE POLICY "Users can view own or shared prayer points"
  ON acpd_prayer_points FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_shared = true);

-- Update RLS SELECT policy for general_prayer_points:
-- Users can see their own prayers OR shared prayers
DROP POLICY IF EXISTS "Authenticated users can view general prayer points" ON general_prayer_points;
CREATE POLICY "Users can view own or shared general prayer points"
  ON general_prayer_points FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_shared = true);

-- Update general_prayer_points UPDATE policy to only allow owner updates
DROP POLICY IF EXISTS "Authenticated users can update general prayer points" ON general_prayer_points;
CREATE POLICY "Users can update own general prayer points"
  ON general_prayer_points FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Update general_prayer_points DELETE policy to only allow owner deletes
DROP POLICY IF EXISTS "Authenticated users can delete general prayer points" ON general_prayer_points;
CREATE POLICY "Users can delete own general prayer points"
  ON general_prayer_points FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
