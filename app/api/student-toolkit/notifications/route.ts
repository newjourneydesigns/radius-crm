/**
 * Push notification settings for the signed-in student leader.
 *
 *   GET    → { publicKey, prefs, preferences, subscriptions, pushSupported }
 *   POST   → update notification preferences
 *   PUT    → register (or re-enable) this device's push subscription
 *   DELETE → disable one endpoint
 *
 * Every query is keyed on the session leader's id; nothing here reads an id
 * from the URL or the body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import { getPublicVapidKey } from '../../../../lib/student-toolkit/push';

export const dynamic = 'force-dynamic';

const PREFERENCE_COLUMNS =
  'student_leader_id, inbox_push_enabled, roster_absence_push_enabled, badge_count_enabled, push_nudge_requested_at';

const SUBSCRIPTION_COLUMNS =
  'id, endpoint, enabled, device_label, user_agent, created_at, last_successful_delivery_at, last_failed_delivery_at';

function getDeviceLabel(userAgent: string | null) {
  if (!userAgent) return null;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'Apple device';
  if (/Android/i.test(userAgent)) return 'Android device';
  if (/Windows/i.test(userAgent)) return 'Windows browser';
  if (/Macintosh/i.test(userAgent)) return 'Mac browser';
  return 'Browser';
}

/** Read the preference row, creating it with table defaults on first visit. */
async function ensurePrefs(studentLeaderId: number | string) {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('student_notification_preferences')
    .select(PREFERENCE_COLUMNS)
    .eq('student_leader_id', studentLeaderId)
    .maybeSingle();
  if (data) return data;

  const { data: inserted, error } = await supabase
    .from('student_notification_preferences')
    .upsert({ student_leader_id: studentLeaderId }, {
      onConflict: 'student_leader_id',
      ignoreDuplicates: true,
    })
    .select(PREFERENCE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (inserted) return inserted;

  // ignoreDuplicates returns nothing when a concurrent request won the insert.
  const { data: existing, error: reloadError } = await supabase
    .from('student_notification_preferences')
    .select(PREFERENCE_COLUMNS)
    .eq('student_leader_id', studentLeaderId)
    .single();
  if (reloadError) throw reloadError;
  return existing;
}

export async function GET() {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const [prefs, subs] = await Promise.all([
    ensurePrefs(leader.id),
    supabase
      .from('student_push_subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('student_leader_id', leader.id)
      .order('created_at', { ascending: false }),
  ]);

  const publicKey = getPublicVapidKey();
  return NextResponse.json({
    publicKey,
    prefs,
    // Same object under the Circle Leader Toolkit's key, so a component forked
    // from CircleTabs/settings reads it without a rename.
    preferences: prefs,
    subscriptions: subs.data || [],
    pushSupported: Boolean(publicKey),
  });
}

export async function POST(req: NextRequest) {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  for (const [incoming, column] of [
    ['inboxPushEnabled', 'inbox_push_enabled'],
    ['rosterAbsencePushEnabled', 'roster_absence_push_enabled'],
    ['badgeCountEnabled', 'badge_count_enabled'],
  ] as const) {
    if (typeof body[incoming] === 'boolean') patch[column] = body[incoming];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No settings supplied.' }, { status: 400 });
  }

  const { data, error } = await createServiceSupabaseClient()
    .from('student_notification_preferences')
    .upsert(
      { student_leader_id: leader.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'student_leader_id' }
    )
    .select(PREFERENCE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data, preferences: data });
}

export async function PUT(req: NextRequest) {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subscription = body.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'A valid push subscription is required.' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent');
  const supabase = createServiceSupabaseClient();

  // `endpoint` is unique across all leaders: a shared device that switches
  // accounts re-points the row rather than orphaning it on the old leader.
  const { data, error } = await supabase
    .from('student_push_subscriptions')
    .upsert(
      {
        student_leader_id: leader.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
        device_label: getDeviceLabel(userAgent),
        enabled: true,
        disabled_at: null,
        failure_count: 0,
      },
      { onConflict: 'endpoint' }
    )
    .select('id, endpoint, enabled, device_label, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Turning on a device is a request to be notified — make sure the preference
  // that gates inbox pushes is on, or the new subscription would sit silent.
  await supabase
    .from('student_notification_preferences')
    .upsert(
      {
        student_leader_id: leader.id,
        inbox_push_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_leader_id' }
    );

  return NextResponse.json({ subscription: data });
}

export async function DELETE(req: NextRequest) {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required.' }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await createServiceSupabaseClient()
    .from('student_push_subscriptions')
    .update({ enabled: false, disabled_at: now })
    .eq('student_leader_id', leader.id)
    .eq('endpoint', endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
