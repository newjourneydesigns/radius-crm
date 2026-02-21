-- ============================================================
-- Todo List Integration with Encouragements and Follow-Ups
-- Allows planned encouragements and follow-ups to appear in todo list
-- with bidirectional sync
-- ============================================================

-- 1. Add columns to todo_items to link with encouragements and follow-ups
ALTER TABLE todo_items 
  ADD COLUMN IF NOT EXISTS linked_encouragement_id INTEGER REFERENCES acpd_encouragements(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS linked_leader_id INTEGER REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS todo_type TEXT DEFAULT 'manual' CHECK (todo_type IN ('manual', 'encouragement', 'follow_up'));

-- 2. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_todo_items_linked_encouragement 
  ON todo_items(linked_encouragement_id) WHERE linked_encouragement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todo_items_linked_leader 
  ON todo_items(linked_leader_id) WHERE linked_leader_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todo_items_type 
  ON todo_items(todo_type);

-- 3. Update timestamp trigger for acpd_encouragements
CREATE OR REPLACE FUNCTION update_acpd_encouragements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if the encouragements table has an updated_at column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'acpd_encouragements' 
    AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS update_acpd_encouragements_updated_at ON acpd_encouragements;
    CREATE TRIGGER update_acpd_encouragements_updated_at
      BEFORE UPDATE ON acpd_encouragements
      FOR EACH ROW
      EXECUTE FUNCTION update_acpd_encouragements_updated_at();
  ELSE
    -- Add updated_at column if it doesn't exist
    ALTER TABLE acpd_encouragements ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    CREATE TRIGGER update_acpd_encouragements_updated_at
      BEFORE UPDATE ON acpd_encouragements
      FOR EACH ROW
      EXECUTE FUNCTION update_acpd_encouragements_updated_at();
  END IF;
END $$;

-- 4. Helper function to create or sync encouragement todos
CREATE OR REPLACE FUNCTION sync_encouragement_to_todo(
  p_encouragement_id INTEGER,
  p_user_id UUID,
  p_leader_name TEXT,
  p_message_date DATE,
  p_note TEXT,
  p_encourage_method TEXT
)
RETURNS void AS $$
DECLARE
  v_todo_text TEXT;
  v_method_label TEXT;
BEGIN
  -- Convert method to readable label
  v_method_label := CASE p_encourage_method
    WHEN 'text' THEN '💬 Text'
    WHEN 'email' THEN '📧 Email'
    WHEN 'call' THEN '📞 Call'
    WHEN 'in_person' THEN '🤝 In Person'
    WHEN 'card' THEN '✉️ Card'
    ELSE '📝 Other'
  END;
  
  -- Build todo text
  v_todo_text := 'Send encouragement to ' || p_leader_name || ' via ' || v_method_label;
  
  -- Insert or update the todo
  INSERT INTO todo_items (
    user_id,
    text,
    notes,
    completed,
    due_date,
    todo_type,
    linked_encouragement_id
  ) VALUES (
    p_user_id,
    v_todo_text,
    p_note,
    false,
    p_message_date,
    'encouragement',
    p_encouragement_id
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 5. Helper function to create or sync follow-up todos
CREATE OR REPLACE FUNCTION sync_followup_to_todo(
  p_leader_id INTEGER,
  p_user_id UUID,
  p_leader_name TEXT,
  p_follow_up_date DATE
)
RETURNS void AS $$
DECLARE
  v_todo_text TEXT;
BEGIN
  v_todo_text := 'Follow up with ' || p_leader_name;
  
  -- Insert or update the todo
  INSERT INTO todo_items (
    user_id,
    text,
    completed,
    due_date,
    todo_type,
    linked_leader_id
  ) VALUES (
    p_user_id,
    v_todo_text,
    false,
    p_follow_up_date,
    'follow_up',
    p_leader_id
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_encouragement_to_todo IS 'Creates or updates a todo item for a planned encouragement';
COMMENT ON FUNCTION sync_followup_to_todo IS 'Creates or updates a todo item for a leader follow-up';
COMMENT ON COLUMN todo_items.linked_encouragement_id IS 'Links this todo to a planned encouragement in acpd_encouragements';
COMMENT ON COLUMN todo_items.linked_leader_id IS 'Links this todo to a leader follow-up in circle_leaders';
COMMENT ON COLUMN todo_items.todo_type IS 'Type of todo: manual (user-created), encouragement (from planned encouragement), or follow_up (from leader follow-up)';
