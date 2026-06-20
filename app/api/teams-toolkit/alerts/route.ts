/**
 * GET /api/teams-toolkit/alerts
 * Lightweight alert counts for the tab badge. Phase 1 surfaces unread inbox
 * messages only (no event summaries yet).
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/teams-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let unreadMessages = 0;
  try {
    const supabase = createServiceSupabaseClient();
    const { data: recipients } = await supabase
      .from('circle_summary_inbox_recipients')
      .select('message_id, read_at, read_version')
      .eq('leader_id', leader.id);

    const messageIds = (recipients || []).map((r: any) => r.message_id);
    if (messageIds.length > 0) {
      const { data: messages } = await supabase
        .from('circle_summary_inbox_messages')
        .select('id, version')
        .in('id', messageIds);
      const versionById = new Map((messages || []).map((m: any) => [m.id, Number(m.version || 1)]));
      unreadMessages = (recipients || []).filter((r: any) => {
        const version = versionById.get(r.message_id);
        if (version == null) return false; // message deleted/unsent
        return !r.read_at || Number(r.read_version || 0) < version;
      }).length;
    }
  } catch (error) {
    console.warn(
      '[teams-toolkit/alerts] count lookup failed:',
      error instanceof Error ? error.message : error
    );
  }

  return NextResponse.json({
    unreadMessages,
    pendingEventSummaries: 0,
    totalAlertCount: unreadMessages,
  });
}
