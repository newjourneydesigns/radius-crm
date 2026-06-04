-- weekly_ai_summaries was originally created with `create table if not exists`,
-- so an earlier version of the table already existed when the
-- 20260420000004 migration ran. That meant its declared
-- `generated_by ... on delete set null` rule was never actually applied — the
-- live constraint stayed ON DELETE NO ACTION. As a result, deleting a user who
-- had ever generated a weekly summary failed with "Database error deleting user".
--
-- Drop EVERY foreign key currently guarding generated_by (by introspecting the
-- catalog, so we don't depend on names and so we catch the case where more than
-- one FK constraint exists on the column) and re-add a single one with the
-- intended ON DELETE SET NULL behavior. Summaries are preserved; only the
-- authorship pointer is cleared when the generating user is removed.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.weekly_ai_summaries'::regclass
      and con.contype = 'f'
      and (
        select att.attname
        from pg_attribute att
        where att.attrelid = con.conrelid
          and att.attnum = con.conkey[1]
      ) = 'generated_by'
  loop
    execute format(
      'alter table public.weekly_ai_summaries drop constraint %I',
      fk.conname
    );
  end loop;

  alter table public.weekly_ai_summaries
    add constraint weekly_ai_summaries_generated_by_fkey
    foreign key (generated_by) references auth.users(id) on delete set null;
end $$;

-- ON DELETE SET NULL is meaningless if the column itself is NOT NULL: deleting
-- the generating user then fails with "null value in column generated_by ...
-- violates not-null constraint" (SQLSTATE 23502). The live column had drifted to
-- NOT NULL, so make it nullable to match the SET NULL behavior above.
alter table public.weekly_ai_summaries
  alter column generated_by drop not null;
