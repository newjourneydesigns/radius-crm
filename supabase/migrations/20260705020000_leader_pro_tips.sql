-- Circle Leader Pro Tips — short weekly YouTube clips with a rich-text
-- write-up, published on a schedule.
--
-- A tip becomes visible in the toolkit's Resources "Pro Tips" catalog once
-- publish_at arrives (query-time filter — no cron involved). Optionally the
-- tip is also cross-posted to the leader inbox: the admin API creates a
-- scheduled circle_summary_inbox_messages row (inbox_message_id) delivered by
-- the existing deliver-scheduled-inbox worker, pushes included.

CREATE TABLE IF NOT EXISTS leader_pro_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL DEFAULT 'circle'
    CHECK (audience IN ('circle', 'host_team')),
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  publish_at TIMESTAMPTZ NOT NULL,
  send_to_inbox BOOLEAN NOT NULL DEFAULT false,
  inbox_message_id UUID REFERENCES circle_summary_inbox_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS leader_pro_tips_publish_idx
  ON leader_pro_tips (audience, publish_at DESC);

-- Service-role only (all access goes through admin/leader API routes).
ALTER TABLE leader_pro_tips ENABLE ROW LEVEL SECURITY;
