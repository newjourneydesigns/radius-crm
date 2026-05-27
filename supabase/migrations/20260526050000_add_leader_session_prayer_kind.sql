-- Allow logging "I prayed for this leader" without an associated prayer point.
-- When prayer_kind = 'leader_session', prayer_point_id holds the circle_leader_id.

alter table prayer_session_logs
  drop constraint if exists prayer_session_logs_prayer_kind_check;

alter table prayer_session_logs
  add constraint prayer_session_logs_prayer_kind_check
  check (prayer_kind in ('leader', 'general', 'leader_session'));
