-- ============================================================
-- Circle Visit Todo Integration
-- Creates todos for scheduled visits and keeps them in sync
-- ============================================================

-- 1. Add circle_visit todo type and linked_visit_id field to todo_items
ALTER TABLE todo_items
  ADD COLUMN IF NOT EXISTS linked_visit_id UUID REFERENCES circle_visits(id) ON DELETE CASCADE;

-- Update the todo_type check constraint to include circle_visit
ALTER TABLE todo_items
  DROP CONSTRAINT IF EXISTS todo_items_todo_type_check;

ALTER TABLE todo_items
  ADD CONSTRAINT todo_items_todo_type_check 
  CHECK (todo_type IN ('manual', 'encouragement', 'follow_up', 'circle_visit'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_todo_items_linked_visit_id ON todo_items(linked_visit_id);

-- 2. TRIGGER: When a circle visit is scheduled, create a todo
CREATE OR REPLACE FUNCTION handle_visit_scheduled()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a newly scheduled visit
  IF NEW.status = 'scheduled' AND (OLD.id IS NULL OR OLD.status != 'scheduled') THEN
    
    -- Get the leader name for the todo text
    DECLARE
      leader_name TEXT;
    BEGIN
      SELECT name INTO leader_name FROM circle_leaders WHERE id = NEW.leader_id;
      
      -- Create a todo for the scheduled visit
      INSERT INTO todo_items (
        text,
        completed,
        due_date,
        notes,
        todo_type,
        linked_visit_id,
        linked_leader_id
      ) VALUES (
        'Circle Visit: ' || COALESCE(leader_name, 'Leader'),
        false,
        NEW.visit_date,
        NEW.previsit_note,
        'circle_visit',
        NEW.id,
        NEW.leader_id
      );
    END;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_visit_scheduled ON circle_visits;
CREATE TRIGGER trigger_visit_scheduled
  AFTER INSERT OR UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_scheduled();

-- 3. TRIGGER: When a todo linked to a visit is marked complete, complete the visit
CREATE OR REPLACE FUNCTION handle_visit_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a circle_visit todo and it was just completed
  IF NEW.todo_type = 'circle_visit' 
     AND NEW.linked_visit_id IS NOT NULL 
     AND NEW.completed = true 
     AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    
    -- Mark the visit as completed
    -- Note: This is a simplified completion - the user should use the full form
    -- for recording celebrations, observations, and next steps
    UPDATE circle_visits
    SET 
      status = 'completed',
      completed_at = NOW(),
      completed_by = 'todo_completion'
    WHERE id = NEW.linked_visit_id
      AND status = 'scheduled';
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_visit_todo_completion ON todo_items;
CREATE TRIGGER trigger_visit_todo_completion
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_todo_completion();

-- 4. TRIGGER: When a visit is completed (outside of todo list), mark the todo as complete
CREATE OR REPLACE FUNCTION handle_visit_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if the visit was changed to completed
  IF NEW.status = 'completed' 
     AND (OLD.status IS NULL OR OLD.status = 'scheduled') THEN
    
    -- Mark the linked todo as complete
    UPDATE todo_items
    SET 
      completed = true,
      completed_at = NOW()
    WHERE linked_visit_id = NEW.id
      AND todo_type = 'circle_visit'
      AND completed = false;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_visit_completed ON circle_visits;
CREATE TRIGGER trigger_visit_completed
  AFTER UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_completed();

-- 5. TRIGGER: When a visit is canceled, complete the todo with a note
CREATE OR REPLACE FUNCTION handle_visit_canceled()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if the visit was changed to canceled
  IF NEW.status = 'canceled' 
     AND (OLD.status IS NULL OR OLD.status = 'scheduled') THEN
    
    -- Mark the linked todo as complete and add cancellation note
    UPDATE todo_items
    SET 
      completed = true,
      completed_at = NOW(),
      notes = COALESCE(notes || E'\n\n', '') || 'Visit canceled: ' || COALESCE(NEW.cancel_reason, 'No reason provided')
    WHERE linked_visit_id = NEW.id
      AND todo_type = 'circle_visit'
      AND completed = false;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_visit_canceled ON circle_visits;
CREATE TRIGGER trigger_visit_canceled
  AFTER UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_canceled();

-- 6. TRIGGER: When a todo linked to a visit is UN-completed, restore visit to scheduled
CREATE OR REPLACE FUNCTION handle_visit_todo_uncompleted()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if a completed todo was just uncompleted
  IF NEW.completed = false 
     AND (OLD.completed IS NULL OR OLD.completed = true)
     AND NEW.todo_type = 'circle_visit'
     AND NEW.linked_visit_id IS NOT NULL THEN
    
    -- Restore the visit to scheduled status
    UPDATE circle_visits
    SET 
      status = 'scheduled',
      completed_at = NULL,
      completed_by = NULL
    WHERE id = NEW.linked_visit_id
      AND status = 'completed';
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_visit_todo_uncompleted ON todo_items;
CREATE TRIGGER trigger_visit_todo_uncompleted
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_todo_uncompleted();

-- Add comments
COMMENT ON FUNCTION handle_visit_scheduled IS 'Creates a todo when a circle visit is scheduled';
COMMENT ON FUNCTION handle_visit_todo_completion IS 'Marks visit as completed when linked todo is completed';
COMMENT ON FUNCTION handle_visit_completed IS 'Marks linked todo as complete when visit is completed';
COMMENT ON FUNCTION handle_visit_canceled IS 'Marks linked todo as complete when visit is canceled';
COMMENT ON FUNCTION handle_visit_todo_uncompleted IS 'Restores visit to scheduled when linked todo is uncompleted';
