import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Lightweight count behind the nav "Today" alert dot. Returns the number of
// still-open items the user must act on: board cards due today or overdue
// (not complete) plus follow-ups due today or overdue. This mirrors the
// app-icon badge formula (lib/appBadge.ts → computeOpenBadgeCount) and the
// push cron (lib/todayPushReminders.ts) so the nav dot, the OS app badge, and
// the notification count never disagree.

export interface TodayBadgeCount {
  count: number;
  cards: number;
  followUps: number;
}

type UserProfile = { id: string; name: string; email: string };
type BoardRow = { id: string };
type AssignmentRow = { card_id: string };
type CardIdRow = { id: string; board_id?: string | null };

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

function getTodayDate(): string {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const y = cst.getFullYear();
  const m = String(cst.getMonth() + 1).padStart(2, '0');
  const d = String(cst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractSubFromToken(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub ?? null;
  } catch { return null; }
}

// ── Server-side response cache (per user, 60s TTL) ───────────────────────────
const responseCache = new Map<string, { payload: TodayBadgeCount; cachedAt: number }>();
const RESPONSE_CACHE_TTL = 60_000;

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase        = getSupabaseServiceClient();
    const anonClient      = createClient(supabaseUrl, supabaseAnonKey);

    const today = getTodayDate();
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';

    const optimisticId = extractSubFromToken(token);

    const [authResult, profileResult] = await Promise.all([
      anonClient.auth.getUser(token),
      optimisticId
        ? supabase.from('users').select('id, name, email').eq('id', optimisticId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!authResult.data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userProfile = profileResult.data as UserProfile | null;
    if (!userProfile || userProfile.id !== authResult.data.user.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const cacheKey = `badge:${userProfile.id}:${today}`;
    const cached = responseCache.get(cacheKey);
    if (!fresh && cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL) {
      return NextResponse.json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
    }

    const user = { id: userProfile.id, name: userProfile.name };

    // Open board cards (user's boards + cards assigned to them) due today/overdue.
    const [{ data: boardsRaw }, { data: assignmentRows }] = await Promise.all([
      supabase.from('project_boards').select('id').eq('user_id', user.id).eq('is_archived', false),
      supabase.from('card_assignments').select('card_id').eq('user_id', user.id),
    ]);
    const boardIds       = ((boardsRaw || []) as BoardRow[]).map((b) => b.id);
    const assignedCardIds = ((assignmentRows || []) as AssignmentRow[]).map((a) => a.card_id);

    const [ownedCardsRes, assignedCardsRes, createdCardsRes] = await Promise.all([
      boardIds.length > 0
        ? supabase.from('board_cards').select('id')
            .in('board_id', boardIds).eq('is_archived', false).eq('is_complete', false)
            .not('due_date', 'is', null).lte('due_date', today)
        : Promise.resolve({ data: [] as CardIdRow[] }),
      assignedCardIds.length > 0
        ? supabase.from('board_cards').select('id, board_id')
            .in('id', assignedCardIds).eq('is_archived', false).eq('is_complete', false)
            .not('due_date', 'is', null).lte('due_date', today)
        : Promise.resolve({ data: [] as CardIdRow[] }),
      // Cards the user created on any board (matches the Today list scope).
      supabase.from('board_cards').select('id')
        .eq('created_by', user.id).eq('is_archived', false).eq('is_complete', false)
        .not('due_date', 'is', null).lte('due_date', today),
    ]);

    const assignedBoardIds = Array.from(new Set(
      ((assignedCardsRes.data || []) as CardIdRow[]).map((c) => c.board_id).filter((id): id is string => Boolean(id))
    ));
    const missingBoardIds = assignedBoardIds.filter((id) => !boardIds.includes(id));
    const activeBoardIds = new Set(boardIds);
    if (missingBoardIds.length > 0) {
      const { data: extraBoards } = await supabase
        .from('project_boards')
        .select('id')
        .in('id', missingBoardIds)
        .eq('is_archived', false);
      ((extraBoards || []) as BoardRow[]).forEach((b) => activeBoardIds.add(b.id));
    }

    const cardIds = new Set<string>();
    for (const c of (ownedCardsRes.data || []) as CardIdRow[]) {
      cardIds.add(c.id);
    }
    for (const c of (assignedCardsRes.data || []) as CardIdRow[]) {
      if (c.board_id && activeBoardIds.has(c.board_id)) cardIds.add(c.id);
    }
    for (const c of (createdCardsRes.data || []) as CardIdRow[]) {
      cardIds.add(c.id);
    }

    // Follow-ups assigned to this user, due today/overdue (or no date set).
    const { count: followUpCount } = await supabase
      .from('circle_leaders')
      .select('id', { count: 'exact', head: true })
      .eq('acpd', user.name)
      .eq('follow_up_required', true)
      .or(`follow_up_date.lte.${today},follow_up_date.is.null`);

    const cards = cardIds.size;
    const followUps = followUpCount || 0;
    const payload: TodayBadgeCount = { count: cards + followUps, cards, followUps };

    responseCache.set(cacheKey, { payload, cachedAt: Date.now() });

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err: unknown) {
    console.error('Today badge-count API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
