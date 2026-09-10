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
