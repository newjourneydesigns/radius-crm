-- ============================================================
-- Bidirectional Sync Triggers
-- Keeps todos in sync with encouragements and follow-ups
-- ============================================================

-- 1. TRIGGER: When a todo linked to an encouragement is marked complete
-- This trigger marks the encouragement as "sent" when the todo is completed
CREATE OR REPLACE FUNCTION handle_encouragement_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is an encouragement todo and it was just completed
  IF NEW.todo_type = 'encouragement' 
     AND NEW.linked_encouragement_id IS NOT NULL 
     AND NEW.completed = true 
     AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    
    -- Update the encouragement to mark it as sent
    UPDATE acpd_encouragements
    SET 
      message_type = 'sent',
      message_date = CURRENT_DATE
    WHERE id = NEW.linked_encouragement_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_encouragement_todo_completion ON todo_items;
CREATE TRIGGER trigger_encouragement_todo_completion
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_encouragement_todo_completion();

-- 2. TRIGGER: When a todo linked to a follow-up is marked complete
-- This trigger clears the follow-up requirement when the todo is completed
CREATE OR REPLACE FUNCTION handle_followup_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a follow-up todo and it was just completed
  IF NEW.todo_type = 'follow_up' 
     AND NEW.linked_leader_id IS NOT NULL 
     AND NEW.completed = true 
     AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    
    -- Clear the follow-up requirement
    UPDATE circle_leaders
    SET 
      follow_up_required = false,
      follow_up_date = NULL
    WHERE id = NEW.linked_leader_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_followup_todo_completion ON todo_items;
CREATE TRIGGER trigger_followup_todo_completion
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_followup_todo_completion();

-- 3. TRIGGER: When an encouragement is marked as sent (outside of todo list)
-- This trigger marks the linked todo as complete
CREATE OR REPLACE FUNCTION handle_encouragement_marked_sent()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if the encouragement was changed from planned to sent
  IF NEW.message_type = 'sent' 
     AND (OLD.message_type IS NULL OR OLD.message_type = 'planned') THEN
    
    -- Mark the linked todo as complete
    UPDATE todo_items
    SET 
      completed = true,
      completed_at = NOW()
    WHERE linked_encouragement_id = NEW.id
      AND todo_type = 'encouragement'
      AND completed = false;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_encouragement_marked_sent ON acpd_encouragements;
CREATE TRIGGER trigger_encouragement_marked_sent
  AFTER UPDATE ON acpd_encouragements
  FOR EACH ROW
  EXECUTE FUNCTION handle_encouragement_marked_sent();

-- 4. TRIGGER: When an encouragement is deleted (outside of todo list)
-- This trigger deletes the linked todo (already handled by CASCADE, but explicit for clarity)
CREATE OR REPLACE FUNCTION handle_encouragement_deleted()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete the linked todo (though CASCADE should handle this)
  DELETE FROM todo_items
  WHERE linked_encouragement_id = OLD.id
    AND todo_type = 'encouragement';
    
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_encouragement_deleted ON acpd_encouragements;
CREATE TRIGGER trigger_encouragement_deleted
  BEFORE DELETE ON acpd_encouragements
  FOR EACH ROW
  EXECUTE FUNCTION handle_encouragement_deleted();

-- 5. TRIGGER: When a follow-up is cleared (outside of todo list)
-- This trigger marks the linked todo as complete
CREATE OR REPLACE FUNCTION handle_followup_cleared()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if follow_up_required was changed from true to false
  IF NEW.follow_up_required = false 
     AND (OLD.follow_up_required IS NULL OR OLD.follow_up_required = true) THEN
    
    -- Mark the linked todo as complete
    UPDATE todo_items
    SET 
      completed = true,
      completed_at = NOW()
    WHERE linked_leader_id = NEW.id
      AND todo_type = 'follow_up'
      AND completed = false;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_followup_cleared ON circle_leaders;
CREATE TRIGGER trigger_followup_cleared
  AFTER UPDATE ON circle_leaders
  FOR EACH ROW
  EXECUTE FUNCTION handle_followup_cleared();

-- 6. TRIGGER: When a todo linked to encouragement/follow-up is UN-completed
-- This trigger restores the encouragement/follow-up to its original state
CREATE OR REPLACE FUNCTION handle_todo_uncompleted()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if a completed todo was just uncompleted
  IF NEW.completed = false 
     AND (OLD.completed IS NULL OR OLD.completed = true) THEN
    
    -- If it's an encouragement todo, restore it to "planned"
    IF NEW.todo_type = 'encouragement' AND NEW.linked_encouragement_id IS NOT NULL THEN
      UPDATE acpd_encouragements
      SET message_type = 'planned'
      WHERE id = NEW.linked_encouragement_id;
    END IF;
    
    -- If it's a follow-up todo, restore the follow-up requirement
    IF NEW.todo_type = 'follow_up' AND NEW.linked_leader_id IS NOT NULL THEN
      UPDATE circle_leaders
      SET 
        follow_up_required = true,
        follow_up_date = NEW.due_date
      WHERE id = NEW.linked_leader_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_todo_uncompleted ON todo_items;
CREATE TRIGGER trigger_todo_uncompleted
  AFTER UPDATE ON todo_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_todo_uncompleted();

COMMENT ON FUNCTION handle_encouragement_todo_completion IS 'Marks encouragement as sent when linked todo is completed';
COMMENT ON FUNCTION handle_followup_todo_completion IS 'Clears follow-up requirement when linked todo is completed';
COMMENT ON FUNCTION handle_encouragement_marked_sent IS 'Marks linked todo as complete when encouragement is sent';
COMMENT ON FUNCTION handle_followup_cleared IS 'Marks linked todo as complete when follow-up is cleared';
COMMENT ON FUNCTION handle_todo_uncompleted IS 'Restores encouragement/follow-up when linked todo is uncompleted';
