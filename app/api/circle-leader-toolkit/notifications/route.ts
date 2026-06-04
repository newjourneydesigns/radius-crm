import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { getPublicVapidKey } from '../../../../lib/circle-leader-toolkit/push';

export const dynamic = 'force-dynamic';

function getDeviceLabel(userAgent: string | null) {
  if (!userAgent) return null;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'Apple device';
  if (/Android/i.test(userAgent)) return 'Android device';
  if (/Windows/i.test(userAgent)) return 'Windows browser';
  if (/Macintosh/i.test(userAgent)) return 'Mac browser';
  return 'Browser';
}

async function ensurePrefs(leaderId: number | string) {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('circle_leader_notification_preferences')
    .select('leader_id, inbox_push_enabled, summary_reminder_push_enabled, badge_count_enabled, push_nudge_requested_at')
    .eq('leader_id', leaderId)
    .maybeSingle();
  if (data) return data;
  const { data: inserted, error } = await supabase
    .from('circle_leader_notification_preferences')
    .upsert({ leader_id: leaderId }, { onConflict: 'leader_id', ignoreDuplicates: true })
    .select('leader_id, inbox_push_enabled, summary_reminder_push_enabled, badge_count_enabled, push_nudge_requested_at')
    .maybeSingle();
  if (error) throw error;
  if (inserted) return inserted;
  const { data: existing, error: reloadError } = await supabase
    .from('circle_leader_notification_preferences')
    .select('leader_id, inbox_push_enabled, summary_reminder_push_enabled, badge_count_enabled, push_nudge_requested_at')
    .eq('leader_id', leaderId)
    .single();
  if (reloadError) throw reloadError;
  return existing;
}

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  const supabase = createServiceSupabaseClient();
  const [prefs, subs] = await Promise.all([
    ensurePrefs(leader.id),
    supabase
      .from('circle_leader_push_subscriptions')
      .select('id, endpoint, enabled, device_label, user_agent, created_at, updated_at, last_successful_delivery_at, last_failed_delivery_at')
      .eq('leader_id', leader.id)
      .order('updated_at', { ascending: false }),
  ]);

  return NextResponse.json({
    publicKey: getPublicVapidKey(),
    preferences: prefs,
    subscriptions: subs.data || [],
    pushSupported: Boolean(getPublicVapidKey()),
  });
}

export async function POST(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const patch: Record<string, boolean> = {};
  for (const [incoming, column] of [
    ['inboxPushEnabled', 'inbox_push_enabled'],
    ['summaryReminderPushEnabled', 'summary_reminder_push_enabled'],
    ['badgeCountEnabled', 'badge_count_enabled'],
  ] as const) {
    if (typeof body[incoming] === 'boolean') patch[column] = body[incoming];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No settings supplied.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leader_notification_preferences')
    .upsert({ leader_id: leader.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'leader_id' })
    .select('leader_id, inbox_push_enabled, summary_reminder_push_enabled, badge_count_enabled, push_nudge_requested_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data });
}

export async function PUT(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const subscription = body.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'A valid push subscription is required.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const userAgent = req.headers.get('user-agent');
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leader_push_subscriptions')
    .upsert({
      leader_id: leader.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent,
      device_label: getDeviceLabel(userAgent),
      enabled: true,
      disabled_at: null,
      failure_count: 0,
      updated_at: now,
    }, { onConflict: 'endpoint' })
    .select('id, endpoint, enabled, device_label, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase
    .from('circle_leader_notification_preferences')
    .upsert({ leader_id: leader.id, inbox_push_enabled: true, updated_at: now }, { onConflict: 'leader_id' });
  return NextResponse.json({ subscription: data });
}

export async function DELETE(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required.' }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await createServiceSupabaseClient()
    .from('circle_leader_push_subscriptions')
    .update({ enabled: false, disabled_at: now, updated_at: now })
    .eq('leader_id', leader.id)
    .eq('endpoint', endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
