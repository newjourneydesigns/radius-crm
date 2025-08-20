-- Cleanup and consolidate circle types in Supabase
-- This script will merge existing circle types into the desired consolidated list

-- First, let's see what we're working with
-- SELECT value, COUNT(*) as count FROM circle_types GROUP BY value ORDER BY value;

-- Step 1: Update existing circle_leaders to use consolidated types
UPDATE circle_leaders 
SET circle_type = CASE 
    -- Men's types
    WHEN circle_type IN ('Mens', 'Men''s', 'YA| Mens') THEN 'Men''s'
    
    -- Women's types  
    WHEN circle_type IN ('Womens', 'Women''s', 'YA | Womens') THEN 'Women''s'
    
    -- Couples types
    WHEN circle_type IN ('Couples', 'YA | Couples') THEN 'Couples'
    
    -- YA Men's types
    WHEN circle_type IN ('YA| Mens', 'YA | Mens', 'Young Adult | Men''s') THEN 'YA | Men''s'
    
    -- YA Women's types
    WHEN circle_type IN ('YA | Womens', 'Young Adult | Women''s') THEN 'YA | Women''s'
    
    -- YA Couples types
    WHEN circle_type IN ('YA | Couples') THEN 'YA | Couples'
    
    -- YA Coed types (this covers the existing "YA | Coed")
    WHEN circle_type IN ('YA | Coed') THEN 'YA | Coed'
    
    -- Default case - keep existing value if it doesn't match
    ELSE circle_type
END
WHERE circle_type IN (
    'Mens', 'Men''s', 'Womens', 'Women''s', 'Couples',
    'YA | Mens', 'YA| Mens', 'YA | Womens', 'YA | Couples', 'YA | Coed',
    'Young Adult | Men''s', 'Young Adult | Women''s'
);

-- Step 2: Clean up the circle_types reference table
-- First, add the new consolidated types if they don't exist
INSERT INTO circle_types (value) 
SELECT * FROM (VALUES 
    ('Men''s'),
    ('Women''s'), 
    ('Couples'),
    ('YA | Men''s'),
    ('YA | Women''s'),
    ('YA | Couples'),
    ('YA | Coed')
) AS new_types(value)
WHERE NOT EXISTS (
    SELECT 1 FROM circle_types WHERE circle_types.value = new_types.value
);

-- Step 3: Remove old/duplicate circle types that are no longer needed
-- (Only remove if no circle_leaders are using them after the update)
DELETE FROM circle_types 
WHERE value IN (
    'Mens', 'Womens', 'YA | Mens', 'YA| Mens', 'YA | Womens',
    'Young Adult | Men''s', 'Young Adult | Women''s'
) 
AND value NOT IN (
    SELECT DISTINCT circle_type FROM circle_leaders WHERE circle_type IS NOT NULL
);

-- Step 4: Verify the cleanup
-- Uncomment these lines to see the results:

-- SELECT 'Updated circle_leaders types:' as info;
-- SELECT circle_type, COUNT(*) as count 
-- FROM circle_leaders 
-- WHERE circle_type IS NOT NULL
-- GROUP BY circle_type 
-- ORDER BY circle_type;

-- SELECT 'Final circle_types reference table:' as info;
-- SELECT id, value 
-- FROM circle_types 
-- ORDER BY 
--     CASE 
--         WHEN value LIKE 'YA |%' THEN 2
--         ELSE 1 
--     END,
--     value;
