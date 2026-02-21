# Circle Visits Feature - Implementation Complete

## Overview
The Circle Visits feature allows you to plan, schedule, and record visits to Circle Leaders. Scheduled visits automatically appear in your todo list and can be included in daily email reports.

## Features Implemented

### 1. **Schedule Circle Visits**
- Select a visit date for any Circle Leader
- Add optional pre-visit notes/context
- Automatically creates a todo item with the visit date as the due date

### 2. **Record Visit Details**
When completing a visit, you can optionally answer three reflection questions:

- **Celebrations:** What are you celebrating about this leader and/or their Circle?
- **Observations:** What did you see, hear, or experience?
- **Next Step:** My next step to disciple this leader is...

All responses are saved with the visit and automatically added as a note to the leader's profile.

### 3. **Visit Management**
- **View History:** See all past visits with their details
- **Cancel Visits:** Cancel scheduled visits with a reason
- **Edit/Delete:** Full CRUD operations for visit management
- **Status Tracking:** Visits are tracked as Scheduled, Completed, or Canceled

### 4. **Todo List Integration**
- Scheduled visits automatically create todo items
- Completing the todo marks the visit as complete (simplified)
- Completing the visit through the full form marks the todo as complete
- Canceling a visit completes the todo with a note

### 5. **External Links**
Two convenient buttons added to the Circle Visits section:

- **JotForm Link:** Direct link to the Circle Visit form
  - URL: https://form.jotform.com/230576051412144
  
- **View Submissions:** Link to Google Sheets with all submissions
  - URL: https://docs.google.com/spreadsheets/d/1PWorX0udibjgbskLU6lOQ5T8oS6AWGyCW-9x76CUbxs/edit#gid=1262105001

## Files Created/Modified

### Database Migrations
1. **`create_circle_visits_table.sql`** (already existed)
   - Creates the circle_visits table with basic fields
   
2. **`add_circle_visit_questions.sql`** (NEW)
   - Adds three question fields: celebrations, observations, next_step
   
3. **`add_circle_visit_todo_integration.sql`** (NEW)
   - Adds linked_visit_id to todo_items table
   - Updates todo_type constraint to include 'circle_visit'
   - Creates bidirectional sync triggers between visits and todos

### Code Files Modified
1. **`lib/supabase.ts`**
   - Updated CircleVisit interface with question fields
   - Updated TodoItem interface with linked_visit_id and 'circle_visit' type

2. **`hooks/useCircleVisits.ts`**
   - Updated completeVisit() to accept optional question responses
   - Enhanced note creation to include all recorded information

3. **`components/circle/CircleVisitsSection.tsx`**
   - Updated CompleteVisitModal to include three optional question fields
   - Added external JotForm and Google Sheets buttons
   - Enhanced visit history display to show question responses
   - Improved dark mode support throughout

4. **`app/circle/[id]/page.tsx`**
   - Added CircleVisitsSection import
   - Added Circle Visits section to the leader profile page

### New Files
1. **`run-circle-visits-migrations.js`** (NEW)
   - Migration runner script with instructions

## Installation Instructions

### Step 1: Run Database Migrations

You need to run three SQL migration files in your Supabase database:

#### Option A: Using Supabase Dashboard (Recommended)
1. Open your Supabase Dashboard
2. Navigate to the SQL Editor
3. Run each file in order:
   ```
   1. create_circle_visits_table.sql
   2. add_circle_visit_questions.sql
   3. add_circle_visit_todo_integration.sql
   ```

#### Option B: Using Supabase CLI
```bash
# If you have the Supabase CLI installed
supabase db push
```

### Step 2: Verify Installation
```bash
# Run the migration runner to see instructions
node run-circle-visits-migrations.js
```

### Step 3: Test the Feature
1. Navigate to any Circle Leader profile page
2. Look for the "Circle Visits" section
3. Click "Schedule Visit" to create a new visit
4. Check your todo list - you should see the visit as a todo item
5. Complete the visit using the "Complete" button and fill in the optional questions

## How It Works

### Scheduling a Visit
```
User schedules visit → circle_visits record created → Trigger fires → Todo item created
```

### Completing a Visit
```
User clicks "Complete" → Modal opens with questions → Data saved → Visit marked complete → Todo marked complete → Note added to leader profile
```

### Todo Integration Flow
```
Todo marked complete ← Syncs → Visit marked complete
Todo uncompleted     ← Syncs → Visit returned to scheduled
Visit canceled       →         Todo marked complete with note
```

## Database Schema

### circle_visits Table
```sql
- id (UUID primary key)
- leader_id (integer, FK to circle_leaders)
- visit_date (date)
- status (text: 'scheduled' | 'completed' | 'canceled')
- scheduled_by (text)
- scheduled_at (timestamp)
- completed_at (timestamp)
- completed_by (text)
- canceled_at (timestamp)
- canceled_by (text)
- cancel_reason (text)
- previsit_note (text)
- celebrations (text) ← NEW
- observations (text) ← NEW
- next_step (text) ← NEW
- created_at (timestamp)
- updated_at (timestamp)
```

### todo_items Table (Updated)
```sql
- All existing fields...
- linked_visit_id (UUID, FK to circle_visits) ← NEW
- todo_type (updated to include 'circle_visit') ← UPDATED
```

## UI Components

### Circle Visits Section Location
Path: `/app/circle/[id]` (Circle Leader Profile Page)

The section appears between:
- **ACPD Tracking Section** (above)
- **Progress Scorecard Section** (below)

### Section Features
- Header with "Schedule Visit" button
- External links (JotForm and Google Sheets)
- Next scheduled visit card (if exists)
  - Shows visit date, who scheduled it, pre-visit notes
  - "Complete" and "Cancel" buttons
- Recent visits history (last 5)
  - Each visit shows date, status, details
  - Completed visits show all question responses
  - Color-coded badges for different response types

## Daily Email Integration

Scheduled visits with todos will automatically appear in the daily email digest sent to users, as they are now part of the todo system.

## Future Enhancements (Optional)

Potential improvements you might consider:

1. **Email Notifications:** Send reminder emails before scheduled visits
2. **Recurring Visits:** Allow scheduling recurring visits (monthly, quarterly)
3. **Visit Templates:** Pre-fill questions based on templates
4. **Analytics Dashboard:** Track visit frequency and completion rates
5. **Mobile App:** Dedicated mobile interface for recording visits on-site
6. **Photo Uploads:** Allow attaching photos from visits
7. **Attendee Tracking:** Record who attended the circle during the visit

## Troubleshooting

### Visits not appearing in todos
- Check that the `add_circle_visit_todo_integration.sql` migration ran successfully
- Verify the trigger functions exist in your database
- Check browser console for any errors

### Questions not saving
- Verify the `add_circle_visit_questions.sql` migration ran successfully
- Check that the columns exist: `celebrations`, `observations`, `next_step`

### Permission errors
- Ensure RLS policies are set up correctly for circle_visits table
- Check that users have access to the circle_leaders they're trying to visit

## Support

If you encounter any issues:
1. Check the browser console for errors
2. Verify all migrations ran successfully
3. Check Supabase logs for database errors
4. Ensure all environment variables are set correctly

## Summary of Changes

**Total Files Created:** 4
- 2 SQL migration files
- 1 migration runner script
- 1 documentation file (this file)

**Total Files Modified:** 4
- lib/supabase.ts
- hooks/useCircleVisits.ts
- components/circle/CircleVisitsSection.tsx
- app/circle/[id]/page.tsx

**Features Added:**
✅ Schedule circle visits with date picker
✅ Three optional reflection questions on completion
✅ Automatic todo list integration
✅ Bidirectional sync between visits and todos
✅ External JotForm and Google Sheets links
✅ Full visit history with detailed responses
✅ Cancel visit functionality
✅ Dark mode support
✅ Visit status badges
✅ Notes automatically added to leader profile

**Ready for Production:** ✅

After running the database migrations, the feature is fully functional and ready to use!
