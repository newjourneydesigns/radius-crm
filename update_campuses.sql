-- Update campus values to match new standardized values
-- Run these commands in Supabase SQL editor

-- Update existing campus values to new standardized values
UPDATE circle_leaders 
SET campus = 'Flower Mound' 
WHERE campus IN ('Downtown', 'Main', 'Central', 'FM', 'Flower Mound Campus');

UPDATE circle_leaders 
SET campus = 'Denton' 
WHERE campus IN ('North', 'Denton Campus', 'DN');

UPDATE circle_leaders 
SET campus = 'Lewisville' 
WHERE campus IN ('South', 'Lewisville Campus', 'LV');

UPDATE circle_leaders 
SET campus = 'Gainesville' 
WHERE campus IN ('East', 'Gainesville Campus', 'GV');

UPDATE circle_leaders 
SET campus = 'Online' 
WHERE campus IN ('Virtual', 'Remote', 'Digital', 'Web');

UPDATE circle_leaders 
SET campus = 'University' 
WHERE campus IN ('West', 'College', 'UNT', 'TWU', 'Campus Ministry');

UPDATE circle_leaders 
SET campus = 'Argyle' 
WHERE campus IN ('Argyle Campus', 'AR');

-- Show the updated campus distribution
SELECT campus, COUNT(*) as count 
FROM circle_leaders 
WHERE campus IS NOT NULL 
GROUP BY campus 
ORDER BY campus;
