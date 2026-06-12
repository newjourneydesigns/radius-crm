/**
 * POST /api/circle-leader-toolkit/deliver-scheduled-inbox
 *
 * Cron-invoked worker that delivers Circle Summary inbox messages whose
 * scheduled_at has arrived. For each due message it resolves the current set of
 * eligible target leaders, writes recipient rows, fires inbox pushes, and flips
 * the message status from 'scheduled' to 'sent'.
 *
 * Auth: Bearer CRON_SECRET (same pattern as the other scheduled routes).
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { TargetType, deliverToLeaders, loadTargetLeaders } from '../../../../lib/circle-leader-toolkit/inbox-delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const nowIso = DateTime.utc().toISO();

  const { data: dueMessages, error } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, target_type, target_value, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = dueMessages || [];
  let delivered = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const message of messages) {
    try {
      const leaders = await loadTargetLeaders(
        (message.target_type || 'all') as TargetType,
        message.target_value
      );

      // Mark sent first so a mid-loop failure can't double-deliver on the next run.
      const { error: updateError } = await supabase
        .from('circle_summary_inbox_messages')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', message.id)
        .eq('status', 'scheduled');
      if (updateError) throw updateError;

      await deliverToLeaders({ id: message.id, title: message.title }, leaders);
      delivered += 1;
    } catch (e: any) {
      errors.push({ id: message.id, error: e?.message || String(e) });
      console.error('[deliver-scheduled-inbox] delivery failed:', message.id, e?.message || e);
    }
  }

  return NextResponse.json({ delivered, due: messages.length, errors });
}
