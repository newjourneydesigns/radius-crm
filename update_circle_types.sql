-- Update circle types to match new standardized values
-- Run these commands in Supabase SQL editor

-- Update existing circle types to new standardized values
UPDATE circle_leaders 
SET circle_type = 'Men''s' 
WHERE circle_type IN ('Men''s Circle', 'Mens', 'Men', 'Male');

UPDATE circle_leaders 
SET circle_type = 'Women''s' 
WHERE circle_type IN ('Women''s Circle', 'Womens', 'Women', 'Female');

UPDATE circle_leaders 
SET circle_type = 'Young Adult | Coed' 
WHERE circle_type IN ('Mixed Circle', 'Coed', 'Co-ed', 'Mixed', 'Young Adult Mixed', 'Youth Circle');

UPDATE circle_leaders 
SET circle_type = 'Young Adult | Men''s' 
WHERE circle_type IN ('Young Adult Men', 'Youth Men', 'YA Men');

UPDATE circle_leaders 
SET circle_type = 'Young Adult | Women''s' 
WHERE circle_type IN ('Young Adult Women', 'Youth Women', 'YA Women');

UPDATE circle_leaders 
SET circle_type = 'Young Adult | Couple''s' 
WHERE circle_type IN ('Couples', 'Married', 'Young Adult Couples', 'YA Couples', 'Senior Circle');

-- Show the updated circle types
SELECT circle_type, COUNT(*) as count 
FROM circle_leaders 
WHERE circle_type IS NOT NULL 
GROUP BY circle_type 
ORDER BY circle_type;
