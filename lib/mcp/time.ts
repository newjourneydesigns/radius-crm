import { DateTime } from 'luxon';

/**
 * Milliseconds for a stored timestamp, or NaN if it can't be read. Postgres returns ISO 8601 with a `T`;
 * the SQL form is accepted too in case a serializer ever changes.
 */
export function timestampMillis(value: string): number {
  const iso = DateTime.fromISO(value);
  return (iso.isValid ? iso : DateTime.fromSQL(value)).toMillis();
}

/** True once `value` has passed. An unreadable timestamp counts as passed, so expiry checks fail closed. */
export const hasPassed = (value: string, now: Date) => !(timestampMillis(value) > now.getTime());
