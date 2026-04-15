# Prompt: Re-implement Board Column Automations + List Actions

Use the following spec to re-create two features in a Kanban board app: **Column Automations** and **List Actions**. Both are modals attached to individual board columns.

---

## Tech context

- Next.js 14 App Router, TypeScript, Tailwind CSS + DaisyUI
- Supabase (PostgreSQL) — `board_columns` table has an `automations` column of type `jsonb` (array)
- Card updates go through an `updateCard(boardId, cardId, updates)` function
- Card moves go through `moveCard(boardId, cardId, columnId, position)` and `applyChecklistTemplate(boardId, cardId, templateId)`
- Each column header has two icon buttons that open these modals: a sliders icon (automations) and an ellipsis/actions icon (list actions)

---

## 1. TypeScript type — `ColumnAutomationAction`

Store this as a discriminated union in your types file:

```ts
export type ColumnAutomationAction =
  | { type: 'set_complete';   value: boolean }
  | { type: 'set_priority';   value: 'low' | 'medium' | 'high' | 'urgent' | null }
  | { type: 'set_assignee';   value: string }         // user name or id
  | { type: 'set_labels';     value: string[] }       // array of label ids
  | { type: 'clear_labels';   value: true }
  | { type: 'add_checklist';  value: string[] }       // array of checklist template ids
  | { type: 'move_completed'; value: string }         // destination column id
  | { type: 'set_due_date';   value: string }         // ISO date string
  | { type: 'strip_due_date'; value: true };
```

The `BoardColumn` interface includes:

```ts
automations: ColumnAutomationAction[];
```

Stored as a `jsonb` column on `board_columns`. Default to `[]`.

---

## 2. Column Automations

### What it does
**Trigger:** every time a card is moved into a column (drag-and-drop or programmatic move).  
**Effect:** automatically applies all saved actions to the card.

### `runColumnAutomations(cardId, destColId)` — execution logic

```ts
const runColumnAutomations = async (cardId: string, destColId: string) => {
  const destCol = board.columns.find(c => c.id === destColId);
  const automations = destCol?.automations ?? [];
  if (automations.length === 0) return;

  const cardUpdates: Record<string, unknown> = {};
  for (const action of automations) {
    if (action.type === 'set_complete')   cardUpdates.is_complete = action.value;
    if (action.type === 'set_priority')   cardUpdates.priority    = action.value;
    if (action.type === 'set_assignee')   cardUpdates.assignee    = action.value;
    if (action.type === 'set_labels')     cardUpdates.label_ids   = action.value;
    if (action.type === 'clear_labels')   cardUpdates.label_ids   = [];
    if (action.type === 'set_due_date')   cardUpdates.due_date    = action.value;
    if (action.type === 'strip_due_date') cardUpdates.due_date    = null;
  }
  if (Object.keys(cardUpdates).length > 0) {
    await updateCard(boardId, cardId, cardUpdates);
  }

  // apply checklist templates
  const checklistAction = automations.find(a => a.type === 'add_checklist');
  if (checklistAction?.type === 'add_checklist') {
    for (const templateId of checklistAction.value) {
      await applyChecklistTemplate(boardId, cardId, templateId);
    }
  }

  // move_completed: if the card is now complete (or was just set complete), move it
  const moveCompletedAction = automations.find(a => a.type === 'move_completed');
  if (moveCompletedAction?.type === 'move_completed') {
    const card = board.cards.find(c => c.id === cardId);
    const isComplete = 'is_complete' in cardUpdates ? cardUpdates.is_complete : card?.is_complete;
    if (isComplete) {
      await moveCard(boardId, cardId, moveCompletedAction.value, 0);
    }
  }
};
```

Also call `runColumnAutomations` inside `handleToggleComplete` when marking a card complete, to trigger the `move_completed` action:

```ts
const handleToggleComplete = async (cardId: string, makeComplete: boolean) => {
  await updateCard(boardId, cardId, { is_complete: makeComplete });
  if (makeComplete && board) {
    const card = board.cards.find(c => c.id === cardId);
    const col = board.columns.find(c => c.id === card?.column_id);
    const moveAction = col?.automations?.find(a => a.type === 'move_completed');
    if (moveAction?.type === 'move_completed') {
      await moveCard(boardId, cardId, moveAction.value, 0);
    }
  }
};
```

### `ColumnAutomationsModal` — UI

**Props:**
- `column: BoardColumn` — the column being configured
- `columns: BoardColumn[]` — other columns on this board (for move_completed destination picker)
- `labels: BoardLabel[]` — board labels
- `checklistTemplates: ChecklistTemplate[]`
- `onSave: (automations: ColumnAutomationAction[]) => Promise<void>`
- `onClose: () => void`

**Behavior:**
- Opens as a modal overlay
- Header: sliders icon + "Automations — {column.title}"
- Subheader hint: "When a card is moved into this list, automatically:"
- Shows currently saved automations as a list of rows: `[Label] → [Value] [Delete button]`
- **Only one automation per type** — adding the same type replaces the existing one
- "Add automation" section with a `<select>` dropdown of action types + a `+` button
- Dynamic value input area below the select changes based on selected type (see below)
- Save button calls `onSave(actions)` then closes

**Action type display labels:**
```
set_complete    → "Set complete"
set_priority    → "Set priority"
set_assignee    → "Set assignee"
set_labels      → "Set labels"
clear_labels    → "Strip labels"
add_checklist   → "Add checklist"
move_completed  → "Move completed cards"
set_due_date    → "Set due date"
strip_due_date  → "Strip due date"
```

**Value inputs per type:**

| Type | Input |
|---|---|
| `set_complete` | Radio/select: "Complete" (true) / "Incomplete" (false) |
| `set_priority` | Select: Low / Medium / High / Urgent / None (null) |
| `set_assignee` | Select from users list (id stored) |
| `set_labels` | Chip multi-select of board labels (stores array of ids) |
| `clear_labels` | No input needed — just a button to add |
| `add_checklist` | Chip multi-select of checklist templates (stores array of ids) |
| `move_completed` | Select of other columns on the board |
| `set_due_date` | `<input type="date">` |
| `strip_due_date` | No input needed — just a button to add |

**Validation:** The add button is disabled until required value inputs are filled (`set_assignee`, `move_completed`, `set_due_date` require a non-empty value).

**Column header indicator:** When a column has one or more automations saved (`automations.length > 0`), apply a CSS class (e.g. `kb-automations-active`) to the sliders button to visually distinguish it.

**Saving:** `onSave` calls `updateColumn(boardId, col.id, { automations })` which writes the JSON array back to Supabase.

---

## 3. List Actions

### What it does
One-time bulk operations against all cards currently in a column. Opened via an ellipsis/actions button on the column header.

### `ListActionsModal` — UI

**Props:**
- `column: BoardColumn`
- `cards: BoardCard[]` — only non-archived cards in this column
- `board: FullBoard` — full board object (for labels, other columns, board id)
- `onUpdateCard: (cardId, updates) => Promise<void>`
- `onDeleteCard: (cardId) => Promise<void>`
- `onMoveCard: (cardId, newColumnId) => Promise<void>`
- `onAddChecklistItem: (cardId, title) => Promise<void>`
- `checklistTemplates: ChecklistTemplate[]`
- `onApplyTemplate: (cardId, templateId) => Promise<void>`
- `onSortCards: (columnId, direction: 'asc' | 'desc' | 'due_asc' | 'due_desc') => Promise<void>`
- `onMoveToBoardCards: (targetBoardId, targetColumnId) => Promise<void>`
- `onClose: () => void`

**Header:** column color dot + "List Actions — {column.title}" + card count badge

**If 0 cards:** show empty state message — "No cards in this list"

**Actions (rendered as rows with label + controls):**

### 1. Set Due Date
- Date input + Apply button
- On apply: `updateCard(id, { due_date: value })` for all cards

### 2. Strip Due Date
- Single "Remove from All" button (no input)
- On click: `updateCard(id, { due_date: null })` for all cards

### 3. Set Assignee
- Select from users list (shows name, stores name as assignee value)
- Falls back to free-text input if users list is empty
- On apply: `updateCard(id, { assignee: name })` for all cards

### 4. Set Priority
- Select: None / Low / Medium / High / Urgent
- On apply: `updateCard(id, { priority: val })` for all cards; "none" maps to `null`

### 5. Add Label _(only shown if board has labels)_
- Select from board labels
- On apply: adds label to cards that don't already have it
  - Logic: `existing = card.labels.map(l => l.id); if (!existing.includes(labelId)) updateCard(id, { label_ids: [...existing, labelId] })`

### 6. Sort Cards
- Four buttons: A → Z, Z → A, Due ↑, Due ↓
- Each calls `onSortCards(column.id, direction)`
- Directions: `'asc'`, `'desc'`, `'due_asc'`, `'due_desc'`

### 7. Mark All
- "Mark All Complete" button → `updateCard(id, { is_complete: true })` for all
- "Mark All Incomplete" button → `updateCard(id, { is_complete: false })` for all

### 8. Add Checklist Item
- Text input + Apply button
- On apply: `onAddChecklistItem(card.id, text)` for all cards

### 9. Apply Checklist Template _(only shown if templates exist)_
- Select from templates (shows name + item count)
- On apply: `onApplyTemplate(card.id, templateId)` for all cards

### 10. Move All Cards _(only shown if other columns exist)_
- Select from other columns in the board
- On click Move: `onMoveCard(card.id, targetColId)` for all cards

### 11. Move All Completed _(only shown if other columns exist)_
- Select from other columns
- Button shows count of completed cards: "Move (N)"
- Disabled if 0 completed cards
- On click: `onMoveCard(card.id, targetColId)` for all completed cards only

### 12. Move All to Board
- Two-step: first select a board (excludes current board), then select a column from that board
- Board columns loaded dynamically when board is selected
- On click Move: `onMoveToBoardCards(targetBoardId, targetColumnId)` (moves all cards at once)

### 13. Clear All Cards _(danger zone)_
- "Delete N Cards" button
- First click sets a confirmation state
- Confirmation shows: "Delete all N cards from '{column.title}'? This cannot be undone."
- Confirm: `onDeleteCard(card.id)` for all cards; Cancel returns to normal

**Applying state:** While any action is running, all buttons are disabled and show an `applying` flag.

**Result feedback:** After each action completes, show a small feedback message: "{Action} applied to N card(s)"

---

## 4. Wiring it up in the board page

```tsx
// State
const [listActionsColId, setListActionsColId] = useState<string | null>(null);
const [automationsColId, setAutomationsColId] = useState<string | null>(null);

// Column header buttons
<button onClick={() => setListActionsColId(col.id)} title="List actions">
  {/* ellipsis icon */}
</button>
<button
  onClick={() => setAutomationsColId(col.id)}
  title="Column automations"
  className={col.automations?.length > 0 ? 'automations-active' : ''}
>
  {/* sliders icon */}
</button>

// Drag drop handler — fire automations after move
await moveCard(boardId, card.id, destColId, position);
await runColumnAutomations(card.id, destColId);

// Modals at bottom of JSX
{listActionsColId && board && (() => {
  const col = board.columns.find(c => c.id === listActionsColId);
  if (!col) return null;
  const colCards = board.cards.filter(c => c.column_id === col.id && !c.is_archived);
  return (
    <ListActionsModal
      column={col}
      cards={colCards}
      board={board}
      onUpdateCard={async (cardId, updates) => { await updateCard(boardId, cardId, updates); }}
      onDeleteCard={async (cardId) => { await deleteCard(boardId, cardId); }}
      onMoveCard={async (cardId, newColId) => { await moveCard(boardId, cardId, newColId, 0); await runColumnAutomations(cardId, newColId); }}
      onAddChecklistItem={async (cardId, title) => { await addChecklistItem(boardId, cardId, title); }}
      checklistTemplates={checklistTemplates}
      onApplyTemplate={async (cardId, templateId) => { await applyChecklistTemplate(boardId, cardId, templateId); }}
      onSortCards={async (columnId, direction) => { /* sort logic */ }}
      onMoveToBoardCards={async (targetBoardId, targetColumnId) => {
        for (const card of colCards) {
          await moveToBoardCard(card.id, targetBoardId, targetColumnId);
        }
      }}
      onClose={() => setListActionsColId(null)}
    />
  );
})()}

{automationsColId && board && (() => {
  const col = board.columns.find(c => c.id === automationsColId);
  if (!col) return null;
  return (
    <ColumnAutomationsModal
      column={col}
      columns={board.columns.filter(c => c.id !== col.id)}
      labels={board.labels}
      checklistTemplates={checklistTemplates}
      onSave={async (automations) => {
        await updateColumn(boardId, col.id, { automations });
      }}
      onClose={() => setAutomationsColId(null)}
    />
  );
})()}
```

---

## 5. Sort cards implementation (reference)

```ts
const handleSortCards = async (columnId: string, direction: 'asc' | 'desc' | 'due_asc' | 'due_desc') => {
  const colCards = board.cards.filter(c => c.column_id === columnId && !c.is_archived);
  const sorted = [...colCards].sort((a, b) => {
    if (direction === 'asc')      return a.title.localeCompare(b.title);
    if (direction === 'desc')     return b.title.localeCompare(a.title);
    if (direction === 'due_asc')  return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1;
    if (direction === 'due_desc') return (a.due_date ?? '') > (b.due_date ?? '') ? -1 : 1;
    return 0;
  });
  for (let i = 0; i < sorted.length; i++) {
    await updateCard(boardId, sorted[i].id, { position: i });
  }
};
```

---

## Summary of all automation/action types

| Feature | Action | Trigger |
|---|---|---|
| Column Automation | set_complete | card moved into column |
| Column Automation | set_priority | card moved into column |
| Column Automation | set_assignee | card moved into column |
| Column Automation | set_labels | card moved into column |
| Column Automation | clear_labels | card moved into column |
| Column Automation | add_checklist | card moved into column |
| Column Automation | move_completed | card moved into column (or toggled complete) |
| Column Automation | set_due_date | card moved into column |
| Column Automation | strip_due_date | card moved into column |
| List Action | Set Due Date | manual bulk apply |
| List Action | Strip Due Date | manual bulk apply |
| List Action | Set Assignee | manual bulk apply |
| List Action | Set Priority | manual bulk apply |
| List Action | Add Label | manual bulk apply |
| List Action | Sort Cards (A→Z, Z→A, Due↑, Due↓) | manual bulk apply |
| List Action | Mark All Complete / Incomplete | manual bulk apply |
| List Action | Add Checklist Item | manual bulk apply |
| List Action | Apply Checklist Template | manual bulk apply |
| List Action | Move All Cards | manual bulk apply |
| List Action | Move All Completed | manual bulk apply |
| List Action | Move All to Board | manual bulk apply |
| List Action | Clear All Cards | manual bulk apply (with confirmation) |
