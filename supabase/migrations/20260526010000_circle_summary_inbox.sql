-- Circle Summary Inbox: ACPD/RADIUS-authored messages delivered to
-- individual Circle Leaders with per-leader read state.

CREATE TABLE IF NOT EXISTS circle_summary_inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL CHECK (target_type IN ('all', 'campus', 'acpd', 'leader')),
  target_value TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS circle_summary_inbox_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES circle_summary_inbox_messages(id) ON DELETE CASCADE,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  read_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, leader_id)
);

CREATE TABLE IF NOT EXISTS circle_summary_inbox_message_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES circle_summary_inbox_messages(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, version)
);

CREATE INDEX IF NOT EXISTS circle_summary_inbox_messages_created_idx
  ON circle_summary_inbox_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS circle_summary_inbox_recipients_leader_idx
  ON circle_summary_inbox_recipients (leader_id, created_at DESC);

CREATE INDEX IF NOT EXISTS circle_summary_inbox_recipients_message_idx
  ON circle_summary_inbox_recipients (message_id);

ALTER TABLE circle_summary_inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_summary_inbox_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_summary_inbox_message_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read circle_summary_inbox_messages"
  ON circle_summary_inbox_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read circle_summary_inbox_recipients"
  ON circle_summary_inbox_recipients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read circle_summary_inbox_message_revisions"
  ON circle_summary_inbox_message_revisions FOR SELECT TO authenticated USING (true);
