-- Insert sample circle leaders
INSERT INTO circle_leaders (name, email, phone, campus, acpd, status, day, time, frequency, circle_type, event_summary_received, ccb_profile_link) VALUES
('John Smith', 'john.smith@email.com', '(555) 123-4567', 'Downtown', 'Jane Doe', 'Active', 'Tuesday', '19:00', 'Weekly', 'Men''s Circle', true, 'https://example.com/john'),
('Mary Johnson', 'mary.johnson@email.com', '(555) 234-5678', 'North', 'Mike Wilson', 'Active', 'Wednesday', '18:30', 'Weekly', 'Women''s Circle', false, 'https://example.com/mary'),
('David Brown', 'david.brown@email.com', '(555) 345-6789', 'South', 'Sarah Davis', 'Active', 'Thursday', '20:00', 'Bi-weekly', 'Mixed Circle', true, 'https://example.com/david'),
('Lisa Wilson', 'lisa.wilson@email.com', '(555) 456-7890', 'East', 'Jane Doe', 'Active', 'Monday', '19:30', 'Weekly', 'Women''s Circle', false, 'https://example.com/lisa'),
('Michael Davis', 'michael.davis@email.com', '(555) 567-8901', 'West', 'Mike Wilson', 'On Hold', 'Friday', '18:00', 'Monthly', 'Men''s Circle', false, null),
('Sarah Miller', 'sarah.miller@email.com', '(555) 678-9012', 'Downtown', 'Sarah Davis', 'Active', 'Sunday', '17:00', 'Weekly', 'Youth Circle', true, 'https://example.com/sarah'),
('Robert Garcia', 'robert.garcia@email.com', '(555) 789-0123', 'North', 'Jane Doe', 'Active', 'Saturday', '10:00', 'Weekly', 'Mixed Circle', false, 'https://example.com/robert'),
('Jennifer Lopez', 'jennifer.lopez@email.com', '(555) 890-1234', 'South', 'Mike Wilson', 'Inactive', 'Tuesday', '19:00', 'Bi-weekly', 'Women''s Circle', false, null),
('Thomas Anderson', 'thomas.anderson@email.com', '(555) 901-2345', 'East', 'Sarah Davis', 'Active', 'Wednesday', '20:30', 'Weekly', 'Men''s Circle', true, 'https://example.com/thomas'),
('Emily Taylor', 'emily.taylor@email.com', '(555) 012-3456', 'West', 'Jane Doe', 'Active', 'Thursday', '18:00', 'Weekly', 'Youth Circle', false, 'https://example.com/emily');

-- Note: You'll need to manually create an admin user in the Supabase auth UI first,
-- then update the users table to set their role to 'admin'
