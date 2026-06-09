-- CCB daily budget guard
--
-- Backstop against blowing through CCB's 10,000 call/day quota. The in-process
-- circuit breaker in lib/ccb/ccb-client.ts only caps per-minute/per-hour rates
-- within a single serverless instance, so it can't see (or stop) the daily
-- total accumulating across many short-lived invocations. On 2026-06-08 an
-- uncached per-leader reminder loop drove ~13.7k calls and exhausted the quota,
-- which made already-reported event summaries render as "Pending".
--
-- This table + RPC give every CCB call a shared, atomic daily counter so no
-- caller — present or future — can exceed a configurable ceiling.

create table if not exists public.ccb_api_budget (
  usage_date  date        primary key,
  call_count  integer     not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.ccb_api_budget enable row level security;
-- No policies are defined on purpose: only the service role (which bypasses
-- RLS) touches this table, via the SECURITY DEFINER function below.

-- Atomically increment today's counter and report whether we are still under
-- the caller-supplied limit. Returns the post-increment count so callers can
-- log how close they are.
create or replace function public.ccb_budget_consume(p_date date, p_limit integer)
returns table(call_count integer, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ccb_api_budget as b (usage_date, call_count, updated_at)
  values (p_date, 1, now())
  on conflict (usage_date)
  do update set call_count = b.call_count + 1, updated_at = now()
  returning b.call_count into v_count;

  return query select v_count, (v_count <= p_limit);
end;
$$;

revoke all on function public.ccb_budget_consume(date, integer) from public, anon, authenticated;
grant execute on function public.ccb_budget_consume(date, integer) to service_role;
