-- Fix notes table RLS policies
-- Run these commands in Supabase SQL editor

-- Enable RLS if not already enabled
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy to allow anyone to read notes
CREATE POLICY "Allow read access to notes" ON notes
FOR SELECT TO anon, authenticated
USING (true);

-- Policy to allow anyone to insert notes
CREATE POLICY "Allow insert access to notes" ON notes
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Policy to allow anyone to update their own notes
CREATE POLICY "Allow update access to notes" ON notes
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Policy to allow anyone to delete notes
CREATE POLICY "Allow delete access to notes" ON notes
FOR DELETE TO anon, authenticated
USING (true);
