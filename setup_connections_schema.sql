-- Create connection_types table
CREATE TABLE IF NOT EXISTS connection_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default connection types
INSERT INTO connection_types (name, description) VALUES
('Phone Call', 'Direct phone conversation with circle leader'),
('Text Message', 'SMS or text message communication'),
('Email', 'Email communication'),
('In-Person Meeting', 'Face-to-face meeting or encounter'),
('Video Call', 'Video conference or virtual meeting'),
('Social Media', 'Communication via social media platforms'),
('Other', 'Other forms of communication')
ON CONFLICT (name) DO NOTHING;

-- Create connections table
CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY,
  circle_leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  connection_type_id INTEGER NOT NULL REFERENCES connection_types(id),
  date_of_connection DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'System'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_connections_leader_id ON connections(circle_leader_id);
CREATE INDEX IF NOT EXISTS idx_connections_date ON connections(date_of_connection);
CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(connection_type_id);

-- Enable RLS (Row Level Security)
ALTER TABLE connection_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Create policies for connection_types (readable by all authenticated users)
CREATE POLICY "Allow read access to connection_types" ON connection_types
  FOR SELECT TO authenticated USING (true);

-- Create policies for connections
CREATE POLICY "Allow all operations on connections" ON connections
  FOR ALL TO authenticated USING (true);

-- Grant permissions
GRANT ALL ON connection_types TO authenticated;
GRANT ALL ON connections TO authenticated;
GRANT USAGE ON SEQUENCE connection_types_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE connections_id_seq TO authenticated;
