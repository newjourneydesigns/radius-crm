-- Shared cache for CCB group calendar + attendance lookups.
-- The /api/circle-summary/events route checks this table before hitting CCB,
-- so all serverless instances benefit from the prewarm job (vs the previous
-- per-instance in-memory cache that only helped on warm hits).

create table if not exists public.ccb_group_events_cache (
  group_id text not null,
  start_date text not null,
  end_date text not null,
  calendar_events jsonb not null default '[]'::jsonb,
  attendance_xml jsonb,
  synced_at timestamptz not null default now(),
  primary key (group_id, start_date, end_date)
);

create index if not exists ccb_group_events_cache_synced_at_idx
  on public.ccb_group_events_cache (synced_at);

alter table public.ccb_group_events_cache enable row level security;
-- Service role only; no policies = no anon/authenticated access.
