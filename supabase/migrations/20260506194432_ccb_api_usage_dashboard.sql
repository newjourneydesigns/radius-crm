create table if not exists public.ccb_api_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.users(id) on delete set null,
  module text not null default 'Unknown',
  action text not null default 'Unknown',
  direction text not null default 'pull' check (direction in ('pull', 'push')),
  ccb_service text not null,
  request_method text not null default 'GET',
  status_code integer,
  success boolean not null default false,
  duration_ms integer not null default 0,
  rate_limit_limit integer,
  rate_limit_remaining integer,
  rate_limit_reset timestamptz,
  retry_after integer,
  error_message text
);

create index if not exists ccb_api_requests_created_at_idx
  on public.ccb_api_requests (created_at desc);

create index if not exists ccb_api_requests_service_created_idx
  on public.ccb_api_requests (ccb_service, created_at desc);

create index if not exists ccb_api_requests_user_created_idx
  on public.ccb_api_requests (user_id, created_at desc);

create table if not exists public.ccb_api_rate_limits (
  ccb_service text primary key,
  updated_at timestamptz not null default now(),
  rate_limit_limit integer,
  rate_limit_remaining integer,
  rate_limit_reset timestamptz,
  retry_after integer,
  status text not null default 'unknown',
  last_status_code integer,
  last_error_message text
);

create table if not exists public.ccb_api_daily_status (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  daily_limit integer,
  counter integer,
  last_run_date date,
  percent_used numeric(6,2)
);

create index if not exists ccb_api_daily_status_created_at_idx
  on public.ccb_api_daily_status (created_at desc);

create table if not exists public.ccb_api_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  ccb_service text,
  resolved_at timestamptz
);

create index if not exists ccb_api_alerts_open_created_idx
  on public.ccb_api_alerts (created_at desc)
  where resolved_at is null;

alter table public.ccb_api_requests enable row level security;
alter table public.ccb_api_rate_limits enable row level security;
alter table public.ccb_api_daily_status enable row level security;
alter table public.ccb_api_alerts enable row level security;
