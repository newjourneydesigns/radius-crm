-- Add completed_at timestamp to todo_items so completed tasks can auto-hide daily
-- This is idempotent and safe to re-run.

ALTER TABLE public.todo_items
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Best-effort backfill for existing completed rows
-- Use updated_at as an approximation of completion time when available.
UPDATE public.todo_items
SET completed_at = COALESCE(updated_at, created_at, NOW())
WHERE completed IS TRUE
  AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_todo_items_completed_at ON public.todo_items(completed_at);
