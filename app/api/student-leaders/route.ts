/**
 * Admin API for the student_leaders roster.
 *
 * student_leaders is RLS-on with no browser policies (student leaders are
 * frequently minors, so every read path is a server route on the service role),
 * which is why the admin screens go through here instead of querying Supabase
 * from the client.
 *
 *   GET    ?term=&campus=&status=&q=   → { leaders: [...] }
 *   POST   { action: 'import', ... }   → import/update people from a CCB group
 *   PATCH  { id, ... }                 → edit one leader (incl. the kill switch)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../lib/auth-middleware';
import { isStudentToolkitEnabled } from '../../../lib/student-toolkit/feature-flag';
import { createServiceSupabaseClient } from '../../../lib/server-supabase';
import { isValidTerm } from '../../../lib/student-toolkit/terms';

export const dynamic = 'force-dynamic';

const SELECT_COLUMNS =
  'id, name, email, phone, campus, status, toolkit_access_enabled, ccb_individual_id, ' +
  'source_ccb_group_id, term, birthday, last_seen_at, created_at, updated_at';

const STATUSES = ['active', 'archived'] as const;

type ImportPerson = {
  ccb_individual_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthday: string | null;
};

async function gate(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  return null;
}

function cleanString(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

/** Only the people the client actually checked, normalized and de-duplicated. */
function parsePeople(raw: unknown): { people: ImportPerson[]; error: string | null } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { people: [], error: 'Select at least one person to import.' };
  }

  const byCcbId = new Map<string, ImportPerson>();
  for (const entry of raw as Array<Record<string, unknown>>) {
    const ccbId = cleanString(entry?.ccb_individual_id);
    const name = cleanString(entry?.name);
    // ccb_individual_id is the whole point of the import — it is what makes a
    // re-run an update instead of a duplicate. A person without one is skipped
    // rather than inserted, so nobody ends up unmatchable.
    if (!ccbId || !name) continue;
    byCcbId.set(ccbId, {
      ccb_individual_id: ccbId,
      name,
      email: cleanString(entry?.email),
      phone: cleanString(entry?.phone),
      birthday: cleanString(entry?.birthday),
    });
  }

  if (byCcbId.size === 0) {
    return { people: [], error: 'None of the selected people have a CCB ID and a name.' };
  }
  return { people: Array.from(byCcbId.values()), error: null };
}

// The feature flag hides the whole Student Toolkit, API included. Middleware
// only 404s the /api/student-toolkit prefix, so this route — which lives under
// a different prefix — checks the flag itself.
function featureDisabled() {
  return !isStudentToolkitEnabled();
}

export async function GET(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const block = await gate(req);
  if (block) return block;

  const params = new URL(req.url).searchParams;
  const term = params.get('term');
  const campus = params.get('campus');
  const status = params.get('status');
  const search = (params.get('q') || '').trim();

  const supabase = createServiceSupabaseClient({ noStore: true });
  let query = supabase.from('student_leaders').select(SELECT_COLUMNS).order('name');

  if (isValidTerm(term)) query = query.eq('term', term);
  if (campus) query = query.eq('campus', campus);
  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq('status', status);
  if (search) {
    // PostgREST parses `or=` as a comma-separated list wrapped in parens, so a
    // comma or paren in the search text would corrupt the filter. Strip those,
    // then escape the ILIKE wildcards.
    const safe = search.replace(/[(),]/g, ' ').replace(/[%_]/g, (c) => `\\${c}`);
    const pattern = `%${safe}%`;
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leaders: data || [] });
}

/**
 * POST { action: 'import', campus, term, source_ccb_group_id, people: [...] }
 *
 * Matching is on ccb_individual_id so a re-run updates people instead of
 * duplicating them. Done as an explicit read-then-split rather than an upsert:
 * the uniqueness of ccb_individual_id comes from a PARTIAL index
 * (`WHERE ccb_individual_id IS NOT NULL`), and Postgres will not infer a
 * partial index for ON CONFLICT unless the predicate is restated — which
 * PostgREST's upsert cannot do.
 */
export async function POST(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const block = await gate(req);
  if (block) return block;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action !== 'import') {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  }

  const campus = String(body.campus || '').trim();
  const term = String(body.term || '').trim();
  const sourceGroupId = String(body.source_ccb_group_id || '').trim();

  if (!campus) return NextResponse.json({ error: 'Campus is required.' }, { status: 400 });
  if (!isValidTerm(term)) {
    return NextResponse.json({ error: 'Term must look like 2026-fall or 2026-spring.' }, { status: 400 });
  }
  if (!/^\d+$/.test(sourceGroupId)) {
    return NextResponse.json({ error: 'A numeric CCB leaders group ID is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient({ noStore: true });

  const { data: campusRows, error: campusError } = await supabase.from('campuses').select('value');
  if (campusError) {
    return NextResponse.json({ error: `Could not read campuses: ${campusError.message}` }, { status: 500 });
  }
  if (!(campusRows || []).some((row) => String(row.value).trim() === campus)) {
    return NextResponse.json(
      { error: `"${campus}" is not a campus in Settings. Add it there first.` },
      { status: 400 }
    );
  }

  const { people, error: peopleError } = parsePeople(body.people);
  if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });

  const ccbIds = people.map((p) => p.ccb_individual_id);
  const { data: existingRows, error: existingError } = await supabase
    .from('student_leaders')
    .select('id, ccb_individual_id')
    .in('ccb_individual_id', ccbIds);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingByCcbId = new Map(
    ((existingRows || []) as { id: number; ccb_individual_id: string }[]).map((row) => [
      row.ccb_individual_id,
      row.id,
    ])
  );

  const now = new Date().toISOString();
  const toInsert = people.filter((p) => !existingByCcbId.has(p.ccb_individual_id));
  const toUpdate = people.filter((p) => existingByCcbId.has(p.ccb_individual_id));

  let inserted = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('student_leaders')
      .insert(
        toInsert.map((person) => ({
          name: person.name,
          email: person.email,
          phone: person.phone,
          // Student leaders are often minors themselves, and
          // lib/messaging/minorGuard.ts needs a birthday to evaluate. CCB
          // returns it inline on the roster pull, so it costs nothing here.
          birthday: person.birthday,
          campus,
          term,
          ccb_individual_id: person.ccb_individual_id,
          source_ccb_group_id: sourceGroupId,
          status: 'active',
        }))
      )
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length || 0;
  }

  let updated = 0;
  for (const person of toUpdate) {
    const id = existingByCcbId.get(person.ccb_individual_id)!;
    // Re-import refreshes what CCB owns (name, contact, birthday) and re-points
    // the person at this term's group. It deliberately leaves `status` and
    // `toolkit_access_enabled` alone — those are staff decisions, and a
    // re-import must not silently un-archive someone or undo a kill switch.
    const { error } = await supabase
      .from('student_leaders')
      .update({
        name: person.name,
        email: person.email,
        phone: person.phone,
        birthday: person.birthday,
        campus,
        term,
        source_ccb_group_id: sourceGroupId,
        updated_at: now,
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated += 1;
  }

  const skipped = (Array.isArray(body.people) ? body.people.length : 0) - people.length;

  return NextResponse.json({
    ok: true,
    imported: inserted,
    updated,
    skipped,
    message:
      `Imported ${inserted} new student leader${inserted === 1 ? '' : 's'}` +
      ` and updated ${updated}.` +
      (skipped > 0 ? ` ${skipped} skipped for a missing CCB ID or name.` : ''),
  });
}

/** PATCH { id, toolkit_access_enabled?, status?, name?, email?, phone?, campus? } */
export async function PATCH(req: NextRequest) {
  if (featureDisabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const block = await gate(req);
  if (block) return block;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.toolkit_access_enabled !== undefined) {
    updates.toolkit_access_enabled = body.toolkit_access_enabled === true;
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: `Status must be ${STATUSES.join(' or ')}.` }, { status: 400 });
    }
    updates.status = status;
  }
  if (body.name !== undefined) {
    const name = cleanString(body.name);
    if (!name) return NextResponse.json({ error: 'Name cannot be blank.' }, { status: 400 });
    updates.name = name;
  }
  if (body.email !== undefined) updates.email = cleanString(body.email);
  if (body.phone !== undefined) updates.phone = cleanString(body.phone);
  if (body.campus !== undefined) updates.campus = cleanString(body.campus);

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_leaders')
    .update(updates)
    .eq('id', body.id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leader: data });
}
