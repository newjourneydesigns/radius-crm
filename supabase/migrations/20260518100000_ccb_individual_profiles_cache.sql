-- Cache table for CCB individual profile data (phone/email/birthday).
-- Lets the roster page render instantly from cached data, then revalidate
-- stale rows in the background.

create table if not exists public.ccb_individual_profiles (
  ccb_individual_id text primary key,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  birthday text,
  synced_at timestamptz not null default now()
);

create index if not exists ccb_individual_profiles_synced_at_idx
  on public.ccb_individual_profiles (synced_at);

alter table public.ccb_individual_profiles enable row level security;

-- Only service role reads/writes this table; no client-side access.
-- (No policies = no anon/authenticated access.)
