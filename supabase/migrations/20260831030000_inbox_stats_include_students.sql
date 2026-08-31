-- ============================================================================
-- Count student recipients in the inbox stats view
-- ============================================================================
-- circle_summary_inbox_message_stats powers the recipient / read / unread
-- counts on the admin Leader Messages page. It LEFT JOINs
-- circle_summary_inbox_recipients only, whose leader_id has a foreign key to
-- circle_leaders — so student leaders get their own recipient table, and every
-- student message reported 0 recipients, 0 read, 0 unread.
--
-- That is the one number staff actually came for. Knowing who has read a
-- message is the whole reason the toolkit exists rather than another dashboard
-- somebody has to be told to go look at.
--
-- A message carries exactly one audience, so only one of the two tables ever
-- holds rows for a given message_id and the union cannot double-count.
-- ============================================================================

CREATE OR REPLACE VIEW circle_summary_inbox_message_stats AS
WITH all_recipients AS (
  SELECT message_id, read_at, read_version
  FROM circle_summary_inbox_recipients
  UNION ALL
  SELECT message_id, read_at, read_version
  FROM student_inbox_recipients
)
SELECT
  m.id AS message_id,
  COALESCE(COUNT(r.message_id), 0)::int AS recipients,
  COALESCE(
    COUNT(*) FILTER (
      WHERE r.read_at IS NOT NULL
        AND COALESCE(r.read_version, 0) >= COALESCE(m.version, 1)
    ),
    0
  )::int AS read,
  COALESCE(
    COUNT(r.message_id) FILTER (
      WHERE r.read_at IS NULL
        OR COALESCE(r.read_version, 0) < COALESCE(m.version, 1)
    ),
    0
  )::int AS unread
FROM circle_summary_inbox_messages m
LEFT JOIN all_recipients r ON r.message_id = m.id
GROUP BY m.id, m.version;

-- CREATE OR REPLACE VIEW does not carry these forward reliably, and the view is
-- service-role-only by design (see 20260608233000): its base tables have RLS on
-- with no policies, so a definer view would leak aggregate counts to
-- anon/authenticated through PostgREST.
ALTER VIEW public.circle_summary_inbox_message_stats SET (security_invoker = true);
REVOKE ALL ON public.circle_summary_inbox_message_stats FROM anon, authenticated;
