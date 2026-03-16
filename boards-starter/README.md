# GSD Board

A full-featured project board built with **Next.js (App Router) + Supabase + TypeScript**.
Zero external UI dependencies — all icons and styles are inline.

## Features

- Board list with create/delete
- Kanban columns with drag-and-drop reordering (native HTML5 DnD)
- Cards with priority, labels, assignee, start/due dates
- Card detail modal with description, checklist, comments
- Checklist templates (save/apply)
- Board-level rich text notes panel (contentEditable with toolbar)
- Label manager with 18-color picker
- Inline edit on double-click (titles, descriptions)
- Search + filters (priority, label, date)
- Public board sharing
- Bulk list actions (set due date, assignee, labels, sort, move, clear)
- Card duplication
- Fully responsive (mobile filter panel, stacked detail modal)
- Dark mode first, self-contained inline CSS (`kb-*` class prefix)

## Files

```
boards-starter/
├── README.md              ← this file
├── PROMPT.md              ← GPT prompt to include when adapting
├── types/
│   └── board-types.ts     ← all TypeScript interfaces
├── components/
│   └── BoardIcons.tsx     ← zero-dependency inline SVG icons
├── hooks/
│   └── useProjectBoard.ts ← all Supabase CRUD operations
├── pages/
│   ├── boards-list.tsx    ← board list page
│   └── board-detail.tsx   ← kanban board detail page
└── schema/
    └── tables.sql         ← full Supabase DDL (tables, indexes, RLS, triggers)
```

## To adapt for your project

1. **Auth**: Replace `useAuth()` with your own auth hook.
   Both page files have a `/* AUTH: ... */` comment showing where to plug in.
   The hook calls `supabase.auth.getUser()` — swap if not using Supabase Auth.

2. **Supabase client**: Update `import { supabase } from '../lib/supabase'` in the hook
   to point to your project's Supabase client.

3. **Routing**: Uses Next.js `useRouter()` / `useParams()`. Adapt for your framework.

4. **Import Leaders feature**: The `ImportLeadersModal` in board-detail.tsx is application-specific.
   Remove it if you don't need it (search for `ImportLeadersModal` and delete the component +
   its references in the main `BoardPage` component).

5. **Run the SQL** in `schema/tables.sql` in your Supabase SQL editor to create all tables.

## Design system

- All CSS classes prefixed with `kb-` (kanban board)
- Dark mode by default: `#0f1117` background, `#1a1d27` cards, `#6366f1` primary accent
- Inline `<style>` tags — no external CSS files needed
- SF Pro / system font stack
- 10px/12px/13px/14px type scale
- 8px/10px/14px border radius scale
