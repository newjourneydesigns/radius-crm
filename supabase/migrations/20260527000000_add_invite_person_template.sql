-- Per-user saved template for the "Invite a Person" message on /search and circle detail pages.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_person_template text;

COMMENT ON COLUMN users.invite_person_template IS
  'User-customized template for the Invite a Person message. NULL means use the app default. Placeholders: {personName}, {personFirstName}, {leaderName}, {acpdName}, {day}, {time}, {frequency}, {location}.';
