-- Did the ccb_attendance_facts migration land? READ ONLY.
--
-- Expect:
--   ccb_attendance_facts   exists, rls_enabled = true, rows = 0 until the next
--                          sync-attendance run (hourly at :30) writes to it
--   ccb_event_group_map    exists, rls_enabled = true, rows > 0 — seeded from
--                          the cached calendars and leader event ids
select
  c.relname                                      as table_name,
  c.relrowsecurity                               as rls_enabled,
  (select count(*) from ccb_attendance_facts)    as facts_rows,
  (select count(*) from ccb_event_group_map)     as map_rows,
  (select count(distinct ccb_group_id)
     from ccb_event_group_map)                   as groups_mapped,
  (select count(*) from circle_leaders
     where ccb_group_id is not null
       and status not in ('Inactive','Removed','off-boarding')) as active_leaders_with_group
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ccb_attendance_facts', 'ccb_event_group_map')
order by c.relname;
