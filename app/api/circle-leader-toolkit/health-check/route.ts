import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { loadCachedCalendarByGroup } from '../../../../lib/circle-leader-toolkit/reminder-calendar';
import { buildCircleSummaryUrl, deliverLeaderPush, parseCcbDateTime } from '../../../../lib/circle-leader-toolkit/push';
import { parseAttendanceMap, type AttendanceStatus } from '../../../../lib/circle-leader-toolkit/events-data';
import { doesMeetingFrequencyIncludeDate } from '../../../../lib/meetingFrequency';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TZ = 'America/Chicago';
// Same window the toolkit's events page (and its alert count) uses, so the
// number pushed overnight matches the number the app shows when opened.
const LOOKBACK_WEEKS = 12;

/**
 * Nightly toolkit health check. Runs once overnight (right after the CCB
 * prewarm refreshes `ccb_group_events_cache`) and, for every leader with an
 * enabled push subscription, counts outstanding items:
 *
 *   1. Past events with no submitted summary and no attendance in CCB
 *   2. Unread Leader Hub inbox messages
 *
 * Leaders with anything outstanding get one digest push whose `badgeCount`
 * sets the app-icon badge on installed PWAs — so the badge is right in the
 * morning even if the app hasn't been opened. Everything is served from
 * Supabase caches/tables; this route makes zero CCB calls.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const now = DateTime.now().setZone(TZ);
  const windowStart = now.minus({ weeks: LOOKBACK_WEEKS });
  // Local midnight identifies "today's digest" for the once-per-day dedupe.
  const digestOccurrence = now.startOf('day').toUTC().toISO()!;

  const sent: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  const { data: leaders, error: leaderError } = await supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, frequency, meeting_start_date')
    .eq('circle_summary_access_enabled', true);
  if (leaderError) return NextResponse.json({ error: leaderError.message }, { status: 500 });

  const leaderIds = (leaders || []).map((leader: any) => leader.id);
  if (leaderIds.length === 0) {
    return NextResponse.json({ ok: true, checkedLeaders: 0, sentCount: 0, sent, skipped, errors });
  }

  // Only leaders with a live push subscription can receive anything, so skip
  // the (cheap but pointless) counting for everyone else.
  const { data: subs, error: subsError } = await supabase
    .from('circle_leader_push_subscriptions')
    .select('leader_id')
    .in('leader_id', leaderIds)
    .eq('enabled', true);
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 });
  const pushLeaderIds = new Set((subs || []).map((s: any) => String(s.leader_id)));

  // Digest is on by default; a stored preference row can opt out. Tolerate a
  // missing column (migration not applied yet) by falling back to defaults.
  const prefByLeader = new Map<string, any>();
  const { data: prefs, error: prefsError } = await supabase
    .from('circle_leader_notification_preferences')
    .select('leader_id, nightly_digest_push_enabled, badge_count_enabled')
    .in('leader_id', leaderIds);
  if (prefsError) {
    console.warn('[circle-toolkit/health-check] preferences lookup failed:', prefsError.message);
  } else {
    for (const pref of prefs || []) prefByLeader.set(String(pref.leader_id), pref);
  }

  const targets = (leaders || []).filter((leader: any) => {
    if (!pushLeaderIds.has(String(leader.id))) return false;
    const pref = prefByLeader.get(String(leader.id));
    return pref ? pref.nightly_digest_push_enabled !== false : true;
  });
  const targetIds = targets.map((leader: any) => leader.id);
  if (targetIds.length === 0) {
    return NextResponse.json({ ok: true, checkedLeaders: 0, sentCount: 0, sent, skipped, errors });
  }

  // --- Unread inbox messages, in bulk (same rule as getLeaderAlertCounts) ---
  const unreadByLeader = new Map<string, number>();
  const { data: recipients } = await supabase
    .from('circle_summary_inbox_recipients')
    .select('leader_id, message_id, read_at, read_version')
    .in('leader_id', targetIds);
  const messageIds = Array.from(new Set((recipients || []).map((r: any) => r.message_id).filter(Boolean)));
  const messageById = new Map<string, any>();
  if (messageIds.length > 0) {
    const { data: messages } = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, version')
      .in('id', messageIds)
      .eq('status', 'sent');
    for (const message of messages || []) messageById.set(message.id, message);
  }
  for (const recipient of recipients || []) {
    const message = messageById.get(recipient.message_id);
    if (!message) continue;
    if (recipient.read_at && Number(recipient.read_version || 0) >= Number(message.version || 1)) continue;
    const key = String(recipient.leader_id);
    unreadByLeader.set(key, (unreadByLeader.get(key) || 0) + 1);
  }

  // --- Pending event summaries, from the prewarmed CCB cache ---
  const groupIds = targets
    .map((leader: any) => leader.ccb_group_id)
    .filter((id: any) => id != null);
  const calendarByGroup = await loadCachedCalendarByGroup(supabase, groupIds);

  // Freshest cached attendance per group. The cron runs right after the daily
  // prewarm, so "has attendance in CCB" is at most ~an hour old here.
  const attendanceByGroup = new Map<string, Map<string, AttendanceStatus>>();
  if (groupIds.length > 0) {
    const { data: cacheRows } = await supabase
      .from('ccb_group_events_cache')
      .select('group_id, attendance_xml, synced_at')
      .in('group_id', Array.from(new Set(groupIds.map((id: any) => String(id)))))
      .order('synced_at', { ascending: false });
    for (const row of cacheRows || []) {
      const key = String(row.group_id);
      if (attendanceByGroup.has(key)) continue;
      attendanceByGroup.set(key, parseAttendanceMap(row.attendance_xml));
    }
  }

  const { data: submissionRows } = await supabase
    .from('circle_event_summaries')
    .select('leader_id, ccb_event_id, occurrence, status')
    .in('leader_id', targetIds)
    .eq('status', 'submitted')
    .gte('occurrence', windowStart.toISO()!);
  const submittedSet = new Set(
    (submissionRows || []).map(
      (s: any) => `${s.leader_id}|${s.ccb_event_id}|${DateTime.fromISO(s.occurrence).toFormat('yyyy-LL-dd')}`
    )
  );

  const ignoredSet = new Set<string>();
  const { data: ignoredRows, error: ignoredError } = await supabase
    .from('circle_summary_ignored_events')
    .select('leader_id, ccb_event_id, occurrence_date')
    .in('leader_id', targetIds)
    .gte('occurrence_date', windowStart.toFormat('yyyy-LL-dd'));
  if (ignoredError) {
    console.warn('[circle-toolkit/health-check] ignored events lookup failed:', ignoredError.message);
  } else {
    for (const row of ignoredRows || []) {
      ignoredSet.add(`${row.leader_id}|${row.ccb_event_id}|${String(row.occurrence_date).slice(0, 10)}`);
    }
  }

  // --- One digest push per leader with anything outstanding ---
  for (const leader of targets) {
    try {
      const unreadMessages = unreadByLeader.get(String(leader.id)) || 0;

      let pendingEventSummaries = 0;
      if (leader.ccb_group_id != null) {
        const groupKey = String(leader.ccb_group_id);
        const events = calendarByGroup.get(groupKey) ?? [];
        const attendance = attendanceByGroup.get(groupKey);
        for (const event of events) {
          const start = parseCcbDateTime(event.startDateTime);
          if (!start || start > now || start < windowStart) continue;
          if (
            !doesMeetingFrequencyIncludeDate({
              date: event.startDate,
              frequency: leader.frequency,
              meetingStartDate: leader.meeting_start_date,
            })
          ) {
            continue;
          }
          if (ignoredSet.has(`${leader.id}|${event.eventId}|${event.startDate}`)) continue;
          if (attendance?.get(`${event.eventId}|${event.startDate}`)?.has) continue;
          if (submittedSet.has(`${leader.id}|${event.eventId}|${event.startDate}`)) continue;
          pendingEventSummaries += 1;
        }
      }

      const totalAlertCount = unreadMessages + pendingEventSummaries;
      if (totalAlertCount === 0) {
        skipped.push({ leaderId: leader.id, reason: 'nothing_outstanding' });
        continue;
      }

      const parts: string[] = [];
      if (pendingEventSummaries > 0) {
        parts.push(`${pendingEventSummaries} event ${pendingEventSummaries === 1 ? 'summary' : 'summaries'} to submit`);
      }
      if (unreadMessages > 0) {
        parts.push(`${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}`);
      }

      const route =
        leader.ccb_group_id != null
          ? `/circle-leader-toolkit/${encodeURIComponent(String(leader.ccb_group_id))}`
          : '/circle-leader-toolkit';
      const badgeEnabled = prefByLeader.get(String(leader.id))?.badge_count_enabled !== false;

      const result = await deliverLeaderPush(
        {
          notification_type: 'nightly_digest',
          leader_id: leader.id,
          occurrence: digestOccurrence,
        },
        {
          title: 'Circle Leader Toolkit',
          body: `You have ${parts.join(' and ')} waiting.`,
          url: buildCircleSummaryUrl(route),
          tag: `circle-toolkit-digest-${leader.id}`,
          ...(badgeEnabled ? { badgeCount: totalAlertCount } : {}),
        }
      );

      if ((result as any).skipped) {
        skipped.push({ leaderId: leader.id, reason: (result as any).reason });
      } else {
        sent.push({ leaderId: leader.id, unreadMessages, pendingEventSummaries, totalAlertCount });
      }
    } catch (error: any) {
      errors.push({ leaderId: leader.id, error: error?.message || 'Digest push failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedLeaders: targets.length,
    sentCount: sent.length,
    sent,
    skipped,
    errors,
  });
}
