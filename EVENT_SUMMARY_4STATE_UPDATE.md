# Event Summary State 4-State System Update

## Overview
Updating the event summary tracking from 3 states to 4 states:

### New States
1. **Not Received** (starting state) - RED (#dc2626)
2. **Received** - GREEN (#16a34a)
3. **Did Not Meet** - BLUE (#2563eb)
4. **Skipped** - YELLOW (#eab308)

### Old System (3 states)
- `event_summary_received` (boolean)
- `event_summary_skipped` (boolean) 
- Both FALSE = Not Received

## Files Updated

### ✅ Completed

1. **Database Migration** - `supabase/migrations/20260129000000_add_event_summary_state_enum.sql`
   - Created `event_summary_status` enum type
   - Added `event_summary_state` column
   - Migrated existing data
   - Created sync trigger for backwards compatibility

2. **TypeScript Types** - `lib/supabase.ts`
   - Added `EventSummaryState` type
   - Updated `CircleLeader` interface

3. **Utility Functions** - `lib/event-summary-utils.ts` (NEW FILE)
   - `getEventSummaryState()` - Extract state from leader record
   - `getEventSummaryColors()` - Get color classes for each state
   - `getEventSummaryButtonLabel()` - Get button labels

4. **Calendar Component** - `components/calendar/CircleMeetingsCalendar.tsx`
   - Updated prop types to use `EventSummaryState`
   - Updated state calculation to use utility functions
   - Updated button rendering to show 4 buttons
   - Updated event colors (added blue for "Did Not Meet")
   - Updated list view colors

5. **Migration Runner** - `run-event-summary-state-migration.js`
   - Script to execute the database migration

### ⏳ Still Need to Update

1. **Circle Leader Profile Page** - `app/circle/[id]/page.tsx`
   - Update `handleSetEventSummaryState()` function
   - Update button rendering (currently shows 3 buttons, need 4)
   - Update state calculations
   - Update colors

2. **Calendar Page** - `app/calendar/page.tsx`
   - Update `handleSetEventSummaryState()` callback
   - Update to pass new state to database

3. **Dashboard Components**:
   - `components/dashboard/CircleLeaderCard.tsx`
   - `components/dashboard/CircleLeaderCard-new.tsx`
   - `app/dashboard/event-summaries/EventSummariesPanel.tsx`

4. **Filter Panel** - `components/calendar/CalendarFilterPanel.tsx`
   - Add "Did Not Meet" option to filter dropdown

5. **Hooks** - `hooks/useTodayCircles.ts`
   - Update filtering logic to use new enum

## Migration Steps

1. Run the database migration:
   ```bash
   node run-event-summary-state-migration.js
   ```

2. Test calendar page - buttons should show 4 options

3. Update circle leader profile page

4. Update dashboard components

5. Update filters

## Notes

- Old boolean columns are kept for backwards compatibility
- Trigger keeps them in sync with new enum column
- Can remove old columns in future migration after confirming everything works
- "Skipped" now means user intentionally skipped, while "Did Not Meet" means the meeting didn't happen

## Color Reference

```typescript
not_received: RED - bg-red-600, border-red-600, text-red-600
received: GREEN - bg-green-600, border-green-600, text-green-600
did_not_meet: BLUE - bg-blue-600, border-blue-600, text-blue-600
skipped: YELLOW - bg-yellow-600, border-yellow-600, text-yellow-600
```
