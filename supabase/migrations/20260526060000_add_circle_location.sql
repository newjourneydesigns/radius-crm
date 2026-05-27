-- Add meeting location field to circle_leaders for use on the Find a Circle page.
ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN circle_leaders.location IS 'Free-form meeting location for the circle (city, neighborhood, address, etc.)';
