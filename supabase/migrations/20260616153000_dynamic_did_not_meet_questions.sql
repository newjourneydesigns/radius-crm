ALTER TABLE dynamic_questions
  ADD COLUMN IF NOT EXISTS response_key TEXT NOT NULL DEFAULT 'dynamic'
  CHECK (response_key IN ('dynamic', 'did_not_meet_reason', 'did_not_meet_notes'));

CREATE UNIQUE INDEX IF NOT EXISTS dynamic_questions_single_response_key_idx
  ON dynamic_questions (response_key)
  WHERE response_key <> 'dynamic';

INSERT INTO dynamic_questions (
  label,
  help_text,
  field_type,
  options,
  required,
  active_from,
  active_to,
  sort_order,
  response_key,
  show_when_did_not_meet,
  show_when_attended
)
SELECT
  'What kept you from meeting?',
  NULL,
  'radio',
  '[
    "Holiday weekend",
    "Leader out of town",
    "Low attendance",
    "Weather",
    {
      "label": "Other",
      "value": "__other__",
      "followup_label": "Tell us more",
      "followup_required": true
    }
  ]'::jsonb,
  TRUE,
  NULL,
  NULL,
  0,
  'did_not_meet_reason',
  TRUE,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM dynamic_questions WHERE response_key = 'did_not_meet_reason'
);

UPDATE dynamic_questions
SET options = '[
  "Holiday weekend",
  "Leader out of town",
  "Low attendance",
  "Weather",
  {
    "label": "Other",
    "value": "__other__",
    "followup_label": "Tell us more",
    "followup_required": true
  }
]'::jsonb
WHERE response_key = 'did_not_meet_reason'
  AND label = 'What kept you from meeting?'
  AND options @> '[{ "label": "Other", "value": "__other__" }]'::jsonb
  AND options::text NOT LIKE '%followup_label%';

INSERT INTO dynamic_questions (
  label,
  help_text,
  field_type,
  options,
  required,
  active_from,
  active_to,
  sort_order,
  response_key,
  show_when_did_not_meet,
  show_when_attended
)
SELECT
  'Anything else worth noting? (optional)',
  NULL,
  'textarea',
  '[]'::jsonb,
  FALSE,
  NULL,
  NULL,
  10,
  'did_not_meet_notes',
  TRUE,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM dynamic_questions WHERE response_key = 'did_not_meet_notes'
);
