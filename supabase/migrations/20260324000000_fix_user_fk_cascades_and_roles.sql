-- Fix 1: Add ACPD and Viewer to the user_role enum
-- (role column is an enum type, not plain TEXT with CHECK constraint)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ACPD';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Viewer';

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
