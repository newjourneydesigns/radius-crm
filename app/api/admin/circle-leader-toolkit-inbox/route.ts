/**
 * Admin-style API for Circle Summary inbox messages.
 *
 * Any signed-in RADIUS user can send/edit messages. Delivery creates
 * per-leader recipient rows so leaders keep a durable read/unread history.
 *
 * Messages can also be scheduled: a future scheduled_at stores the message with
 * status='scheduled' and no recipients until the delivery worker
 * (/api/circle-leader-toolkit/deliver-scheduled-inbox) sends it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import {
  TargetType,
  deliverToLeaders,
  insertRevision,
  loadTargetLeaders,
  parseLeaderTargetIds,
} from '../../../../lib/circle-leader-toolkit/inbox-delivery';

export const dynamic = 'force-dynamic';

const TARGET_TYPES = new Set(['all', 'campus', 'acpd', 'leader']);

/** True when an error is a "column does not exist" for status/scheduled_at,
 *  i.e. a Supabase instance that hasn't run the inbox unsend/scheduling migrations. */
function isMissingMigrationColumn(error: unknown): boolean {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '').toLowerCase()
      : '';
  return (
    text.includes('does not exist') &&
    (text.includes('status') || text.includes('scheduled_at'))
  );
}

async function requireRadiusUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }

  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }),
    };
  }

  return { user: { ...user, profile }, response: null };
}

function normalizeTargetType(value: unknown): TargetType | null {
  const type = typeof value === 'string' ? value : '';
  return TARGET_TYPES.has(type) ? (type as TargetType) : null;
}

/**
 * Parses an inbound scheduled_at. The composer sends a UTC ISO string (it anchors
 * the chosen wall-clock time to America/Chicago, then converts to UTC). Returns
 * iso=null for "send now" (blank/missing) and flags whether it is a valid future time.
 */
function parseScheduledAt(value: unknown): { iso: string | null; valid: boolean; future: boolean } {
  if (value == null || value === '') return { iso: null, valid: true, future: false };
  const dt = DateTime.fromISO(String(value));
  if (!dt.isValid) return { iso: null, valid: false, future: false };
  const iso = dt.toUTC().toISO();
  return { iso, valid: true, future: dt.toUTC() > DateTime.utc() };
}

type PushStatus = 'enabled' | 'pref_off' | 'no_device';

/**
 * Determines, per leader, whether a sent inbox message would actually fire a
 * push notification. A push only fires when the leader has inbox_push_enabled
 * AND at least one enabled device subscription (see lib/circle-leader-toolkit/push).
 */
async function loadPushStatusByLeader(leaderIds: Array<number | string>) {
  const statusByLeader = new Map<string, PushStatus>();
  if (leaderIds.length === 0) return statusByLeader;

  const supabase = createServiceSupabaseClient();
  const [prefsResult, subsResult] = await Promise.all([
    supabase
      .from('circle_leader_notification_preferences')
      .select('leader_id, inbox_push_enabled')
      .in('leader_id', leaderIds),
    supabase
      .from('circle_leader_push_subscriptions')
      .select('leader_id')
      .eq('enabled', true)
      .in('leader_id', leaderIds),
  ]);

  const inboxEnabled = new Map<string, boolean>();
  for (const row of prefsResult.data || []) {
    inboxEnabled.set(String(row.leader_id), row.inbox_push_enabled === true);
  }
  const hasDevice = new Set<string>(
    (subsResult.data || []).map((row: any) => String(row.leader_id))
  );

  for (const leaderId of leaderIds) {
    const key = String(leaderId);
    if (!hasDevice.has(key)) {
      statusByLeader.set(key, 'no_device');
    } else if (inboxEnabled.get(key) !== true) {
      statusByLeader.set(key, 'pref_off');
    } else {
      statusByLeader.set(key, 'enabled');
    }
  }
  return statusByLeader;
}

function pickMessageFields(body: any) {
  const targetType = normalizeTargetType(body.target_type);
  const targetValue =
    Array.isArray(body.target_value)
      ? body.target_value.map((value) => String(value).trim()).filter(Boolean).join(',')
      : body.target_value != null
      ? String(body.target_value).trim()
      : null;
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    body_html: typeof body.body_html === 'string' ? body.body_html : '',
    target_type: targetType,
    target_value: targetType === 'all' ? null : targetValue || null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  if (url.searchParams.get('preview') === '1') {
    const targetType = normalizeTargetType(url.searchParams.get('target_type'));
    const targetValue = url.searchParams.get('target_value');
    if (!targetType) {
      return NextResponse.json({ error: 'Valid target_type is required.' }, { status: 400 });
    }
    if (targetType !== 'all' && !targetValue) {
      return NextResponse.json({ recipients: [] });
    }

    try {
      const leaders = await loadTargetLeaders(targetType, targetValue);
      const pushStatusByLeader = await loadPushStatusByLeader(leaders.map((l) => l.id));
      const recipients = leaders.map((leader) => ({
        ...leader,
        push_status: pushStatusByLeader.get(String(leader.id)) || 'no_device',
      }));
      const pushSummary = recipients.reduce(
        (acc, r) => {
          if (r.push_status === 'enabled') acc.enabled += 1;
          else if (r.push_status === 'pref_off') acc.pref_off += 1;
          else acc.no_device += 1;
          return acc;
        },
        { enabled: 0, pref_off: 0, no_device: 0 }
      );
      return NextResponse.json({ recipients, pushSummary });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Failed to preview recipients.' }, { status: 500 });
    }
  }

  const supabase = createServiceSupabaseClient();
  let { data: messages, error } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, target_type, target_value, status, scheduled_at, version, created_by, edited_by, created_at, updated_at, unsent_at, resent_at')
    .order('updated_at', { ascending: false });

  if (error && isMissingMigrationColumn(error)) {
    const fallback = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, title, body_html, target_type, target_value, version, created_by, edited_by, created_at, updated_at')
      .order('updated_at', { ascending: false });
    messages = (fallback.data || []).map((message: any) => ({ ...message, status: 'sent', scheduled_at: null }));
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (messages || []).map((m: any) => m.id);
  const leaderTargetIds = Array.from(
    new Set(
      (messages || [])
        .filter((m: any) => m.target_type === 'leader' && m.target_value)
        .flatMap((m: any) => parseLeaderTargetIds(m.target_value))
    )
  );
  const leaderLabels = new Map<string, string>();
  if (leaderTargetIds.length > 0) {
    const { data: targetLeaders, error: targetLeaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, campus')
      .in('id', leaderTargetIds);
    if (targetLeaderError) {
      return NextResponse.json({ error: targetLeaderError.message }, { status: 500 });
    }
    for (const leader of targetLeaders || []) {
      leaderLabels.set(
        String(leader.id),
        leader.campus ? `${leader.name} · ${leader.campus}` : leader.name
      );
    }
  }

  const statsByMessage = new Map<string, { recipients: number; unread: number; read: number }>();
  for (const message of messages || []) {
    statsByMessage.set(message.id, { recipients: 0, unread: 0, read: 0 });
  }
  if (ids.length > 0) {
    const { data: statRows, error: statError } = await supabase
      .from('circle_summary_inbox_message_stats')
      .select('message_id, recipients, unread, read')
      .in('message_id', ids);
    if (statError) return NextResponse.json({ error: statError.message }, { status: 500 });
    for (const row of statRows || []) {
      statsByMessage.set(row.message_id, {
        recipients: Number(row.recipients || 0),
        unread: Number(row.unread || 0),
        read: Number(row.read || 0),
      });
    }
  }

  return NextResponse.json({
    messages: (messages || []).map((message: any) => {
      const targetLeaderNames = parseLeaderTargetIds(message.target_value)
        .map((id) => leaderLabels.get(id))
        .filter(Boolean) as string[];

      return {
        ...message,
        target_label:
          message.target_type === 'all'
            ? 'All leaders'
            : message.target_type === 'leader'
            ? targetLeaderNames.length > 2
              ? `${targetLeaderNames.slice(0, 2).join(', ')} + ${targetLeaderNames.length - 2} more`
              : targetLeaderNames.join(', ') || 'Individual Circle'
            : message.target_value,
        stats: statsByMessage.get(message.id) || { recipients: 0, unread: 0, read: 0 },
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'nudge_push') {
    const leaderIds = Array.isArray(body.leader_ids)
      ? Array.from(new Set(body.leader_ids.map((id: unknown) => String(id).trim()).filter(Boolean)))
      : [];
    if (leaderIds.length === 0) {
      return NextResponse.json({ error: 'No leaders supplied to nudge.' }, { status: 400 });
    }
    const supabase = createServiceSupabaseClient();
    const now = new Date().toISOString();
    const { error: nudgeError } = await supabase
      .from('circle_leader_notification_preferences')
      .upsert(
        leaderIds.map((leaderId) => ({
          leader_id: leaderId,
          push_nudge_requested_at: now,
          updated_at: now,
        })),
        { onConflict: 'leader_id' }
      );
    if (nudgeError) return NextResponse.json({ error: nudgeError.message }, { status: 500 });
    return NextResponse.json({ nudged: leaderIds.length });
  }

  const fields = pickMessageFields(body);
  if (!fields.title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  if (!fields.target_type) {
    return NextResponse.json({ error: 'Valid target_type is required.' }, { status: 400 });
  }
  if (fields.target_type !== 'all' && !fields.target_value) {
    return NextResponse.json({ error: 'Target value is required.' }, { status: 400 });
  }

  const scheduled = parseScheduledAt(body.scheduled_at);
  if (!scheduled.valid) {
    return NextResponse.json({ error: 'Invalid scheduled time.' }, { status: 400 });
  }
  const isScheduled = scheduled.iso != null && scheduled.future;

  try {
    // Validate the target resolves to at least one eligible leader at compose time.
    const leaders = await loadTargetLeaders(fields.target_type, fields.target_value);
    if (leaders.length === 0) {
      return NextResponse.json({ error: 'No eligible leaders match that target.' }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data: message, error: messageError } = await supabase
      .from('circle_summary_inbox_messages')
      .insert({
        ...fields,
        status: isScheduled ? 'scheduled' : 'sent',
        scheduled_at: isScheduled ? scheduled.iso : null,
        created_by: auth.user!.id,
        edited_by: auth.user!.id,
      })
      .select()
      .single();
    if (messageError) throw messageError;

    if (!isScheduled) {
      await deliverToLeaders(message, leaders);
    }

    await insertRevision({
      messageId: message.id,
      version: 1,
      title: fields.title,
      bodyHtml: fields.body_html,
      editedBy: auth.user!.id,
    });

    return NextResponse.json({
      message,
      recipients: isScheduled ? [] : leaders,
      scheduled: isScheduled,
      scheduled_at: isScheduled ? scheduled.iso : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Send failed.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id ? String(body.id) : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  let { data: existing, error: loadError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, version, status')
    .eq('id', id)
    .maybeSingle();
  if (loadError && isMissingMigrationColumn(loadError)) {
    const fallback = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, version')
      .eq('id', id)
      .maybeSingle();
    existing = fallback.data ? { ...fallback.data, status: 'sent' } : fallback.data;
    loadError = fallback.error;
  }
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const now = new Date().toISOString();

  // Editing a scheduled (undelivered) message: recipients aren't created yet, so
  // the target and the scheduled time stay editable and the version is not bumped.
  if (existing.status === 'scheduled') {
    const fields = pickMessageFields(body);
    if (!fields.target_type) {
      return NextResponse.json({ error: 'Valid target_type is required.' }, { status: 400 });
    }
    if (fields.target_type !== 'all' && !fields.target_value) {
      return NextResponse.json({ error: 'Target value is required.' }, { status: 400 });
    }

    const scheduled = parseScheduledAt(body.scheduled_at);
    if (!scheduled.valid) {
      return NextResponse.json({ error: 'Invalid scheduled time.' }, { status: 400 });
    }
    const stillScheduled = scheduled.iso != null && scheduled.future;

    try {
      const leaders = await loadTargetLeaders(fields.target_type, fields.target_value);
      if (leaders.length === 0) {
        return NextResponse.json({ error: 'No eligible leaders match that target.' }, { status: 400 });
      }

      const { data: message, error: updateError } = await supabase
        .from('circle_summary_inbox_messages')
        .update({
          ...fields,
          title,
          body_html: bodyHtml,
          status: stillScheduled ? 'scheduled' : 'sent',
          scheduled_at: stillScheduled ? scheduled.iso : null,
          edited_by: auth.user!.id,
          updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();
      if (updateError) throw updateError;

      // If they cleared the schedule (or set it to now), deliver immediately.
      if (!stillScheduled) {
        await deliverToLeaders({ id, title }, leaders);
      }

      return NextResponse.json({
        message,
        recipients: stillScheduled ? [] : leaders,
        scheduled: stillScheduled,
        delivered: !stillScheduled,
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Update failed.' }, { status: 500 });
    }
  }

  // Editing an already-sent (or unsent) message: bump version so recipients see it
  // as unread again. Target stays locked (recipients already exist).
  const nextVersion = Number(existing.version || 1) + 1;

  const { data: message, error: updateError } = await supabase
    .from('circle_summary_inbox_messages')
    .update({
      title,
      body_html: bodyHtml,
      version: nextVersion,
      edited_by: auth.user!.id,
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  try {
    await insertRevision({
      messageId: id,
      version: nextVersion,
      title,
      bodyHtml,
      editedBy: auth.user!.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Revision save failed.' }, { status: 500 });
  }

  return NextResponse.json({ message });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id ? String(body.id) : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: existing, error: loadError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, target_type, target_value, version, status')
    .eq('id', id)
    .maybeSingle();
  if (loadError && isMissingMigrationColumn(loadError)) {
    return NextResponse.json(
      { error: 'Run the circle_summary_inbox migrations before using these actions.' },
      { status: 500 }
    );
  }
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const now = new Date().toISOString();

  // Deliver a scheduled message right now instead of waiting for its scheduled time.
  if (action === 'send_now') {
    if (existing.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled messages can be sent now.' }, { status: 400 });
    }
    if (!existing.target_type) {
      return NextResponse.json({ error: 'Valid target_type is required.' }, { status: 400 });
    }

    try {
      const leaders = await loadTargetLeaders(existing.target_type as TargetType, existing.target_value);
      if (leaders.length === 0) {
        return NextResponse.json({ error: 'No eligible leaders match that target.' }, { status: 400 });
      }

      const { data: message, error: updateError } = await supabase
        .from('circle_summary_inbox_messages')
        .update({
          status: 'sent',
          scheduled_at: null,
          edited_by: auth.user!.id,
          updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();
      if (updateError) throw updateError;

      await deliverToLeaders({ id, title: existing.title }, leaders);
      return NextResponse.json({ message, recipients: leaders });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Send failed.' }, { status: 500 });
    }
  }

  if (action === 'unsend') {
    const { data: message, error: updateError } = await supabase
      .from('circle_summary_inbox_messages')
      .update({
        status: 'unsent',
        unsent_at: now,
        updated_at: now,
        edited_by: auth.user!.id,
      })
      .eq('id', id)
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { error: deleteRecipientsError } = await supabase
      .from('circle_summary_inbox_recipients')
      .delete()
      .eq('message_id', id);
    if (deleteRecipientsError) {
      return NextResponse.json({ error: deleteRecipientsError.message }, { status: 500 });
    }

    return NextResponse.json({ message });
  }

  if (action === 'resend') {
    const fields = pickMessageFields(body);
    if (!fields.title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!fields.target_type) {
      return NextResponse.json({ error: 'Valid target_type is required.' }, { status: 400 });
    }
    if (fields.target_type !== 'all' && !fields.target_value) {
      return NextResponse.json({ error: 'Target value is required.' }, { status: 400 });
    }

    try {
      const leaders = await loadTargetLeaders(fields.target_type, fields.target_value);
      if (leaders.length === 0) {
        return NextResponse.json({ error: 'No eligible leaders match that target.' }, { status: 400 });
      }

      const nextVersion = Number(existing.version || 1) + 1;
      const { data: message, error: updateError } = await supabase
        .from('circle_summary_inbox_messages')
        .update({
          ...fields,
          status: 'sent',
          version: nextVersion,
          edited_by: auth.user!.id,
          updated_at: now,
          resent_at: now,
          unsent_at: null,
        })
        .eq('id', id)
        .select()
        .single();
      if (updateError) throw updateError;

      await deliverToLeaders({ id, title: fields.title }, leaders);
      await insertRevision({
        messageId: id,
        version: nextVersion,
        title: fields.title,
        bodyHtml: fields.body_html,
        editedBy: auth.user!.id,
      });

      return NextResponse.json({ message, recipients: leaders });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Resend failed.' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('circle_summary_inbox_messages')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
