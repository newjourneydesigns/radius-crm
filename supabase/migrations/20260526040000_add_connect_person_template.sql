-- Add per-user customizable Connect Person message template
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS connect_person_template text;

COMMENT ON COLUMN users.connect_person_template IS
  'Per-ACPD template for the Connect New Person message. Supports placeholders: {leaderFirstName}, {personName}, {phone}, {email}, {currentUserName}. NULL = use system default.';
