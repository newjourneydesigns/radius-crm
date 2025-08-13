-- Diagnostic script to check current database state
-- Run this in Supabase SQL Editor to understand the current schema

-- 1. Check if user_role enum exists and what values it has
SELECT 
  t.typname as enum_name,
  e.enumlabel as enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname = 'user_role'
ORDER BY e.enumsortorder;

-- 2. Check current users table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. Check current constraint on role column
SELECT 
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public' 
AND tc.table_name = 'users' 
AND tc.constraint_type = 'CHECK'
AND cc.check_clause LIKE '%role%';

-- 4. Check what role values currently exist in the users table
SELECT DISTINCT role, COUNT(*) as count
FROM users 
GROUP BY role
ORDER BY role;

-- 5. Show all enum types in the database
SELECT 
  t.typname as enum_name,
  STRING_AGG(e.enumlabel, ', ' ORDER BY e.enumsortorder) as possible_values
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
GROUP BY t.typname
ORDER BY t.typname;
