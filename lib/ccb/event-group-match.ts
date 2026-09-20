/**
 * Matching a CCB event to the circle that owns it, by name.
 *
 * WHY THIS EXISTS
 *
 * `attendance_profiles` is the only CCB call that returns the whole church in
 * one request, and it names an event but NOT the group it belongs to. So an
 * occurrence only becomes "this circle's meeting" through a mapping RADIUS
 * holds itself, in `ccb_event_group_map`.
 *
 * That map is fed from two places, and both have the same blind spot: the
 * nightly prewarm learns events from `ccb_group_events_cache`, a 12-week
 * calendar window, and a toolkit submission learns the one event it was filed
 * against. An event that never landed on a cached calendar and was never
 * submitted through the toolkit is therefore never learned — and because
 * `/api/ccb/sync-attendance` builds its own event→leader index purely from
 * `circle_leaders.ccb_event_ids`, it cannot see that event either, so it never
 * teaches the map about it. Chicken and egg: the map stays empty for exactly
 * the events nothing else already knew.
 *
 * Measured on the week of 2026-09-06, the map covered 232 of 287 circle
 * occurrences — 81%. The missing 19% is not missing attendance: the facts in
 * `ccb_attendance_facts` are complete, keyed on CCB's own identifiers. It is
 * missing *attribution*, which is what "when did this person last attend"
 * reads through, so those answers silently degrade.
 *
 * The way out is the one every other matcher in this codebase already takes:
 * CCB titles a circle's events with the group's name, `FMT | S1 | Jane Doe`.
 * That pattern held for all 294 rows of a real Event List export, and matching
 * on it recovered 50 of the 55 unmapped occurrences that week.
 *
 * This module is deliberately narrower than the 5-tier ladder in
 * `ccb-client.ts:1865`. That one runs against a leader set already filtered to
 * a window and may accept a loose substring; this one writes a permanent row
 * into the map, so it only accepts exact, unambiguous names. A wrong pair here
 * is not a bad answer once — it is a bad answer forever, since the map never
 * re-points an event it has already filed.
 */

/** `CODE | S# | Leader Name` — how CCB names every Adult Circles group. */
export const CIRCLE_EVENT_NAME_RE =
  /^\s*(FMT|DNT|LVT|GVT|ONL)\s*\|\s*(S\d+)\s*\|\s*(.+?)\s*$/i;

export type MatchableLeader = {
  id: number | string;
  name?: string | null;
  ccb_group_id?: string | number | null;
  ccb_group_name?: string | null;
};

export type LeaderNameIndex = {
  byGroupName: Map<string, MatchableLeader>;
  byPersonName: Map<string, MatchableLeader>;
  /** Names seen more than once, held back rather than guessed at. */
  ambiguous: Set<string>;
};

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Index leaders by the two names an event title can carry.
 *
 * A name belonging to more than one leader is removed from the index entirely
 * rather than resolved first-wins. Two circles led by different people who
 * share a display name is the exact case where a wrong guess files one
 * circle's attendance under the other permanently, and an unmapped event costs
 * far less than a mis-mapped one.
 */
export function buildLeaderNameIndex(leaders: MatchableLeader[]): LeaderNameIndex {
  const byGroupName = new Map<string, MatchableLeader>();
  const byPersonName = new Map<string, MatchableLeader>();
  const ambiguous = new Set<string>();

  const add = (
    index: Map<string, MatchableLeader>,
    key: string,
    leader: MatchableLeader
  ) => {
    if (!key) return;
    const held = index.get(key);
    if (held && String(held.id) !== String(leader.id)) {
      ambiguous.add(key);
      index.delete(key);
      return;
    }
    if (!ambiguous.has(key)) index.set(key, leader);
  };

  for (const leader of leaders) {
    if (leader.ccb_group_id == null || String(leader.ccb_group_id).trim() === '') continue;
    add(byGroupName, norm(leader.ccb_group_name), leader);
    add(byPersonName, norm(leader.name), leader);
  }

  return { byGroupName, byPersonName, ambiguous };
}

export type NameMatch = {
  leader: MatchableLeader;
  via: 'group_name_match' | 'leader_name_match';
};

/**
 * Resolve an event title to a circle. Whole title against the CCB group name
 * first, since that is the string CCB itself generated; only then the leader
 * segment against the person's name, which is weaker because a leader can run
 * more than one circle.
 */
export function matchEventTitleToLeader(
  title: string | null | undefined,
  index: LeaderNameIndex
): NameMatch | null {
  const whole = norm(title);
  if (!whole) return null;

  const byGroup = index.byGroupName.get(whole);
  if (byGroup) return { leader: byGroup, via: 'group_name_match' };

  const parsed = CIRCLE_EVENT_NAME_RE.exec(title ?? '');
  if (!parsed) return null;

  const person = norm(parsed[3]);
  const byPerson = index.byPersonName.get(person);
  if (byPerson) return { leader: byPerson, via: 'leader_name_match' };

  return null;
}

/**
 * Event→group pairs for every event a name match can place and the map does
 * not already hold. Pairs already mapped are skipped rather than re-asserted,
 * because the map keeps an event's first group and a deliberate correction
 * should not have to compete with a nightly job.
 */
export function pairsForUnmappedEvents(
  events: Array<{ eventId: string; title?: string | null }>,
  index: LeaderNameIndex,
  alreadyMapped: Set<string>
): Array<{ ccbEventId: string; ccbGroupId: string }> {
  const pairs = new Map<string, string>();

  for (const event of events) {
    const eventId = String(event.eventId ?? '').trim();
    if (!eventId || alreadyMapped.has(eventId) || pairs.has(eventId)) continue;

    const match = matchEventTitleToLeader(event.title, index);
    if (!match) continue;

    const groupId = String(match.leader.ccb_group_id ?? '').trim();
    if (groupId) pairs.set(eventId, groupId);
  }

  return Array.from(pairs, ([ccbEventId, ccbGroupId]) => ({ ccbEventId, ccbGroupId }));
}
