/**
 * POST /api/circle-leader-toolkit/notifications/test
 * Sends a test push notification to the current leader's enabled subscriptions.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { sendWebPush } from '../../../../../lib/circle-leader-toolkit/push';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function POST() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const { data: subscriptions, error } = await supabase
    .from('circle_leader_push_subscriptions')
    .select('id, leader_id, endpoint, p256dh, auth, failure_count')
    .eq('leader_id', leader.id)
    .eq('enabled', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json(
      { error: 'No enabled push subscriptions found. Enable push on this device first.' },
      { status: 400 }
    );
  }

  const payload = {
    title: 'Test Notification',
    body: 'This is a test push notification from Circle Leader Toolkit.',
    url: '/circle-leader-toolkit',
    tag: 'test-notification',
  };

  let sent = 0;
  const errors: string[] = [];
  for (const sub of subscriptions) {
    try {
      await sendWebPush(sub, payload);
      sent++;
    } catch (e: any) {
      errors.push(e?.message || 'Push send failed');
    }
  }

  if (sent === 0) {
    return NextResponse.json(
      { error: errors.join('; ') || 'Failed to send push notification' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, sent, message: 'Test push sent' });
}
