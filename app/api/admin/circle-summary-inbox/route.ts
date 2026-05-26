/**
 * Admin-style API for Circle Summary inbox messages.
 *
 * Any signed-in RADIUS user can send/edit messages. Delivery creates
 * per-leader recipient rows so leaders keep a durable read/unread history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

type TargetType = 'all' | 'campus' | 'acpd' | 'leader';

type LeaderTarget = {
  id: number | string;
  name: string;
  campus: string | null;
  acpd: string | null;
  ccb_group_id: string | number | null;
  status: string | null;
  circle_summary_access_enabled?: boolean | null;
};

const TARGET_TYPES = new Set(['all', 'campus', 'acpd', 'leader']);
const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);

function isMissingStatusColumn(error: unknown): boolean {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  return text.toLowerCase().includes('status') && text.toLowerCase().includes('does not exist');
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

function isEligibleLeader(leader: LeaderTarget): boolean {
  const status = (leader.status || '').trim().toLowerCase();
  if (INELIGIBLE_STATUSES.has(status)) return false;
  if (leader.circle_summary_access_enabled === false) return false;
  return true;
}

function parseLeaderTargetIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

async function loadTargetLeaders(targetType: TargetType, targetValue: string | null) {
  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from('circle_leaders')
    .select('id, name, campus, acpd, ccb_group_id, status, circle_summary_access_enabled')
    .order('name');

  if (targetType === 'campus') {
    if (!targetValue) return [];
    query = query.eq('campus', targetValue);
  } else if (targetType === 'acpd') {
    if (!targetValue) return [];
    query = query.eq('acpd', targetValue);
  } else if (targetType === 'leader') {
    const ids = parseLeaderTargetIds(targetValue);
    if (ids.length === 0) return [];
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as LeaderTarget[]).filter(isEligibleLeader);
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

async function insertRevision({
  messageId,
  version,
  title,
  bodyHtml,
  editedBy,
}: {
  messageId: string;
  version: number;
  title: string;
  bodyHtml: string;
  editedBy: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('circle_summary_inbox_message_revisions')
    .insert({
      message_id: messageId,
      version,
      title,
      body_html: bodyHtml,
      edited_by: editedBy,
    });
  if (error) throw error;
}

async function replaceRecipients(messageId: string, leaders: LeaderTarget[]) {
  const supabase = createServiceSupabaseClient();
  const { error: deleteError } = await supabase
    .from('circle_summary_inbox_recipients')
    .delete()
    .eq('message_id', messageId);
  if (deleteError) throw deleteError;

  if (leaders.length === 0) return;

  const recipientRows = leaders.map((leader) => ({
    message_id: messageId,
    leader_id: leader.id,
  }));
  const { error: recipientError } = await supabase
    .from('circle_summary_inbox_recipients')
    .insert(recipientRows);
  if (recipientError) throw recipientError;
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
      return NextResponse.json({ recipients: leaders });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Failed to preview recipients.' }, { status: 500 });
    }
  }

  const supabase = createServiceSupabaseClient();
  let { data: messages, error } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, target_type, target_value, status, version, created_by, edited_by, created_at, updated_at, unsent_at, resent_at')
    .order('updated_at', { ascending: false });

  if (error && isMissingStatusColumn(error)) {
    const fallback = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, title, body_html, target_type, target_value, version, created_by, edited_by, created_at, updated_at')
      .order('updated_at', { ascending: false });
    messages = (fallback.data || []).map((message: any) => ({ ...message, status: 'sent' }));
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

    const supabase = createServiceSupabaseClient();
    const { data: message, error: messageError } = await supabase
      .from('circle_summary_inbox_messages')
      .insert({
        ...fields,
        created_by: auth.user!.id,
        edited_by: auth.user!.id,
      })
      .select()
      .single();
    if (messageError) throw messageError;

    const recipientRows = leaders.map((leader) => ({
      message_id: message.id,
      leader_id: leader.id,
    }));
    const { error: recipientError } = await supabase
      .from('circle_summary_inbox_recipients')
      .insert(recipientRows);
    if (recipientError) throw recipientError;

    await insertRevision({
      messageId: message.id,
      version: 1,
      title: fields.title,
      bodyHtml: fields.body_html,
      editedBy: auth.user!.id,
    });

    return NextResponse.json({ message, recipients: leaders });
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
  if (loadError && isMissingStatusColumn(loadError)) {
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

  const nextVersion = Number(existing.version || 1) + 1;
  const now = new Date().toISOString();

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
  if (loadError && isMissingStatusColumn(loadError)) {
    return NextResponse.json(
      { error: 'Run the circle_summary_inbox_unsend migration before using Unsend/Resend.' },
      { status: 500 }
    );
  }
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const now = new Date().toISOString();

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

      await replaceRecipients(id, leaders);
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
