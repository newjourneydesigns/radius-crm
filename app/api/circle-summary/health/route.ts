/**
 * Leader-facing Leadership Snapshot (Health) API for the Circle Leader
 * Dashboard. Authenticated by the leader-session cookie via getSessionLeader(),
 * so each submission links straight to the signed-in leader (no email match,
 * no admin confirmation needed — identity is already verified).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createSnapshot, getActiveTemplate, getSnapshotWindow } from '../../../../lib/leadershipSnapshotServer';

export const dynamic = 'force-dynamic';

// GET — the signed-in leader's own snapshots, newest first.
export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const [{ data, error }, template, window] = await Promise.all([
    supabase
      .from('leadership_snapshots')
      .select('*')
      .eq('circle_leader_id', Number(leader.id))
      .order('created_at', { ascending: false }),
    getActiveTemplate(),
    getSnapshotWindow(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data || [], template, window });
}

// POST — submit a new self-assessment for the signed-in leader.
export async function POST(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  // Submissions are only accepted while the window is open.
  const window = await getSnapshotWindow();
  if (!window.isOpen) {
    return NextResponse.json(
      { error: 'The Leadership Snapshot is currently closed.', window },
      { status: 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // circle_type personalizes the AI prompt; it lives on the leader record.
  const supabase = createServiceSupabaseClient();
  const { data: leaderRow } = await supabase
    .from('circle_leaders')
    .select('circle_type')
    .eq('id', Number(leader.id))
    .maybeSingle();

  const { snapshot, error, status } = await createSnapshot({
    circleLeaderId: Number(leader.id),
    leaderLinkConfirmed: true, // self-submitted: identity is verified
    submittedBy: null,
    respondent_name: leader.name,
    respondent_email: leader.email,
    respondent_phone: leader.phone,
    role: 'Circle Leader',
    campus: leader.campus,
    circle_type: leaderRow?.circle_type ?? null,
    group_size: body.group_size ?? null,
    answers: (body.answers || {}) as Record<string, number>,
    reflections: (body.reflections || {}) as Record<string, string>,
  });

  if (error) return NextResponse.json({ error }, { status: status || 500 });
  return NextResponse.json({ snapshot }, { status: 201 });
}
