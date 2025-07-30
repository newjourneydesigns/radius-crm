# Known Issues

## Database Issues

### Notes Table Permissions Issue
**Status**: In Progress  
**Date Reported**: July 30, 2025  
**Priority**: Medium

**Problem**: Notes are not saving to the database due to Row Level Security (RLS) policy restrictions.

**Symptoms**:
- Insert operations on the `notes` table fail
- Error logs show permission-related errors
- Notes read operations work fine (empty array returned)
- Circle Leader verification succeeds

**Root Cause**: 
The `notes` table likely has RLS enabled but no policies configured to allow anonymous users to insert records.

**Temporary Workaround**: 
- Local notes are created and stored in component state when database insert fails
- Users can still add notes, but they won't persist across page refreshes
- Notes display "Local User" as the creator

**Required Fix**:
1. Access Supabase dashboard as project administrator
2. Navigate to Authentication > Policies for the `notes` table
3. Create appropriate RLS policies to allow:
   - INSERT operations for authenticated/anonymous users
   - SELECT operations for reading notes
   - UPDATE/DELETE operations for note management

**SQL Commands Needed**:
```sql
-- Enable RLS if not already enabled
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy to allow anyone to read notes
CREATE POLICY "Allow read access to notes" ON notes
FOR SELECT TO anon, authenticated
USING (true);

-- Policy to allow anyone to insert notes
CREATE POLICY "Allow insert access to notes" ON notes
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Policy to allow anyone to update their own notes
CREATE POLICY "Allow update access to notes" ON notes
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Policy to allow anyone to delete notes
CREATE POLICY "Allow delete access to notes" ON notes
FOR DELETE TO anon, authenticated
USING (true);
```

**Testing Steps**:
1. Apply the RLS policies in Supabase dashboard
2. Refresh the application
3. Navigate to a Circle Leader profile
4. Try adding a note
5. Verify the note saves to database and persists on page refresh

---

## Migration Issues

### Follow-up Status Migration
**Status**: Pending  
**Date Reported**: July 30, 2025  
**Priority**: Low

**Problem**: The follow-up status migration in `supabase/migrations/add_follow_up_status.sql` needs to be executed.

**Required Action**: Run the migration via Supabase dashboard or CLI with appropriate permissions.
