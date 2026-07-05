/**
 * Admin CRUD for Circle Leader Pro Tips — short weekly YouTube clips with a
 * rich-text write-up, published on a schedule.
 *
 * A tip appears in the toolkit's Resources → Pro Tips catalog once publish_at
 * arrives (query-time filter). When send_to_inbox is set, the tip is also
 * cross-posted as a Message Center inbox message: scheduled for the same
 * publish time and delivered (with pushes) by the existing
 * deliver-scheduled-inbox worker, or delivered immediately when the publish
 * time is already past.
 *
 *   GET    ?audience=  → { tips } newest-first, each with inbox_status
 *   POST   { ... }     → create tip (+ inbox message when send_to_inbox)
 *   PUT    { id, ... } → update tip; keeps a still-scheduled inbox message in sync
 *   DELETE ?id=        → delete tip; cancels a still-scheduled inbox message
 */

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { isYouTubeUrl } from '../../../../lib/renderMessageHtml';
import {
  deliverToLeaders,
  insertRevision,
  loadTargetLeaders,
} from '../../../../lib/circle-leader-toolkit/inbox-delivery';
import type { ResourcePageAudience } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

function parseAudience(value: unknown): ResourcePageAudience {
  return value === 'host_team' ? 'host_team' : 'circle';
}

type TipFields = {
  audience: ResourcePageAudience;
  title: string;
  youtube_url: string;
  body_html: string;
  publish_at: string; // UTC ISO
  send_to_inbox: boolean;
};

function parseTipFields(body: any): { fields?: TipFields; error?: string } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return { error: 'A title is required.' };

  const youtube_url = typeof body.youtube_url === 'string' ? body.youtube_url.trim() : '';
  if (!youtube_url || !isYouTubeUrl(youtube_url)) {
    return { error: 'A valid YouTube link is required.' };
  }

  const publishDt = DateTime.fromISO(String(body.publish_at ?? ''));
  if (!publishDt.isValid) return { error: 'A valid publish date is required.' };

  return {
    fields: {
      audience: parseAudience(body.audience),
      title,
      youtube_url,
      body_html: typeof body.body_html === 'string' ? body.body_html : '',
      publish_at: publishDt.toUTC().toISO()!,
      send_to_inbox: body.send_to_inbox === true,
    },
  };
}

/** The inbox rendition: the video link first (auto-embeds), then the write-up. */
function inboxBodyHtml(fields: Pick<TipFields, 'youtube_url' | 'body_html'>): string {
  return `<p>${fields.youtube_url}</p>${fields.body_html || ''}`;
}

/**
 * Cross-post the tip to the leader inbox. A future publish time creates a
 * scheduled message (delivered by the cron worker, pushes included); a past
 * one delivers immediately. Returns the inbox message id.
 */
async function createInboxMessage(
  supabase: ServiceClient,
  fields: TipFields,
  userId: string
): Promise<string> {
  const leaders = await loadTargetLeaders('all', null, {
    audience: fields.audience,
    filters: null,
  });
  if (leaders.length === 0) {
    throw new Error('No eligible leaders to receive the inbox message.');
  }

  const isScheduled = DateTime.fromISO(fields.publish_at) > DateTime.utc();
  const { data: message, error } = await supabase
    .from('circle_summary_inbox_messages')
    .insert({
      title: fields.title,
      body_html: inboxBodyHtml(fields),
      target_type: 'all',
      target_value: null,
      audience: fields.audience,
      audience_filters: null,
      delivery_start: null,
      delivery_end: null,
      status: isScheduled ? 'scheduled' : 'sent',
      scheduled_at: isScheduled ? fields.publish_at : null,
      created_by: userId,
      edited_by: userId,
    })
    .select()
    .single();
  if (error) throw error;

  if (!isScheduled) {
    await deliverToLeaders(message, leaders);
  }
  await insertRevision({
    messageId: message.id,
    version: 1,
    title: fields.title,
    bodyHtml: inboxBodyHtml(fields),
    editedBy: userId,
  });
  return message.id;
}

async function loadInboxStatus(supabase: ServiceClient, messageIds: string[]) {
  const statusById = new Map<string, string>();
  if (messageIds.length === 0) return statusById;
  const { data } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, status')
    .in('id', messageIds);
  for (const row of data || []) statusById.set(row.id, row.status || 'sent');
  return statusById;
}

async function gate(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  try {
    const audience = parseAudience(new URL(req.url).searchParams.get('audience'));
    const supabase = createServiceSupabaseClient();
    const { data: tips, error } = await supabase
      .from('leader_pro_tips')
      .select('*')
      .eq('audience', audience)
      .order('publish_at', { ascending: false });
    if (error) throw error;

    const statusById = await loadInboxStatus(
      supabase,
      (tips || []).map((t) => t.inbox_message_id).filter(Boolean)
    );
    const withStatus = (tips || []).map((tip) => ({
      ...tip,
      inbox_status: tip.inbox_message_id
        ? statusById.get(tip.inbox_message_id) || null
        : null,
    }));
    return NextResponse.json(
      { tips: withStatus },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to load.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { fields, error: fieldError } = parseTipFields(body);
  if (!fields) return NextResponse.json({ error: fieldError }, { status: 400 });

  try {
    const supabase = createServiceSupabaseClient();
    let inbox_message_id: string | null = null;
    if (fields.send_to_inbox) {
      inbox_message_id = await createInboxMessage(supabase, fields, user!.id);
    }
    const { data, error: insertError } = await supabase
      .from('leader_pro_tips')
      .insert({ ...fields, inbox_message_id, updated_by: user?.id || null })
      .select()
      .single();
    if (insertError) throw insertError;
    return NextResponse.json({ tip: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Create failed.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { fields, error: fieldError } = parseTipFields(body);
  if (!fields) return NextResponse.json({ error: fieldError }, { status: 400 });

  try {
    const supabase = createServiceSupabaseClient();
    const { data: existing, error: loadError } = await supabase
      .from('leader_pro_tips')
      .select('*')
      .eq('id', id)
      .single();
    if (loadError) throw loadError;

    // Keep the cross-posted inbox message in sync while it hasn't gone out
    // yet. A message that already reached leaders is left untouched.
    let inbox_message_id: string | null = existing.inbox_message_id || null;
    if (inbox_message_id) {
      const { data: message } = await supabase
        .from('circle_summary_inbox_messages')
        .select('id, status, version')
        .eq('id', inbox_message_id)
        .maybeSingle();
      if (message?.status === 'scheduled') {
        if (fields.send_to_inbox) {
          const nextVersion = (message.version || 1) + 1;
          const { error: msgError } = await supabase
            .from('circle_summary_inbox_messages')
            .update({
              title: fields.title,
              body_html: inboxBodyHtml(fields),
              scheduled_at: fields.publish_at,
              // A publish time moved into the past gets picked up by the next
              // worker run, so the message stays 'scheduled' either way.
              version: nextVersion,
              edited_by: user!.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', inbox_message_id);
          if (msgError) throw msgError;
          await insertRevision({
            messageId: inbox_message_id,
            version: nextVersion,
            title: fields.title,
            bodyHtml: inboxBodyHtml(fields),
            editedBy: user!.id,
          });
        } else {
          // Unchecked before delivery — cancel the scheduled message.
          await supabase.from('circle_summary_inbox_messages').delete().eq('id', inbox_message_id);
          inbox_message_id = null;
        }
      }
    } else if (fields.send_to_inbox) {
      inbox_message_id = await createInboxMessage(supabase, fields, user!.id);
    }

    const { data, error: updateError } = await supabase
      .from('leader_pro_tips')
      .update({
        ...fields,
        inbox_message_id,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ tip: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Save failed.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  try {
    const supabase = createServiceSupabaseClient();
    const { data: tip } = await supabase
      .from('leader_pro_tips')
      .select('id, inbox_message_id')
      .eq('id', id)
      .maybeSingle();
    if (!tip) return NextResponse.json({ ok: true });

    // Cancel the cross-post only if it hasn't been delivered yet.
    if (tip.inbox_message_id) {
      await supabase
        .from('circle_summary_inbox_messages')
        .delete()
        .eq('id', tip.inbox_message_id)
        .eq('status', 'scheduled');
    }
    const { error: deleteError } = await supabase.from('leader_pro_tips').delete().eq('id', id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Delete failed.' }, { status: 500 });
  }
}
