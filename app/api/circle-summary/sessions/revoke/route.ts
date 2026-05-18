/**
 * POST /api/circle-summary/sessions/revoke
 * Body: { leader_id }
 *
 * Admin-only endpoint to revoke all persistent Circle Summary sessions for a
 * leader. Use when a device is lost, a leader steps down, or access needs to
 * be reset without deleting the leader.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../../lib/auth-middleware';
import { revokeLeaderSessions } from '../../../../../lib/circle-summary/session';

export const dynamic = 'force-dynamic';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function isMigrationMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('leader_sessions') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

export async function POST(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: { leader_id?: number | string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.leader_id) {
    return NextResponse.json({ error: 'leader_id is required.' }, { status: 400 });
  }

  try {
    const revokedCount = await revokeLeaderSessions(body.leader_id);
    return NextResponse.json({ ok: true, revokedCount });
  } catch (err: unknown) {
    console.error('[circle-summary-sessions] revoke failed:', err);
    if (isMigrationMissingError(err)) {
      return NextResponse.json(
        {
          code: 'MIGRATION_REQUIRED',
          error: 'Apply the leader persistent sessions migration before revoking Circle Summary sessions.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: errorMessage(err, 'Failed to revoke sessions.') }, { status: 500 });
  }
}
