-- Add foreign key constraint for notes.created_by to reference users.id
ALTER TABLE public.notes 
ADD CONSTRAINT notes_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id);

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_notes_created_by_users ON notes(created_by);
