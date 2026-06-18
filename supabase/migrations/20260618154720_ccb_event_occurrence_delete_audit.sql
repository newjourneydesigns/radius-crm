-- Audit log for the admin CCB v2 event occurrence delete tool.
--
-- This table intentionally has RLS enabled with no anon/authenticated policies.
-- The tool writes through the server-side service role only, because records can
-- contain sensitive admin action history and CCB identifiers.

CREATE TABLE IF NOT EXISTS public.ccb_event_occurrence_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_email text,
  user_name text,

  action text NOT NULL CHECK (action IN ('search', 'delete')),
  search_params jsonb NOT NULL DEFAULT '{}'::jsonb,

  group_id text,
  group_name text,
  event_id text,
  event_name text,
  occurrence text,
  event_start text,
  event_end text,

  had_attendance boolean,
  total_attendance integer,

  ccb_response_status integer,
  success boolean NOT NULL DEFAULT false,
  error_message text,

  result_count integer,
  selected_count integer
);

CREATE INDEX IF NOT EXISTS ccb_event_occurrence_delete_audit_created_idx
  ON public.ccb_event_occurrence_deletion_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS ccb_event_occurrence_delete_audit_user_created_idx
  ON public.ccb_event_occurrence_deletion_audit (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ccb_event_occurrence_delete_audit_event_occurrence_idx
  ON public.ccb_event_occurrence_deletion_audit (event_id, occurrence);

ALTER TABLE public.ccb_event_occurrence_deletion_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ccb_event_occurrence_deletion_audit IS
  'Service-role-only audit log for admin CCB v2 event occurrence search/delete actions.';
