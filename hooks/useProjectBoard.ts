'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { nextDueDate, nextDueDateForDays, type TodoRepeatRule } from '../lib/todoRecurrence';
import type {
  ProjectBoard,
  BoardColumn,
  BoardCard,
  BoardLabel,
  CardComment,
  CardChecklist,
  CardPriority,
  ChecklistTemplate,
  CardAssignment,
} from '../lib/supabase';

// ── Full board shape ──
export interface FullBoard extends ProjectBoard {
  columns: BoardColumn[];
  cards: BoardCard[];
  labels: BoardLabel[];
}

// ── Default columns & labels for new boards ──
const DEFAULT_COLUMNS = [
  { title: 'To Do', position: 0, color: '#6366f1' },
  { title: 'In Progress', position: 1, color: '#f59e0b' },
  { title: 'Review', position: 2, color: '#8b5cf6' },
  { title: 'Done', position: 3, color: '#22c55e' },
];

const DEFAULT_LABELS = [
  { name: 'Bug', color: '#ef4444' },
  { name: 'Feature', color: '#3b82f6' },
  { name: 'Enhancement', color: '#8b5cf6' },
  { name: 'Urgent', color: '#f97316' },
];

// ── Hook ──
export function useProjectBoard() {
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [board, setBoard] = useState<FullBoard | null>(null);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Board list ────────────────────────────────────────────
  const fetchBoards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // RLS policies handle visibility (own boards + public boards)
      const { data, error: err } = await supabase
        .from('project_boards')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setBoards(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createBoard = useCallback(async (title: string, description?: string) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create board
      const { data: boardData, error: boardErr } = await supabase
        .from('project_boards')
        .insert([{ title: title.trim(), description: description?.trim() || null, user_id: user.id }])
        .select()
        .single();
      if (boardErr) throw boardErr;

      // Create default columns
      const cols = DEFAULT_COLUMNS.map(c => ({ ...c, board_id: boardData.id }));
      await supabase.from('board_columns').insert(cols);

      // Create default labels
      const labels = DEFAULT_LABELS.map(l => ({ ...l, board_id: boardData.id }));
      await supabase.from('board_labels').insert(labels);

      setBoards(prev => [boardData, ...prev]);
      return boardData as ProjectBoard;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  // ─── Single board ──────────────────────────────────────────
  const fetchBoard = useCallback(async (boardId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch board, columns, cards, labels in parallel (scoped to board)
      const [boardRes, colsRes, cardsRes, labelsRes] = await Promise.all([
        supabase.from('project_boards').select('*').eq('id', boardId).single(),
        supabase.from('board_columns').select('*').eq('board_id', boardId).order('position'),
        supabase.from('board_cards').select('*').eq('board_id', boardId).eq('is_archived', false).order('position'),
        supabase.from('board_labels').select('*').eq('board_id', boardId),
      ]);

      if (boardRes.error) throw boardRes.error;

      const columns = colsRes.data || [];
      const cardIds = (cardsRes.data || []).map(c => c.id);
      const labels = labelsRes.data || [];

      // Fetch child data scoped to this board's cards
      let allComments: any[] = [];
      let allChecklists: any[] = [];
      let allLabelAssignments: any[] = [];
      let allCardAssignments: any[] = [];

      if (cardIds.length > 0) {
        const [commentsRes, checklistsRes, labelAssignmentsRes, cardAssignmentsRes] = await Promise.all([
          supabase.from('card_comments').select('*').in('card_id', cardIds).order('created_at', { ascending: true }),
          supabase.from('card_checklists').select('*').in('card_id', cardIds).order('position'),
          supabase.from('card_label_assignments').select('*').in('card_id', cardIds),
          supabase.from('card_assignments').select('*').in('card_id', cardIds),
        ]);
        const rawComments = commentsRes.data || [];
        if (rawComments.length > 0) {
          const commentUserIds = [...new Set(rawComments.map((c: any) => c.user_id))];
          const { data: commentUsersData } = await supabase.from('users').select('id, name').in('id', commentUserIds);
          const commentUsersMap = new Map((commentUsersData || []).map((u: any) => [u.id, { name: u.name }]));
          allComments = rawComments.map((c: any) => ({ ...c, users: commentUsersMap.get(c.user_id) || null }));
        } else {
          allComments = rawComments;
        }
        allChecklists = checklistsRes.data || [];
        allLabelAssignments = labelAssignmentsRes.data || [];
        // Enrich assignments with user data from public.users
        const rawAssignments = cardAssignmentsRes.data || [];
        if (rawAssignments.length > 0) {
          const userIds = [...new Set(rawAssignments.map((a: any) => a.user_id))];
          const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', userIds);
          const usersMap = new Map((usersData || []).map((u: any) => [u.id, { name: u.name, email: u.email }]));
          allCardAssignments = rawAssignments.map((a: any) => ({ ...a, users: usersMap.get(a.user_id) || null }));
        }
      }

      // Stitch comments, checklists, labels, assignments onto cards
      const cards = (cardsRes.data || []).map(card => ({
        ...card,
        comments: allComments.filter(cm => cm.card_id === card.id),
        checklists: allChecklists.filter(cl => cl.card_id === card.id),
        labels: allLabelAssignments
          .filter(a => a.card_id === card.id)
          .map(a => labels.find(l => l.id === a.label_id))
          .filter(Boolean),
        assignments: allCardAssignments.filter(a => a.card_id === card.id),
      }));

      const fullBoard: FullBoard = { ...boardRes.data, columns, cards, labels };
      setBoard(fullBoard);
      return fullBoard;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Bulk fetch all boards with full data (for calendar) ──
  const fetchAllBoardsFull = useCallback(async (): Promise<FullBoard[]> => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch all tables in parallel — one query per table
      const [boardsRes, colsRes, cardsRes, labelsRes, commentsRes, checklistsRes, labelAssignmentsRes, cardAssignmentsRes] = await Promise.all([
        supabase.from('project_boards').select('*').eq('is_archived', false).order('created_at', { ascending: false }),
        supabase.from('board_columns').select('*').order('position'),
        supabase.from('board_cards').select('*').eq('is_archived', false).order('position'),
        supabase.from('board_labels').select('*'),
        supabase.from('card_comments').select('*').order('created_at', { ascending: true }),
        supabase.from('card_checklists').select('*').order('position'),
        supabase.from('card_label_assignments').select('*'),
        supabase.from('card_assignments').select('*'),
      ]);

      const allBoards = boardsRes.data || [];
      const allColumns = colsRes.data || [];
      const allCards = cardsRes.data || [];
      const allLabels = labelsRes.data || [];
      const rawAllComments = commentsRes.data || [];
      let allComments: any[] = rawAllComments;
      if (rawAllComments.length > 0) {
        const commentUserIds = [...new Set(rawAllComments.map((c: any) => c.user_id))];
        const { data: commentUsersData } = await supabase.from('users').select('id, name').in('id', commentUserIds);
        const commentUsersMap = new Map((commentUsersData || []).map((u: any) => [u.id, { name: u.name }]));
        allComments = rawAllComments.map((c: any) => ({ ...c, users: commentUsersMap.get(c.user_id) || null }));
      }
      const allChecklists = checklistsRes.data || [];
      const allLabelAssignments = labelAssignmentsRes.data || [];
      // Enrich assignments with user data from public.users
      const rawCardAssignments = cardAssignmentsRes.data || [];
      let allCardAssignments: any[] = rawCardAssignments;
      if (rawCardAssignments.length > 0) {
        const userIds = [...new Set(rawCardAssignments.map((a: any) => a.user_id))];
        const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', userIds);
        const usersMap = new Map((usersData || []).map((u: any) => [u.id, { name: u.name, email: u.email }]));
        allCardAssignments = rawCardAssignments.map((a: any) => ({ ...a, users: usersMap.get(a.user_id) || null }));
      }

      // Group child data by board/card for fast lookup
      const colsByBoard = new Map<string, typeof allColumns>();
      for (const col of allColumns) {
        const arr = colsByBoard.get(col.board_id) || [];
        arr.push(col);
        colsByBoard.set(col.board_id, arr);
      }

      const labelsByBoard = new Map<string, typeof allLabels>();
      for (const label of allLabels) {
        const arr = labelsByBoard.get(label.board_id) || [];
        arr.push(label);
        labelsByBoard.set(label.board_id, arr);
      }

      const commentsByCard = new Map<string, typeof allComments>();
      for (const cm of allComments) {
        const arr = commentsByCard.get(cm.card_id) || [];
        arr.push(cm);
        commentsByCard.set(cm.card_id, arr);
      }

      const checklistsByCard = new Map<string, typeof allChecklists>();
      for (const cl of allChecklists) {
        const arr = checklistsByCard.get(cl.card_id) || [];
        arr.push(cl);
        checklistsByCard.set(cl.card_id, arr);
      }

      const assignmentsByCard = new Map<string, typeof allLabelAssignments>();
      for (const a of allLabelAssignments) {
        const arr = assignmentsByCard.get(a.card_id) || [];
        arr.push(a);
        assignmentsByCard.set(a.card_id, arr);
      }

      const cardAssignmentsByCard = new Map<string, typeof allCardAssignments>();
      for (const a of allCardAssignments) {
        const arr = cardAssignmentsByCard.get(a.card_id) || [];
        arr.push(a);
        cardAssignmentsByCard.set(a.card_id, arr);
      }

      // Assemble full boards
      const results: FullBoard[] = allBoards.map(b => {
        const boardLabels = labelsByBoard.get(b.id) || [];
        const boardCards = allCards
          .filter(c => c.board_id === b.id)
          .map(card => ({
            ...card,
            comments: commentsByCard.get(card.id) || [],
            checklists: checklistsByCard.get(card.id) || [],
            labels: (assignmentsByCard.get(card.id) || [])
              .map(a => boardLabels.find(l => l.id === a.label_id))
              .filter(Boolean),
            assignments: cardAssignmentsByCard.get(card.id) || [],
          }));

        return {
          ...b,
          columns: colsByBoard.get(b.id) || [],
          cards: boardCards,
          labels: boardLabels,
        };
      });

      setBoards(allBoards);
      return results;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  const updateBoard = useCallback(async (boardId: string, updates: Partial<ProjectBoard>) => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('project_boards')
        .update(updates)
        .eq('id', boardId)
        .select()
        .single();
      if (err) throw err;
      setBoard(prev => prev ? { ...prev, ...data } : prev);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const deleteBoard = useCallback(async (boardId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('project_boards')
        .delete()
        .eq('id', boardId);
      if (err) throw err;
      setBoards(prev => prev.filter(b => b.id !== boardId));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  // ─── Columns ───────────────────────────────────────────────
  const addColumn = useCallback(async (boardId: string, title: string, color?: string) => {
    setError(null);
    try {
      // Determine next position
      const maxPos = board?.columns.reduce((m, c) => Math.max(m, c.position), -1) ?? -1;
      const { data, error: err } = await supabase
        .from('board_columns')
        .insert([{ board_id: boardId, title, position: maxPos + 1, color: color || '#6366f1' }])
        .select()
        .single();
      if (err) throw err;
      setBoard(prev => prev ? { ...prev, columns: [...prev.columns, data] } : prev);
      return data as BoardColumn;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [board?.columns]);

  const updateColumn = useCallback(async (boardId: string, colId: string, updates: Partial<BoardColumn>) => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('board_columns')
        .update(updates)
        .eq('id', colId)
        .select()
        .single();
      if (err) throw err;
      setBoard(prev => prev ? {
        ...prev,
        columns: prev.columns.map(c => c.id === colId ? { ...c, ...data } : c),
      } : prev);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const deleteColumn = useCallback(async (boardId: string, colId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('board_columns')
        .delete()
        .eq('id', colId);
      if (err) throw err;
      setBoard(prev => prev ? {
        ...prev,
        columns: prev.columns.filter(c => c.id !== colId),
        cards: prev.cards.filter(c => c.column_id !== colId),
      } : prev);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const reorderColumns = useCallback(async (boardId: string, columnOrder: { id: string; position: number }[]) => {
    setError(null);
    // Optimistic update
    setBoard(prev => {
      if (!prev) return prev;
      const updated = prev.columns.map(c => {
        const order = columnOrder.find(o => o.id === c.id);
        return order ? { ...c, position: order.position } : c;
      });
      updated.sort((a, b) => a.position - b.position);
      return { ...prev, columns: updated };
    });
    try {
      // Batch update positions
      await Promise.all(
        columnOrder.map(({ id, position }) =>
          supabase.from('board_columns').update({ position }).eq('id', id)
        )
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ─── Cards ─────────────────────────────────────────────────
  const addCard = useCallback(async (boardId: string, data: {
    column_id: string;
    title: string;
    description?: string;
    priority?: CardPriority;
    start_date?: string;
    due_date?: string;
    assignee?: string;
    label_ids?: string[];
  }) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Determine next position in column
      const colCards = board?.cards.filter(c => c.column_id === data.column_id) || [];
      const maxPos = colCards.reduce((m, c) => Math.max(m, c.position), -1);

      const { label_ids, ...cardFields } = data;
      const { data: card, error: err } = await supabase
        .from('board_cards')
        .insert([{
          ...cardFields,
          board_id: boardId,
          position: maxPos + 1,
          created_by: user?.id || null,
        }])
        .select()
        .single();
      if (err) throw err;

      // Assign labels if provided
      if (label_ids?.length) {
        const assignments = label_ids.map(lid => ({ card_id: card.id, label_id: lid }));
        await supabase.from('card_label_assignments').insert(assignments);
      }

      // Build full card locally
      const labelObjs = (board?.labels || []).filter(l => label_ids?.includes(l.id));
      const fullCard = { ...card, labels: labelObjs, comments: [], checklists: [] };
      setBoard(prev => prev ? { ...prev, cards: [...prev.cards, fullCard] } : prev);
      return fullCard as BoardCard;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [board?.cards, board?.labels]);

  const updateCard = useCallback(async (boardId: string, cardId: string, updates: any) => {
    setError(null);
    try {
      const { label_ids, ...cardUpdates } = updates;

      // Update card fields if any
      let cardData: any = {};
      if (Object.keys(cardUpdates).length > 0) {
        const { data, error: err } = await supabase
          .from('board_cards')
          .update(cardUpdates)
          .eq('id', cardId)
          .select()
          .single();
        if (err) throw err;
        cardData = data;
      }

      // Update label assignments if provided
      if (label_ids !== undefined) {
        // Remove existing assignments
        await supabase.from('card_label_assignments').delete().eq('card_id', cardId);
        // Add new ones
        if (label_ids.length > 0) {
          const assignments = label_ids.map((lid: string) => ({ card_id: cardId, label_id: lid }));
          await supabase.from('card_label_assignments').insert(assignments);
        }
      }

      setBoard(prev => {
        if (!prev) return prev;
        let updatedLabels: BoardLabel[] | undefined;
        if (label_ids !== undefined) {
          updatedLabels = prev.labels.filter(l => label_ids.includes(l.id));
        }
        return {
          ...prev,
          cards: prev.cards.map(c => {
            if (c.id !== cardId) return c;
            return {
              ...c,
              ...cardData,
              labels: updatedLabels !== undefined ? updatedLabels : c.labels,
              comments: c.comments,
              checklists: c.checklists,
            };
          }),
        };
      });
      return cardData;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const deleteCard = useCallback(async (boardId: string, cardId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('board_cards')
        .delete()
        .eq('id', cardId);
      if (err) throw err;
      setBoard(prev => prev ? { ...prev, cards: prev.cards.filter(c => c.id !== cardId) } : prev);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  // ── Create next occurrence for repeating card ─────────────
  const createNextRepeatCard = useCallback(async (card: BoardCard, firstColumnId: string) => {
    const rule = card.repeat_rule as Exclude<TodoRepeatRule, 'none'> | undefined;
    if (!rule || rule === 'none') return null;

    const baseDate = card.due_date || card.start_date;
    if (!baseDate) return null;

    const interval = card.repeat_interval || 1;
    const days = card.repeat_days;

    // Use day-of-week aware helper for daily + specific days selected
    const calcNext = (iso: string) =>
      rule === 'daily' && days?.length
        ? nextDueDateForDays(iso, days)
        : nextDueDate(iso, rule, interval);

    const newDueDate = calcNext(baseDate);

    // If both start & due, shift start by the same delta
    let newStartDate: string | null = null;
    if (card.start_date && card.due_date) {
      newStartDate = calcNext(card.start_date);
    } else if (card.start_date) {
      newStartDate = newDueDate;
    }

    const seriesId = card.series_id || card.id;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Find highest position in destination column
      const { data: colCards } = await supabase
        .from('board_cards')
        .select('position')
        .eq('column_id', firstColumnId)
        .eq('is_archived', false)
        .order('position', { ascending: false })
        .limit(1);
      const maxPos = colCards?.[0]?.position ?? -1;

      const { data: newCard, error: err } = await supabase
        .from('board_cards')
        .insert([{
          board_id: card.board_id,
          column_id: firstColumnId,
          title: card.title,
          description: card.description || null,
          priority: card.priority,
          start_date: newStartDate,
          due_date: newDueDate,
          assignee: card.assignee || null,
          created_by: user?.id || null,
          position: maxPos + 1,
          repeat_rule: card.repeat_rule,
          repeat_interval: card.repeat_interval,
          repeat_days: card.repeat_days || null,
          series_id: seriesId,
          is_series_master: false,
        }])
        .select()
        .single();
      if (err) throw err;

      // Copy label assignments
      if (card.labels?.length) {
        const assignments = card.labels.map(l => ({ card_id: newCard.id, label_id: l.id }));
        await supabase.from('card_label_assignments').insert(assignments);
      }

      // Add to board state
      const fullCard = { ...newCard, labels: card.labels || [], comments: [], checklists: [] };
      setBoard(prev => prev ? { ...prev, cards: [...prev.cards, fullCard] } : prev);
      return fullCard as BoardCard;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const moveCard = useCallback(async (boardId: string, cardId: string, newColumnId: string, newPosition: number) => {
    setError(null);
    // Optimistic
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map(c =>
          c.id === cardId ? { ...c, column_id: newColumnId, position: newPosition } : c
        ),
      };
    });
    try {
      const { error: err } = await supabase
        .from('board_cards')
        .update({ column_id: newColumnId, position: newPosition })
        .eq('id', cardId);
      if (err) throw err;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const moveToBoardCard = useCallback(async (cardId: string, targetBoardId: string, targetColumnId: string) => {
    setError(null);
    // Remove card from current board state optimistically
    setBoard(prev => {
      if (!prev) return prev;
      return { ...prev, cards: prev.cards.filter(c => c.id !== cardId) };
    });
    try {
      const { error: err } = await supabase
        .from('board_cards')
        .update({ board_id: targetBoardId, column_id: targetColumnId, position: 0 })
        .eq('id', cardId);
      if (err) throw err;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const reorderCardsInColumn = useCallback(async (boardId: string, columnId: string, cardIds: string[]) => {
    setError(null);
    // Optimistic
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map(c => {
          const idx = cardIds.indexOf(c.id);
          if (idx !== -1) return { ...c, column_id: columnId, position: idx };
          return c;
        }),
      };
    });
    try {
      const updates = cardIds.map((id, idx) =>
        supabase.from('board_cards').update({ column_id: columnId, position: idx }).eq('id', id)
      );
      await Promise.all(updates);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ─── Comments ──────────────────────────────────────────────
  const addComment = useCallback(async (boardId: string, cardId: string, content: string) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: err } = await supabase
        .from('card_comments')
        .insert([{ card_id: cardId, user_id: user.id, content }])
        .select()
        .single();
      if (err) throw err;

      const { data: userData } = await supabase.from('users').select('name').eq('id', user.id).single();
      const enrichedComment = { ...data, users: userData ? { name: userData.name } : null };

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId ? { ...c, comments: [...(c.comments || []), enrichedComment] } : c
          ),
        };
      });
      return enrichedComment as CardComment;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const updateComment = useCallback(async (boardId: string, cardId: string, commentId: string, content: string) => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('card_comments')
        .update({ content })
        .eq('id', commentId)
        .select()
        .single();
      if (err) throw err;

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId
              ? { ...c, comments: (c.comments || []).map(cm => cm.id === commentId ? { ...cm, content } : cm) }
              : c
          ),
        };
      });
      return data as CardComment;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const deleteComment = useCallback(async (boardId: string, cardId: string, commentId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('card_comments')
        .delete()
        .eq('id', commentId);
      if (err) throw err;

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId
              ? { ...c, comments: (c.comments || []).filter(cm => cm.id !== commentId) }
              : c
          ),
        };
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  // ─── Checklists ────────────────────────────────────────────
  const addChecklistItem = useCallback(async (boardId: string, cardId: string, title: string) => {
    setError(null);
    try {
      // Determine next position
      const existing = board?.cards.find(c => c.id === cardId)?.checklists || [];
      const maxPos = existing.reduce((m: number, cl: any) => Math.max(m, cl.position), -1);

      const { data, error: err } = await supabase
        .from('card_checklists')
        .insert([{ card_id: cardId, title, position: maxPos + 1 }])
        .select()
        .single();
      if (err) throw err;

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId ? { ...c, checklists: [...(c.checklists || []), data] } : c
          ),
        };
      });
      return data as CardChecklist;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [board?.cards]);

  const toggleChecklistItem = useCallback(async (boardId: string, cardId: string, itemId: string, isCompleted: boolean) => {
    setError(null);
    // Optimistic
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map(c =>
          c.id === cardId
            ? {
                ...c,
                checklists: (c.checklists || []).map(cl =>
                  cl.id === itemId ? { ...cl, is_completed: isCompleted } : cl
                ),
              }
            : c
        ),
      };
    });
    try {
      const { error: err } = await supabase
        .from('card_checklists')
        .update({ is_completed: isCompleted })
        .eq('id', itemId);
      if (err) throw err;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const updateChecklistItemDueDate = useCallback(async (boardId: string, cardId: string, itemId: string, dueDate: string | null) => {
    setError(null);
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: prev.cards.map(c =>
          c.id === cardId
            ? {
                ...c,
                checklists: (c.checklists || []).map(cl =>
                  cl.id === itemId ? { ...cl, due_date: dueDate || undefined } : cl
                ),
              }
            : c
        ),
      };
    });
    try {
      const { error: err } = await supabase
        .from('card_checklists')
        .update({ due_date: dueDate })
        .eq('id', itemId);
      if (err) throw err;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const deleteChecklistItem = useCallback(async (boardId: string, cardId: string, itemId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('card_checklists')
        .delete()
        .eq('id', itemId);
      if (err) throw err;

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId
              ? { ...c, checklists: (c.checklists || []).filter(cl => cl.id !== itemId) }
              : c
          ),
        };
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  // ─── Checklist Templates ────────────────────────────────────
  const fetchChecklistTemplates = useCallback(async (boardId: string) => {
    try {
      const { data, error: err } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setChecklistTemplates(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const saveChecklistTemplate = useCallback(async (boardId: string, name: string, items: string[]) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error: err } = await supabase
        .from('checklist_templates')
        .insert([{ board_id: boardId, user_id: user.id, name, items }])
        .select()
        .single();
      if (err) throw err;
      setChecklistTemplates(prev => [data, ...prev]);
      return data as ChecklistTemplate;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const deleteChecklistTemplate = useCallback(async (templateId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('checklist_templates')
        .delete()
        .eq('id', templateId);
      if (err) throw err;
      setChecklistTemplates(prev => prev.filter(t => t.id !== templateId));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const applyChecklistTemplate = useCallback(async (boardId: string, cardId: string, templateId: string) => {
    setError(null);
    try {
      const template = checklistTemplates.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');
      const existing = board?.cards.find(c => c.id === cardId)?.checklists || [];
      let maxPos = existing.reduce((m: number, cl: any) => Math.max(m, cl.position), -1);
      const rows = template.items.map((title: string) => ({
        card_id: cardId,
        title,
        position: ++maxPos,
      }));
      const { data, error: err } = await supabase
        .from('card_checklists')
        .insert(rows)
        .select();
      if (err) throw err;
      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId ? { ...c, checklists: [...(c.checklists || []), ...(data || [])] } : c
          ),
        };
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [checklistTemplates, board?.cards]);

  // ─── Labels ────────────────────────────────────────────────
  const addLabel = useCallback(async (boardId: string, name: string, color: string) => {
    setError(null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: BoardLabel = { id: tempId, board_id: boardId, name, color, created_at: new Date().toISOString() };
    setBoard(prev => prev ? { ...prev, labels: [...prev.labels, optimistic] } : prev);
    try {
      const { data, error: err } = await supabase
        .from('board_labels')
        .insert([{ board_id: boardId, name, color }])
        .select()
        .single();
      if (err) throw err;
      setBoard(prev => prev ? { ...prev, labels: prev.labels.map(l => l.id === tempId ? data : l) } : prev);
      return data as BoardLabel;
    } catch (err: any) {
      setError(err.message);
      setBoard(prev => prev ? { ...prev, labels: prev.labels.filter(l => l.id !== tempId) } : prev);
      return null;
    }
  }, []);

  const updateLabel = useCallback(async (boardId: string, labelId: string, updates: Partial<BoardLabel>) => {
    setError(null);
    setBoard(prev => prev ? {
      ...prev,
      labels: prev.labels.map(l => l.id === labelId ? { ...l, ...updates } : l),
    } : prev);
    try {
      const { data, error: err } = await supabase
        .from('board_labels')
        .update(updates)
        .eq('id', labelId)
        .select()
        .single();
      if (err) throw err;
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const deleteLabel = useCallback(async (boardId: string, labelId: string) => {
    setError(null);
    try {
      // Remove assignments first
      await supabase.from('card_label_assignments').delete().eq('label_id', labelId);
      const { error: err } = await supabase.from('board_labels').delete().eq('id', labelId);
      if (err) throw err;

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          labels: prev.labels.filter(l => l.id !== labelId),
          cards: prev.cards.map(c => ({
            ...c,
            labels: (c.labels || []).filter(l => l.id !== labelId),
          })),
        };
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  // ─── Card Assignments (user ↔ card) ───────────────────────
  const assignCard = useCallback(async (cardId: string, userId: string) => {
    setError(null);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { data: rawData, error: err } = await supabase
        .from('card_assignments')
        .insert([{ card_id: cardId, user_id: userId, assigned_by: currentUser?.id }])
        .select('*')
        .single();
      if (err) throw err;
      // Enrich with user data
      const { data: userData } = await supabase.from('users').select('name, email').eq('id', userId).single();
      const data = { ...rawData, users: userData || null };

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId
              ? { ...c, assignments: [...(c.assignments || []), data] }
              : c
          ),
        };
      });
      return data as CardAssignment;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const unassignCard = useCallback(async (cardId: string, userId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('card_assignments')
        .delete()
        .eq('card_id', cardId)
        .eq('user_id', userId);
      if (err) throw err;

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId
              ? { ...c, assignments: (c.assignments || []).filter(a => a.user_id !== userId) }
              : c
          ),
        };
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  const fetchSystemUsers = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id, name, email')
        .order('name');
      if (err) throw err;
      return (data || []) as { id: string; name: string; email: string }[];
    } catch {
      return [];
    }
  }, []);

  return {
    boards, board, loading, error, checklistTemplates,
    fetchBoards, createBoard, fetchBoard, fetchAllBoardsFull, updateBoard, deleteBoard,
    addColumn, updateColumn, deleteColumn, reorderColumns,
    addCard, updateCard, deleteCard, moveCard, moveToBoardCard, createNextRepeatCard, reorderCardsInColumn,
    addComment, updateComment, deleteComment,
    addChecklistItem, toggleChecklistItem, updateChecklistItemDueDate, deleteChecklistItem,
    fetchChecklistTemplates, saveChecklistTemplate, deleteChecklistTemplate, applyChecklistTemplate,
    addLabel, updateLabel, deleteLabel,
    assignCard, unassignCard, fetchSystemUsers,
    setBoard,
  };
}
