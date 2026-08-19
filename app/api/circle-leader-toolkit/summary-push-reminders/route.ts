import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { loadCachedCalendarByGroup } from '../../../../lib/circle-leader-toolkit/reminder-calendar';
import { buildCircleSummaryUrl, deliverLeaderPush, parseCcbDateTime } from '../../../../lib/circle-leader-toolkit/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TZ = 'America/Chicago';
const LOOKBACK_HOURS = 48;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const now = DateTime.now().setZone(TZ);
  const sent: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  const { data: leaders, error: leaderError } = await supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id')
    .eq('circle_summary_access_enabled', true)
    .not('ccb_group_id', 'is', null);
  if (leaderError) return NextResponse.json({ error: leaderError.message }, { status: 500 });

  const leaderIds = (leaders || []).map((leader: any) => leader.id);
  const { data: prefs } = leaderIds.length
    ? await supabase
        .from('circle_leader_notification_preferences')
        .select('leader_id, summary_reminder_push_enabled')
        .in('leader_id', leaderIds)
        .eq('summary_reminder_push_enabled', true)
    : { data: [] as any[] };
  const enabledLeaderIds = new Set((prefs || []).map((pref: any) => String(pref.leader_id)));

  // Read calendars from the shared ccb_group_events_cache (warmed daily by the
  // prewarm job) instead of calling CCB live per leader. This cron fires every
  // 5 minutes; per-leader live CCB calls here were the single biggest consumer
  // of CCB's daily quota.
  const enabledLeaders = (leaders || []).filter((leader: any) => enabledLeaderIds.has(String(leader.id)));
  const calendarByGroup = await loadCachedCalendarByGroup(
    supabase,
    enabledLeaders.map((leader: any) => leader.ccb_group_id).filter((id: any) => id != null)
  );

  // Skip events whose reminder a previous run already recorded. Without this
  // pre-check, every event in the lookback window re-inserts on each 5-minute
  // run just to bounce off the summary_uniq constraint (~1.6k duplicate-key
  // errors/day in Postgres). The 23505 handler in deliverLeaderPush stays as
  // the backstop for races between overlapping runs.
  const deliveredKeys = new Set<string>();
  if (enabledLeaders.length > 0) {
    const { data: priorDeliveries, error: priorError } = await supabase
      .from('circle_leader_notification_deliveries')
      .select('leader_id, ccb_event_id, occurrence')
      .eq('notification_type', 'summary_reminder')
      .in('leader_id', enabledLeaders.map((leader: any) => leader.id))
      .gte('occurrence', now.minus({ hours: LOOKBACK_HOURS + 1 }).toUTC().toISO()!);
    if (priorError) {
      console.warn('[summary-push-reminders] prior delivery lookup failed:', priorError.message);
    }
    for (const row of priorDeliveries || []) {
      deliveredKeys.add(`${row.leader_id}|${row.ccb_event_id}|${new Date(row.occurrence).getTime()}`);
    }
  }

  for (const leader of enabledLeaders) {
    try {
      const events = calendarByGroup.get(String(leader.ccb_group_id)) ?? [];
      for (const event of events || []) {
        const start = parseCcbDateTime(event.startDateTime);
        if (!start) continue;
        const dueAt = start.plus({ hours: 1 });
        if (dueAt > now || start < now.minus({ hours: LOOKBACK_HOURS })) continue;

        const occurrenceIso = start.toUTC().toISO();
        if (occurrenceIso && deliveredKeys.has(`${leader.id}|${event.eventId}|${new Date(occurrenceIso).getTime()}`)) {
          skipped.push({ leaderId: leader.id, eventId: event.eventId, reason: 'already_delivered' });
          continue;
        }

        const { data: submitted } = await supabase
          .from('circle_event_summaries')
          .select('id')
          .eq('leader_id', leader.id)
          .eq('ccb_event_id', event.eventId)
          .eq('occurrence', event.startDateTime)
          .eq('status', 'submitted')
          .maybeSingle();
        if (submitted) {
          skipped.push({ leaderId: leader.id, eventId: event.eventId, reason: 'submitted' });
          continue;
        }

        const route = `/circle-leader-toolkit/${encodeURIComponent(String(leader.ccb_group_id))}/events/${encodeURIComponent(String(event.eventId))}/${encodeURIComponent(String(event.startDateTime))}`;
        const result = await deliverLeaderPush(
          {
            notification_type: 'summary_reminder',
            leader_id: leader.id,
            ccb_event_id: String(event.eventId),
            occurrence: occurrenceIso,
          },
          {
            title: 'Circle summary needed',
            body: 'Your Circle ended recently. Please submit your event summary.',
            url: buildCircleSummaryUrl(route),
            tag: `circle-summary-${leader.id}-${event.eventId}-${event.startDate}`,
          }
        );
        if ((result as any).skipped) skipped.push({ leaderId: leader.id, eventId: event.eventId, reason: (result as any).reason });
        else sent.push({ leaderId: leader.id, eventId: event.eventId, occurrence: event.startDateTime });
      }
    } catch (error: any) {
      errors.push({ leaderId: leader.id, error: error?.message || 'Reminder push failed' });
    }
  }

  return NextResponse.json({ ok: true, eligibleLeaders: enabledLeaderIds.size, sentCount: sent.length, sent, skipped, errors });
}
