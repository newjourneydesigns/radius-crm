import type { Principal } from './oauth';
import { InputError } from './schema';

const norm = (value: string) => value.trim().toLowerCase();

/**
 * Whether this connection may see a record at `campus`. `principal.campuses` null means every campus. A
 * restricted connection never sees a record with no campus: unknown is not allowed.
 */
export function canSeeCampus(principal: Principal, campus: string | null | undefined): boolean {
  if (!principal.campuses) return true;
  if (!campus) return false;
  const wanted = norm(campus);
  return principal.campuses.some((c) => norm(c) === wanted);
}

/**
 * The single gate for reading or writing anything about one leader. A leader outside the user's campuses
 * is reported exactly like one that doesn't exist, so the tools can't be used to probe for ids.
 * A campus *filter* in a tool's arguments only narrows results; this is what enforces permission.
 */
export function authorizeLeader<T extends { campus: string | null }>(
  principal: Principal,
  leader: T | null,
  id: number
): T {
  if (!leader || !canSeeCampus(principal, leader.campus)) throw new InputError(`No Circle Leader with id ${id}.`);
  return leader;
}
