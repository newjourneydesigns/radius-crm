-- Create checklist_templates table
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  board_id uuid REFERENCES project_boards(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checklist templates"
  ON checklist_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checklist templates"
  ON checklist_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own checklist templates"
  ON checklist_templates FOR DELETE
  USING (auth.uid() = user_id);
