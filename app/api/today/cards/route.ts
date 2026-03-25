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

async function buildCardsData(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  user: { id: string; name: string; email: string },
  today: string
): Promise<TodayCardsData> {
  // ── Phase 1: board IDs + assigned card IDs ────────────────────────────────
  const [{ data: userBoards }, { data: assignmentRows }] = await Promise.all([
    supabase.from('project_boards').select('id, title').eq('user_id', user.id),
    supabase.from('card_assignments').select('card_id').eq('user_id', user.id),
  ]);

  const boardMap = new Map<string, string>();
  (userBoards || []).forEach((b: any) => boardMap.set(b.id, b.title));
  const boardIds        = Array.from(boardMap.keys());
  const assignedCardIds = (assignmentRows || []).map((a: any) => a.card_id);

  // ── Phase 2: board columns + assigned card rows + focused cards ───────────
  const [{ data: colsData }, { data: assignedCardsRaw }, { data: focusCardsRaw }] = await Promise.all([
    boardIds.length > 0
      ? supabase.from('board_columns').select('id, title, board_id').in('board_id', boardIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    assignedCardIds.length > 0
      ? supabase.from('board_cards')
          .select('id, title, due_date, is_complete, column_id, priority')
          .in('id', assignedCardIds)
          .not('due_date', 'is', null).lte('due_date', today).eq('is_complete', false)
      : Promise.resolve({ data: [] as any[], error: null }),
    boardIds.length > 0
      ? supabase.from('board_cards')
          .select('id, title, due_date, board_id, column_id, priority')
          .in('board_id', boardIds)
          .eq('is_focused', true)
          .eq('is_complete', false)
          .order('due_date', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const colMap = new Map<string, { title: string; board_id: string }>();
  (colsData || []).forEach((c: any) => colMap.set(c.id, { title: c.title, board_id: c.board_id }));
  const colIds = Array.from(colMap.keys());

  // ── Phase 3: owned cards + extra cols for assigned cards ──────────────────
  const missingColIds = (assignedCardsRaw || [])
    .filter((c: any) => !colMap.has(c.column_id)).map((c: any) => c.column_id);

  const [{ data: ownedCardsRaw }, { data: extraColsData }] = await Promise.all([
    colIds.length > 0
      ? supabase.from('board_cards')
          .select('id, title, due_date, is_complete, column_id, priority')
          .in('column_id', colIds)
          .not('due_date', 'is', null).lte('due_date', today).eq('is_complete', false)
      : Promise.resolve({ data: [] as any[], error: null }),
    missingColIds.length > 0
      ? supabase.from('board_columns').select('id, title, board_id').in('id', missingColIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const extraBoardIds1 = new Set<string>();
  (extraColsData || []).forEach((c: any) => {
    colMap.set(c.id, { title: c.title, board_id: c.board_id });
    if (!boardMap.has(c.board_id)) extraBoardIds1.add(c.board_id);
  });
  if (extraBoardIds1.size > 0) {
    const { data: extraBoards } = await supabase.from('project_boards').select('id, title').in('id', Array.from(extraBoardIds1));
    (extraBoards || []).forEach((b: any) => boardMap.set(b.id, b.title));
  }

  const cardDedupe = new Map<string, any>();
  [...(ownedCardsRaw || []), ...(assignedCardsRaw || [])].forEach((c: any) => {
    if (!cardDedupe.has(c.id)) cardDedupe.set(c.id, c);
  });
  const cardIds = Array.from(cardDedupe.keys());

  // ── Phase 4: assignee names + labels + checklist counts + all board card IDs
  const focusCardIds   = (focusCardsRaw || []).map((c: any) => c.id);
  const allEnrichedIds = Array.from(new Set([...cardIds, ...focusCardIds]));

  const [{ data: assignmentNames }, { data: allBoardCardIds }, { data: labelRows }, { data: checklistRows }] = await Promise.all([
    cardIds.length > 0
      ? supabase.from('card_assignments').select('card_id, users!inner(name)').in('card_id', cardIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    colIds.length > 0
      ? supabase.from('board_cards').select('id').in('column_id', colIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    allEnrichedIds.length > 0
      ? supabase.from('card_label_assignments')
          .select('card_id, board_labels(name, color)')
          .in('card_id', allEnrichedIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    allEnrichedIds.length > 0
      ? supabase.from('card_checklists')
          .select('card_id, is_completed')
          .in('card_id', allEnrichedIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const assigneeMap: Record<string, string[]> = {};
  (assignmentNames || []).forEach((a: any) => {
    if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
    if (a.users?.name) assigneeMap[a.card_id].push(a.users.name);
  });

  const labelMap: Record<string, { name: string; color: string }[]> = {};
  (labelRows || []).forEach((r: any) => {
    if (!labelMap[r.card_id]) labelMap[r.card_id] = [];
    if (r.board_labels) labelMap[r.card_id].push(r.board_labels);
  });

  const checklistTotalMap: Record<string, number> = {};
  const checklistDoneMap:  Record<string, number> = {};
  (checklistRows || []).forEach((r: any) => {
    checklistTotalMap[r.card_id] = (checklistTotalMap[r.card_id] || 0) + 1;
    if (r.is_completed) checklistDoneMap[r.card_id] = (checklistDoneMap[r.card_id] || 0) + 1;
  });

  const allCards: CardDigestItem[] = Array.from(cardDedupe.values()).map((c: any) => {
    const col = colMap.get(c.column_id);
    return {
      id: c.id, title: c.title, due_date: c.due_date,
      board_name: col ? (boardMap.get(col.board_id) || 'Unknown Board') : 'Unknown Board',
      board_id: col?.board_id || '', column_name: col?.title || '',
      assignees: assigneeMap[c.id] || [],
      priority: c.priority,
      labels: labelMap[c.id] || [],
      checklist_total: checklistTotalMap[c.id] || 0,
      checklist_done: checklistDoneMap[c.id] || 0,
    };
  });

  const focusCards: CardDigestItem[] = (focusCardsRaw || []).map((c: any) => ({
    id: c.id, title: c.title, due_date: c.due_date,
    board_name: boardMap.get(c.board_id) || 'Unknown Board',
    board_id: c.board_id,
    column_name: colMap.get(c.column_id)?.title || '',
    assignees: assigneeMap[c.id] || [],
    priority: c.priority,
    labels: labelMap[c.id] || [],
    checklist_total: checklistTotalMap[c.id] || 0,
    checklist_done: checklistDoneMap[c.id] || 0,
  }));

  // ── Phase 5: checklist items ──────────────────────────────────────────────
  const userCardIds = new Set<string>(cardDedupe.keys());
  (allBoardCardIds || []).forEach((c: any) => userCardIds.add(c.id));
  assignedCardIds.forEach((id: string) => userCardIds.add(id));

  let allChecklist: ChecklistDigestItem[] = [];
  if (userCardIds.size > 0) {
    const { data: checklists } = await supabase.from('card_checklists')
      .select('id, title, due_date, is_completed, card_id')
      .eq('is_completed', false).not('due_date', 'is', null).lte('due_date', today)
      .in('card_id', Array.from(userCardIds));

    const clCardIds = Array.from(new Set((checklists || []).map((cl: any) => cl.card_id)));
    if (clCardIds.length > 0) {
      const { data: cardInfos } = await supabase.from('board_cards')
        .select('id, title, column_id').in('id', clCardIds);

      const cardInfoMap = new Map<string, { title: string; column_id: string }>();
      (cardInfos || []).forEach((ci: any) => cardInfoMap.set(ci.id, { title: ci.title, column_id: ci.column_id }));

      const missingClCols = (cardInfos || []).filter((ci: any) => !colMap.has(ci.column_id)).map((ci: any) => ci.column_id);
      if (missingClCols.length > 0) {
        const { data: extraCols } = await supabase.from('board_columns').select('id, title, board_id').in('id', missingClCols);
        const extraBIds = new Set<string>();
        (extraCols || []).forEach((c: any) => {
          colMap.set(c.id, { title: c.title, board_id: c.board_id });
          if (!boardMap.has(c.board_id)) extraBIds.add(c.board_id);
        });
        if (extraBIds.size > 0) {
          const { data: extraBoards } = await supabase.from('project_boards').select('id, title').in('id', Array.from(extraBIds));
          (extraBoards || []).forEach((b: any) => boardMap.set(b.id, b.title));
        }
      }

      allChecklist = (checklists || []).map((cl: any): ChecklistDigestItem => {
        const info = cardInfoMap.get(cl.card_id);
        const col  = info ? colMap.get(info.column_id) : undefined;
        return {
          id: cl.id, text: cl.title, due_date: cl.due_date,
          card_title: info?.title || 'Unknown Card', card_id: cl.card_id,
          board_name: col ? (boardMap.get(col.board_id) || 'Unknown Board') : 'Unknown Board',
          board_id: col?.board_id || '',
        };
      });
    }
  }

  return {
    cards: {
      dueToday: allCards.filter(c => c.due_date === today),
      overdue:  allCards.filter(c => c.due_date !== null && c.due_date! < today),
    },
    focusCards,
    checklistItems: {
      dueToday: allChecklist.filter(c => c.due_date === today),
      overdue:  allChecklist.filter(c => c.due_date !== null && c.due_date! < today),
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

    const user = { id: userProfile.id, name: userProfile.name, email: userProfile.email };
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
