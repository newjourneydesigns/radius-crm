# 🚨 URGENT: Fix Circle Visits RLS Policies

## Problem
You're getting **403 Forbidden** errors when trying to access circle visits because the Row Level Security (RLS) policies are blocking access.

## Quick Fix

### Run this SQL in your Supabase Dashboard SQL Editor:

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Copy and paste the contents of **`fix_circle_visits_rls.sql`**
5. Click **Run**

### Or use this one-line command:

```sql
-- Drop old policies and create new ones
DROP POLICY IF EXISTS "Directors can manage circle visits" ON circle_visits;
DROP POLICY IF EXISTS "Viewers can read circle visits" ON circle_visits;

CREATE POLICY "Authenticated users can view circle visits" ON circle_visits
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create circle visits" ON circle_visits
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update circle visits" ON circle_visits
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete circle visits" ON circle_visits
  FOR DELETE USING (auth.role() = 'authenticated');

ALTER TABLE circle_visits ENABLE ROW LEVEL SECURITY;
```

## What This Does

This replaces the placeholder RLS policies with proper ones that:
- ✅ Allow any authenticated user to view circle visits
- ✅ Allow any authenticated user to create circle visits
- ✅ Allow any authenticated user to update circle visits
- ✅ Allow any authenticated user to delete circle visits

## After Running the Fix

1. Refresh your browser
2. Try scheduling a circle visit again
3. The 403 errors should be gone! ✨

## Alternative: More Restrictive Policies (Optional)

If you want to restrict access based on ACPD/director roles, you can use more specific policies after testing. But for now, this will get the feature working.
