-- Aggregated per-message inbox stats so the admin Leader Messages page
-- can fetch recipient/unread/read counts in a single query instead of
-- pulling every recipient row and counting in JS.

CREATE OR REPLACE VIEW circle_summary_inbox_message_stats AS
SELECT
  m.id AS message_id,
  COALESCE(COUNT(r.id), 0)::int AS recipients,
  COALESCE(
    COUNT(*) FILTER (
      WHERE r.read_at IS NOT NULL
        AND COALESCE(r.read_version, 0) >= COALESCE(m.version, 1)
    ),
    0
  )::int AS read,
  COALESCE(
    COUNT(r.id) FILTER (
      WHERE r.read_at IS NULL
        OR COALESCE(r.read_version, 0) < COALESCE(m.version, 1)
    ),
    0
  )::int AS unread
FROM circle_summary_inbox_messages m
LEFT JOIN circle_summary_inbox_recipients r ON r.message_id = m.id
GROUP BY m.id, m.version;
