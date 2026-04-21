-- Weekly AI summaries: one per week, generated from filtered calendar data
create table if not exists weekly_ai_summaries (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique, -- Sunday of the week (YYYY-MM-DD); one saved summary per week
  summary_text text not null,
  filter_label text not null default 'All Circles', -- e.g. "Flower Mound · Women's"
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table weekly_ai_summaries enable row level security;

-- All authenticated users can read summaries
create policy "Authenticated users can read weekly summaries"
  on weekly_ai_summaries for select
  using (auth.role() = 'authenticated');

-- Authenticated users can insert
create policy "Authenticated users can insert weekly summaries"
  on weekly_ai_summaries for insert
  with check (auth.role() = 'authenticated');

-- Authenticated users can update (allows overwriting with a new regenerated summary)
create policy "Authenticated users can update weekly summaries"
  on weekly_ai_summaries for update
  using (auth.role() = 'authenticated');
