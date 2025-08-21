-- Add additional leader fields to circle_leaders table
-- Migration: Add Additional Leader Support
-- Date: 2025-08-20

ALTER TABLE circle_leaders 
ADD COLUMN additional_leader_name VARCHAR(255),
ADD COLUMN additional_leader_phone VARCHAR(50),
ADD COLUMN additional_leader_email VARCHAR(255);

-- Add indexes for better performance
CREATE INDEX idx_circle_leaders_additional_email ON circle_leaders(additional_leader_email);
CREATE INDEX idx_circle_leaders_additional_phone ON circle_leaders(additional_leader_phone);
