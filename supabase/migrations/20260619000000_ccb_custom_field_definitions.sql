-- Snapshot CCB custom-field definitions so they survive the v1 XML API retirement.
--
-- Why: the v2 (Pushpay) API returns a person's custom fields only as opaque IDs
-- (e.g. `option:individual/3` = 3) with NO labels. The human-readable dictionary
-- — field name -> label ("udf_ind_pulldown_3" -> "Area of Life") and pulldown
-- option id -> label (3 -> "Business") — lives ONLY in the v1 XML API today
-- (`custom_field_labels` for field labels; per-individual profile XML for the
-- pulldown option labels). When v1 is shut off, that dictionary disappears.
--
-- These two tables are that dictionary, captured from v1 while it still works.
-- The app resolves v2's raw IDs against them. v2's `{type}:individual/{N}` maps
-- deterministically to v1's `udf_ind_{type}_{N}`, so no per-request v1 call is
-- ever needed at read time.

-- 1. Field definitions (one row per custom field) ---------------------------
-- Populated in full from v1 `custom_field_labels` (a single call).
CREATE TABLE IF NOT EXISTS ccb_custom_field_definitions (
  name        TEXT PRIMARY KEY,            -- v1 field name, e.g. 'udf_ind_pulldown_3'
  label       TEXT,                        -- human label, e.g. 'Area of Life' (may be '')
  field_type  TEXT NOT NULL,               -- 'text' | 'date' | 'pulldown'
  scope       TEXT NOT NULL,               -- 'individual' | 'group'
  admin_only  BOOLEAN NOT NULL DEFAULT FALSE,
  v2_field_id TEXT,                        -- v2 join key, e.g. 'option:individual/3'
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ccb_custom_field_definitions ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: the sync writes and the app reads through the
-- service-role client in server routes.
COMMENT ON TABLE ccb_custom_field_definitions IS
  'Snapshot of CCB custom-field definitions (name -> label/type). Captured from v1 custom_field_labels so labels survive the v1 API retirement; v2 only returns opaque IDs. v2_field_id joins to v2 individual custom_fields[].id.';

-- 2. Pulldown option labels (one row per selectable option) -----------------
-- v1 has NO global service for these — the option labels appear only inline in
-- each individual's profile XML as <selection id="3">Business</selection>. So
-- this table is filled opportunistically: whenever the sync (or any individual
-- fetch) sees a pulldown selection, it upserts the (field, option) pair. A
-- backfill pass over individuals accumulates the full option set.
CREATE TABLE IF NOT EXISTS ccb_custom_field_options (
  field_name   TEXT NOT NULL REFERENCES ccb_custom_field_definitions(name) ON DELETE CASCADE,
  option_id    INTEGER NOT NULL,           -- v1 selection id / v2 option value
  option_label TEXT NOT NULL,              -- e.g. 'Business'
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (field_name, option_id)
);
ALTER TABLE ccb_custom_field_options ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: service-role access only.
COMMENT ON TABLE ccb_custom_field_options IS
  'Pulldown option id -> label for CCB custom fields (e.g. field udf_ind_pulldown_3 option 3 = "Business"). Harvested opportunistically from individual profile XML because v1 exposes no global option-list service.';
