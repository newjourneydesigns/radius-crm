-- AI Scorekeeper — shared tables schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Enables signed-in players to share a live game; everyone at the table
-- appends events and sees everyone else's in realtime.

create table if not exists public.shared_games (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.game_members (
  game_id uuid not null references public.shared_games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.shared_events (
  pk bigint generated always as identity primary key,
  game_id uuid not null references public.shared_games (id) on delete cascade,
  id text not null,              -- client event id (dedupe key)
  event jsonb not null,          -- the GameEvent, verbatim
  created_at timestamptz not null default now(),
  unique (game_id, id)
);

create index if not exists shared_events_game_idx on public.shared_events (game_id, pk);

alter table public.shared_games enable row level security;
alter table public.game_members enable row level security;
alter table public.shared_events enable row level security;

-- Membership check used by every policy.
create or replace function public.is_game_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_members m
    where m.game_id = gid and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.shared_games g
    where g.id = gid and g.owner = auth.uid()
  );
$$;

-- shared_games: owners create; owners and members read.
create policy "shared_games_insert" on public.shared_games
  for insert to authenticated with check (owner = auth.uid());
create policy "shared_games_select" on public.shared_games
  for select to authenticated using (public.is_game_member(id));

-- game_members: users see their own memberships; joining happens through
-- the RPC below (knowing the unguessable game id is the invitation).
create policy "game_members_select" on public.game_members
  for select to authenticated using (user_id = auth.uid());

-- shared_events: members read and append; events are immutable (no
-- update/delete policies — undo is itself an event).
create policy "shared_events_select" on public.shared_events
  for select to authenticated using (public.is_game_member(game_id));
create policy "shared_events_insert" on public.shared_events
  for insert to authenticated with check (public.is_game_member(game_id));

-- Join a shared game by id (the link IS the invite).
create or replace function public.join_shared_game(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.shared_games where id = gid) then
    raise exception 'game not found';
  end if;
  insert into public.game_members (game_id, user_id)
  values (gid, auth.uid())
  on conflict do nothing;
end;
$$;

-- Realtime: broadcast inserted events to subscribed members.
alter publication supabase_realtime add table public.shared_events;
