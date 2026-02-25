-- ============================================================
-- Supabase Linter Fix — Comprehensive
-- Generated 2025-02-25
--
-- Fixes:
--   A. 23 function_search_path_mutable warnings  (SET search_path = '')
--   B. Dangerous anon RLS policies on circle_leaders & notes
--   C. Overly permissive RLS on general_prayer_points (scope to owner)
--
-- Already applied (previous run):
--   - Dropped SECURITY DEFINER view rls_status
--   - Enabled RLS on bug_reports with ACPD-only read policies
--
-- NOT fixable via SQL (change in Supabase Dashboard):
--   - auth_otp_long_expiry          → Auth > Providers > Email > reduce OTP expiry to < 1 hour
--   - auth_leaked_password_protection → Auth > Settings > enable leaked password protection
--   - vulnerable_postgres_version    → Settings > Infrastructure > upgrade Postgres
--
-- Intentionally permissive (internal CRM, all authenticated = trusted staff):
--   - circle_meeting_attendees   INSERT/UPDATE/DELETE  (shared attendance data)
--   - circle_meeting_occurrences INSERT/UPDATE/DELETE  (shared attendance data)
--   - connections                INSERT/UPDATE         (shared connection log)
--   - bug_reports                INSERT                (anyone can submit)
-- ============================================================

BEGIN;

-- ============================================================
-- A. Fix function_search_path_mutable for all 23 functions
--    Setting search_path = '' forces schema-qualified references
--    and prevents search_path injection attacks.
-- ============================================================

-- Trigger functions (no parameters)
ALTER FUNCTION public.update_development_prospects_updated_at()       SET search_path = '';
ALTER FUNCTION public.update_todo_items_updated_at()                  SET search_path = '';
ALTER FUNCTION public.update_updated_at_column()                      SET search_path = '';
ALTER FUNCTION public.update_circle_visits_updated_at()               SET search_path = '';
ALTER FUNCTION public.set_updated_at()                                SET search_path = '';
ALTER FUNCTION public.trigger_set_timestamp()                         SET search_path = '';
ALTER FUNCTION public.update_acpd_encouragements_updated_at()         SET search_path = '';
ALTER FUNCTION public.sync_event_summary_flags()                      SET search_path = '';
ALTER FUNCTION public.sync_followup_to_todo()                         SET search_path = '';
ALTER FUNCTION public.handle_followup_todo_completion()               SET search_path = '';
ALTER FUNCTION public.handle_encouragement_marked_sent()              SET search_path = '';
ALTER FUNCTION public.handle_encouragement_deleted()                  SET search_path = '';
ALTER FUNCTION public.handle_followup_cleared()                       SET search_path = '';
ALTER FUNCTION public.handle_todo_uncompleted()                       SET search_path = '';
ALTER FUNCTION public.sync_encouragement_to_todo()                    SET search_path = '';
ALTER FUNCTION public.handle_encouragement_todo_completion()          SET search_path = '';
ALTER FUNCTION public.handle_new_user()                               SET search_path = '';

-- Functions with parameters
ALTER FUNCTION public.get_week_start_date(DATE)                       SET search_path = '';
ALTER FUNCTION public.is_acpd(UUID)                                   SET search_path = '';
ALTER FUNCTION public.get_user_role_bypass_rls(UUID)                  SET search_path = '';
ALTER FUNCTION public.is_user_acpd(UUID)                              SET search_path = '';
ALTER FUNCTION public.bootstrap_user_profiles()                       SET search_path = '';
ALTER FUNCTION public.check_monthly_communication()                   SET search_path = '';

-- ============================================================
-- B. Fix dangerous anon policies on circle_leaders
--    Anonymous users should NEVER be able to insert/update leaders.
--    Replace with authenticated-only policies.
-- ============================================================

DROP POLICY IF EXISTS "Allow anonymous inserts"  ON public.circle_leaders;
DROP POLICY IF EXISTS "Allow anonymous updates"  ON public.circle_leaders;

CREATE POLICY "Authenticated users can insert circle leaders"
  ON public.circle_leaders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update circle leaders"
  ON public.circle_leaders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- C. Fix dangerous anon/open policies on notes
--    Remove the catch-all "Allow all operations" policy and
--    the anon-accessible policies. Replace with authenticated-only
--    policies scoped to the note's created_by user.
-- ============================================================

DROP POLICY IF EXISTS "Allow all operations on notes" ON public.notes;
DROP POLICY IF EXISTS "Allow delete access to notes"  ON public.notes;
DROP POLICY IF EXISTS "Allow insert access to notes"  ON public.notes;
DROP POLICY IF EXISTS "Allow update access to notes"  ON public.notes;

-- All authenticated users can read notes (shared CRM data)
CREATE POLICY "Authenticated users can read notes"
  ON public.notes FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert notes (created_by will be set to their uid)
CREATE POLICY "Authenticated users can insert notes"
  ON public.notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Users can update their own notes
CREATE POLICY "Authenticated users can update own notes"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Users can delete their own notes
CREATE POLICY "Authenticated users can delete own notes"
  ON public.notes FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ACPD can update any note
CREATE POLICY "ACPD can update all notes"
  ON public.notes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ACPD')
  );

-- ACPD can delete any note
CREATE POLICY "ACPD can delete all notes"
  ON public.notes FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ACPD')
  );

-- ============================================================
-- D. Tighten general_prayer_points UPDATE/DELETE to owner
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can update general prayer points" ON public.general_prayer_points;
DROP POLICY IF EXISTS "Authenticated users can delete general prayer points" ON public.general_prayer_points;

CREATE POLICY "Users can update own prayer points"
  ON public.general_prayer_points FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prayer points"
  ON public.general_prayer_points FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMIT;
