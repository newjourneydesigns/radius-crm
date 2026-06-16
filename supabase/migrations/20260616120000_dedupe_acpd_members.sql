-- ============================================================================
-- Clean up duplicate ACPD conversation memberships
--
-- Duplicate (conversation_id, user_id) rows made membership checks that use
-- .maybeSingle() error out (false "not a member"), which blocked deleting a
-- conversation, and they double-count unread. Remove the dupes and make sure
-- the uniqueness that prevents them is in place.
-- ============================================================================

DELETE FROM public.acpd_conversation_members a
USING public.acpd_conversation_members b
WHERE a.conversation_id = b.conversation_id
  AND a.user_id = b.user_id
  AND a.ctid > b.ctid;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.acpd_conversation_members'::regclass
      AND c.contype = 'u'
      AND c.conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'public.acpd_conversation_members'::regclass AND attname = 'conversation_id'),
        (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'public.acpd_conversation_members'::regclass AND attname = 'user_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.acpd_conversation_members
      ADD CONSTRAINT acpd_conversation_members_conversation_id_user_id_key
      UNIQUE (conversation_id, user_id);
  END IF;
END $do$;
