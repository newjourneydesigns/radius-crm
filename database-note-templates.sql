-- Create note_templates table for personal user note templates
CREATE TABLE IF NOT EXISTS note_templates (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS (Row Level Security) policies
ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own templates
CREATE POLICY "Users can view own note templates" ON note_templates
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can only insert their own templates  
CREATE POLICY "Users can create own note templates" ON note_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own templates
CREATE POLICY "Users can update own note templates" ON note_templates
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can only delete their own templates
CREATE POLICY "Users can delete own note templates" ON note_templates
  FOR DELETE USING (auth.uid() = user_id);

-- Add index for faster queries by user_id
CREATE INDEX IF NOT EXISTS idx_note_templates_user_id ON note_templates(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_note_templates_updated_at 
  BEFORE UPDATE ON note_templates 
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
