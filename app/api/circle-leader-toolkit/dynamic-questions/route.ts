/**
 * GET /api/circle-leader-toolkit/dynamic-questions
 * Returns currently-active admin-configured questions for the submission form.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('dynamic_questions')
    .select('id, label, help_text, field_type, options, required, show_when_did_not_meet, show_when_attended, sort_order, response_key')
    .or(`active_from.is.null,active_from.lte.${today}`)
    .or(`active_to.is.null,active_to.gte.${today}`)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ questions: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ questions: data || [] });
}
