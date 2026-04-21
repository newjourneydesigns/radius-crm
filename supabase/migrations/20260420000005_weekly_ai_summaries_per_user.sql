-- Change weekly_ai_summaries from one-per-week to one-per-user-per-week

-- Drop the old single-column unique constraint
alter table weekly_ai_summaries drop constraint if exists weekly_ai_summaries_week_start_date_key;

-- Add composite unique constraint (user + week)
alter table weekly_ai_summaries add constraint weekly_ai_summaries_week_user_unique unique (week_start_date, generated_by);

-- Make generated_by required going forward
alter table weekly_ai_summaries alter column generated_by set not null;

-- Drop old permissive read/update policies
drop policy if exists "Authenticated users can read weekly summaries" on weekly_ai_summaries;
drop policy if exists "Authenticated users can update weekly summaries" on weekly_ai_summaries;

-- Users can only read their own summaries
create policy "Users can read own weekly summaries"
  on weekly_ai_summaries for select
  using (auth.uid() = generated_by);

-- Users can only update their own summaries
create policy "Users can update own weekly summaries"
  on weekly_ai_summaries for update
  using (auth.uid() = generated_by);
