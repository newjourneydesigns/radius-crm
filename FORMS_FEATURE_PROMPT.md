# Build Prompt — Public Forms → Board Cards (ported from Lumio)

> Paste this whole file to Claude Code inside the Radius repo. It is a complete
> spec for recreating Lumio's "intake forms that turn into Kanban cards" feature,
> already adapted to Radius's stack and schema. Build it end-to-end.

---

## 0. What we're building (one paragraph)

Let a logged-in user create a **public form** tied to one of their boards. The form
has a drag-to-reorder **field editor**. Each field can **map to a card field**
(title, description, priority, due date, assignee) or be left unmapped. The form
gets a public URL (`/f/<slug>`) that **anyone can fill out without logging in**.
On submit, the server validates the fields, **builds a card from the mappings**,
drops it into the form's target column, stores the raw submission for the record,
and (optionally) emails the assignee. The owner can view every submission, jump to
the card it created, and export submissions to CSV.

This already exists and works in the Lumio project (`gsd-boards`). Radius has a
nearly identical board schema, so the data model and server logic port almost 1:1.
The main rebuild work is the **UI in Radius's styling system** and a few **schema
adaptations** noted below. Where this spec and the live Lumio code disagree, prefer
this spec — it reflects Radius's reality.

---

## 1. Read these before writing code

- `STYLE_GUIDE.md` — colors, components, spacing. Match it exactly.
- `.claude/skills/frontend-design/SKILL.md` — required before any UI (per CLAUDE.md).
- `create_project_boards_tables.sql` — the board/card schema you'll write into.
- `create_card_assignments_table.sql` — how Radius models assignees (see §6).
- `add_board_card_linked_leader.sql` — CRM-specific card field, optional mapping (see §7).
- An existing `app/api/**/route.ts` — copy its **Next 14 route signature** and how it
  builds a Supabase server client. Do NOT invent a new pattern.
- `middleware.ts` — **critical:** the public form page and the submit/public API
  routes must be reachable by anonymous users. Confirm `/f/...` and `/api/forms/...`
  are excluded from any auth redirect in middleware before you finish (see §5.4).

---

## 2. Stack & conventions (Radius — do not use Lumio's)

| Concern | Radius convention |
|---|---|
| Framework | Next.js 14, App Router |
| Styling | **Tailwind CSS + DaisyUI**, dark-mode default — NOT inline `kb-` CSS |
| Icons | **lucide-react only** — no inline SVGs, no emoji in UI |
| Dates | **Luxon** — not native `Date` for formatting/parsing |
| Auth | Supabase passwordless (magic link) |
| Email | Resend |
| DB | Supabase (Postgres + RLS); service-role key for server routes |

---

## 3. Concept mapping (Lumio → Radius)

Radius's board tables share Lumio's names and columns, so most things map directly.

| Lumio | Radius | Note |
|---|---|---|
| `project_boards` | `project_boards` | same |
| `board_columns` | `board_columns` | same |
| `board_cards` | `board_cards` | same columns: `title, description, priority, due_date, assignee, position, is_archived, board_id, column_id` |
| `board_forms` (new) | **create it** | identical definition (§4) |
| `form_submissions` (new) | **create it** | identical definition (§4) |
| `assignees` array on card | **`card_assignments` join table** | Radius difference — see §6 |
| `board_custom_fields` / `card_custom_field_values` | **do not exist** | drop custom-field mapping (§7) unless you add the tables |
| `notifications` inbox table | **may not exist** | make assignment notify adaptive (§8) |
| user display names | `users` table / `auth.users.raw_user_meta_data->>'name'` | for the assignee picker |

---

## 4. Database (write a new migration `create_board_forms_tables.sql`)

```sql
-- ============================================================
-- Board Forms — public intake → card creation
-- ============================================================

CREATE TABLE IF NOT EXISTS board_forms (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id      uuid NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
  column_id     uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  slug          text NOT NULL UNIQUE,
  fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id       uuid NOT NULL REFERENCES board_forms(id) ON DELETE CASCADE,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  card_id       uuid REFERENCES board_cards(id) ON DELETE SET NULL,
  submitted_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_forms_user_id ON board_forms(user_id);
CREATE INDEX IF NOT EXISTS idx_board_forms_board_id ON board_forms(board_id);
CREATE INDEX IF NOT EXISTS idx_board_forms_slug ON board_forms(slug);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);

ALTER TABLE board_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Owner manages their own forms
CREATE POLICY "View own forms"   ON board_forms FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert own forms" ON board_forms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own forms" ON board_forms FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Delete own forms" ON board_forms FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Public (anon) can read ACTIVE forms only — powers the public form page
CREATE POLICY "Public read active forms" ON board_forms FOR SELECT TO anon USING (is_active = true);

-- Submissions: owner reads, anon + auth can insert
CREATE POLICY "View own submissions" ON form_submissions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM board_forms f WHERE f.id = form_submissions.form_id AND f.user_id = auth.uid())
);
CREATE POLICY "Anon insert submissions" ON form_submissions FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY "Auth insert submissions" ON form_submissions FOR INSERT TO authenticated  WITH CHECK (true);

-- Anonymous submitters need to create the card + read column/card positions.
-- NOTE: the submit API uses the service-role key (which bypasses RLS), so these
-- anon policies are only required if you ever submit from the browser with the
-- anon key. Include them to match Lumio and keep the option open:
CREATE POLICY "Anon insert cards"   ON board_cards   FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon read columns"   ON board_columns FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read cards"     ON board_cards   FOR SELECT TO anon USING (true);

-- Reuse Radius's updated_at trigger fn if present; otherwise create it.
CREATE TRIGGER update_board_forms_updated_at
  BEFORE UPDATE ON board_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

If `update_updated_at_column()` doesn't exist in Radius, either create it or set
`updated_at` manually in the editor save call. Check before assuming.

---

## 5. The pieces to build

### 5.1 Types

Add to Radius's board types file (wherever `board_cards` types live):

```ts
export type FormFieldType = 'text' | 'textarea' | 'email' | 'url' | 'number' | 'date' | 'select';

export interface FormField {
  id: string;                 // stable per-field key, used as the submission data key
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];         // for 'select'
  maps_to?: 'title' | 'description' | 'priority' | 'due_date' | 'assignee';
  // assignee config:
  assignee_options?: { id: string; name: string }[]; // members shown in the dropdown
  assignee_visible?: boolean;    // true/undefined = shown on form; false = hidden, auto-applied
  assignee_default_id?: string;  // applied server-side when assignee_visible === false
}

export interface BoardForm {
  id: string; user_id: string; board_id: string; column_id: string;
  title: string; description?: string; slug: string;
  fields: FormField[]; is_active: boolean; created_at: string; updated_at: string;
}

export interface FormSubmission {
  id: string; form_id: string; data: Record<string, string>;
  card_id?: string; submitted_at: string;
}
```

> Drop the `custom_field:${string}` branch from `maps_to` unless you add custom-field
> tables (§7). Keep the assignee fields — they're the most useful part.

### 5.2 Forms list page — `app/forms/page.tsx`

A grid of the user's forms + a "New Form" modal. Mirror Radius's existing list pages.

- **Fetch:** all `board_forms` where `user_id = me`, newest first. Join board titles
  for display (fetch `project_boards` by the distinct `board_id`s).
- **Per-card actions** (lucide icons): copy public link (`<origin>/f/<slug>`),
  preview (open `/f/<slug>`), view submissions (→ editor `?tab=submissions`),
  edit (→ editor), toggle active/inactive (updates `is_active`), delete (confirm first).
- **Create modal:**
  1. Title input + board `<select>`.
  2. When a board is picked, load its members (see §6) and show an "Assignees on
     public form" checklist (all checked by default) with a Select/Deselect-all toggle.
  3. On create:
     - generate a slug: lowercase, non-alphanumerics → `-`, trim dashes, cap 40 chars,
       then append `-` + 6 random base36 chars (collision-safe).
     - grab the board's **first column** (`order by position limit 1`) as `column_id`;
       error if the board has no columns.
     - insert the form with a **sensible default field set**:
       ```
       [
         { id:'field_1', type:'text',     label:'Title',       required:true,  placeholder:'Enter a title...',     maps_to:'title' },
         { id:'field_2', type:'textarea', label:'Description', required:false, placeholder:'Describe in detail...', maps_to:'description' },
         { id:'field_3', type:'select',   label:'Priority',    required:false, placeholder:'Select priority...', options:['Low','Medium','High','Urgent'], maps_to:'priority' },
         { id:'field_4', type:'date',     label:'Due Date',    required:false, maps_to:'due_date' },
         { id:'field_5', type:'select',   label:'Assignee',    required:false, placeholder:'Select assignee...', maps_to:'assignee', assignee_options:<checked members> },
       ]
       ```
     - redirect to the editor (`/forms/<id>/edit`).

### 5.3 Form editor — `app/forms/[id]/edit/page.tsx`

Two tabs: **Edit Form** and **Submissions**.

**Edit tab — two-column layout (stack on mobile):**

*Settings panel:*
- Form title, description (shown on public page).
- **Target Column** `<select>` (the board's columns) — new cards land here.
- **Status** toggle (Active / Inactive).
- **Public Link** display with copy button (`<origin>/f/<slug>`).
- Save button → updates `title, description, column_id, is_active, fields`.

*Fields panel:*
- "Add Field" appends `{ type:'text', label:'New Field', required:false }` with a
  unique id (`field_<n>_<timestamp>`) and expands it.
- Each field is a collapsible row: drag handle (reorder via HTML5 drag, swap on
  dragover), label + type chip + "Required" badge + a "→ maps_to" chip, and a delete button.
- Expanded editor exposes: **Label**, **Type**, **Placeholder**, **Options** (textarea,
  one per line — only for `select` that isn't priority/assignee), **Maps to Card Field**
  `<select>`, **Required** toggle.
- **Smart coupling when `maps_to` changes** (replicate exactly):
  - `priority` → force `type:'select'`, lock options to `['Low','Medium','High','Urgent']`,
    and disable the Type selector.
  - `due_date` → force `type:'date'`, disable Type selector.
  - `assignee` → force `type:'select'`, seed `assignee_options` from board members,
    disable Type selector, and reveal the **assignee visibility** sub-editor:
    - **Visible:** show a member checklist (Select/Deselect all). Checked members become
      the public dropdown options. If none checked, the field is hidden from the public form.
    - **Hidden:** hide the field from submitters and show a **Default Assignee** `<select>`
      (single member or "None"). That default is applied to every submission server-side.

**Submissions tab:**
- Fetch `form_submissions` for this form, newest first.
- Header: count, a search box (filters across all `data` values + the date), and
  **Export CSV** (columns: `Submitted` + each field label; quote-escape values).
- Each submission is collapsible: title line uses the value of the field whose
  `maps_to==='title'` (fallback "Submission") + formatted date (use Luxon). Expanded
  shows every field `label → value`, plus any leftover `data` keys not matching a
  current field. If the submission has a `card_id`, show a **View Card** button that
  routes to the board with that card focused (match Radius's deep-link pattern, e.g.
  `/boards/<board_id>?card=<card_id>`).

### 5.4 Public form page — `app/f/[slug]/page.tsx` (NO auth)

This page must render for anonymous visitors. Verify `middleware.ts` does not redirect
`/f/...` to login. Render with Radius's styling but it's a standalone, centered card
(no app sidebar/topnav).

- Load the form by slug where `is_active = true`. If missing/inactive, show a friendly
  "not accepting submissions" state.
- Render fields in order, but:
  - **Skip** an assignee field when `assignee_visible === false` (auto-applied server-side).
  - **Skip** a visible assignee field that has no `assignee_options`.
  - Assignee → `<select>` of `assignee_options` (value = member id).
  - `priority` → `<select>` of Low/Medium/High/Urgent (submit lowercase values).
  - `due_date` / `date` → a date input (use Radius's date input component if one exists).
  - `select` → options dropdown; `textarea` → textarea; otherwise an `<input>` typed
    by field type (email/url/number/text).
- **Client validation:** required check (skipping hidden assignee), email regex,
  URL must start with `http(s)://`. Show inline per-field errors.
- **Submit:** `POST /api/forms/submit` with `{ formId, data }` where `data` is
  `{ [field.id]: stringValue }`. On success show a "Submitted!" state with an optional
  "View card →" link (if the API returns `cardId`+`boardId`) and a "Submit another" reset.

### 5.5 Optional: embeddable script

Lumio also ships `public/embed.js` — a vanilla-JS snippet that fetches a form by slug
(`GET /api/forms/public/<slug>`) and renders it inline on any external site (no iframe),
posting to the same submit endpoint. Port it only if Trip wants external embedding; the
hosted `/f/<slug>` page covers most needs. If you do, also build the public GET route
in §5.6.

### 5.6 API routes

**`GET app/api/forms/public/[slug]/route.ts`** — returns `{ id, title, description, fields }`
for an active form by slug; `no-store` + permissive CORS. Only needed for embed.js.

**`POST app/api/forms/submit/route.ts`** — the heart. Steps:

1. **Rate limit** by IP (`x-forwarded-for` → first hop): in-memory map, e.g. 10 reqs /
   5 min → 429 when exceeded. (Fine for a single Netlify instance; note it's per-instance.)
2. Parse `{ formId, data }`; 400 if missing.
3. Create a **service-role** Supabase client (bypasses RLS).
4. Load the form by id where `is_active=true`; 404 if not found.
5. **Validate required fields** server-side — but skip a hidden assignee
   (`maps_to==='assignee' && assignee_visible===false`), which is satisfied by its default.
6. **Build the card from mappings** (this is the core algorithm — replicate precisely):

   ```
   title = 'Form submission' (default)
   description = ''
   priority = 'medium'; priorityExplicitlyMapped = false
   due_date = null; assignee = null
   descParts = []   // unmapped fields rendered into the description

   for each field:
     // hidden assignee: apply its default BEFORE the empty-value guard
     if field.maps_to === 'assignee' && field.assignee_visible === false:
        if field.assignee_default_id: assignee = field.assignee_default_id
        continue
     value = (data[field.id] || '').trim()
     if !value: continue
     switch field.maps_to:
       'title'       -> title = value
       'description' -> description = value
       'priority'    -> if value in [low,medium,high,urgent]: priority = value; priorityExplicitlyMapped = true
       'due_date'    -> due_date = value
       'assignee'    -> assignee = value   // a user id
       else          -> descParts.push(`**${field.label}:** ${value}`)
   // append unmapped fields under the mapped description
   if descParts: description = description ? description + '\n\n' + descParts.join('\n') : descParts.join('\n')
   ```

7. **Next position** in the target column: `select position ... order by position desc
   limit 1`, then `+1` (or `0` if empty).
8. **Insert the card** into `board_id` + `column_id` with title/description/priority/
   due_date/position, `is_archived:false`. For assignee, see §6 (Radius uses
   `card_assignments`, not an `assignees` array).
9. **Log the submission** into `form_submissions` with `form_id`, raw `data`, and `card_id`.
10. **Assignment notification** (if an assignee was set) — adaptive, see §8.
11. Return `{ success:true, cardId, boardId }`.

CORS: allow `POST, OPTIONS`; handle the `OPTIONS` preflight with 204. Wrap the whole
thing so a thrown error returns a 400/500 JSON rather than crashing.

---

## 6. Assignee model — the key Radius adaptation

Lumio stores assignees inline (`board_cards.assignee` text + an `assignees` array).
**Radius uses `card_assignments` (card_id, user_id) as the source of truth** plus a
legacy `board_cards.assignee` text column.

So in the submit route, after inserting the card with an assignee:

- Set `board_cards.assignee` to the member's **name** (keeps the legacy text column
  consistent with the rest of Radius), AND
- Insert a row into `card_assignments { card_id, user_id: <assignee id>, assigned_by: form.user_id }`.

Confirm how Radius's board UI reads assignees (it almost certainly joins
`card_assignments`) and write whichever the UI expects so the assignee actually
shows on the card. If the UI only reads the text column, you can skip the join insert —
**check the board card component before deciding.**

**Loading board members** (for the editor + create modal): given a board, find its
members. Radius's `project_boards` doesn't have a `team_id` like Lumio, and boards are
team-shared (`authenticated USING (true)`). The simplest correct source is the `users`
table (display name + id). Match how Radius's existing board UI populates its assignee
picker and reuse that exact query/helper rather than inventing one.

---

## 7. Custom fields & a CRM-specific mapping (optional)

- Radius has **no** `board_custom_fields` / `card_custom_field_values` tables, so the
  Lumio `custom_field:<id>` mapping branch is **omitted**. Unmapped fields simply flow
  into the card description (that path already covers "extra data").
- **Opportunity:** Radius cards have `linked_leader` (`add_board_card_linked_leader.sql`).
  If useful, add a `maps_to: 'linked_leader'` option whose form field is a dropdown of
  circle leaders, and set `board_cards.linked_leader` from it in the submit route. Treat
  this as a follow-up, not part of the core port — ask Trip before adding.

---

## 8. Assignment notification — adaptive

Lumio writes an inbox `notifications` row AND sends a Resend email. Radius may not have a
`notifications` table. So:

- If a `notifications` table exists, insert a row (`type:'assignment'`, title/body, the
  board/card ids, `is_read:false`).
- Always attempt the Resend email if Radius has an assignment-email helper and the
  assignee has an email + notifications enabled. Reuse Radius's existing email helper;
  do not build a new Resend integration.
- Wrap notifications in try/catch — they're **non-critical**; a failure must not fail the
  submission. **Do not** add any new paid-API calls (email counts) without Trip's OK
  (per CLAUDE.md).
- Skip the Lumio "AI auto-triage priority" step unless Trip asks — it's an extra paid AI
  call and not core to the feature.

---

## 9. Styling notes

- Rebuild all three surfaces (list, editor, public page) in **Tailwind + DaisyUI** per
  `STYLE_GUIDE.md`: `rounded-xl` cards, indigo primary, dark-mode default, `lucide-react`
  icons, Luxon for date formatting. **Discard Lumio's inline `kb-`/`pf-` CSS entirely** —
  it's a different design system.
- Mobile-first; the editor's two columns stack under ~768px; inputs ≥16px font on mobile
  to avoid iOS zoom.
- Follow the **frontend skill + screenshot loop** (CLAUDE.md): build → screenshot →
  compare → iterate. Don't ship the first render.

---

## 10. Build order

1. Migration (§4) — apply in Supabase, confirm tables + RLS.
2. Types (§5.1).
3. Submit API + public GET (§5.6) — testable with curl before any UI.
4. Public form page `/f/[slug]` (§5.4) + middleware exclusion (§5.4) — submit a real
   form via curl, confirm a card appears in the target column and a submission is logged.
5. Forms list + create modal (§5.2).
6. Form editor: Edit tab (§5.3), then Submissions tab + CSV.
7. Assignee wiring (§6) — verify the assignee shows on the created card in the board UI.
8. Notifications (§8), optional embed (§5.5), optional linked_leader (§7).

---

## 11. Acceptance criteria

- [ ] A logged-in user can create a form on a board, edit its fields, reorder them,
      map fields to title/description/priority/due_date/assignee, and toggle active.
- [ ] `/f/<slug>` loads for a logged-OUT visitor and rejects inactive forms.
- [ ] Submitting creates a card in the form's target column with all mapped data; the
      title/description/priority/due_date/assignee are correct; unmapped fields appear in
      the description as `**Label:** value`.
- [ ] Hidden-assignee forms apply the configured default assignee with no visible field.
- [ ] The created card's assignee shows correctly in Radius's board UI (§6).
- [ ] Every submission is stored and visible in the editor's Submissions tab, searchable,
      CSV-exportable, and links to the card it created.
- [ ] Required/email/URL validation works on both client and server.
- [ ] No new paid-API calls were added without explicit approval.
- [ ] UI matches `STYLE_GUIDE.md` and was iterated with the screenshot loop.

---

## 12. Reference implementation (Lumio)

If you have access to the `gsd-boards` repo, the working originals are:

- `boards-starter/schema/forms.sql` — schema + RLS
- `src/types/board-types.ts` — `FormField` / `BoardForm` / `FormSubmission`
- `src/components/FormsListPage.tsx` — list + create modal + slug/default fields
- `src/components/FormEditorPage.tsx` — editor + submissions + CSV + mapping coupling
- `src/components/PublicFormPage.tsx` — public form rendering + validation
- `src/app/api/forms/submit/route.ts` — the mapping engine (port faithfully)
- `src/app/api/forms/public/[slug]/route.ts` — public GET
- `public/embed.js` — optional external embed script

Port the **logic** from these; rebuild the **presentation** in Radius's design system.
```
