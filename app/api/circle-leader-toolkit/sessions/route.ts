/**
 * Admin-only Circle Summary access controls for a leader.
 *
 * GET /api/circle-leader-toolkit/sessions?leader_id=123
 * PATCH /api/circle-leader-toolkit/sessions { leader_id, enabled }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { isLeaderEligible, revokeLeaderSessions } from '../../../../lib/circle-leader-toolkit/session';

export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }
  return null;
}

function parseLeaderId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function isMigrationMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('circle_summary_access_enabled') ||
    text.includes('leader_sessions') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

function migrationRequiredResponse() {
  return NextResponse.json(
    {
      code: 'MIGRATION_REQUIRED',
      error: 'Apply the leader persistent sessions migration before using Circle Summary access controls.',
    },
    { status: 409 }
  );
}

async function getSessionStatus(leaderId: number) {
  const supabase = createServiceSupabaseClient();

  const { data: leader, error: leaderError } = await supabase
    .from('circle_leaders')
    .select('id, status, circle_summary_access_enabled')
    .eq('id', leaderId)
    .maybeSingle();

  if (leaderError) throw leaderError;
  if (!leader) return null;

  const { data: sessions, error: sessionsError } = await supabase
    .from('leader_sessions')
    .select('id, last_seen_at, created_at')
    .eq('leader_id', leaderId)
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false });

  if (sessionsError) throw sessionsError;

  return {
    enabled: isLeaderEligible(leader) && leader.circle_summary_access_enabled !== false,
    blockedByStatus: !isLeaderEligible(leader),
    activeSessions: sessions?.length ?? 0,
    lastSeenAt: sessions?.[0]?.last_seen_at ?? null,
  };
}

export async function GET(req: NextRequest) {
  const adminError = await requireAdmin(req);
  if (adminError) return adminError;

  const leaderId = parseLeaderId(new URL(req.url).searchParams.get('leader_id'));
  if (!leaderId) {
    return NextResponse.json({ error: 'leader_id is required.' }, { status: 400 });
  }

  try {
    const status = await getSessionStatus(leaderId);
    if (!status) return NextResponse.json({ error: 'Leader not found.' }, { status: 404 });
    return NextResponse.json(status);
  } catch (err: unknown) {
    console.error('[circle-summary-sessions] GET failed:', err);
    if (isMigrationMissingError(err)) return migrationRequiredResponse();
    return NextResponse.json({ error: errorMessage(err, 'Failed to load sessions.') }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const adminError = await requireAdmin(req);
  if (adminError) return adminError;

  let body: { leader_id?: number | string; enabled?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const leaderId = parseLeaderId(body.leader_id);
  if (!leaderId || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'leader_id and enabled are required.' }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { data: existingLeader, error: existingError } = await supabase
      .from('circle_leaders')
      .select('id, status')
      .eq('id', leaderId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existingLeader) return NextResponse.json({ error: 'Leader not found.' }, { status: 404 });
    if (body.enabled && !isLeaderEligible(existingLeader)) {
      return NextResponse.json(
        { error: 'Archived leaders cannot use Circle Summary.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('circle_leaders')
      .update({
        circle_summary_access_enabled: body.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leaderId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    const revokedCount = body.enabled ? 0 : await revokeLeaderSessions(leaderId);
    const status = await getSessionStatus(leaderId);
    return NextResponse.json({ ok: true, revokedCount, ...status });
  } catch (err: unknown) {
    console.error('[circle-summary-sessions] PATCH failed:', err);
    if (isMigrationMissingError(err)) return migrationRequiredResponse();
    return NextResponse.json({ error: errorMessage(err, 'Failed to update access.') }, { status: 500 });
  }
}
