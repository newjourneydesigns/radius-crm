alter table notebook_pages
  add column if not exists editor_mode text not null default 'text',
  add column if not exists ink jsonb,
  add column if not exists has_ink boolean not null default false,
  add column if not exists ink_stroke_count integer not null default 0,
  add column if not exists ink_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notebook_pages_editor_mode_check'
  ) then
    alter table notebook_pages
      add constraint notebook_pages_editor_mode_check
        check (editor_mode in ('text', 'ink'));
  end if;
end $$;

update notebook_pages
set
  has_ink = coalesce(jsonb_array_length(ink -> 'strokes'), 0) > 0,
  ink_stroke_count = coalesce(jsonb_array_length(ink -> 'strokes'), 0),
  ink_updated_at = case
    when coalesce(jsonb_array_length(ink -> 'strokes'), 0) > 0 then updated_at
    else ink_updated_at
  end
where ink is not null;
