'use client';

import { useState, useCallback } from 'react';
// AUTH: Replace with your Supabase client import
import { supabase } from '../lib/supabase';
import type {
  ProjectBoard,
  BoardColumn,
  BoardCard,
  BoardLabel,
  CardComment,
  CardChecklist,
  CardPriority,
  ChecklistTemplate,
} from '../types/board-types';

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
      // Fetch board, columns, cards, labels, comments, checklists, label assignments in parallel
      const [boardRes, colsRes, cardsRes, labelsRes, commentsRes, checklistsRes, assignmentsRes] = await Promise.all([
        supabase.from('project_boards').select('*').eq('id', boardId).single(),
        supabase.from('board_columns').select('*').eq('board_id', boardId).order('position'),
        supabase.from('board_cards').select('*').eq('board_id', boardId).eq('is_archived', false).order('position'),
        supabase.from('board_labels').select('*').eq('board_id', boardId),
        supabase.from('card_comments').select('*').order('created_at', { ascending: true }),
        supabase.from('card_checklists').select('*').order('position'),
        supabase.from('card_label_assignments').select('*'),
      ]);

      if (boardRes.error) throw boardRes.error;

      const columns = colsRes.data || [];
      const labels = labelsRes.data || [];
      const allComments = commentsRes.data || [];
      const allChecklists = checklistsRes.data || [];
      const allAssignments = assignmentsRes.data || [];

      // Stitch comments, checklists, labels onto cards
      const cards = (cardsRes.data || []).map(card => ({
        ...card,
        comments: allComments.filter(cm => cm.card_id === card.id),
        checklists: allChecklists.filter(cl => cl.card_id === card.id),
        labels: allAssignments
          .filter(a => a.card_id === card.id)
          .map(a => labels.find(l => l.id === a.label_id))
          .filter(Boolean),
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

      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map(c =>
            c.id === cardId ? { ...c, comments: [...(c.comments || []), data] } : c
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
    try {
      const { data, error: err } = await supabase
        .from('board_labels')
        .insert([{ board_id: boardId, name, color }])
        .select()
        .single();
      if (err) throw err;
      setBoard(prev => prev ? { ...prev, labels: [...prev.labels, data] } : prev);
      return data as BoardLabel;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const updateLabel = useCallback(async (boardId: string, labelId: string, updates: Partial<BoardLabel>) => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('board_labels')
        .update(updates)
        .eq('id', labelId)
        .select()
        .single();
      if (err) throw err;
      setBoard(prev => prev ? {
        ...prev,
        labels: prev.labels.map(l => l.id === labelId ? { ...l, ...data } : l),
      } : prev);
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

  return {
    boards, board, loading, error, checklistTemplates,
    fetchBoards, createBoard, fetchBoard, updateBoard, deleteBoard,
    addColumn, updateColumn, deleteColumn, reorderColumns,
    addCard, updateCard, deleteCard, moveCard, reorderCardsInColumn,
    addComment, deleteComment,
    addChecklistItem, toggleChecklistItem, deleteChecklistItem,
    fetchChecklistTemplates, saveChecklistTemplate, deleteChecklistTemplate, applyChecklistTemplate,
    addLabel, updateLabel, deleteLabel,
    setBoard,
  };
}
