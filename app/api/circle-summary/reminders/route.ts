/**
 * POST /api/circle-summary/reminders
 *
 * Called by the Netlify scheduled function every 15 minutes. Loads leaders
 * with email reminders enabled, looks at their CCB group calendar, and sends:
 *
 *   - `pre_meeting`: 1 hour before the event starts (idempotent per
 *     leader+event+occurrence — circle_reminder_sends has a unique index)
 *   - `follow_up`: morning after the event, repeated daily until they submit
 *     a summary or 7 days pass. Capped to one send per leader/event/day.
 *
 * Authorization: Bearer ${CRON_SECRET} header.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createSessionToken } from '../../../../lib/leader-tokens';
import { sendReminderEmail } from '../../../../lib/circle-summary/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TZ = 'America/Chicago';
const MAGIC_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PRE_MEETING_WINDOW_MIN = 45;
const PRE_MEETING_WINDOW_MAX = 75;
const FOLLOW_UP_HOUR_START = 8;  // 8am local
const FOLLOW_UP_HOUR_END = 10;   // up to 10am local
const FOLLOW_UP_LOOKBACK_DAYS = 7;

function buildMagicLinkUrl(leaderId: number | string, next: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'http://localhost:3000';
  const token = createSessionToken(leaderId, MAGIC_LINK_TTL_MS);
  const url = new URL('/api/circle-summary/auth/link', appUrl);
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
    .not('email', 'is', null)
    .not('ccb_group_id', 'is', null);

  if (!leaders || leaders.length === 0) {
    return NextResponse.json({ ok: true, eligibleLeaders: 0, sent, skipped, errors });
  }

  // Two date windows we need from CCB: anything from a week ago to two hours from now
  const calStart = now.minus({ days: FOLLOW_UP_LOOKBACK_DAYS + 1 }).toFormat('yyyy-LL-dd');
  const calEnd = now.plus({ hours: 3 }).toFormat('yyyy-LL-dd');

  for (const leader of leaders) {
    try {
      const ccb = createCCBClient();
      const calendarEvents = await ccb.getGroupCalendarEvents(
        String(leader.ccb_group_id),
        calStart,
        calEnd
      );

      // ---- Pre-meeting reminder candidates ----
      for (const e of calendarEvents) {
        const startDt = DateTime.fromFormat(e.startDateTime, 'yyyy-LL-dd HH:mm:ss', {
          zone: TZ,
        });
        if (!startDt.isValid) continue;
        const minutesUntil = startDt.diff(now, 'minutes').minutes;
        if (minutesUntil < PRE_MEETING_WINDOW_MIN || minutesUntil > PRE_MEETING_WINDOW_MAX) continue;

        const { data: already } = await supabase
          .from('circle_reminder_sends')
          .select('id')
          .eq('leader_id', leader.id)
          .eq('kind', 'pre_meeting')
          .eq('ccb_event_id', e.eventId)
          .eq('occurrence_date', e.startDate)
          .maybeSingle();
        if (already) continue;

        const magicUrl = buildMagicLinkUrl(
          leader.id,
          `/circle-summary/events/${encodeURIComponent(e.eventId)}/${encodeURIComponent(e.startDateTime)}`
        );
        const result = await sendReminderEmail({
          to: leader.email!,
          leaderName: leader.name,
          kind: 'pre_meeting',
          meetingDateLabel: formatMeetingLabel(startDt),
          magicLinkUrl: magicUrl,
        });
        if (!result.success) {
          errors.push({ leaderId: leader.id, error: result.error || 'send failed' });
          continue;
        }
        await supabase.from('circle_reminder_sends').insert({
          leader_id: leader.id,
          kind: 'pre_meeting',
          ccb_event_id: e.eventId,
          occurrence_date: e.startDate,
        });
        sent.push({ leaderId: leader.id, kind: 'pre_meeting', eventId: e.eventId, date: e.startDate });
      }

      // ---- Follow-up reminder candidates (only during morning window) ----
      if (now.hour < FOLLOW_UP_HOUR_START || now.hour >= FOLLOW_UP_HOUR_END) continue;

      const cutoff = now.minus({ days: FOLLOW_UP_LOOKBACK_DAYS });
      for (const e of calendarEvents) {
        const startDt = DateTime.fromFormat(e.startDateTime, 'yyyy-LL-dd HH:mm:ss', {
          zone: TZ,
        });
        if (!startDt.isValid) continue;
        if (startDt > now) continue;            // future event — handled by pre_meeting
        if (startDt < cutoff) continue;          // too old to nag about

        // Has this leader already submitted for this occurrence?
        const { data: submitted } = await supabase
          .from('circle_event_summaries')
          .select('id')
          .eq('leader_id', leader.id)
          .eq('ccb_event_id', e.eventId)
          .eq('occurrence', e.startDateTime)
          .eq('status', 'submitted')
          .maybeSingle();
        if (submitted) continue;

        // Did we already send a follow-up for this (leader, event, occurrence) today?
        const todayDate = now.toFormat('yyyy-LL-dd');
        const { data: sentToday } = await supabase
          .from('circle_reminder_sends')
          .select('id')
          .eq('leader_id', leader.id)
          .eq('kind', 'follow_up')
          .eq('ccb_event_id', e.eventId)
          .eq('occurrence_date', e.startDate)
          .gte('sent_at', `${todayDate}T00:00:00Z`)
          .maybeSingle();
        if (sentToday) continue;

        const magicUrl = buildMagicLinkUrl(
          leader.id,
          `/circle-summary/events/${encodeURIComponent(e.eventId)}/${encodeURIComponent(e.startDateTime)}`
        );
        const result = await sendReminderEmail({
          to: leader.email!,
          leaderName: leader.name,
          kind: 'follow_up',
          meetingDateLabel: formatMeetingLabel(startDt),
          magicLinkUrl: magicUrl,
        });
        if (!result.success) {
          errors.push({ leaderId: leader.id, error: result.error || 'send failed' });
          continue;
        }
        await supabase.from('circle_reminder_sends').insert({
          leader_id: leader.id,
          kind: 'follow_up',
          ccb_event_id: e.eventId,
          occurrence_date: e.startDate,
        });
        sent.push({ leaderId: leader.id, kind: 'follow_up', eventId: e.eventId, date: e.startDate });
        // Only one follow-up per leader per run
        break;
      }
    } catch (e: any) {
      errors.push({ leaderId: leader.id, error: e?.message || 'CCB fetch failed' });
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
