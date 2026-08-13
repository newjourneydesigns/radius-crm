-- Birthdate on campaign people, for the under-18 texting gate.
--
-- A campaign roster mixes adults and students, and a minor should never be on
-- the receiving end of a bulk text. Storing the birthdate lets the campaign view
-- hold those people back from every send path and list them separately with the
-- reason.
--
-- Kept as TEXT rather than DATE because it is copied verbatim from CCB, which
-- returns 'YYYY-MM-DD' for a full birthdate but also month/day-only values for
-- people who withheld the year. Parsing (and ignoring the year-less ones) is
-- handled in lib/messaging/minorGuard.ts.
--
-- Pasted rosters don't need this column — a Birthdate or Age column from a
-- spreadsheet already lands in `attributes` and is read from there.

ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS birthdate TEXT;

COMMENT ON COLUMN follow_up_campaign_people.birthdate IS
  'Birthdate as CCB reports it (usually YYYY-MM-DD; may be month/day only). Used to block texting anyone under 18. NULL = unknown, which does not block.';
