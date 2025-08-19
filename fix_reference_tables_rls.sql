-- Fix RLS for reference tables to allow public read access
-- These tables contain non-sensitive lookup data that needs to be accessible to populate filters

-- Disable RLS for reference tables (they only contain lookup data)
ALTER TABLE campuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE acpd_list DISABLE ROW LEVEL SECURITY;  
ALTER TABLE statuses DISABLE ROW LEVEL SECURITY;
ALTER TABLE circle_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE frequencies DISABLE ROW LEVEL SECURITY;

-- Verify data is accessible
SELECT 'campuses' as table_name, count(*) as row_count FROM campuses
UNION ALL
SELECT 'acpd_list' as table_name, count(*) as row_count FROM acpd_list
UNION ALL  
SELECT 'statuses' as table_name, count(*) as row_count FROM statuses
UNION ALL
SELECT 'circle_types' as table_name, count(*) as row_count FROM circle_types
UNION ALL
SELECT 'frequencies' as table_name, count(*) as row_count FROM frequencies;
