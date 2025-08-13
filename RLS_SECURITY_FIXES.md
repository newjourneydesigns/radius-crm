# RLS Security Fixes

This document outlines the steps to fix the Row Level Security (RLS) issues identified by Supabase's security linter.

## Problem Summary

The Supabase security audit found that several tables have RLS policies defined but RLS is not actually enabled on the tables. This is a critical security issue because the policies are not being enforced.

**Affected Tables:**
- `acpd_list`
- `campuses` 
- `circle_types`
- `connection_types`
- `connections`
- `frequencies`
- `statuses`
- `users`

## Security Issues Found

1. **Policy Exists RLS Disabled**: Tables have policies but RLS is not enabled
2. **RLS Disabled in Public**: Public tables without RLS protection

## Solution

### Step 1: Apply the RLS Fixes

Execute the SQL script in Supabase SQL Editor:

```sql
-- Run this file in Supabase SQL Editor
-- File: fix_rls_security_issues.sql
```

This script will:

1. ✅ Enable RLS on all affected tables
2. ✅ Drop and recreate policies with proper structure
3. ✅ Create role-based access controls (admin vs user)
4. ✅ Set up proper permissions
5. ✅ Create helper functions for policy management

### Step 2: Verify the Fixes

Run the verification script:

```sql
-- Run this file in Supabase SQL Editor to verify fixes
-- File: verify_rls_fixes.sql
```

### Step 3: Test Your Application

After applying the fixes, test your application to ensure:

1. ✅ Reference tables (campuses, statuses, etc.) are readable by authenticated users
2. ✅ Only admins can modify reference tables
3. ✅ Users can only access their own data where appropriate
4. ✅ Circle leaders data is accessible to authenticated users
5. ✅ Notes and connections work properly

## Security Model Implemented

### Reference Tables (Read-mostly data)
- **Read**: All authenticated users
- **Write**: ACPD users only

Tables: `acpd_list`, `campuses`, `circle_types`, `connection_types`, `frequencies`, `statuses`

### User Data
- **Read**: Users can see their own profile, ACPD users can see all
- **Write**: Users can update their own profile, ACPD users can manage all

### Operational Data
- **Circle Leaders**: All authenticated users can read, ACPD users can write
- **Notes**: All authenticated users can read/write
- **Connections**: All authenticated users can read/write, ACPD users can delete

## ACPD User Setup

Your system uses role values 'ACPD' and 'Viewer'. To make a user an ACPD user (with admin privileges), update their role in the database:

```sql
UPDATE users 
SET role = 'ACPD' 
WHERE email = 'your-acpd-email@domain.com';
```

## Monitoring

Use the `rls_status` view to monitor RLS status:

```sql
SELECT * FROM public.rls_status;
```

## Troubleshooting

If you encounter access issues after applying the fixes:

1. **Check user role**: Ensure ACPD users have `role = 'ACPD'` in the users table
2. **Verify authentication**: Ensure users are properly authenticated
3. **Check policies**: Use the verification script to ensure all policies are in place
4. **Review logs**: Check Supabase logs for specific policy violations

## Files Created

- `fix_rls_security_issues.sql` - Main fix script
- `verify_rls_fixes.sql` - Verification script
- `RLS_SECURITY_FIXES.md` - This documentation

## Next Steps

1. Apply the fixes in your Supabase project
2. Test your application thoroughly
3. Set up ACPD users as needed
4. Monitor the RLS status view periodically
5. Update your application deployment process to include RLS verification

## Security Best Practices

Going forward:

1. Always enable RLS when creating new tables
2. Create policies before inserting data
3. Test policies with different user roles
4. Use the helper functions (`is_acpd()`) for consistent role checking
5. Regularly audit your RLS configuration
