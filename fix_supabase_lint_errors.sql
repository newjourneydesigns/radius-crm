-- Fix Supabase Linter Errors (2025-02-24)
-- 1. Drop the SECURITY DEFINER view `public.rls_status`
-- 2. Enable RLS on `public.bug_reports`

-- ============================================================
-- 1. Drop rls_status view
--    This view was only used for ad-hoc monitoring and triggers
--    a security_definer_view lint error. Querying pg_tables and
--    pg_policies can be done directly when needed.
-- ============================================================
DROP VIEW IF EXISTS public.rls_status;

-- ============================================================
-- 2. Enable RLS on bug_reports
--    This table has no user_id column (anonymous submissions),
--    so anyone authenticated can insert, only admins can read/manage.
-- ============================================================
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to submit a bug report
CREATE POLICY "Authenticated users can insert bug reports"
  ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow admins/ACPD to view all bug reports
CREATE POLICY "Admins can view all bug reports"
  ON public.bug_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'ACPD')
    )
  );

-- Allow admins/ACPD to update any bug report (e.g. mark resolved)
CREATE POLICY "Admins can update all bug reports"
  ON public.bug_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'ACPD')
    )
  );

-- Allow admins/ACPD to delete bug reports
CREATE POLICY "Admins can delete bug reports"
  ON public.bug_reports
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'ACPD')
    )
  );
