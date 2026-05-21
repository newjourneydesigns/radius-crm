-- Per-session prayer logs. One row per "I prayed for this" tap, with an
-- optional note attached to that session (not to the original prayer).
-- prayer_kind disambiguates between acpd_prayer_points and general_prayer_points
-- since the two tables share an id sequence space conceptually.

create table if not exists prayer_session_logs (
  id              bigserial primary key,
  prayer_point_id bigint not null,
  prayer_kind     text not null check (prayer_kind in ('leader', 'general')),
  prayed_on       date not null default current_date,
  note            text,
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists prayer_session_logs_point_idx
  on prayer_session_logs (prayer_kind, prayer_point_id, prayed_on desc);

create index if not exists prayer_session_logs_user_idx
  on prayer_session_logs (user_id);

alter table prayer_session_logs enable row level security;

drop policy if exists "users read own logs" on prayer_session_logs;
create policy "users read own logs"
  on prayer_session_logs for select using (auth.uid() = user_id);

drop policy if exists "users insert own logs" on prayer_session_logs;
create policy "users insert own logs"
  on prayer_session_logs for insert with check (auth.uid() = user_id);

drop policy if exists "users update own logs" on prayer_session_logs;
create policy "users update own logs"
  on prayer_session_logs for update using (auth.uid() = user_id);

drop policy if exists "users delete own logs" on prayer_session_logs;
create policy "users delete own logs"
  on prayer_session_logs for delete using (auth.uid() = user_id);
