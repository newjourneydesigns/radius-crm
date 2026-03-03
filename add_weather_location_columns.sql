-- Add weather location columns to users table
-- Users can set their city, state, and zip for weather in daily digest emails

ALTER TABLE users ADD COLUMN IF NOT EXISTS weather_city TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weather_state TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weather_zip TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_weather BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN users.weather_city IS 'City name for weather in daily digest email';
COMMENT ON COLUMN users.weather_state IS 'US state abbreviation for weather in daily digest email';
COMMENT ON COLUMN users.weather_zip IS 'ZIP code for weather in daily digest email';
COMMENT ON COLUMN users.include_weather IS 'Whether to include weather forecast in daily digest email';
