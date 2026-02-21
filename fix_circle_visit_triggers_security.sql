-- ============================================================
-- Fix Circle Visit Todo Integration - Security Definer
-- Updates trigger functions to bypass RLS when creating/updating todos
-- ============================================================

-- 1. Update the visit scheduled trigger to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_visit_scheduled()
RETURNS TRIGGER 
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
DECLARE
  leader_name TEXT;
BEGIN
  -- Only process if this is a newly scheduled visit
  IF NEW.status = 'scheduled' AND (OLD.id IS NULL OR OLD.status != 'scheduled') THEN
    
    -- Get the leader name for the todo text
    SELECT name INTO leader_name FROM circle_leaders WHERE id = NEW.leader_id;
    
    -- Create a todo for the scheduled visit
    INSERT INTO todo_items (
      user_id,
      text,
      completed,
      due_date,
      notes,
      todo_type,
      linked_visit_id,
      linked_leader_id
    ) VALUES (
      auth.uid(), -- Use the current user's ID
      'Circle Visit: ' || COALESCE(leader_name, 'Leader'),
      false,
      NEW.visit_date,
      NEW.previsit_note,
      'circle_visit',
      NEW.id,
      NEW.leader_id
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the visit completed trigger to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_visit_completed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 3. Update the visit canceled trigger to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_visit_canceled()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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

-- 4. Update the todo completion trigger to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_visit_todo_completion()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process if this is a circle_visit todo and it was just completed
  IF NEW.todo_type = 'circle_visit' 
     AND NEW.linked_visit_id IS NOT NULL 
     AND NEW.completed = true 
     AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    
    -- Mark the visit as completed
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

-- 5. Update the todo uncompleted trigger to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_visit_todo_uncompleted()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Recreate all triggers to ensure they use the updated functions
DROP TRIGGER IF EXISTS trigger_visit_scheduled ON circle_visits;
CREATE TRIGGER trigger_visit_scheduled
  AFTER INSERT OR UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_scheduled();

DROP TRIGGER IF EXISTS trigger_visit_completed ON circle_visits;
CREATE TRIGGER trigger_visit_completed
  AFTER UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_completed();

DROP TRIGGER IF EXISTS trigger_visit_canceled ON circle_visits;
CREATE TRIGGER trigger_visit_canceled
  AFTER UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_canceled();

DROP TRIGGER IF EXISTS trigger_visit_todo_completion ON todo_items;
CREATE TRIGGER trigger_visit_todo_completion
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_todo_completion();

DROP TRIGGER IF EXISTS trigger_visit_todo_uncompleted ON todo_items;
CREATE TRIGGER trigger_visit_todo_uncompleted
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_visit_todo_uncompleted();

-- Update comments
COMMENT ON FUNCTION handle_visit_scheduled IS 'Creates a todo when a circle visit is scheduled (runs with SECURITY DEFINER to bypass RLS)';
COMMENT ON FUNCTION handle_visit_completed IS 'Marks linked todo as complete when visit is completed (runs with SECURITY DEFINER)';
COMMENT ON FUNCTION handle_visit_canceled IS 'Marks linked todo as complete when visit is canceled (runs with SECURITY DEFINER)';
COMMENT ON FUNCTION handle_visit_todo_completion IS 'Marks visit as completed when linked todo is completed (runs with SECURITY DEFINER)';
COMMENT ON FUNCTION handle_visit_todo_uncompleted IS 'Restores visit to scheduled when linked todo is uncompleted (runs with SECURITY DEFINER)';
