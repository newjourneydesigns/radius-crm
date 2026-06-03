-- Leadership Snapshot: in-app self-assessment for Circle Leaders.
-- One row per completed assessment, with full version history so an admin can
-- edit a mistyped entry and revert to any previous edit point.

CREATE TABLE IF NOT EXISTS leadership_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Auto-matched to a Circle Leader by email; admin confirms/corrects the link.
  circle_leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE SET NULL,
  leader_link_confirmed BOOLEAN NOT NULL DEFAULT false,

  -- The signed-in RADIUS user who completed the assessment.
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Context captured at submission time (prefilled from the leader, but stored
  -- as a point-in-time snapshot so later profile edits don't rewrite history).
  respondent_name  TEXT,
  respondent_email TEXT,
  respondent_phone TEXT,
  role        TEXT,
  campus      TEXT,
  circle_type TEXT,
  group_size  TEXT,

  -- Raw responses. answers keyed q1_1..q5_3 (values 1-4); reflections r1..r5.
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,
  reflections JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Computed at submission (stored so history stays stable if scoring changes).
  category_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_score   INTEGER NOT NULL DEFAULT 0,

  -- AI output (Gemini): overall summary + per-category next steps keyed by cat id.
  ai_summary             TEXT,
  ai_category_next_steps JSONB,

  template_version INTEGER NOT NULL DEFAULT 1,
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Immutable copy of the editable payload at each version (mirrors the
-- circle_summary_inbox_message_revisions pattern). Revert reads from here.
CREATE TABLE IF NOT EXISTS leadership_snapshot_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES leadership_snapshots(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  data JSONB NOT NULL,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_id, version)
);

CREATE INDEX IF NOT EXISTS leadership_snapshots_leader_idx
  ON leadership_snapshots (circle_leader_id, created_at DESC);

CREATE INDEX IF NOT EXISTS leadership_snapshots_unlinked_idx
  ON leadership_snapshots (leader_link_confirmed, created_at DESC);

CREATE INDEX IF NOT EXISTS leadership_snapshots_submitted_by_idx
  ON leadership_snapshots (submitted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS leadership_snapshot_revisions_snapshot_idx
  ON leadership_snapshot_revisions (snapshot_id, version DESC);

-- Keep updated_at current on edits.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_leadership_snapshots_updated_at ON leadership_snapshots;
CREATE TRIGGER update_leadership_snapshots_updated_at
  BEFORE UPDATE ON leadership_snapshots
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE leadership_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_snapshot_revisions ENABLE ROW LEVEL SECURITY;

-- No browser-facing policies. All reads/writes go through server routes that
-- verify the RADIUS user session before using the service-role client
-- (same approach as the Circle Summary inbox).

COMMENT ON TABLE leadership_snapshots IS 'Circle Leader self-assessment submissions (Leadership Snapshot), with versioned edit history.';
COMMENT ON COLUMN leadership_snapshots.answers IS 'Rating answers keyed q1_1..q5_3, values 1-4.';
COMMENT ON COLUMN leadership_snapshots.category_scores IS 'Array of { id, label, score (0-100), isStrength } computed at submission.';
COMMENT ON COLUMN leadership_snapshots.ai_category_next_steps IS 'Per-category AI next steps keyed by category id (cat1..cat5).';
COMMENT ON TABLE leadership_snapshot_revisions IS 'Immutable per-version copies of a leadership_snapshot for edit history / revert.';
