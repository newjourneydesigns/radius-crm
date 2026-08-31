/**
 * Admin CRUD for the CCB group map behind the Student Leader Toolkit.
 *
 * One row per (campus, term, kind, ccb_group_id):
 *   circle    — a campus's circle group, one per grade (several rows are normal)
 *   movement  — the main student gathering
 *   leaders   — where /import-students reads student leaders from
 *
 * Student ministry is still tracking these IDs down, so this is the screen that
 * lets staff wire a campus in the moment they have one — no deploy, no SQL.
 *
 * student_ministry_groups is RLS-on with no browser policies, so every read and
 * write here runs on the service role behind an admin gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { isStudentToolkitEnabled } from '../../../../lib/student-toolkit/feature-flag';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { isValidTerm, currentTerm } from '../../../../lib/student-toolkit/terms';

export const dynamic = 'force-dynamic';

const KINDS = ['circle', 'movement', 'leaders'] as const;
type GroupKind = (typeof KINDS)[number];

const SELECT_COLUMNS =
  'id, campus, term, kind, ccb_group_id, label, active, last_synced_at, last_sync_error, created_at, updated_at';

function isKind(value: unknown): value is GroupKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

async function gate(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return { user: null, response: NextResponse.json({ error: error || 'Forbidden' }, { status: 403 }) };
  }
  return { user, response: null };
}

/**
 * Campus is a free-text column, so a typo here means a group that never matches
 * a student leader. Check it against the campuses reference list instead of
 * trusting the client — the picker sends a value from that same list.
 */
async function isKnownCampus(campus: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient({ noStore: true });
  const { data, error } = await supabase.from('campuses').select('value');
  if (error) throw new Error(`Could not read campuses: ${error.message}`);
  return (data || []).some((row) => String(row.value).trim() === campus);
}

/** Shared field validation for POST/PATCH. Returns an error string, or null. */
async function validateWritableFields(fields: {
  campus?: string;
  term?: string;
  kind?: unknown;
  ccb_group_id?: string;
}): Promise<string | null> {
  if (fields.term !== undefined && !isValidTerm(fields.term)) {
    return 'Term must look like 2026-fall or 2026-spring.';
  }
  if (fields.kind !== undefined && !isKind(fields.kind)) {
    return `Kind must be one of ${KINDS.join(', ')}.`;
  }
  if (fields.ccb_group_id !== undefined && !/^\d+$/.test(fields.ccb_group_id)) {
    return 'CCB group ID must be a number — copy it from the group URL in CCB.';
  }
  if (fields.campus !== undefined) {
    if (!fields.campus) return 'Campus is required.';
    if (!(await isKnownCampus(fields.campus))) {
      return `"${fields.campus}" is not a campus in Settings. Add it there first.`;
    }
  }
  return null;
}

/** GET ?term= — the map for one term, plus every term that already has rows. */
// The feature flag hides the whole Student Toolkit, API included. Middleware
// only 404s the /api/student-toolkit prefix, so this route — which lives under
// a different prefix — checks the flag itself.
function featureDisabled() {
  return !isStudentToolkitEnabled();
}

export async function GET(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { response } = await gate(req);
  if (response) return response;

  const requested = new URL(req.url).searchParams.get('term');
  const term = isValidTerm(requested) ? requested : currentTerm();

  // noStore: staff add a group and immediately re-read it; a cached empty list
  // reads as "the save didn't work".
  const supabase = createServiceSupabaseClient({ noStore: true });

  const [groupsRes, termsRes] = await Promise.all([
    supabase
      .from('student_ministry_groups')
      .select(SELECT_COLUMNS)
      .eq('term', term)
      .order('campus')
      .order('kind')
      .order('label'),
    supabase.from('student_ministry_groups').select('term'),
  ]);

  if (groupsRes.error) {
    return NextResponse.json({ error: groupsRes.error.message }, { status: 500 });
  }

  const terms = Array.from(
    new Set([term, ...((termsRes.data || []) as { term: string }[]).map((r) => r.term)])
  ).filter(isValidTerm);

  return NextResponse.json({ term, terms, groups: groupsRes.data || [] });
}

/** POST — map a CCB group to a campus, term, and kind. */
export async function POST(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { user, response } = await gate(req);
  if (response) return response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const campus = String(body.campus || '').trim();
  const term = String(body.term || '').trim();
  const kind = body.kind;
  const ccbGroupId = String(body.ccb_group_id || '').trim();
  const label = typeof body.label === 'string' ? body.label.trim() : '';

  const invalid = await validateWritableFields({ campus, term, kind, ccb_group_id: ccbGroupId });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_ministry_groups')
    .insert({
      campus,
      term,
      kind,
      ccb_group_id: ccbGroupId,
      label: label || null,
      // A leaders group is an import source, not an attendance source — the
      // nightly sync walks active rows of every kind and would corrupt the
      // directory with it. Enforced by a CHECK in
      // 20260831020000_student_leaders_group_kind.sql; kept here so the API
      // never has to bounce a save the UI could have avoided.
      active: kind !== 'leaders',
      created_by: user?.id || null,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // 23505 = the (campus, term, kind, ccb_group_id) unique index.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'That group is already mapped for this campus, term, and kind.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ group: data });
}

/** PATCH — edit one mapping: { id, label?, active?, ccb_group_id? }. */
export async function PATCH(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { response } = await gate(req);
  if (response) return response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: existing, error: lookupError } = await supabase
    .from('student_ministry_groups')
    .select('id, kind, ccb_group_id')
    .eq('id', body.id)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Group mapping not found.' }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.label !== undefined) {
    updates.label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
  }

  if (body.ccb_group_id !== undefined) {
    const ccbGroupId = String(body.ccb_group_id).trim();
    const invalid = await validateWritableFields({ ccb_group_id: ccbGroupId });
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    updates.ccb_group_id = ccbGroupId;
    if (ccbGroupId !== existing.ccb_group_id) {
      // The stored sync state describes the OLD group ID. Clearing it stops a
      // stale "synced 3 hours ago" from vouching for an ID nobody has tried.
      updates.last_synced_at = null;
      updates.last_sync_error = null;
    }
  }

  if (body.active !== undefined) {
    const active = body.active === true;
    if (active && existing.kind === 'leaders') {
      return NextResponse.json(
        {
          error:
            'A leaders group is an import source only — the nightly attendance sync must not read it.',
        },
        { status: 400 }
      );
    }
    updates.active = active;
  }

  const { data, error } = await supabase
    .from('student_ministry_groups')
    .update(updates)
    .eq('id', body.id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}

/** DELETE ?id= — unmap a group. Attendance already pulled for it is kept. */
export async function DELETE(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { response } = await gate(req);
  if (response) return response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('student_ministry_groups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
