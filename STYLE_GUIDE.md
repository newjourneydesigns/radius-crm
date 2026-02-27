# Radius CRM — Style Guide & Design Context

> Use this document as a reference when building new pages, components, or features
> to ensure visual consistency across the application.

---

## Color Palette

| Token               | Light Mode              | Dark Mode                |
| -------------------- | ----------------------- | ------------------------ |
| **Primary**          | `indigo-600` `#4F46E5`  | `indigo-500` `#6366F1`   |
| **Primary Hover**    | `indigo-700` `#4338CA`  | `indigo-400` `#818CF8`   |
| **Background**       | `slate-50` `#F8FAFC`    | `slate-900` `#0F172A`    |
| **Surface / Cards**  | `white` with `border-slate-200` | `slate-800` with `border-slate-700` |
| **Text Primary**     | `slate-900`             | `white`                  |
| **Text Secondary**   | `slate-500`             | `slate-400`              |
| **Success**          | `green-500` `#22C55E`   | `green-400`              |
| **Warning**          | `amber-500` `#F59E0B`   | `amber-400`              |
| **Destructive**      | `red-500` `#EF4444`     | `red-400`                |

---

## Typography

- **Font Family:** Inter (fallback: system sans-serif stack)
- **Headings:** `font-bold` or `font-semibold`, `tracking-tight`
- **Body:** `text-sm` to `text-base`, `font-normal`
- **Labels / Metadata:** `text-xs`, `uppercase`, `tracking-wide`, muted color (`slate-400` / `slate-500`)

---

## Layout

| Element            | Specification                                      |
| ------------------ | -------------------------------------------------- |
| **Sidebar**        | Fixed left, ~64px collapsed / ~256px expanded      |
| **Sidebar Active** | Indigo background pill with white text              |
| **Top Bar**        | Minimal — search, notifications bell, user avatar   |
| **Main Content**   | Responsive grid (CSS Grid / Flexbox), card-based    |
| **Spacing**        | `p-4` to `p-6` on cards, `gap-4` / `gap-6` between elements |

---

## Components

### Cards
- `rounded-xl`, `shadow-sm` or `shadow-md`
- Border: `border border-slate-200` (light) / `border-slate-700` (dark)

### Buttons
- **Primary:** `rounded-lg`, solid indigo, hover = darker shade
- **Secondary:** Ghost / outline style
- **Destructive:** Red variant for delete actions

### Inputs
- `rounded-lg`, border, focus ring in indigo/purple

### Badges / Tags
- `rounded-full` pills
- Colored background + matching text (e.g., `bg-indigo-100 text-indigo-700`)

### Tables
- Clean minimal rows, `divide-y` style (no heavy borders)
- Row hover highlight

### Avatars
- `rounded-full`
- Optional status indicator dot (green = online)

---

## Dashboard Widgets

| Widget              | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| **Stat Cards**      | Icon + large number + label + trend arrow (green ↑ / red ↓)    |
| **Activity Feed**   | Timeline with avatars, timestamps, action descriptions          |
| **Todo Lists**      | Checkbox items, strike-through on completion                    |
| **Charts**          | Minimal bar/line/donut using brand colors (Recharts)            |
| **Circle Cards**    | Grid cards showing leader name, member count, visit stats       |

---

## Interactions & Polish

- **Transitions:** `duration-150` to `duration-200` on hover/focus
- **Hover Effects:** Subtle background color shift on interactive elements
- **Loading States:** Skeleton loaders with `animate-pulse`
- **Toasts:** Bottom-right, `rounded-lg`, auto-dismiss
- **Real-time Indicators:** Small animated dot or subtle glow for live data

---

## Tech Stack

| Layer        | Technology                        |
| ------------ | --------------------------------- |
| Framework    | Next.js / React                   |
| Styling      | Tailwind CSS                      |
| UI Library   | shadcn/ui                         |
| Icons        | Lucide React                      |
| Backend      | Supabase (Postgres + Auth + Realtime) |
| Charts       | Recharts                          |

---

## Overall Aesthetic

Modern, clean, professional SaaS dashboard — **Linear meets Notion**.

- Minimal chrome, focused content
- Generous whitespace
- Subtle depth through shadows and borders (not heavy gradients)
- Calm, organized, and trustworthy — suited for church/community CRM use
