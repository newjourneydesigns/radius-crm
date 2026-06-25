import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

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

function isMigrationMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('toolkit_home_screen_completed_at') ||
    text.includes('toolkit_onboarding_completed_at') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

export async function PATCH(req: NextRequest) {
  const adminError = await requireAdmin(req);
  if (adminError) return adminError;

  let body: { leader_id?: number | string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const leaderId = parseLeaderId(body.leader_id);
  if (!leaderId) {
    return NextResponse.json({ error: 'leader_id is required.' }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('circle_leaders')
      .update({
        toolkit_home_screen_completed_at: null,
        toolkit_home_screen_dismissed_at: null,
        toolkit_notifications_completed_at: null,
        toolkit_notifications_dismissed_at: null,
        toolkit_practice_summary_completed_at: null,
        toolkit_onboarding_completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leaderId)
      .select('id, name')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Leader not found.' }, { status: 404 });

    return NextResponse.json({ ok: true, leader: data });
  } catch (err: unknown) {
    console.error('[circle-toolkit-onboarding-admin] PATCH failed:', err);
    if (isMigrationMissingError(err)) {
      return NextResponse.json(
        {
          code: 'MIGRATION_REQUIRED',
          error: 'Apply the Circle Toolkit onboarding migration before restarting onboarding.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to restart onboarding.' },
      { status: 500 }
    );
  }
}
