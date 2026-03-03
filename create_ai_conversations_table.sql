-- =============================================================
-- Radius AI Assistant — Conversation History Table
-- =============================================================
-- Stores multi-turn conversation history for the Radius AI
-- assistant. Messages auto-expire after 7 days.
-- =============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);

-- 3. Index for cleanup job (expire old conversations)
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at ON ai_conversations(updated_at);

-- 4. Enable RLS
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies — users can only access their own conversations
CREATE POLICY "Users can view their own AI conversations"
  ON ai_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI conversations"
  ON ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI conversations"
  ON ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_ai_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_conversations_updated_at();

-- 7. Cleanup function — delete conversations older than 7 days
-- Run this via pg_cron or a scheduled Netlify function:
--   SELECT cleanup_old_ai_conversations();
CREATE OR REPLACE FUNCTION cleanup_old_ai_conversations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_conversations
  WHERE updated_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Optional: schedule automatic cleanup via pg_cron (if extension is enabled)
-- SELECT cron.schedule('cleanup-ai-conversations', '0 3 * * *', 'SELECT cleanup_old_ai_conversations()');

-- 9. Grant service role full access (for API route using service key)
GRANT ALL ON ai_conversations TO service_role;
