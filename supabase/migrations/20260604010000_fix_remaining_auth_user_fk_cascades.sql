-- Several foreign keys that reference auth.users(id) were left as ON DELETE
-- NO ACTION (many on tables that live only in the production database and were
-- never captured as migrations). Any user who had ever authored a comment,
-- scored a leader, sent a follow-up, linked a notebook page, etc. could not be
-- deleted — the delete failed with "Database error deleting user".
--
-- Sweep every single-column foreign key that points at auth.users and is still
-- NO ACTION or RESTRICT, and give it a sane delete rule:
--   * nullable column  -> ON DELETE SET NULL  (preserve the row, clear the actor)
--   * NOT NULL column  -> ON DELETE CASCADE   (the row can't outlive its owner)
--
-- This is catalog-driven so it also covers drifted tables that aren't defined in
-- these migrations, and it is safe to re-run (it only touches NO ACTION/RESTRICT
-- FKs, so anything already SET NULL / CASCADE is left alone).
do $$
declare
  fk record;
  col_notnull boolean;
  new_action text;
begin
  for fk in
    select con.conname,
           con.conrelid,
           nsp.nspname as schema_name,
           rel.relname as table_name,
           att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fns on fns.oid = frel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and fns.nspname = 'auth'
      and frel.relname = 'users'
      and con.confdeltype in ('a', 'r')      -- NO ACTION or RESTRICT
      and array_length(con.conkey, 1) = 1     -- single-column FKs only
  loop
    select att.attnotnull
      into col_notnull
    from pg_attribute att
    where att.attrelid = fk.conrelid
      and att.attname = fk.column_name;

    new_action := case when col_notnull then 'cascade' else 'set null' end;

    execute format(
      'alter table %I.%I drop constraint %I',
      fk.schema_name, fk.table_name, fk.conname
    );
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      fk.schema_name, fk.table_name, fk.conname, fk.column_name, new_action
    );

    raise notice 'Fixed %.%(%) -> ON DELETE %',
      fk.schema_name, fk.table_name, fk.column_name, upper(new_action);
  end loop;
end $$;
