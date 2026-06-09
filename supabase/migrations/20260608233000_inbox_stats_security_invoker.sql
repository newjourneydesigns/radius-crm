-- Harden circle_summary_inbox_message_stats against the Supabase
-- "Security Definer View" lint.
--
-- A Postgres view defaults to its owner's privileges (SECURITY DEFINER
-- semantics), and the owner (postgres) bypasses RLS. The view's base tables
-- (circle_summary_inbox_messages / _recipients) intentionally have RLS enabled
-- with NO policies: nothing is browser-facing, and all access flows through
-- server routes using the service-role client. The default definer view broke
-- that contract -- anon/authenticated could read aggregated recipient/read/
-- unread counts via PostgREST even though they get zero rows from the base
-- tables.
--
-- security_invoker makes the view inherit the exact RLS posture of its base
-- tables: anon/authenticated -> evaluated as themselves -> deny-all -> 0 rows;
-- service-role server routes -> bypass RLS -> full data (no app behavior change).
ALTER VIEW public.circle_summary_inbox_message_stats SET (security_invoker = true);

-- Belt-and-suspenders: this view is service-role-only by design, so drop any
-- client grants too.
REVOKE ALL ON public.circle_summary_inbox_message_stats FROM anon, authenticated;
