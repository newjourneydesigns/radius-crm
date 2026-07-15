/**
 * POST /api/circle-leader-toolkit/reminders
 *
 * Called by the Netlify scheduled function every 15 minutes. Loads leaders
 * with email reminders enabled, looks at their CCB group calendar, and sends a
 * single reminder ~1 hour after each Circle starts, nudging the leader to
 * submit their summary. One email per leader/event/occurrence — never repeats.
 *
 * Authorization: Bearer ${CRON_SECRET} header.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { loadCachedCalendarByGroup } from '../../../../lib/circle-leader-toolkit/reminder-calendar';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../lib/leader-tokens';
import { sendReminderEmail } from '../../../../lib/circle-leader-toolkit/email';
import { getCircleSummaryBaseUrl } from '../../../../lib/circle-leader-toolkit/links';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TZ = 'America/Chicago';
// Fire a single reminder ~1 hour after the Circle starts. The window is
// wider than the 15-minute cron cadence so a tick always lands inside it; the
// circle_reminder_sends check below guarantees exactly one email per occurrence.
const POST_MEETING_MIN_MINUTES = 60;
const POST_MEETING_MAX_MINUTES = 80;
const REMINDER_KIND = 'summary_reminder';
const LEGACY_REMINDER_KINDS = ['follow_up', 'pre_meeting'];

function buildMagicLinkUrl(leaderId: number | string, next: string): string {
  const appUrl = getCircleSummaryBaseUrl();
  const token = createSessionToken(leaderId, RADIUS_LINK_TTL_MS);
  const url = new URL('/api/circle-leader-toolkit/auth/link', appUrl);
  url.searchParams.set('t', token);
  url.searchParams.set('next', next);
  return url.toString();
}

function formatMeetingLabel(dt: DateTime): string {
  return dt.setZone(TZ).toFormat('EEEE, LLL d') + ' at ' + dt.setZone(TZ).toFormat('h:mm a');
}

export async function POST(req: Request) {
  // Cron auth
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const now = DateTime.now().setZone(TZ);
  const sent: Array<{ leaderId: number; kind: string; eventId: string; date: string }> = [];
  const skipped: Array<{ leaderId: number; reason: string }> = [];
  const errors: Array<{ leaderId: number; error: string }> = [];

  const { data: leaders } = await supabase
    .from('circle_leaders')
    .select('id, name, email, ccb_group_id')
    .eq('email_reminders_enabled', true)
    .eq('circle_summary_access_enabled', true)
    .not('email', 'is', null)
    .not('ccb_group_id', 'is', null);

  if (!leaders || leaders.length === 0) {
    return NextResponse.json({ ok: true, eligibleLeaders: 0, sent, skipped, errors });
  }

  // We only care about Circles that started within the last ~80 minutes. Read each
  // leader's calendar from the shared ccb_group_events_cache (warmed daily by
  // the prewarm job) instead of calling CCB live per leader — this cron fires
  // every 15 minutes, and per-leader CCB calls here were a top quota burner.
  const calendarByGroup = await loadCachedCalendarByGroup(
    supabase,
    leaders.map((l) => l.ccb_group_id).filter((id): id is number | string => id != null)
  );

  for (const leader of leaders) {
    try {
      const calendarEvents = calendarByGroup.get(String(leader.ccb_group_id)) ?? [];

      for (const e of calendarEvents) {
        const startDt = DateTime.fromFormat(e.startDateTime, 'yyyy-LL-dd HH:mm:ss', {
          zone: TZ,
        });
        if (!startDt.isValid) continue;

        // Only the ~1-hour-after-start window.
        const minutesSince = now.diff(startDt, 'minutes').minutes;
        if (minutesSince < POST_MEETING_MIN_MINUTES || minutesSince > POST_MEETING_MAX_MINUTES) {
          continue;
        }

        // Already submitted? Nothing to nudge.
        const { data: submitted } = await supabase
          .from('circle_event_summaries')
          .select('id')
          .eq('leader_id', leader.id)
          .eq('ccb_event_id', e.eventId)
          .eq('occurrence', e.startDateTime)
          .eq('status', 'submitted')
          .maybeSingle();
        if (submitted) continue;

        // Already reminded for this occurrence? One email only — never repeat.
        // Include legacy kinds so previously sent rows still dedupe after the
        // reminder was renamed to summary_reminder.
        const { data: alreadySent } = await supabase
          .from('circle_reminder_sends')
          .select('id')
          .eq('leader_id', leader.id)
          .in('kind', [REMINDER_KIND, ...LEGACY_REMINDER_KINDS])
          .eq('ccb_event_id', e.eventId)
          .eq('occurrence_date', e.startDate)
          .maybeSingle();
        if (alreadySent) continue;

        const magicUrl = buildMagicLinkUrl(leader.id, '/circle-leader-toolkit/events');
        const result = await sendReminderEmail({
          to: leader.email!,
          leaderName: leader.name,
          kind: REMINDER_KIND,
          meetingDateLabel: formatMeetingLabel(startDt),
          magicLinkUrl: magicUrl,
        });
        if (!result.success) {
          errors.push({ leaderId: leader.id, error: result.error || 'send failed' });
          continue;
        }
        await supabase.from('circle_reminder_sends').insert({
          leader_id: leader.id,
          kind: REMINDER_KIND,
          ccb_event_id: e.eventId,
          occurrence_date: e.startDate,
        });
        sent.push({ leaderId: leader.id, kind: REMINDER_KIND, eventId: e.eventId, date: e.startDate });
      }
    } catch (e: unknown) {
      errors.push({ leaderId: leader.id, error: e instanceof Error ? e.message : 'CCB fetch failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    eligibleLeaders: leaders.length,
    sentCount: sent.length,
    sent,
    skipped,
    errors,
  });
}
