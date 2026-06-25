-- Rename "Event Summary Follow-up" connection type to "Debrief Touchpoint".
UPDATE connection_types
SET name = 'Debrief Touchpoint',
    description = 'Followed up with the leader about their event/debrief summary'
WHERE name = 'Event Summary Follow-up';
