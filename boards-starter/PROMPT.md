# GPT Prompt — GSD Board

Use this prompt when giving the GSD Board files to a GPT to adapt for a new project.

---

Here are the source files for GSD Board, a project board feature built with Next.js (App Router) + Supabase + TypeScript. I want to use this exact UI and interaction model as a starting point for [NEW PROJECT NAME].

Adapt it for [describe your specifics — e.g., different backend, different auth provider, different framework, etc.].

**Key patterns to preserve:**

- The `kb-*` CSS class naming convention and dark-mode-first inline `<style>` blocks
- Card detail modal with description (double-click to edit), checklist with progress bar, comments, and label picker
- Priority badges with color coding (low = green, medium = amber, high = orange, urgent = red)
- Column drag-and-drop reordering using native HTML5 DnD (no library needed)
- Checklist templates — save a card's checklist as a reusable template, apply to other cards or in bulk
- Rich text board notes panel using `contentEditable` with a formatting toolbar (bold, italic, underline, strikethrough, headings, lists, links)
- Label manager with an 18-color picker grid
- Bulk list actions modal — set due date, assignee, label, sort A-Z/Z-A, move all cards, apply checklist template, and clear all cards for an entire column
- Card duplication (copies title, description, priority, dates, assignee, labels, and checklist items)
- Zero-dependency inline SVG icons (BoardIcons.tsx) — no lucide-react or other icon library required
- Responsive design: mobile filter panel toggled by a button, card detail modal stacks vertically, note panel goes full-width
- Inline edit on double-click for board title, column titles
- Search + multi-filter toolbar (priority, label, date — overdue/today/this week/this month/no dates)

**What to change:**

- Replace `useAuth()` with [your auth solution]
- Replace `import { supabase }` with [your data layer / API client]
- The `ImportLeadersModal` component is specific to the original CRM — remove it or adapt for your domain's data import needs
- Adapt Next.js `useRouter()` / `useParams()` if using a different framework
