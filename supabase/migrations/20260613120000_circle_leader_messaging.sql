-- Circle Leader profile messaging: saved message templates + inbound leader replies.
--
-- Powers the Messaging section on the Circle Leader Profile page. Outbound delivery
-- and read receipts reuse the existing circle_summary_inbox_messages / _recipients
-- tables (a profile message is just an inbox message targeted at one leader), so this
-- migration only adds the two pieces that don't exist yet:
--
--   * circle_leader_message_templates — saved, reusable messages so staff can quickly
--     send common leader communications. {{name}} is substituted with the leader's name
--     when a template is applied in the composer.
--   * circle_leader_inbox_replies — messages a leader sends back from their Toolkit
--     Inbox, so the profile shows a complete two-way conversation timeline tied to that
--     leader's record.

CREATE TABLE IF NOT EXISTS circle_leader_message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,                       -- becomes the inbox message title when applied
  body_html TEXT NOT NULL DEFAULT '',
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circle_leader_message_templates_sort_idx
  ON circle_leader_message_templates (sort_order, created_at);

CREATE TABLE IF NOT EXISTS circle_leader_inbox_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  message_id UUID REFERENCES circle_summary_inbox_messages(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  read_by_staff_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circle_leader_inbox_replies_leader_idx
  ON circle_leader_inbox_replies (leader_id, created_at DESC);

ALTER TABLE circle_leader_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_leader_inbox_replies ENABLE ROW LEVEL SECURITY;

-- No browser-facing policies. RADIUS staff reach these tables through server routes
-- that verify a signed-in user, and leaders post replies through the leader-session
-- route, both using the service-role client.

INSERT INTO circle_leader_message_templates (title, subject, body_html, category, sort_order)
VALUES
  (
    'Weekly check-in',
    'Checking in on your Circle',
    '<p>Hey {{name}}, just checking in on how your Circle is going this week. Anything I can be praying for or help you with?</p>',
    'Check-in',
    10
  ),
  (
    'Thank you',
    'Thank you for leading',
    '<p>Thank you, {{name}}, for the way you faithfully love and lead your Circle. It matters more than you know.</p>',
    'Encouragement',
    20
  ),
  (
    'Event summary reminder',
    'Quick reminder: Circle event summary',
    '<p>Hey {{name}}, when you get a moment would you submit your most recent Circle event summary? It helps us stay connected to how your Circle is doing.</p>',
    'Reminder',
    30
  ),
  (
    'Let''s grab coffee',
    'Let''s connect soon',
    '<p>Hey {{name}}, I''d love to connect in person soon. What does your schedule look like over the next couple of weeks?</p>',
    'Care',
    40
  )
ON CONFLICT DO NOTHING;
