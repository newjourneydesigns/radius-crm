import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CardDigestItem, ChecklistDigestItem } from '../../../../lib/emailService';

export interface TodayCardsData {
  cards: { dueToday: CardDigestItem[]; overdue: CardDigestItem[] };
  focusCards: CardDigestItem[];
  checklistItems: { dueToday: ChecklistDigestItem[]; overdue: ChecklistDigestItem[] };
}

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
const responseCache = new Map<string, { payload: object; cachedAt: number }>();
const RESPONSE_CACHE_TTL = 60_000;

// Embedded select used for all card queries.
// Fetches labels, checklist progress, and assignees in the same round-trip as the card row —
// eliminating the separate Phase 4 enrichment queries from the old waterfall approach.
const CARD_SELECT = `
  id, title, due_date, priority, board_id, column_id,
  board_columns(id, title),
  card_label_assignments(board_labels(name, color)),
  card_checklists(is_completed),
  card_assignments(users(name))
`;

function mapCard(c: any, boardMap: Map<string, string>): CardDigestItem {
  const col = Array.isArray(c.board_columns) ? c.board_columns[0] : c.board_columns;
  const checklists = (c.card_checklists || []);
  return {
    id: c.id,
    title: c.title,
    due_date: c.due_date,
    board_name: boardMap.get(c.board_id) || 'Unknown Board',
    board_id: c.board_id || '',
    column_name: col?.title || '',
    assignees: (c.card_assignments || []).map((a: any) => a.users?.name).filter(Boolean),
    priority: c.priority,
    labels: (c.card_label_assignments || []).map((la: any) => la.board_labels).filter(Boolean),
    checklist_total: checklists.length,
    checklist_done: checklists.filter((ci: any) => ci.is_completed).length,
  };
}

async function buildCardsData(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  user: { id: string; name: string; email: string },
  today: string
): Promise<TodayCardsData> {

  // ── Phase 1: user's boards + assigned card IDs (2 parallel queries) ───────
  const [{ data: boardsRaw }, { data: assignmentRows }] = await Promise.all([
    supabase.from('project_boards').select('id, title').eq('user_id', user.id),
    supabase.from('card_assignments').select('card_id').eq('user_id', user.id),
  ]);

  const boardIds        = (boardsRaw || []).map((b: any) => b.id as string);
  const boardMap        = new Map<string, string>((boardsRaw || []).map((b: any) => [b.id, b.title as string]));
  const assignedCardIds = (assignmentRows || []).map((a: any) => a.card_id as string);

  if (boardIds.length === 0 && assignedCardIds.length === 0) {
    return { cards: { dueToday: [], overdue: [] }, focusCards: [], checklistItems: { dueToday: [], overdue: [] } };
  }

  // ── Phase 2: cards + scope for checklist lookup (4 parallel queries) ──────
  //
  // Each card query uses CARD_SELECT to embed labels, checklist counts, and
  // assignees — previously fetched in a separate sequential Phase 4.
  //
  // The fourth query gets all non-complete card IDs in the user's boards
  // so we can scope the checklist items query in Phase 3.

  const [ownedCardsRes, assignedCardsRes, focusCardsRes, allCardIdsRes] = await Promise.all([
    // Cards in user's own boards that are due/overdue
    boardIds.length > 0
      ? supabase.from('board_cards')
          .select(CARD_SELECT)
          .in('board_id', boardIds)
          .eq('is_complete', false)
          .not('due_date', 'is', null)
          .lte('due_date', today)
      : Promise.resolve({ data: [] as any[] }),

    // Cards assigned to user (may overlap with owned — deduplicated below)
    assignedCardIds.length > 0
      ? supabase.from('board_cards')
          .select(CARD_SELECT)
          .in('id', assignedCardIds)
          .eq('is_complete', false)
          .not('due_date', 'is', null)
          .lte('due_date', today)
      : Promise.resolve({ data: [] as any[] }),

    // Focus cards in user's boards (regardless of due date)
    boardIds.length > 0
      ? supabase.from('board_cards')
          .select(CARD_SELECT)
          .in('board_id', boardIds)
          .eq('is_complete', false)
          .eq('is_focused', true)
          .order('due_date', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as any[] }),

    // All incomplete card IDs in user's boards — needed to scope checklist items.
    // Lightweight: IDs only, no enrichment.
    boardIds.length > 0
      ? supabase.from('board_cards').select('id').in('board_id', boardIds).eq('is_complete', false)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // ── Phase 3: checklist items (1 query) ───────────────────────────────────
  //
  // Replaces the old Phase 5 which had its own waterfall of 3–4 sub-queries.

  const ownedCardIds    = (allCardIdsRes.data || []).map((c: any) => c.id as string);
  const allUserCardIds  = Array.from(new Set([...ownedCardIds, ...assignedCardIds]));

  const { data: checklistsRaw } = allUserCardIds.length > 0
    ? await supabase.from('card_checklists')
        .select('id, title, due_date, card_id, board_cards!inner(id, title, board_id)')
        .eq('is_completed', false)
        .not('due_date', 'is', null)
        .lte('due_date', today)
        .in('card_id', allUserCardIds)
    : { data: [] as any[] };

  // ── Build results ─────────────────────────────────────────────────────────

  // Owned cards first; assigned cards fill in any not already present
  const cardDedupe = new Map<string, CardDigestItem>();
  for (const c of (ownedCardsRes.data || []))    cardDedupe.set(c.id, mapCard(c, boardMap));
  for (const c of (assignedCardsRes.data || [])) if (!cardDedupe.has(c.id)) cardDedupe.set(c.id, mapCard(c, boardMap));
  const allCards = Array.from(cardDedupe.values());

  const focusDedupe = new Map<string, CardDigestItem>();
  for (const c of (focusCardsRes.data || [])) focusDedupe.set(c.id, mapCard(c, boardMap));
  const focusCards = Array.from(focusDedupe.values());

  const allChecklist: ChecklistDigestItem[] = (checklistsRaw || []).map((cl: any) => {
    const card   = Array.isArray(cl.board_cards) ? cl.board_cards[0] : cl.board_cards;
    const boardId = card?.board_id || '';
    return {
      id:         cl.id,
      text:       cl.title,
      due_date:   cl.due_date,
      card_title: card?.title || 'Unknown Card',
      card_id:    cl.card_id,
      board_name: boardMap.get(boardId) || 'Unknown Board',
      board_id:   boardId,
    };
  });

  return {
    cards: {
      dueToday: allCards.filter(c => c.due_date === today),
      overdue:  allCards.filter(c => c.due_date != null && c.due_date < today),
    },
    focusCards,
    checklistItems: {
      dueToday: allChecklist.filter(c => c.due_date === today),
      overdue:  allChecklist.filter(c => c.due_date != null && c.due_date < today),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase        = getSupabaseServiceClient();
    const anonClient      = createClient(supabaseUrl, supabaseAnonKey);
    const today           = getTodayDate();

    const optimisticId = extractSubFromToken(token);

    const [authResult, profileResult] = await Promise.all([
      anonClient.auth.getUser(token),
      optimisticId
        ? supabase.from('users').select('id, name, email').eq('id', optimisticId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!authResult.data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userProfile = profileResult.data;
    if (!userProfile || userProfile.id !== authResult.data.user.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const cached = responseCache.get(`cards:${userProfile.id}`);
    if (cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL) {
      return NextResponse.json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
    }

    const user    = { id: userProfile.id, name: userProfile.name, email: userProfile.email };
    const payload = await buildCardsData(supabase, user, today);

    responseCache.set(`cards:${userProfile.id}`, { payload, cachedAt: Date.now() });

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('Today cards API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
