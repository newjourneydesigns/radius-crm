-- Verification script to check RLS status after applying fixes
-- Run this after executing fix_rls_security_issues.sql

-- 1. Check RLS status for all public tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as status
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Check policy count for each table
SELECT 
  schemaname,
  tablename,
  COUNT(*) as policy_count,
  STRING_AGG(policyname, ', ') as policy_names
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- 3. Check for tables that have policies but RLS disabled (should be empty)
SELECT 
  p.schemaname,
  p.tablename,
  'Has policies but RLS disabled' as issue
FROM pg_policies p
JOIN pg_tables t ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.rowsecurity = false
GROUP BY p.schemaname, p.tablename;

-- 4. Check for tables that are public but have no RLS (should only be reference tables with proper policies)
SELECT 
  schemaname,
  tablename,
  'Public table without RLS' as issue
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false
AND tablename NOT IN ('spatial_ref_sys'); -- Exclude PostGIS system table if present

-- 5. Test a sample query to ensure policies work
-- This should only return the current user's profile if not ACPD
SELECT 
  'User profile access test' as test_name,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Can access user data'
    ELSE '❌ Cannot access user data'
  END as result
FROM users 
WHERE id = auth.uid()
LIMIT 1;

-- 6. Test ACPD function
SELECT 
  'ACPD function test' as test_name,
  CASE 
    WHEN public.is_acpd() THEN '✅ User is ACPD'
    ELSE '✅ User is not ACPD (normal user)'
  END as result;

-- 7. Show summary
SELECT 
  '=== SECURITY SUMMARY ===' as summary,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) as tables_with_rls,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false) as tables_without_rls,
  (SELECT COUNT(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') as tables_with_policies;
