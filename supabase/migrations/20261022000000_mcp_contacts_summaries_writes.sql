-- ============================================================================
-- MCP phase 2: campus scoping, idempotent note + connection writes
-- ============================================================================
-- Backs the contact, event-summary and write tools added to the Radius MCP server.
-- Safe to run twice. Grants nobody anything: new scopes (radius:contacts:read,
-- radius:notes:write, radius:connections:write) must still be added to a user's
-- mcp_access.scopes by hand — see docs/MCP_SETUP.md.
--
-- Everything here is reached ONLY through the server's service-role key.

-- ── 1. Campus scoping per MCP user (NULL = every campus) ───────────────────
ALTER TABLE public.mcp_access
  ADD COLUMN IF NOT EXISTS campuses text[];

-- ── 2. How a connection was logged ─────────────────────────────────────────
-- connections.created_by already exists (varchar) but the app never fills it. Connections made through the
-- assistant store the signed-in user's id there as text, and mark themselves with source = 'mcp'.
DO $$
BEGIN
  IF to_regclass('public.connections') IS NOT NULL THEN
    ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS source text;
  END IF;
END $$;

-- ── 3. Write ledger: idempotency + "who changed what" ──────────────────────
-- One row per accepted write. Holds ids, a hash of the request and the content length,
-- never the note or connection text itself.
CREATE TABLE IF NOT EXISTS public.mcp_write_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  grant_id         uuid,
  tool             text NOT NULL,
  idempotency_key  text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  request_hash     text NOT NULL,
  leader_id        bigint,
  record_table     text,
  record_id        text,
  content_length   integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tool, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_mcp_write_log_leader ON public.mcp_write_log(leader_id, created_at DESC);

ALTER TABLE public.mcp_write_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_write_log FROM anon, authenticated;

-- ── 4. mcp_add_note ────────────────────────────────────────────────────────
-- Claims the idempotency key and inserts the note in ONE transaction, so a failure leaves
-- neither a note nor a consumed key. The timestamp is the database clock. Only the notes
-- table is written: follow-up flags and dates are never touched.
CREATE OR REPLACE FUNCTION public.mcp_add_note(
  p_user_id uuid, p_grant_id uuid, p_key text, p_hash text, p_leader_id bigint, p_content text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_log uuid;
  v_existing public.mcp_write_log%ROWTYPE;
  v_note_id text;
BEGIN
  INSERT INTO public.mcp_write_log (user_id, grant_id, tool, idempotency_key, request_hash, leader_id, record_table, content_length)
  VALUES (p_user_id, p_grant_id, 'add_leader_note', p_key, p_hash, p_leader_id, 'notes', char_length(p_content))
  ON CONFLICT (user_id, tool, idempotency_key) DO NOTHING
  RETURNING id INTO v_log;

  IF v_log IS NULL THEN
    SELECT * INTO v_existing FROM public.mcp_write_log
     WHERE user_id = p_user_id AND tool = 'add_leader_note' AND idempotency_key = p_key;
    IF v_existing.request_hash <> p_hash THEN
      RAISE EXCEPTION 'mcp:idempotency_conflict';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'record_id', v_existing.record_id);
  END IF;

  PERFORM 1 FROM public.circle_leaders WHERE id = p_leader_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mcp:leader_not_found';
  END IF;

  -- notes records its author in user_id (there is no created_by column on notes)
  INSERT INTO public.notes (circle_leader_id, content, user_id)
  VALUES (p_leader_id, p_content, p_user_id)
  RETURNING id::text INTO v_note_id;

  UPDATE public.mcp_write_log SET record_id = v_note_id WHERE id = v_log;
  RETURN jsonb_build_object('replayed', false, 'record_id', v_note_id);
END;
$$;

-- ── 5. mcp_log_connection ──────────────────────────────────────────────────
-- Same shape as the app's Log Connection button, in one transaction:
--   1. the connections row (date_of_connection = what happened; created_at = when it was entered)
--   2. the mirror note on the leader's timeline (text built by the server)
--   3. last_check_in_date (and last_connection, where that column exists) moved forward,
--      never backwards, so a backdated entry can't make a leader look less recently contacted.
-- Follow-ups are never cleared.
CREATE OR REPLACE FUNCTION public.mcp_log_connection(
  p_user_id uuid, p_grant_id uuid, p_key text, p_hash text, p_leader_id bigint,
  p_type_id integer, p_date date, p_note text, p_mirror_note text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_log uuid;
  v_existing public.mcp_write_log%ROWTYPE;
  v_connection_id text;
BEGIN
  INSERT INTO public.mcp_write_log (user_id, grant_id, tool, idempotency_key, request_hash, leader_id, record_table, content_length)
  VALUES (p_user_id, p_grant_id, 'log_connection', p_key, p_hash, p_leader_id, 'connections', char_length(coalesce(p_note, '')))
  ON CONFLICT (user_id, tool, idempotency_key) DO NOTHING
  RETURNING id INTO v_log;

  IF v_log IS NULL THEN
    SELECT * INTO v_existing FROM public.mcp_write_log
     WHERE user_id = p_user_id AND tool = 'log_connection' AND idempotency_key = p_key;
    IF v_existing.request_hash <> p_hash THEN
      RAISE EXCEPTION 'mcp:idempotency_conflict';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'record_id', v_existing.record_id);
  END IF;

  PERFORM 1 FROM public.circle_leaders WHERE id = p_leader_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mcp:leader_not_found';
  END IF;

  PERFORM 1 FROM public.connection_types WHERE id = p_type_id AND active IS NOT FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mcp:connection_type_invalid';
  END IF;

  INSERT INTO public.connections (circle_leader_id, date_of_connection, connection_type_id, note, created_by, source)
  VALUES (p_leader_id, p_date, p_type_id, p_note, p_user_id::text, 'mcp')
  RETURNING id::text INTO v_connection_id;

  INSERT INTO public.notes (circle_leader_id, content, user_id)
  VALUES (p_leader_id, p_mirror_note, p_user_id);

  UPDATE public.circle_leaders
     SET last_check_in_date = p_date
   WHERE id = p_leader_id
     AND (last_check_in_date IS NULL OR last_check_in_date::text < p_date::text);

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'circle_leaders' AND column_name = 'last_connection') THEN
    EXECUTE 'UPDATE public.circle_leaders SET last_connection = $1 WHERE id = $2 AND (last_connection IS NULL OR last_connection::text < $1::text)'
      USING p_date, p_leader_id;
  END IF;

  UPDATE public.mcp_write_log SET record_id = v_connection_id WHERE id = v_log;
  RETURN jsonb_build_object('replayed', false, 'record_id', v_connection_id);
END;
$$;

-- Only the server (service role) may call these.
REVOKE ALL ON FUNCTION public.mcp_add_note(uuid, uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_log_connection(uuid, uuid, text, text, bigint, integer, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_add_note(uuid, uuid, text, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_log_connection(uuid, uuid, text, text, bigint, integer, date, text, text) TO service_role;
