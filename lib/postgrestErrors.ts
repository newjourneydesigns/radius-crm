/**
 * Telling "this column isn't in the schema yet" apart from every other write
 * failure.
 *
 * A few occurrence writers upsert the optional note-text columns and, if that
 * fails, retry without them — cover for an environment where the migration
 * adding `topic` / `notes` / `prayer_requests` hasn't run. The catch used to be
 * unconditional, so *any* failure (a constraint violation, a bad row in the
 * batch, a transient error) silently downgraded the write and dropped the
 * leader's write-up. On a batch covering every leader in a week, one bad row
 * cost everyone their notes.
 *
 * PostgREST reports a column it can't resolve two ways:
 *   PGRST204 — "Could not find the 'topic' column of '…' in the schema cache"
 *   42703    — Postgres undefined_column, surfaced straight through
 * Anything else is a real failure and must be logged, not worked around.
 */

const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703']);

export type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

export function isMissingColumnError(error: PostgrestLikeError): boolean {
  if (!error) return false;
  return MISSING_COLUMN_CODES.has(String(error.code ?? '').trim());
}

/**
 * A table PostgREST can't see — almost always a migration that was committed
 * but never run against this database.
 *
 * Newer PostgREST says so (PGRST205 "Could not find the table … in the schema
 * cache"; 42P01 is Postgres's own undefined_table). PostgREST 12.2 doesn't: it
 * answers a write to a missing table with a bare 404 and an empty `{}` body,
 * so supabase-js hands back an error with no code and no message, and only
 * the HTTP status gives it away. That is how Skip Week on the Event Summary
 * Tracker came to fail with "Could not skip the week: undefined". Matching on
 * message text alone misses this case.
 */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

export function isMissingTableError(error: PostgrestLikeError, status?: number): boolean {
  if (!error) return false;
  if (MISSING_TABLE_CODES.has(String(error.code ?? '').trim())) return true;
  return status === 404 && !error.code && !error.message;
}

/** Compact one-line form of a PostgREST error, for logs. */
export function describePostgrestError(error: PostgrestLikeError): string {
  if (!error) return 'unknown error';
  const parts = [
    error.code ? `[${error.code}]` : null,
    error.message ?? null,
    error.details ?? null,
    error.hint ?? null,
  ].filter(Boolean);
  return parts.join(' ') || 'unknown error';
}
