-- ============================================================================
-- Atomic increment for Student Toolkit OTP attempt counters
-- ============================================================================
-- The Student Toolkit's verify-code route reads the outstanding student_otp_codes
-- rows for a leader, then writes back `attempts + 1`. supabase-js can only write
-- literal values, so under concurrent verify requests those read-then-write
-- updates race and lose increments — parallel guesses can exceed
-- OTP_MAX_ATTEMPTS against the 6-digit (1M) code space. Doing the increment in a
-- single SQL statement makes the per-code attempt cap hold under concurrency.
--
-- Mirrors increment_otp_attempts (20260704000000), with one difference: student
-- sign-in is email-only and resolves to a single leader, so the argument is the
-- leader id rather than a list of row ids — every outstanding code for that
-- leader is what a wrong guess was checked against.
--
-- SECURITY DEFINER because student_otp_codes has RLS on with no policies: only
-- the table owner can touch it, and this keeps the function usable from any
-- future non-service caller without opening the table up.

CREATE OR REPLACE FUNCTION increment_student_otp_attempts(p_leader_id BIGINT)
RETURNS TABLE (id uuid, attempts integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE student_otp_codes
  SET attempts = attempts + 1
  WHERE student_leader_id = p_leader_id
    AND consumed_at IS NULL
    AND expires_at > NOW()
  RETURNING id, attempts;
$$;

REVOKE ALL ON FUNCTION increment_student_otp_attempts(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_student_otp_attempts(BIGINT) TO service_role;
