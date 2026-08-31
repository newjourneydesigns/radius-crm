/**
 * POST /api/student-toolkit/notifications/test
 * Sends a test push to the signed-in student leader's enabled devices, so a
 * leader can confirm notifications work before staff rely on them.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../../lib/student-toolkit/session';
import { sendWebPush, studentInboxUrl } from '../../../../../lib/student-toolkit/push';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function POST() {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const { data: subscriptions, error } = await supabase
    .from('student_push_subscriptions')
    .select('id, student_leader_id, endpoint, p256dh, auth, failure_count')
    .eq('student_leader_id', leader.id)
    .eq('enabled', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json(
      { error: 'No devices are set up yet. Turn on push for this device first.' },
      { status: 400 }
    );
  }

  const payload = {
    title: 'Student Toolkit',
    body: 'Notifications are working on this device.',
    // Opening the test lands where a real message would.
    url: studentInboxUrl(leader.id),
    tag: 'student-test-notification',
  };

  let sent = 0;
  const errors: string[] = [];
  for (const subscription of subscriptions) {
    try {
      await sendWebPush(
        {
          id: String(subscription.id),
          leader_id: subscription.student_leader_id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          failure_count: subscription.failure_count ?? 0,
        },
        payload
      );
      sent += 1;
    } catch (e: any) {
      errors.push(e?.message || 'Push send failed');
    }
  }

  if (sent === 0) {
    return NextResponse.json(
      { error: errors.join('; ') || 'Could not send a test notification.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, sent });
}
