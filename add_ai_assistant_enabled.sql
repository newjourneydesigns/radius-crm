-- =============================================================
-- Add AI Assistant toggle to users table
-- =============================================================
-- Allows per-user enable/disable of the Radius AI Assistant.
-- Default: FALSE (off) — admins turn it on for specific users.
-- =============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE;
