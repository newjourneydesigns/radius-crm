-- Create the ACPD/Directors table
CREATE TABLE IF NOT EXISTS acpds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the Circle Types table
CREATE TABLE IF NOT EXISTS circle_types (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the Statuses table
CREATE TABLE IF NOT EXISTS statuses (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the Frequencies table
CREATE TABLE IF NOT EXISTS frequencies (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the Campuses table
CREATE TABLE IF NOT EXISTS campuses (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial data for Circle Types
INSERT INTO circle_types (value) VALUES
  ('Men''s'),
  ('Women''s'),
  ('Young Adult | Coed'),
  ('Young Adult | Men''s'),
  ('Young Adult | Women''s'),
  ('Young Adult | Couple''s')
ON CONFLICT (value) DO NOTHING;

-- Insert initial data for Statuses
INSERT INTO statuses (value) VALUES
  ('invited'),
  ('pipeline'),
  ('follow-up'),
  ('active'),
  ('paused'),
  ('off-boarding')
ON CONFLICT (value) DO NOTHING;

-- Insert initial data for Frequencies
INSERT INTO frequencies (value) VALUES
  ('Weekly'),
  ('Bi-weekly'),
  ('Monthly'),
  ('Quarterly')
ON CONFLICT (value) DO NOTHING;

-- Insert initial data for Campuses
INSERT INTO campuses (value) VALUES
  ('Flower Mound'),
  ('Denton'),
  ('Lewisville'),
  ('Gainesville'),
  ('Online'),
  ('University'),
  ('Argyle')
ON CONFLICT (value) DO NOTHING;

-- Insert some sample directors
INSERT INTO acpds (name, email, status) VALUES
  ('Trip Ochenski', 'trip@theplanning.church', 'active'),
  ('Jane Doe', 'jane@theplanning.church', 'active'),
  ('John Smith', 'john@theplanning.church', 'active')
ON CONFLICT DO NOTHING;

-- Enable Row Level Security (optional but recommended)
ALTER TABLE acpds ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on acpds" ON acpds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on circle_types" ON circle_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on statuses" ON statuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on frequencies" ON frequencies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on campuses" ON campuses FOR ALL USING (true) WITH CHECK (true);
