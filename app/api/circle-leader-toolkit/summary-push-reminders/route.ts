import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
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
  const calStart = now.minus({ hours: LOOKBACK_HOURS }).toFormat('yyyy-LL-dd');
  const calEnd = now.toFormat('yyyy-LL-dd');
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

  for (const leader of leaders || []) {
    if (!enabledLeaderIds.has(String(leader.id))) continue;
    try {
      const ccb = createCCBClient();
      const events = await ccb.getGroupCalendarEvents(String(leader.ccb_group_id), calStart, calEnd);
      for (const event of events || []) {
        const start = parseCcbDateTime(event.startDateTime);
        if (!start) continue;
        const dueAt = start.plus({ minutes: 30 });
        if (dueAt > now || start < now.minus({ hours: LOOKBACK_HOURS })) continue;

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
            occurrence: DateTime.fromFormat(event.startDateTime, 'yyyy-LL-dd HH:mm:ss', { zone: TZ }).toUTC().toISO(),
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
