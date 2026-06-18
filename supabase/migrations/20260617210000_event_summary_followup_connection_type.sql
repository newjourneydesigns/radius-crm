-- Add "Event Summary Follow-up" as a connection type.
--
-- Lets ACPDs label a connection logged on a leader's profile as a follow-up on
-- that leader's event/debrief summary. The Touchpoint Tracker can then optionally
-- count coverage from event-summary follow-ups only (logged touchpoints + these).
INSERT INTO connection_types (name, description, active)
VALUES ('Event Summary Follow-up', 'Followed up with the leader about their event/debrief summary', true)
ON CONFLICT (name) DO NOTHING;
