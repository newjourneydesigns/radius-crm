-- Fix card_assignments foreign keys to reference public.users instead of auth.users
-- This allows Supabase PostgREST to resolve the join: users:user_id(name, email)
-- Run this in the Supabase SQL Editor.

-- Drop existing FKs that point to auth.users
ALTER TABLE card_assignments DROP CONSTRAINT IF EXISTS card_assignments_user_id_fkey;
ALTER TABLE card_assignments DROP CONSTRAINT IF EXISTS card_assignments_assigned_by_fkey;

-- Re-add FKs pointing to public.users
ALTER TABLE card_assignments
  ADD CONSTRAINT card_assignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE card_assignments
  ADD CONSTRAINT card_assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES public.users(id);
