-- Per-day "done" marks for Today-page items that have no completion field of
-- their own (birthdays, prayer requests). One row per item marked done on a
-- given day; deleting the row is the Undo. Keyed by day so the same recurring
-- item can be re-marked on a later day.
--
--   item_type  'birthday' | 'prayer'
--   item_key   'birthday'  -> circle_leader id
--              'prayer'    -> 'leader:<id>' | 'general:<id>'

CREATE TABLE IF NOT EXISTS today_done_marks (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type  text NOT NULL,
  item_key   text NOT NULL,
  done_on    date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_key, done_on)
);

CREATE INDEX IF NOT EXISTS idx_today_done_marks_user_day
  ON today_done_marks (user_id, done_on);

ALTER TABLE today_done_marks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON today_done_marks TO authenticated;

DROP POLICY IF EXISTS "Users can view own done marks" ON today_done_marks;
DROP POLICY IF EXISTS "Users can insert own done marks" ON today_done_marks;
DROP POLICY IF EXISTS "Users can delete own done marks" ON today_done_marks;

CREATE POLICY "Users can view own done marks"
  ON today_done_marks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own done marks"
  ON today_done_marks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own done marks"
  ON today_done_marks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
