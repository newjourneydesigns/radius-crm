/**
 * GET /api/circle-leader-toolkit/dynamic-questions
 * Returns currently-active admin-configured questions for the submission form.
 *
 * The query + short in-memory cache live in
 * lib/circle-leader-toolkit/questions-data.ts so this route and the
 * server-rendered event form page share one cache instance.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { loadActiveDynamicQuestions } from '../../../../lib/circle-leader-toolkit/questions-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const { questions, error } = await loadActiveDynamicQuestions();
  if (error) {
    return NextResponse.json({ questions: [], error }, { status: 500 });
  }

  return NextResponse.json({ questions });
}
