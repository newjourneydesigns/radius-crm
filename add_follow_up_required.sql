-- Adding missing follow_up_required column
ALTER TABLE circle_leaders ADD COLUMN IF NOT EXISTS follow_up_required boolean DEFAULT false;

