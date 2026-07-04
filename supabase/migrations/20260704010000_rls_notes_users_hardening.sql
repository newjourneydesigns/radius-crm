-- ============================================================================
-- RLS hardening: notes (drop anon access) + users (drop read-all escape hatch)
-- ============================================================================
-- These two tables were last configured by hand-run SQL in the repo root
-- (fix_notes_rls.sql, emergency_rls_fix.sql), not by a migration, so this file
-- makes the intended state authoritative and idempotent. It is written to be
-- safe regardless of the exact live policy set (every DROP is IF EXISTS).
--
-- IMPORTANT: apply and verify on a preview / branch database before production.
-- A too-strict RLS policy fails *silently* (queries return zero rows), so
-- confirm on the preview that: (a) an ACPD still sees leader notes on the circle
-- profile + notes pages, (b) creating/editing/deleting a note works, and
-- (c) a brand-new user still onboards (profile auto-created by handle_new_user).

-- ── notes: remove the public-anon grant ────────────────────────────────────
-- fix_notes_rls.sql granted SELECT/INSERT/UPDATE/DELETE to `anon, authenticated`
-- with USING(true). The anon key ships to the browser (NEXT_PUBLIC_*), so that
-- let anyone read/write/delete every leader note. Radius is an internal staff
-- tool where all real users are authenticated staff who share leader notes, so
-- we keep the same open access *for authenticated users only* and drop anon.

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to notes" ON notes;
DROP POLICY IF EXISTS "Allow insert access to notes" ON notes;
DROP POLICY IF EXISTS "Allow update access to notes" ON notes;
DROP POLICY IF EXISTS "Allow delete access to notes" ON notes;

CREATE POLICY "Authenticated read notes" ON notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert notes" ON notes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update notes" ON notes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete notes" ON notes
  FOR DELETE TO authenticated USING (true);

-- ── users: remove the "no profile row ⇒ read everyone" escape hatch ─────────
-- emergency_rls_fix.sql's read-all policy allowed SELECT when the caller has an
-- ACPD profile OR has *no* profile row at all. The second clause let any freshly
-- authenticated account (before its profile exists) read every user row. The
-- handle_new_user trigger now auto-provisions a profile on signup, so the escape
-- is vestigial; self-read is preserved by the separate users_read_own_profile
-- policy, so removing it only blocks reading *other* users without ACPD.
--
-- Uses the existing SECURITY DEFINER helper public.is_acpd_user() (from
-- 20260615120000_acpd_messaging.sql) so the policy does not query `users` from
-- within a `users` policy — that self-reference is what caused the historical
-- "infinite recursion detected in policy for relation users" errors.

DROP POLICY IF EXISTS "acpd_users_read_all_profiles" ON users;

CREATE POLICY "acpd_users_read_all_profiles" ON users
  FOR SELECT TO authenticated
  USING (public.is_acpd_user());
