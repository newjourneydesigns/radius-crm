-- AI Circle Summaries: latest AI coaching snapshot per leader + timeframe,
-- shared across ACPDs so a saved summary costs no extra Gemini quota to view.
create table if not exists circle_ai_summaries (
  id uuid primary key default gen_random_uuid(),
  leader_id bigint not null,
  timeframe_key text not null check (timeframe_key in ('last_month', 'last_3_months', 'last_6_months', 'semester')),
  start_date date not null,
  end_date date not null,
  summary_text text not null,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (leader_id, timeframe_key)
);

create index if not exists idx_circle_ai_summaries_leader on circle_ai_summaries (leader_id);

alter table circle_ai_summaries enable row level security;

-- All authenticated users can read summaries
create policy "Authenticated users can read circle AI summaries"
  on circle_ai_summaries for select
  using (auth.role() = 'authenticated');

-- Authenticated users can insert
create policy "Authenticated users can insert circle AI summaries"
  on circle_ai_summaries for insert
  with check (auth.role() = 'authenticated');

-- Authenticated users can update (allows overwriting with a regenerated summary)
create policy "Authenticated users can update circle AI summaries"
  on circle_ai_summaries for update
  using (auth.role() = 'authenticated');
