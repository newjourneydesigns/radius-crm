-- "Done for the week" on a Big 3 slot, independent of the underlying card.
-- A weekly priority can be finished for the week even when its board card
-- stays open. done_for_week_at records when it was marked; the app treats a
-- slot as done for the week only when this timestamp falls in the current week,
-- so it auto-resets each week without a cron job.

ALTER TABLE today_big_three_slots
  ADD COLUMN IF NOT EXISTS done_for_week_at timestamptz NULL;
