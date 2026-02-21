# Todo List Integration with Encouragements and Follow-Ups

## Overview

This feature integrates **planned encouragements** and **follow-ups** directly into your todo list with **bidirectional sync**. When you mark an encouragement or follow-up as complete in the todo list, it automatically updates the source record, and vice versa.

## Features

### 📝 Automatic Todo Creation
- **Planned Encouragements**: Any encouragement you plan (not yet sent) automatically appears in your todo list
- **Follow-Ups**: Any leader marked as requiring follow-up automatically appears in your todo list

### 🔄 Bidirectional Sync
- **Complete in Todo List** → Marks encouragement as "sent" or clears the follow-up
- **Mark Sent/Clear Outside** → Automatically completes the todo
- **Uncheck Todo** → Restores the encouragement to "planned" or re-enables the follow-up

### 🎨 Visual Indicators
- 💬 **Purple badge** for encouragement todos
- 🔔 **Orange badge** for follow-up todos
- Linked todos cannot be edited (but can be deleted or completed)

## Installation

### Step 1: Run the Database Migration

Since the automatic migration script requires RPC functions not available in Supabase, you'll need to manually run the SQL files:

1. **Open your Supabase Dashboard** → SQL Editor

2. **Run the schema migration** by copying the contents of:
   ```
   add_todo_integration_columns.sql
   ```
   - This adds the linking columns and helper functions

3. **Run the trigger migration** by copying the contents of:
   ```
   add_todo_sync_triggers.sql
   ```
   - This creates the bidirectional sync triggers

### Step 2: Verify the Migration

Check that the following columns were added to `todo_items`:
- `linked_encouragement_id` (INTEGER, nullable)
- `linked_leader_id` (INTEGER, nullable)
- `todo_type` (TEXT, default 'manual')

## How It Works

### Database Schema

The `todo_items` table now has three new columns:

```sql
linked_encouragement_id INTEGER -- Links to acpd_encouragements.id
linked_leader_id INTEGER        -- Links to circle_leaders.id  
todo_type TEXT                  -- 'manual', 'encouragement', or 'follow_up'
```

### Sync Triggers

**6 triggers** handle the bidirectional sync:

1. **`trigger_encouragement_todo_completion`**: When you complete an encouragement todo → marks the encouragement as "sent"

2. **`trigger_followup_todo_completion`**: When you complete a follow-up todo → clears the leader's follow-up requirement

3. **`trigger_encouragement_marked_sent`**: When an encouragement is marked sent outside the todo list → completes the todo

4. **`trigger_followup_cleared`**: When a follow-up is cleared outside the todo list → completes the todo

5. **`trigger_todo_uncompleted`**: When you uncheck a completed todo → restores the encouragement/follow-up to its original state

6. **`trigger_encouragement_deleted`**: When an encouragement is deleted → deletes the linked todo

### Loading Logic

When you load your todos, the system:
1. Fetches all your planned encouragements
2. Fetches all leaders marked as needing follow-up
3. Creates todo items for any that don't already have one
4. Loads all todos (including the newly created ones)

## Usage Examples

### Creating a Planned Encouragement

1. Go to a leader's profile
2. Add a **planned** encouragement (not sent)
3. The encouragement automatically appears in your todo list with a 💬 **Encouragement** badge
4. When you check it off → the encouragement is automatically marked as "sent"

### Marking a Leader for Follow-Up

1. Go to a leader's profile or the dashboard
2. Mark them as requiring follow-up (with optional date)
3. The follow-up automatically appears in your todo list with a 🔔 **Follow-Up** badge
4. When you check it off → the follow-up requirement is automatically cleared

### Uncompleting a Todo

1. If you accidentally complete a linked todo, just uncheck it
2. The system automatically restores the original state:
   - Encouragement → changed back to "planned"
   - Follow-up → requirement is restored

## Technical Details

### Helper Functions

Two helper functions create todos from encouragements and follow-ups:

```sql
sync_encouragement_to_todo(...)
sync_followup_to_todo(...)
```

These are called automatically when loading todos.

### Cascade Deletes

When you delete a linked todo, the `ON DELETE CASCADE` constraint automatically removes the associated encouragement or follow-up record. This is intentional - deleting the todo means you want to remove the item entirely.

### Performance

Indexes were added for efficient queries:
- `idx_todo_items_linked_encouragement`
- `idx_todo_items_linked_leader`
- `idx_todo_items_type`

## Testing Checklist

- [ ] Create a planned encouragement → verify it appears in todo list
- [ ] Complete the encouragement todo → verify encouragement is marked "sent"
- [ ] Uncheck the todo → verify encouragement returns to "planned"
- [ ] Mark encouragement as sent outside todo list → verify todo is completed
- [ ] Delete encouragement → verify todo is deleted
- [ ] Mark a leader for follow-up → verify it appears in todo list
- [ ] Complete the follow-up todo → verify follow-up is cleared from leader
- [ ] Uncheck the todo → verify follow-up is restored
- [ ] Clear follow-up outside todo list → verify todo is completed
- [ ] Check that linked todos cannot be edited (no edit button)
- [ ] Check that linked todos show proper badges (💬 or 🔔)

## Troubleshooting

### Todos not appearing?

1. Make sure the migrations were run successfully
2. Check that `todo_type` column exists in `todo_items`
3. Refresh the page to trigger a fresh load
4. Check browser console for errors

### Sync not working?

1. Verify all 6 triggers were created
2. Check Supabase logs for trigger errors
3. Make sure RLS policies allow the operations

### Want to disable this feature?

To temporarily disable without removing the code:
1. Drop the triggers (keep the columns)
2. Existing linked todos will remain but won't sync

To fully remove:
1. Drop all 6 triggers
2. Drop the 2 helper functions
3. Remove the 3 columns from `todo_items`

## Files Reference

- `add_todo_integration_columns.sql` - Schema changes and helper functions
- `add_todo_sync_triggers.sql` - Bidirectional sync triggers
- `run-todo-integration-migration.js` - Migration runner (requires manual SQL execution)
- `lib/supabase.ts` - Updated `TodoItem` interface
- `app/dashboard/page.tsx` - Updated todo loading and UI

## Future Enhancements

Possible improvements:
- Add more todo types (e.g., scheduled visits, scorecard reviews)
- Allow editing linked todos with a warning
- Show who created the linked item
- Filter todos by type
- Bulk operations on linked todos
