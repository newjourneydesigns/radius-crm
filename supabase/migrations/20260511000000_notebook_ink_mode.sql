alter table notebook_pages
  add column if not exists editor_mode text not null default 'text',
  add column if not exists ink jsonb,
  add constraint notebook_pages_editor_mode_check
    check (editor_mode in ('text', 'ink'));
