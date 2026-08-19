import type { NextRequest } from 'next/server';
import { CCBv2Client, formatCcbAddress } from './ccb-v2-client';
import { fetchCcbGroupClassifications } from './circle-type';
import { isSameLeaderFieldValue, normalizeLeaderFieldValue } from '../leaderFieldValues';

/**
 * The one place that defines what a "sync from CCB" may touch on a circle
 * leader, and how a fresh CCB snapshot is diffed against the stored row.
 * Shared by the per-circle "Re-sync from CCB" and the Mass Update bulk sync so
 * the two can never drift apart.
 */

export const CCB_SYNCABLE_FIELDS = [
  'name', 'campus', 'circle_type', 'circle_location', 'day', 'time', 'frequency',
  'location', 'email', 'phone', 'birthday', 'leader_ccb_profile_link',
  'ccb_group_name', 'ccb_event_ids',
] as const;

export type CcbSyncableField = (typeof CCB_SYNCABLE_FIELDS)[number];

export const CCB_SYNC_FIELD_LABELS: Record<string, string> = {
  name: 'Leader Name', campus: 'Campus', circle_type: 'Circle Type',
  circle_location: 'Circle Location', day: 'Meeting Day',
  time: 'Meeting Time', frequency: 'Frequency', location: 'Location', email: 'Email',
  phone: 'Phone', birthday: 'Birthday', leader_ccb_profile_link: 'Leader CCB Profile',
  ccb_group_name: 'CCB Group Name', ccb_event_ids: 'CCB Event IDs',
};

export interface CcbCircleSnapshot {
  /** CCB-derived values in RADIUS's canonical spelling, only where CCB has data. */
  proposed: Record<string, any>;
  eventIdsLinked: number;
  groupName: string | null;
  /** The group exists but is marked inactive in CCB — worth surfacing to admins. */
  ccbInactive: boolean;
}

export interface CcbSyncChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** CCB web-UI base (no /api.php), for building deep links. '' when unset. */
function ccbLinkBase(): string {
  const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';
  if (!subdomain) return '';
  const base = subdomain.includes('.')
    ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
    : `https://${subdomain}.ccbchurch.com`;
  return base.replace(/\/api\.php$/, '');
}

/**
 * Pull a circle's current data from CCB — group detail, campus name, leader
 * profile, real meeting schedule, and the v1-only Circle Type custom field —
 * exactly the enrichment the importer performs. Returns null when CCB has no
 * group for the id (deleted, or the id is wrong).
 *
 * `campusNameCache` lets a bulk caller resolve the /campuses list once per
 * request instead of once per circle.
 */
export async function fetchCcbCircleSnapshot(opts: {
  request: NextRequest;
  ccbv2: CCBv2Client;
  groupId: string;
  telemetry: { module: string; classificationsAction?: string };
  campusNameCache?: Map<string, string | null>;
}): Promise<CcbCircleSnapshot | null> {
  const { request, ccbv2, groupId } = opts;

  const group = await ccbv2.getGroupDetail(groupId);
  if (!group) return null;

  // Resolve campus name (single-group fetch returns it null).
  let campusName = group.campus?.name || null;
  if (!campusName && group.campus?.id) {
    const campusKey = String(group.campus.id);
    if (opts.campusNameCache?.has(campusKey)) {
      campusName = opts.campusNameCache.get(campusKey) ?? null;
    } else {
      try {
        const campusesRaw = await ccbv2.get('/campuses');
        const campuses = Array.isArray(campusesRaw) ? campusesRaw : (campusesRaw?.items ?? campusesRaw?.data ?? []);
        if (opts.campusNameCache) {
          for (const c of campuses) {
            if (c?.id !== undefined) opts.campusNameCache.set(String(c.id), c?.name || null);
          }
          if (!opts.campusNameCache.has(campusKey)) opts.campusNameCache.set(campusKey, null);
          campusName = opts.campusNameCache.get(campusKey) ?? null;
        } else {
          campusName = campuses.find((c: any) => String(c.id) === campusKey)?.name || null;
        }
      } catch { /* non-fatal */ }
    }
  }

  // Leader profile → email, phone, birthday (the group payload omits them).
  let leaderEmail: string | null = group.mainLeader?.email || null;
  let leaderPhone: string | null = null;
  let leaderBirthday: string | null = null;
  if (group.mainLeader?.id) {
    try {
      const profile = await ccbv2.getIndividualProfile(group.mainLeader.id);
      if (profile) {
        leaderEmail = leaderEmail || profile.email || null;
        leaderPhone = profile.mobilePhone || profile.phone || null;
        leaderBirthday = profile.birthday || null;
      }
    } catch { /* non-fatal */ }
  }

  // Calendar → meeting time/day/frequency + event IDs (current event first).
  let meeting = { eventIds: [] as string[], time: null as string | null, day: null as string | null, frequency: null as string | null, eventLocation: null as string | null };
  try {
    meeting = await ccbv2.getGroupMeetingDetails(groupId);
  } catch { /* non-fatal */ }

  // The group's own "Where this group meets" address is what staff edit, so it
  // wins. An event's address is only a snapshot taken when that event was
  // created, and goes stale the moment a circle changes venue.
  const meetingLocation = formatCcbAddress(group.address) || meeting.eventLocation;

  // Circle Type and Circle Location are custom fields on the CCB group
  // profile, reachable only through v1 — one call returns both. `group.type.name`
  // from v2 is CCB's group_type ("Small Group"), which is not what RADIUS stores.
  const classifications = await fetchCcbGroupClassifications(request, groupId, {
    module: opts.telemetry.module,
    action: opts.telemetry.classificationsAction || 'Lookup Group Classifications',
  });

  const linkBase = ccbLinkBase();
  const leaderProfileLink = linkBase && group.mainLeader?.id
    ? `${linkBase}/goto/individuals/${group.mainLeader.id}`
    : null;

  // Only propose fields where CCB has a value, so a sync never blanks out data
  // that was hand-entered when CCB is sparse. Values are stored in RADIUS's
  // canonical spelling, not CCB's, so applying a sync can't leave a
  // circle_type or frequency no dropdown on the profile page can match.
  const proposed: Record<string, any> = {};
  const setIf = (key: string, val: any) => {
    if (val === null || val === undefined || val === '') return;
    const normalized = normalizeLeaderFieldValue(key, val);
    if (normalized === '') return;
    proposed[key] = normalized;
  };

  setIf('name', group.mainLeader?.fullName || null);
  setIf('campus', campusName);
  setIf('circle_type', classifications.circleType);
  setIf('circle_location', classifications.circleLocation);
  setIf('day', meeting.day || group.meetDay?.name || null);
  setIf('time', meeting.time);
  setIf('frequency', meeting.frequency);
  setIf('location', meetingLocation);
  setIf('email', leaderEmail);
  setIf('phone', leaderPhone);
  setIf('birthday', leaderBirthday);
  setIf('leader_ccb_profile_link', leaderProfileLink);
  setIf('ccb_group_name', group.name);
  if (meeting.eventIds.length > 0) proposed.ccb_event_ids = meeting.eventIds;

  return {
    proposed,
    eventIdsLinked: meeting.eventIds.length,
    groupName: group.name || null,
    ccbInactive: group.inactive === true,
  };
}

/**
 * Diff a CCB snapshot against the stored row: only fields whose proposed value
 * *means* something different from the current one. Comparing raw strings
 * flagged "7:00 PM" against "19:00" and "1st & 3rd" against "1st, 3rd" as
 * edits on every run, so a re-sync could never come back clean.
 */
export function diffCircleSnapshot(
  current: Record<string, any>,
  proposed: Record<string, any>
): { changes: CcbSyncChange[]; values: Record<string, any> } {
  const norm = (v: any) => Array.isArray(v) ? v.map(String).join(', ') : (v ?? '') === '' ? '' : String(v);
  const changes: CcbSyncChange[] = [];
  const values: Record<string, any> = {};
  for (const key of CCB_SYNCABLE_FIELDS) {
    if (!(key in proposed)) continue;
    if (isSameLeaderFieldValue(key, current[key], proposed[key])) continue;
    changes.push({
      field: key,
      label: CCB_SYNC_FIELD_LABELS[key] || key,
      from: norm(current[key]) || '—',
      to: norm(proposed[key]) || '—',
    });
    values[key] = proposed[key];
  }
  return { changes, values };
}
