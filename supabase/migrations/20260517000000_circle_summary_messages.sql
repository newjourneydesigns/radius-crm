-- Message Center: admin-controlled messages shown on the Circle Summary events page.
-- Global by default; optional campus filter; optional date window; ordered by priority.

CREATE TABLE IF NOT EXISTS circle_summary_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  header TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  url TEXT,
  url_label TEXT,
  campus_filter TEXT[] NOT NULL DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circle_summary_messages_window_idx
  ON circle_summary_messages (start_date, end_date, priority DESC);

ALTER TABLE circle_summary_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read circle_summary_messages"
  ON circle_summary_messages FOR SELECT TO authenticated USING (true);
