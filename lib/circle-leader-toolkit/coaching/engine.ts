/**
 * Coaching automation evaluation engine.
 *
 * `evaluateLeader` inspects a single leader's roster + attendance and returns the
 * coaching nudges that are due right now, with already-delivered occurrences
 * filtered out via the coaching_automation_sends ledger. The cron route turns
 * each DueNudge into an inbox message and records the sends.
 *
 * Cadence is encoded in each nudge's subjectKey:
 *   - per-week automations (multiplication, inactivity, birthday, did_not_meet)
 *     dedupe on the Sunday-start week bucket → at most once per week while the condition holds.
 *   - per-member automations (new_member, first_time) dedupe on the member id
 *     → once ever per person.
 */

import { DateTime } from 'luxon';
import { sundayWeekStart, sundayWeekEnd, sundayWeekKey } from '../../week';
import type { AutomationKind, CoachingConfig } from './config';
import {
  NudgeContent,
  TemplateText,
  renderNudge,
} from './templates';

const TZ = 'America/Chicago';
// Brand-new members get the new_member nudge once their join is at least
// followUpHours old; this upper bound keeps the daily worker from firing for
// epoch-backfilled (pre-migration) members, whose added_at sits in 1970.
const NEW_MEMBER_LOOKBACK_DAYS = 7;
// A "first-time attendee" is someone who recently joined and just showed up.
const FIRST_TIME_JOINED_WITHIN_DAYS = 60;
const FIRST_TIME_ATTENDED_WITHIN_DAYS = 8;

export interface CoachingLeader {
  id: number | string;
  name: string;
  campus: string | null;
  acpd: string | null;
  ccb_group_id: string | number | null;
  status: string | null;
  circle_summary_access_enabled?: boolean | null;
}

export interface DueNudge {
  kind: AutomationKind;
  subjectKeys: string[];
  content: NudgeContent;
}

export interface RosterRow {
  ccb_individual_id: string;
  full_name: string | null;
  first_name: string | null;
  birthday: string | null;
  added_at: string | null;
}

/** Pre-loaded, per-leader inputs the evaluation needs (batched by the caller). */
export interface EvaluateContext {
  roster: RosterRow[];
  /** ccb_individual_id → last attended YYYY-MM-DD. */
  lastAttended: Record<string, string>;
  /** Delivered occurrences as "kind:subjectKey". */
  sentKeys: Set<string>;
}


function displayName(row: RosterRow): string {
  return (row.full_name || row.first_name || 'A Circle member').trim();
}

/** Extract { month, day } from a free-form birthday string, or null. */
function birthdayMonthDay(raw: string | null): { month: number; day: number } | null {
  const value = (raw || '').trim();
  if (!value) return null;
  let m: RegExpMatchArray | null;
  if ((m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    return { month: Number(m[2]), day: Number(m[3]) };
  }
  if ((m = value.match(/^(\d{1,2})\/(\d{1,2})/))) {
    return { month: Number(m[1]), day: Number(m[2]) };
  }
  return null;
}

/** True when a birthday (month/day) lands inside the current ISO week. */
function birthdayThisWeek(raw: string | null, weekStart: DateTime, weekEnd: DateTime): boolean {
  const md = birthdayMonthDay(raw);
  if (!md) return false;
  // Check the birthday in the year(s) the current week spans (handles Dec/Jan edges).
  const years = weekStart.year === weekEnd.year ? [weekStart.year] : [weekStart.year, weekEnd.year];
  for (const year of years) {
    const candidate = DateTime.fromObject({ year, month: md.month, day: md.day }, { zone: TZ });
    if (candidate.isValid && candidate >= weekStart.startOf('day') && candidate <= weekEnd.endOf('day')) {
      return true;
    }
  }
  return false;
}

/**
 * Pure evaluation: given a leader's config, the editable templates, and the
 * pre-loaded roster/attendance/sent data, return the nudges due right now.
 * No I/O — the caller batches all reads and the cron route does delivery.
 */
export function evaluateLeader(
  leader: CoachingLeader,
  config: CoachingConfig,
  templates: Record<AutomationKind, TemplateText>,
  ctx: EvaluateContext
): DueNudge[] {
  if (!config.enabled || !leader.ccb_group_id) return [];

  const now = DateTime.now().setZone(TZ);
  // Sunday-start weeks, to match the event-summary domain (submit /
  // leader-week-summary / circle-reporting all key weeks by the Sunday).
  const weekKey = sundayWeekKey(now);
  const weekStart = sundayWeekStart(now);
  const weekEnd = sundayWeekEnd(now);

  const roster = ctx.roster;
  const lastAttended = ctx.lastAttended;
  const alreadySent = (kind: AutomationKind, key: string) => ctx.sentKeys.has(`${kind}:${key}`);

  const nudges: DueNudge[] = [];
  const daysAgo = (iso: string | null): number | null => {
    if (!iso) return null;
    const dt = DateTime.fromISO(iso, { zone: 'utc' });
    if (!dt.isValid) return null;
    return now.diff(dt, 'days').days;
  };
  const attendedDaysAgo = (id: string): number | null => {
    const d = lastAttended[id];
    if (!d) return null;
    const dt = DateTime.fromISO(d, { zone: TZ });
    return dt.isValid ? now.diff(dt, 'days').days : null;
  };

  // --- 1. Multiplication (per-week) ------------------------------------------
  if (config.multiplication.enabled && roster.length >= config.multiplication.rosterThreshold) {
    if (!alreadySent('multiplication', weekKey)) {
      nudges.push({
        kind: 'multiplication',
        subjectKeys: [weekKey],
        content: renderNudge('multiplication', { leaderName: leader.name, rosterCount: roster.length }, templates.multiplication),
      });
    }
  }

  // --- 2. New member 24h follow-up (per-member) ------------------------------
  if (config.newMember.enabled) {
    const minAge = config.newMember.followUpHours / 24; // days
    const due = roster.filter((m) => {
      if (alreadySent('new_member', m.ccb_individual_id)) return false;
      const age = daysAgo(m.added_at);
      return age != null && age >= minAge && age <= NEW_MEMBER_LOOKBACK_DAYS;
    });
    if (due.length > 0) {
      nudges.push({
        kind: 'new_member',
        subjectKeys: due.map((m) => m.ccb_individual_id),
        content: renderNudge('new_member', { leaderName: leader.name, memberNames: due.map(displayName) }, templates.new_member),
      });
    }
  }

  // --- 3. Inactivity (per-week, grouped) -------------------------------------
  if (config.inactivity.enabled && !alreadySent('inactivity', weekKey)) {
    const thresholdDays = config.inactivity.weeks * 7;
    const inactive = roster.filter((m) => {
      const attended = attendedDaysAgo(m.ccb_individual_id);
      if (attended != null) return attended >= thresholdDays;
      // Never attended: only if they've been on the roster longer than the window
      // (and aren't an epoch-backfilled row).
      const joined = daysAgo(m.added_at);
      return joined != null && joined >= thresholdDays && joined <= 365 * 5;
    });
    if (inactive.length > 0) {
      nudges.push({
        kind: 'inactivity',
        subjectKeys: [weekKey],
        content: renderNudge(
          'inactivity',
          { leaderName: leader.name, memberNames: inactive.map(displayName), weeks: config.inactivity.weeks },
          templates.inactivity
        ),
      });
    }
  }

  // --- 4. Birthday this week (per-week, grouped) -----------------------------
  if (config.birthday.enabled && !alreadySent('birthday', weekKey)) {
    const birthdayPeople = roster.filter((m) => birthdayThisWeek(m.birthday, weekStart, weekEnd));
    if (birthdayPeople.length > 0) {
      nudges.push({
        kind: 'birthday',
        subjectKeys: [weekKey],
        content: renderNudge('birthday', { leaderName: leader.name, memberNames: birthdayPeople.map(displayName) }, templates.birthday),
      });
    }
  }

  // --- 5. Did-not-meet streak (per-week) -------------------------------------
  if (config.didNotMeet.enabled && !alreadySent('did_not_meet', weekKey)) {
    const attendanceAges = Object.values(lastAttended)
      .map((d) => {
        const dt = DateTime.fromISO(d, { zone: TZ });
        return dt.isValid ? now.diff(dt, 'days').days : null;
      })
      .filter((n): n is number => n != null);
    // Only nudge circles with attendance history; never nag a brand-new circle.
    if (attendanceAges.length > 0) {
      const mostRecentMeetingDaysAgo = Math.min(...attendanceAges);
      if (mostRecentMeetingDaysAgo >= config.didNotMeet.weeks * 7) {
        nudges.push({
          kind: 'did_not_meet',
          subjectKeys: [weekKey],
          content: renderNudge('did_not_meet', { leaderName: leader.name, weeks: config.didNotMeet.weeks }, templates.did_not_meet),
        });
      }
    }
  }

  // --- 6. First-time attendee welcome (per-member) ---------------------------
  if (config.firstTimeAttendee.enabled) {
    const due = roster.filter((m) => {
      if (alreadySent('first_time', m.ccb_individual_id)) return false;
      const joined = daysAgo(m.added_at);
      const attended = attendedDaysAgo(m.ccb_individual_id);
      return (
        joined != null &&
        joined <= FIRST_TIME_JOINED_WITHIN_DAYS &&
        attended != null &&
        attended <= FIRST_TIME_ATTENDED_WITHIN_DAYS
      );
    });
    if (due.length > 0) {
      nudges.push({
        kind: 'first_time',
        subjectKeys: due.map((m) => m.ccb_individual_id),
        content: renderNudge('first_time', { leaderName: leader.name, memberNames: due.map(displayName) }, templates.first_time),
      });
    }
  }

  return nudges;
}
