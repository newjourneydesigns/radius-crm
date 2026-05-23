'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const BIG_THREE_LABEL = 'Big 3';
const BIG_THREE_LABEL_COLOR = '#f59e0b';
const LAST_BOARD_KEY = 'today_big_three_last_board_id';
const CARD_SELECT = `
  id,
  title,
  due_date,
  priority,
  is_complete,
  board_id,
  column_id,
  board_columns(title),
  card_label_assignments(board_labels(name, color)),
  card_checklists(is_completed),
  card_assignments(users(name))
`;

export interface BigThreeBoard {
  id: string;
  title: string;
}

export interface BigThreeCard {
  id: string;
  title: string;
  due_date: string | null;
  board_id: string;
  board_name: string;
  column_name: string;
  priority?: string;
  is_complete: boolean;
  labels: { name: string; color: string }[];
  assignees: string[];
  checklist_total: number;
  checklist_done: number;
}

export interface BigThreeSlot {
  slotNumber: 1 | 2 | 3;
  card: BigThreeCard | null;
}

interface RawBigThreeCard {
  id: string;
  title: string;
  due_date: string | null;
  board_id: string;
  priority?: string | null;
  is_complete?: boolean | null;
  board_columns?: { title?: string | null } | { title?: string | null }[] | null;
  card_label_assignments?: { board_labels?: { name: string; color: string } | null }[];
  card_checklists?: { is_completed?: boolean | null }[];
  card_assignments?: { users?: { name?: string | null } | null }[];
}

interface BigThreeSlotRow {
  slot_number: number;
  board_cards?: RawBigThreeCard | RawBigThreeCard[] | null;
}

const EMPTY_SLOTS: BigThreeSlot[] = [
  { slotNumber: 1, card: null },
  { slotNumber: 2, card: null },
  { slotNumber: 3, card: null },
];

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function mapCard(raw: RawBigThreeCard | null | undefined, boardMap: Map<string, string>): BigThreeCard | null {
  if (!raw) return null;
  const col = Array.isArray(raw.board_columns) ? raw.board_columns[0] : raw.board_columns;
  const checklists = raw.card_checklists || [];

  return {
    id: raw.id,
    title: raw.title,
    due_date: raw.due_date,
    board_id: raw.board_id,
    board_name: boardMap.get(raw.board_id) || 'Unknown Board',
    column_name: col?.title || '',
    priority: raw.priority || undefined,
    is_complete: Boolean(raw.is_complete),
    labels: (raw.card_label_assignments || []).map(la => la.board_labels).filter((label): label is { name: string; color: string } => Boolean(label)),
    assignees: (raw.card_assignments || []).map(a => a.users?.name).filter((name): name is string => Boolean(name)),
    checklist_total: checklists.length,
    checklist_done: checklists.filter(ci => ci.is_completed).length,
  };
}

export function useBigThree() {
  const [slots, setSlots] = useState<BigThreeSlot[]>(EMPTY_SLOTS);
  const [boards, setBoards] = useState<BigThreeBoard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSlots(EMPTY_SLOTS);
        setBoards([]);
        return;
      }

      const [boardsRes, slotsRes] = await Promise.all([
        supabase
          .from('project_boards')
          .select('id, title')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .order('title'),
        supabase
          .from('today_big_three_slots')
          .select(`
            slot_number,
            card_id,
            board_cards(
              id,
              title,
              due_date,
              priority,
              is_complete,
              board_id,
              column_id,
              board_columns(title),
              card_label_assignments(board_labels(name, color)),
              card_checklists(is_completed),
              card_assignments(users(name))
            )
          `)
          .eq('user_id', user.id)
          .in('slot_number', [1, 2, 3]),
      ]);

      if (boardsRes.error) throw boardsRes.error;
      if (slotsRes.error) throw slotsRes.error;

      const boardList = (boardsRes.data || []) as BigThreeBoard[];
      const boardMap = new Map(boardList.map(board => [board.id, board.title]));
      const slotMap = new Map<number, BigThreeCard | null>();

      const slotRows = (slotsRes.data || []) as unknown as BigThreeSlotRow[];
      for (const row of slotRows) {
        const cardRaw = Array.isArray(row.board_cards) ? row.board_cards[0] : row.board_cards;
        slotMap.set(row.slot_number, mapCard(cardRaw, boardMap));
      }

      setBoards(boardList);
      setSlots(EMPTY_SLOTS.map(slot => ({
        ...slot,
        card: slotMap.get(slot.slotNumber) ?? null,
      })));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load Big 3.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ensureBigThreeLabel = useCallback(async (boardId: string) => {
    const { data: existingLabels, error: labelLookupError } = await supabase
      .from('board_labels')
      .select('id')
      .eq('board_id', boardId)
      .ilike('name', BIG_THREE_LABEL)
      .limit(1);
    if (labelLookupError) throw labelLookupError;

    const existingLabelId = existingLabels?.[0]?.id;
    if (existingLabelId) return existingLabelId as string;

    const { data: label, error: labelCreateError } = await supabase
      .from('board_labels')
      .insert({ board_id: boardId, name: BIG_THREE_LABEL, color: BIG_THREE_LABEL_COLOR })
      .select('id')
      .single();
    if (labelCreateError) throw labelCreateError;
    return label.id as string;
  }, []);

  const assignLabelToCard = useCallback(async (cardId: string, labelId: string) => {
    const { error: labelAssignError } = await supabase
      .from('card_label_assignments')
      .upsert({ card_id: cardId, label_id: labelId }, { onConflict: 'card_id,label_id' });
    if (labelAssignError) throw labelAssignError;
  }, []);

  const assignCardToSlot = useCallback(async (slotNumber: 1 | 2 | 3, cardId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error: slotError } = await supabase
      .from('today_big_three_slots')
      .upsert({
        user_id: user.id,
        slot_number: slotNumber,
        card_id: cardId,
        assigned_at: new Date().toISOString(),
      }, { onConflict: 'user_id,slot_number' });
    if (slotError) throw slotError;
  }, []);

  const createCard = useCallback(async (slotNumber: 1 | 2 | 3, title: string, boardId: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Enter a task title.');
      return false;
    }
    if (!boardId) {
      setError('Select a board.');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: columns, error: columnsError } = await supabase
        .from('board_columns')
        .select('id')
        .eq('board_id', boardId)
        .order('position')
        .limit(1);
      if (columnsError) throw columnsError;
      const columnId = columns?.[0]?.id;
      if (!columnId) throw new Error('Selected board has no columns.');

      const { data: latestCard, error: positionError } = await supabase
        .from('board_cards')
        .select('position')
        .eq('column_id', columnId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (positionError) throw positionError;

      const { data: card, error: cardError } = await supabase
        .from('board_cards')
        .insert({
          title: cleanTitle,
          board_id: boardId,
          column_id: columnId,
          priority: 'medium',
          position: (latestCard?.position ?? -1) + 1,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (cardError) throw cardError;

      const labelId = await ensureBigThreeLabel(boardId);
      await assignLabelToCard(card.id, labelId);
      await assignCardToSlot(slotNumber, card.id);

      try { localStorage.setItem(LAST_BOARD_KEY, boardId); } catch {}
      await load();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create Big 3 card.'));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [assignCardToSlot, assignLabelToCard, ensureBigThreeLabel, load]);

  const searchExistingCards = useCallback(async (query: string) => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: boardRows, error: boardsError } = await supabase
        .from('project_boards')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('is_archived', false);
      if (boardsError) throw boardsError;

      const boardList = (boardRows || []) as BigThreeBoard[];
      const boardIds = boardList.map(board => board.id);
      if (boardIds.length === 0) return [];

      const { data: cardRows, error: cardsError } = await supabase
        .from('board_cards')
        .select(CARD_SELECT)
        .in('board_id', boardIds)
        .eq('is_archived', false)
        .ilike('title', `%${cleanQuery}%`)
        .order('updated_at', { ascending: false })
        .limit(8);
      if (cardsError) throw cardsError;

      const boardMap = new Map(boardList.map(board => [board.id, board.title]));
      return ((cardRows || []) as unknown as RawBigThreeCard[])
        .map(card => mapCard(card, boardMap))
        .filter((card): card is BigThreeCard => Boolean(card));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to search cards.'));
      return [];
    }
  }, []);

  const assignExistingCard = useCallback(async (slotNumber: 1 | 2 | 3, card: BigThreeCard) => {
    setIsSaving(true);
    setError(null);

    try {
      const labelId = await ensureBigThreeLabel(card.board_id);
      await assignLabelToCard(card.id, labelId);
      await assignCardToSlot(slotNumber, card.id);
      try { localStorage.setItem(LAST_BOARD_KEY, card.board_id); } catch {}
      await load();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to add existing card to Big 3.'));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [assignCardToSlot, assignLabelToCard, ensureBigThreeLabel, load]);

  const markDone = useCallback(async (cardId: string) => {
    setSlots(prev => prev.map(slot => slot.card?.id === cardId
      ? { ...slot, card: { ...slot.card, is_complete: true } }
      : slot
    ));

    const { error: updateError } = await supabase
      .from('board_cards')
      .update({ is_complete: true })
      .eq('id', cardId);

    if (updateError) {
      setError(updateError.message);
      await load();
    }
  }, [load]);

  const clearSlot = useCallback(async (slotNumber: 1 | 2 | 3) => {
    setSlots(prev => prev.map(slot => slot.slotNumber === slotNumber ? { ...slot, card: null } : slot));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: clearError } = await supabase
      .from('today_big_three_slots')
      .delete()
      .eq('user_id', user.id)
      .eq('slot_number', slotNumber);

    if (clearError) {
      setError(clearError.message);
      await load();
    }
  }, [load]);

  return {
    slots,
    boards,
    isLoading,
    isSaving,
    error,
    load,
    createCard,
    searchExistingCards,
    assignExistingCard,
    markDone,
    clearSlot,
  };
}
