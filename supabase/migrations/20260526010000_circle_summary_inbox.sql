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

-- No browser-facing policies are added. Radius users and Circle Summary
-- leaders access inbox data through server routes that enforce the sender
-- session or leader-session cookie before using the service-role client.


-- Test messages for local development and inbox UI testing.
INSERT INTO circle_summary_inbox_messages (title, body_html, target_type, target_value)
VALUES
  (
    'Welcome to the Summer Semester',
    '<p>Hey Circle Leaders! The Summer Semester begins May 31 and runs through July 25.</p><p>This summer, we are focusing on enjoying God and the life He has given us. As you lead, help create space for people to slow down, be present, build godly relationships, and receive the goodness of God together.</p>',
    'all',
    NULL
  ),
  (
    'Mid-Summer Circle Check-In',
    '<p>Thank you for faithfully leading and loving your Circle this summer.</p><p>Take a few minutes this week to check in with each person, celebrate what God is doing, and invite them to stay connected through simple, life-giving moments together.</p>',
    'all',
    NULL
  ),
  (
    'Summer Semester Closing Reminder',
    '<p>Our Summer Semester finishes on July 25.</p><p>As we come to the end of the semester, look for opportunities to celebrate stories, encourage next steps, and help your Circle recognize how God has been present in their summer.</p>',
    'all',
    NULL
  )
ON CONFLICT DO NOTHING;
