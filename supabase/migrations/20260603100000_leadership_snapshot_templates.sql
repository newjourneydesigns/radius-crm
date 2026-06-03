-- Editable Leadership Snapshot template: the categories, questions, reflection
-- prompts, and rating scale are now admin-editable and versioned. Each edit
-- creates a new (append-only) version; exactly one row is active at a time and
-- drives new submissions. Past submissions freeze their own structure (see the
-- leadership_snapshots.template column below) so historical results render
-- against the questions the leader actually answered.

CREATE TABLE IF NOT EXISTS leadership_snapshot_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE CHECK (version >= 1),
  -- [{ value, label }] — value is the 1..N rating position.
  scale JSONB NOT NULL,
  -- [{ id, label, subtitle, reflectionId, reflectionPrompt, questions:[{id,stem}] }]
  categories JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS leadership_snapshot_templates_active_idx
  ON leadership_snapshot_templates (is_active, version DESC);

ALTER TABLE leadership_snapshot_templates ENABLE ROW LEVEL SECURITY;

-- The exact template (structure) used for a submission, captured at submit time
-- so editing the active template later never rewrites historical results.
ALTER TABLE leadership_snapshots
  ADD COLUMN IF NOT EXISTS template JSONB;

-- No browser-facing policies. Reads/writes go through server routes that verify
-- the RADIUS user (admin edits) or leader session (taking the assessment) before
-- using the service-role client.

COMMENT ON TABLE leadership_snapshot_templates IS 'Versioned, admin-editable Leadership Snapshot template (categories, questions, reflection prompts, rating scale). One active row drives new submissions.';
COMMENT ON COLUMN leadership_snapshots.template IS 'Frozen copy of the template structure used for this submission, so history renders against the questions actually answered.';
