-- Fix: handle_visit_scheduled trigger was missing user_id when creating todo
-- This caused "null value in column user_id of relation todo_items" error

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
        user_id,
        text,
        completed,
        due_date,
        notes,
        todo_type,
        linked_visit_id,
        linked_leader_id
      ) VALUES (
        NEW.scheduled_by::uuid,
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
