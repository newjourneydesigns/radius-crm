-- Persisted resolution for fuzzy "needs_review" matches.
--
-- When reconcile can only fuzzy-match someone (name matches a form response but
-- no shared CCB id / email / phone), it parks them in needs_review for a human.
-- An admin can then confirm the match (counts as submitted) or reject it (back to
-- unsubmitted). We store that decision here so reconcile honors it on future runs
-- instead of re-flagging the same person every time.
--   'confirmed' -> treated as submitted
--   'rejected'  -> treated as missing (form link dropped)
--   NULL        -> unresolved

ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS match_resolution TEXT
  CHECK (match_resolution IN ('confirmed', 'rejected'));

COMMENT ON COLUMN follow_up_campaign_people.match_resolution IS
  'Admin decision on a fuzzy needs_review match: confirmed (=submitted) or rejected (=missing). Honored by reconcile.';
