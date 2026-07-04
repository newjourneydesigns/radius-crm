-- ============================================================================
-- Atomic increment for OTP attempt counters
-- ============================================================================
-- verify-code reads each outstanding OTP row's `attempts`, then writes back
-- `attempts + 1`. supabase-js can only write literal values, so under concurrent
-- verify requests those read-then-write updates race and lose increments — an
-- attacker firing parallel guesses can exceed OTP_MAX_ATTEMPTS against the
-- 6-digit (1M) code space. Doing the increment in a single SQL statement makes
-- the per-code attempt cap hold under concurrency.
--
-- Runs as the service role (verify-code uses the service client), which bypasses
-- RLS, so no SECURITY DEFINER is needed.

CREATE OR REPLACE FUNCTION increment_otp_attempts(p_ids uuid[])
RETURNS TABLE (id uuid, attempts integer)
LANGUAGE sql
AS $$
  UPDATE leader_otp_codes
  SET attempts = attempts + 1
  WHERE id = ANY(p_ids)
  RETURNING id, attempts;
$$;
