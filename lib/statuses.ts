/**
 * The single source of truth for Circle Leader lifecycle statuses.
 *
 * These values must match the circle_leaders_status_check constraint in the
 * database (see supabase/migrations/20260903000000_add_on_boarding_status.sql)
 * and the rows in the `statuses` table that feed the status dropdowns. When the
 * three drift apart, the app happily offers a status the database rejects on
 * save — which is exactly how "On-boarding" was unsaveable.
 */
export const CIRCLE_LEADER_STATUSES = [
  'invited',
  'pipeline',
  'on-boarding',
  'active',
  'paused',
  'off-boarding',
  'archived',
] as const;

export type CircleLeaderStatus = (typeof CIRCLE_LEADER_STATUSES)[number];

/**
 * Statuses a user can pick when creating or editing a leader. Archiving is its
 * own deliberate action, so it is not offered alongside the lifecycle statuses.
 */
export const ASSIGNABLE_CIRCLE_LEADER_STATUSES = CIRCLE_LEADER_STATUSES.filter(
  (status) => status !== 'archived'
) as readonly CircleLeaderStatus[];

/** Title-cased label for a status value, e.g. 'on-boarding' -> 'On-Boarding'. */
export function circleLeaderStatusLabel(status: string): string {
  return status
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

export function isCircleLeaderStatus(value: unknown): value is CircleLeaderStatus {
  return (
    typeof value === 'string' &&
    (CIRCLE_LEADER_STATUSES as readonly string[]).includes(value.trim().toLowerCase())
  );
}
