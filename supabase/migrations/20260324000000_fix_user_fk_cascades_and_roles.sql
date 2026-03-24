-- Fix 1: Update role CHECK constraint to match actual values in use
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ACPD', 'Viewer', 'admin', 'user'));

-- Fix 2: notes.created_by — add SET NULL on delete so notes survive user removal
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_created_by_fkey;
ALTER TABLE notes
  ADD CONSTRAINT notes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Fix 3: board_cards.created_by — set null on delete (preserve card history)
ALTER TABLE board_cards DROP CONSTRAINT IF EXISTS board_cards_created_by_fkey;
ALTER TABLE board_cards
  ADD CONSTRAINT board_cards_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix 4: card_assignments.assigned_by — set null on delete
ALTER TABLE card_assignments DROP CONSTRAINT IF EXISTS card_assignments_assigned_by_fkey;
ALTER TABLE card_assignments
  ADD CONSTRAINT card_assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
