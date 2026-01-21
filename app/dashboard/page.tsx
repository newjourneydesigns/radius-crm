'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import FilterPanel from '../../components/dashboard/SimpleCampusFilter';
import { DashboardFilters } from '../../hooks/useDashboardFilters';
import CircleStatusBar from '../../components/dashboard/CircleStatusBar';
import TodayCircles from '../../components/dashboard/TodayCircles';
import FollowUpTable from '../../components/dashboard/FollowUpTable';
import ContactModal from '../../components/dashboard/ContactModal';
import EventSummaryProgress from '../../components/dashboard/EventSummaryProgress';
import ConnectionsProgress from '../../components/dashboard/ConnectionsProgress';
import LogConnectionModal from '../../components/dashboard/LogConnectionModal';
import AddNoteModal from '../../components/dashboard/AddNoteModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AlertModal from '../../components/ui/AlertModal';
import ProtectedRoute from '../../components/ProtectedRoute';
import ExportModal from '../../components/dashboard/ExportModal';
import CircleVisitsDashboard from '../../components/dashboard/CircleVisitsDashboard';
import { useDashboardFilters } from '../../hooks/useDashboardFilters';
import { useCircleLeaders, CircleLeaderFilters } from '../../hooks/useCircleLeaders';
import { useTodayCircles } from '../../hooks/useTodayCircles';
import { CircleLeader, supabase, Note, UserNote, TodoItem } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Link from 'next/link';
import { buildRepeatLabel, generateDueDates, toISODate, TodoRepeatRule } from '../../lib/todoRecurrence';

interface ContactModalData {
  isOpen: boolean;
  leaderId: number;
  name: string;
  email: string;
  phone: string;
}

interface LogConnectionModalData {
  isOpen: boolean;
  leaderId: number;
  name: string;
}

// Separate component that uses useSearchParams
function DashboardContent() {
  const { user } = useAuth();
  const { filters, updateFilters, clearAllFilters, isInitialized, isFirstVisit } = useDashboardFilters();
  
  const { 
    circleLeaders, 
    isLoading, 
    error, 
    loadCircleLeaders,
    resetEventSummaryCheckboxes,
    toggleFollowUp,
    updateStatus,
    bulkUpdateStatus,
    invalidateCache,
    getCacheDebugInfo
  } = useCircleLeaders();

  // Separate hook call for status overview - load all data without filters for accurate status counts
  const { 
    circleLeaders: allCircleLeaders,
    loadCircleLeaders: loadAllCircleLeaders
  } = useCircleLeaders();

  // Load today's circles separately for better performance
  const { 
    todayCircles, 
    isLoading: todayCirclesLoading, 
    refreshTodayCircles 
  } = useTodayCircles({
    campus: filters.campus,
    acpd: filters.acpd,
    status: filters.status,
    circleType: filters.circleType,
    eventSummary: filters.eventSummary,
    timeOfDay: filters.timeOfDay
  }, isInitialized && !isFirstVisit && filters.campus.length > 0); // Only load if not first visit and campus selected

    // State for tracking connected leaders this month
  const [connectedThisMonth, setConnectedThisMonth] = useState<number[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Connections tracking state
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectedLeaderIds, setConnectedLeaderIds] = useState<Set<number>>(new Set());
  
  // Refresh key for FilterPanel follow-up table
  const [filterPanelRefreshKey, setFilterPanelRefreshKey] = useState(0);
  
  // State to track if user has made initial campus selection (for lazy loading)
  const [hasCampusSelection, setHasCampusSelection] = useState(false);
  
  // Active section tracking for sticky navigation
  const [activeSection, setActiveSection] = useState('todo-list');

  // Todo list state
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [newTodoRepeatRule, setNewTodoRepeatRule] = useState<TodoRepeatRule>('none');
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [editingTodoDueDate, setEditingTodoDueDate] = useState('');
  const [editingTodoRepeatRule, setEditingTodoRepeatRule] = useState<TodoRepeatRule>('none');
  const [todoDueDateSort, setTodoDueDateSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [todosVisible, setTodosVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('todosVisible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  
  // State for modals
  type RecentNote = Pick<Note, 'id' | 'circle_leader_id' | 'content' | 'created_at'>;
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [recentNotesLoading, setRecentNotesLoading] = useState(false);
  const [recentNotesVisible, setRecentNotesVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('recentNotesVisible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Personal dashboard notes state
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [userNotesLoading, setUserNotesLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [userNotesVisible, setUserNotesVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('userNotesVisible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [deleteNoteModal, setDeleteNoteModal] = useState<{
    isOpen: boolean;
    noteId: number | null;
    content: string;
  }>({
    isOpen: false,
    noteId: null,
    content: ''
  });

  // Load recent notes (latest 10) filtered by current dashboard filters
  const loadRecentNotes = async () => {
    setRecentNotesLoading(true);
    try {
      // Get the filtered leader IDs to filter notes by
      const filteredLeaderIds = filteredLeaders.map(leader => leader.id);
      
      // If no filtered leaders, don't show any notes
      if (filteredLeaderIds.length === 0) {
        setRecentNotes([]);
        return;
      }
      
      const { data, error } = await supabase
        .from('notes')
        .select('id, circle_leader_id, content, created_at')
        .in('circle_leader_id', filteredLeaderIds)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.error('Error loading recent notes:', error);
        setRecentNotes([]);
        return;
      }
      setRecentNotes((data as any) || []);
    } catch (e) {
      console.error('Error loading recent notes:', e);
      setRecentNotes([]);
    } finally {
      setRecentNotesLoading(false);
    }
  };

  const getSeriesMaster = (seriesId?: string | null) => {
    if (!seriesId) return null;
    return todos.find(t => t.series_id === seriesId && t.is_series_master) || null;
  };

  const getSeriesId = () => {
    try {
      // @ts-ignore
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch {
      // ignore
    }
    return `series_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const ensureRecurringTodoHorizon = async (loadedTodos: TodoItem[]) => {
    if (!user?.id) return false;

    const horizonDays = 90;
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + horizonDays);
    const horizonISO = toISODate(horizon);

    const masters = loadedTodos.filter(t =>
      Boolean(t.series_id) &&
      Boolean(t.is_series_master) &&
      Boolean(t.repeat_rule) &&
      Boolean(t.due_date)
    );

    let insertedAny = false;

    for (const master of masters) {
      const seriesId = master.series_id as string;
      const rule = master.repeat_rule as Exclude<TodoRepeatRule, 'none'>;
      const interval = master.repeat_interval || 1;
      const startISO = master.due_date as string;

      const existingDates = new Set(
        loadedTodos
          .filter(t => t.series_id === seriesId && t.due_date)
          .map(t => t.due_date as string)
      );

      const datesToCreate = generateDueDates(startISO, rule, interval, horizonISO)
        .filter(d => !existingDates.has(d));

      if (datesToCreate.length === 0) continue;

      const rows = datesToCreate.map(dueDate => ({
        user_id: master.user_id,
        text: master.text,
        completed: false,
        due_date: dueDate,
        series_id: seriesId,
        is_series_master: false
      }));

      const { error } = await supabase
        .from('todo_items')
        .insert(rows);

      if (error) {
        // If schema isn't migrated yet, just stop trying.
        if (error.code === '42703') return false;
        console.error('Error generating recurring todo occurrences:', error);
        continue;
      }

      insertedAny = true;
    }

    return insertedAny;
  };

  // Load todos from database
  const loadTodos = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('todo_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading todos:', error);
        return;
      }
      
      const loaded = (data || []) as TodoItem[];

      // Ensure recurring series have occurrences generated out to a horizon.
      const inserted = await ensureRecurringTodoHorizon(loaded);
      if (inserted) {
        // Reload to include any newly inserted occurrences.
        const reload = await supabase
          .from('todo_items')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (!reload.error) {
          setTodos((reload.data as any) || []);
          return;
        }
      }

      setTodos(loaded);
    } catch (e) {
      console.error('Error loading todos:', e);
    }
  };

  // Add new todo
  const addTodo = async () => {
    if (!newTodoText.trim() || !user?.id) return;
    
    try {
      // Non-repeating
      if (newTodoRepeatRule === 'none') {
        const insertWithDueDate = await supabase
          .from('todo_items')
          .insert({
            user_id: user.id,
            text: newTodoText.trim(),
            completed: false,
            due_date: newTodoDueDate ? newTodoDueDate : null
          })
          .select()
          .single();

        let data = insertWithDueDate.data;
        let error: any = insertWithDueDate.error;

        if (error && error.code === '42703') {
          const fallbackInsert = await supabase
            .from('todo_items')
            .insert({
              user_id: user.id,
              text: newTodoText.trim(),
              completed: false
            })
            .select()
            .single();
          data = fallbackInsert.data;
          error = fallbackInsert.error;
        }

        if (error) {
          console.error('Error adding todo:', error);
          return;
        }

        setTodos([data as any, ...todos]);
        setNewTodoText('');
        setNewTodoDueDate('');
        setNewTodoRepeatRule('none');
        return;
      }

      // Repeating series (requires due date)
      if (!newTodoDueDate) {
        console.warn('Repeat requires a due date');
        return;
      }

      const seriesId = getSeriesId();
      const masterInsert = await supabase
        .from('todo_items')
        .insert({
          user_id: user.id,
          text: newTodoText.trim(),
          completed: false,
          due_date: newTodoDueDate,
          series_id: seriesId,
          is_series_master: true,
          repeat_rule: newTodoRepeatRule,
          repeat_interval: 1
        })
        .select()
        .single();

      if (masterInsert.error) {
        // If schema isn't migrated yet, fall back to creating a single todo.
        if (masterInsert.error.code === '42703') {
          console.warn('Repeat fields not migrated yet; creating single todo.');
          const fallback = await supabase
            .from('todo_items')
            .insert({
              user_id: user.id,
              text: newTodoText.trim(),
              completed: false,
              due_date: newTodoDueDate
            })
            .select()
            .single();
          if (!fallback.error && fallback.data) {
            setTodos([fallback.data as any, ...todos]);
            setNewTodoText('');
            setNewTodoDueDate('');
            setNewTodoRepeatRule('none');
          }
          return;
        }

        console.error('Error adding recurring todo master:', masterInsert.error);
        return;
      }

      // Generate occurrences out to a horizon (next 90 days)
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 90);
      const horizonISO = toISODate(horizon);
      const toCreate = generateDueDates(
        newTodoDueDate,
        newTodoRepeatRule as Exclude<TodoRepeatRule, 'none'>,
        1,
        horizonISO
      );

      if (toCreate.length > 0) {
        const rows = toCreate.map(d => ({
          user_id: user.id,
          text: newTodoText.trim(),
          completed: false,
          due_date: d,
          series_id: seriesId,
          is_series_master: false
        }));

        const occInsert = await supabase
          .from('todo_items')
          .insert(rows);

        if (occInsert.error && occInsert.error.code !== '23505') {
          console.error('Error inserting recurring todo occurrences:', occInsert.error);
        }
      }

      // Reload so UI includes series occurrences and any DB defaults
      await loadTodos();
      setNewTodoText('');
      setNewTodoDueDate('');
      setNewTodoRepeatRule('none');
      return;
      
      // unreachable (kept for safety)
    } catch (e) {
      console.error('Error adding todo:', e);
    }
  };

  // Toggle todo completion
  const toggleTodo = async (id: number) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    try {
      const { error } = await supabase
        .from('todo_items')
        .update({ completed: !todo.completed })
        .eq('id', id);
      
      if (error) {
        console.error('Error toggling todo:', error);
        return;
      }
      
      setTodos(todos.map(t =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ));

      // Keep recurring series topped up
      if (todo.series_id) {
        loadTodos();
      }
    } catch (e) {
      console.error('Error toggling todo:', e);
    }
  };

  // Start editing todo
  const startEditingTodo = (todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingTodoText(todo.text);
    setEditingTodoDueDate(todo.due_date || '');

    if (todo.series_id) {
      const master = getSeriesMaster(todo.series_id);
      const rule = (master?.repeat_rule as TodoRepeatRule) || 'none';
      setEditingTodoRepeatRule(rule);
    } else {
      setEditingTodoRepeatRule('none');
    }
  };

  // Save edited todo
  const saveEditedTodo = async (id: number) => {
    if (!editingTodoText.trim()) return;

    const todo = todos.find(t => t.id === id);
    const seriesId = todo?.series_id || null;
    const isSeries = Boolean(seriesId);
    
    try {
      if (!isSeries) {
        // Single todo
        const updateWithDueDate = await supabase
          .from('todo_items')
          .update({
            text: editingTodoText.trim(),
            due_date: editingTodoDueDate ? editingTodoDueDate : null
          })
          .eq('id', id);

        let error: any = updateWithDueDate.error;
        if (error && error.code === '42703') {
          const fallbackUpdate = await supabase
            .from('todo_items')
            .update({ text: editingTodoText.trim() })
            .eq('id', id);
          error = fallbackUpdate.error;
        }

        if (error) {
          console.error('Error updating todo:', error);
          return;
        }

        setTodos(todos.map(t =>
          t.id === id ? { ...t, text: editingTodoText.trim(), due_date: editingTodoDueDate ? editingTodoDueDate : null } : t
        ));
      } else {
        // Series: edit applies to the whole series (Apple Reminders-style)
        const master = getSeriesMaster(seriesId);
        const masterId = master?.id || id;

        // Update text for all occurrences (including completed)
        const textUpdate = await supabase
          .from('todo_items')
          .update({ text: editingTodoText.trim() })
          .eq('series_id', seriesId);
        if (textUpdate.error && textUpdate.error.code !== '42703') {
          console.error('Error updating recurring todo text:', textUpdate.error);
        }

        // If user changed repeat rule, apply it on master.
        const rule = editingTodoRepeatRule;

        if (rule === 'none') {
          // Turn off repeat: keep only the edited occurrence
          await supabase
            .from('todo_items')
            .delete()
            .eq('series_id', seriesId)
            .neq('id', masterId);

          await supabase
            .from('todo_items')
            .update({
              series_id: null,
              is_series_master: false,
              repeat_rule: null,
              repeat_interval: null,
              due_date: editingTodoDueDate ? editingTodoDueDate : null
            })
            .eq('id', masterId);
        } else {
          // Ensure due date is set when repeating
          if (!editingTodoDueDate) {
            console.warn('Repeat requires a due date');
          } else {
            // Update master and regenerate future (non-completed) occurrences
            const masterUpdate = await supabase
              .from('todo_items')
              .update({
                due_date: editingTodoDueDate,
                repeat_rule: rule,
                repeat_interval: 1,
                is_series_master: true
              })
              .eq('id', masterId);

            if (masterUpdate.error && masterUpdate.error.code !== '42703') {
              console.error('Error updating recurring todo master:', masterUpdate.error);
            }

            // Delete non-completed occurrences except master
            await supabase
              .from('todo_items')
              .delete()
              .eq('series_id', seriesId)
              .eq('completed', false)
              .neq('id', masterId);

            // Recreate horizon occurrences
            const horizon = new Date();
            horizon.setDate(horizon.getDate() + 90);
            const horizonISO = toISODate(horizon);
            const toCreate = generateDueDates(
              editingTodoDueDate,
              rule as Exclude<TodoRepeatRule, 'none'>,
              1,
              horizonISO
            );

            if (toCreate.length > 0) {
              const rows = toCreate.map(d => ({
                user_id: todo?.user_id,
                text: editingTodoText.trim(),
                completed: false,
                due_date: d,
                series_id: seriesId,
                is_series_master: false
              }));
              const occInsert = await supabase
                .from('todo_items')
                .insert(rows);
              if (occInsert.error && occInsert.error.code !== '23505' && occInsert.error.code !== '42703') {
                console.error('Error inserting regenerated occurrences:', occInsert.error);
              }
            }
          }
        }

        await loadTodos();
      }

      setEditingTodoId(null);
      setEditingTodoText('');
      setEditingTodoDueDate('');
      setEditingTodoRepeatRule('none');
    } catch (e) {
      console.error('Error updating todo:', e);
    }
  };

  // Cancel editing todo
  const cancelEditingTodo = () => {
    setEditingTodoId(null);
    setEditingTodoText('');
    setEditingTodoDueDate('');
    setEditingTodoRepeatRule('none');
  };

  const todayISO = toISODate(new Date());
  const isTodoOverdue = (todo: TodoItem) => {
    if (todo.completed) return false;
    if (!todo.due_date) return false;
    // ISO date strings (YYYY-MM-DD) are safe for lexicographic comparison
    return todo.due_date < todayISO;
  };

  const sortedTodos = useMemo(() => {
    if (todoDueDateSort === 'none') return todos;

    const dir = todoDueDateSort;
    return [...todos].sort((a, b) => {
      const aDate = a.due_date || null;
      const bDate = b.due_date || null;

      // Always put items without due dates at the bottom
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;

      const aTime = new Date(aDate).getTime();
      const bTime = new Date(bDate).getTime();
      if (aTime === bTime) return 0;

      return dir === 'asc' ? aTime - bTime : bTime - aTime;
    });
  }, [todos, todoDueDateSort]);

  // Delete todo
  const deleteTodo = async (id: number) => {
    try {
      const todo = todos.find(t => t.id === id);
      const seriesId = todo?.series_id || null;

      const deleteQuery = seriesId
        ? supabase.from('todo_items').delete().eq('series_id', seriesId)
        : supabase.from('todo_items').delete().eq('id', id);

      const { error } = await deleteQuery;
      
      if (error) {
        console.error('Error deleting todo:', error);
        return;
      }
      
      setTodos(seriesId ? todos.filter(t => t.series_id !== seriesId) : todos.filter(t => t.id !== id));
    } catch (e) {
      console.error('Error deleting todo:', e);
    }
  };

  // Toggle todos visibility
  const toggleTodosVisibility = () => {
    setTodosVisible(prev => {
      const newVisible = !prev;
      try {
        localStorage.setItem('todosVisible', newVisible.toString());
      } catch (error) {
        console.error('Failed to save todos visibility:', error);
      }
      return newVisible;
    });
  };

  // Load user's personal dashboard notes
  const loadUserNotes = async () => {
    if (!user?.id) return;
    
    setUserNotesLoading(true);
    try {
      // First try to query with pinned column (for when migration is complete)
      let { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      
      // If column doesn't exist, fall back to original query
      if (error && error.code === '42703') {
        console.log('Pinned column not found, using fallback query');
        const fallbackQuery = await supabase
          .from('user_notes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        data = fallbackQuery.data;
        error = fallbackQuery.error;
        
        // Add pinned: false to all notes for UI compatibility
        if (data) {
          data = data.map(note => ({ ...note, pinned: false }));
        }
      }
      
      if (error) {
        console.error('Error loading user notes:', error);
        return;
      }
      
      // Sort notes to ensure pinned notes are always at the top
      const sortedNotes = (data || []).sort((a, b) => {
        // First sort by pinned status (pinned notes first)
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        
        // Then sort by creation date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      setUserNotes(sortedNotes);
    } catch (e) {
      console.error('Error loading user notes:', e);
    } finally {
      setUserNotesLoading(false);
    }
  };

  // Save a new user note
  const saveNewUserNote = async () => {
    if (!user?.id || !newNoteContent.trim()) return;
    
    setSavingNoteId(-1); // Use -1 for new note
    try {
      const { data, error } = await supabase
        .from('user_notes')
        .insert({ user_id: user.id, content: newNoteContent })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating user note:', error);
        return;
      }
      
      // Add pinned: false for UI compatibility and sort the list
      const newNote = { ...data, pinned: false };
      setUserNotes(prev => {
        const updatedNotes = [newNote, ...prev];
        
        // Sort to ensure pinned notes stay at the top
        return updatedNotes.sort((a, b) => {
          // First sort by pinned status (pinned notes first)
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          
          // Then sort by creation date (newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
      setNewNoteContent('');
    } catch (e) {
      console.error('Error saving user note:', e);
    } finally {
      setSavingNoteId(null);
    }
  };

  // Update an existing note
  const updateUserNote = async (noteId: number, content: string) => {
    setSavingNoteId(noteId);
    try {
      const { error } = await supabase
        .from('user_notes')
        .update({ content })
        .eq('id', noteId);
      
      if (error) {
        console.error('Error updating user note:', error);
        return;
      }
      
      setUserNotes(prev => prev.map(note => 
        note.id === noteId ? { ...note, content } : note
      ));
      setEditingNoteId(null);
      setEditingContent('');
    } catch (e) {
      console.error('Error updating user note:', e);
    } finally {
      setSavingNoteId(null);
    }
  };

  // Toggle pin status of a note
  const togglePinNote = async (noteId: number) => {
    try {
      const note = userNotes.find(n => n.id === noteId);
      if (!note) return;

      const { error } = await supabase
        .from('user_notes')
        .update({ pinned: !note.pinned })
        .eq('id', noteId);
      
      if (error) {
        if (error.code === '42703') {
          // Column doesn't exist yet, show a helpful message
          setShowAlert({
            isOpen: true,
            type: 'info',
            title: 'Feature Not Available',
            message: 'The pin feature requires a database update. Please run the migration SQL first.'
          });
          return;
        }
        console.error('Error toggling pin status:', error);
        return;
      }
      
      // Update the note and re-sort the list
      setUserNotes(prev => {
        const updatedNotes = prev.map(n => 
          n.id === noteId ? { ...n, pinned: !n.pinned } : n
        );
        
        // Sort to ensure pinned notes stay at the top
        return updatedNotes.sort((a, b) => {
          // First sort by pinned status (pinned notes first)
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          
          // Then sort by creation date (newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
    } catch (e) {
      console.error('Error toggling pin status:', e);
    }
  };

  // Delete a user note
  const deleteUserNote = async (noteId: number) => {
    try {
      const { error } = await supabase
        .from('user_notes')
        .delete()
        .eq('id', noteId);
      
      if (error) {
        console.error('Error deleting user note:', error);
        return;
      }
      
      setUserNotes(prev => prev.filter(note => note.id !== noteId));
    } catch (e) {
      console.error('Error deleting user note:', e);
    }
  };

  // Open delete confirmation modal
  const openDeleteNoteModal = (noteId: number, content: string) => {
    setDeleteNoteModal({
      isOpen: true,
      noteId,
      content
    });
  };

  // Close delete confirmation modal
  const closeDeleteNoteModal = () => {
    setDeleteNoteModal({
      isOpen: false,
      noteId: null,
      content: ''
    });
  };

  // Copy note content to clipboard
  const copyNoteToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      // Close the delete modal if it's open
      closeDeleteNoteModal();
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Copied',
        message: 'Note content copied to clipboard successfully.'
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy note to clipboard. Please try again.'
      });
    }
  };

  // Confirm delete note
  const confirmDeleteNote = async () => {
    if (deleteNoteModal.noteId) {
      await deleteUserNote(deleteNoteModal.noteId);
      closeDeleteNoteModal();
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Note Deleted',
        message: 'The note has been deleted successfully.'
      });
    }
  };

  // Start editing a note
  const startEditingNote = (noteId: number, content: string) => {
    setEditingNoteId(noteId);
    setEditingContent(content);
    
    // Auto-resize textarea to fit content after a short delay
    setTimeout(() => {
      const textarea = document.querySelector(`textarea[data-editing-id="${noteId}"]`) as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(80, Math.min(600, textarea.scrollHeight)) + 'px';
      }
    }, 10);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingContent('');
  };

  // Reference data state
  const [directors, setDirectors] = useState<Array<{id: number; name: string}>>([]);
  const [campuses, setCampuses] = useState<Array<{id: number; value: string}>>([]);
  const [statuses, setStatuses] = useState<Array<{id: number; value: string}>>([]);
  const [circleTypes, setCircleTypes] = useState<Array<{id: number; value: string}>>([]);
  const [frequencies, setFrequencies] = useState<Array<{id: number; value: string}>>([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Load reference data
  const loadReferenceData = async () => {
    setReferenceDataLoading(true);
    try {
      const response = await fetch('/api/reference-data/');
      
      const data = await response.json();

      // Always set the data arrays, even if they're empty (graceful fallback)
      setDirectors(data.directors || []);
      setCampuses(data.campuses || []);
      setStatuses(data.statuses || []);
      setCircleTypes(data.circleTypes || []);
      setFrequencies(data.frequencies || []);

      if (!response.ok) {
        console.warn('Reference data API returned non-OK status, using fallback empty arrays');
      }
    } catch (error) {
      console.error('Error loading reference data:', error);
      // Set empty arrays as fallback
      setDirectors([]);
      setCampuses([]);
      setStatuses([]);
      setCircleTypes([]);
      setFrequencies([]);
    } finally {
      setReferenceDataLoading(false);
    }
  };

  // Load connected leaders for this month
  const loadConnectedLeaders = async () => {
    setConnectionsLoading(true);
    try {
      // Get current month boundaries
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startDate = firstDayOfMonth.toISOString().split('T')[0];
      const endDate = lastDayOfMonth.toISOString().split('T')[0];

      // Query for connections this month
      const { data: connections, error } = await supabase
        .from('connections')
        .select('circle_leader_id')
        .gte('date_of_connection', startDate)
        .lte('date_of_connection', endDate);

      if (error) {
        console.error('Error fetching connected leaders:', error);
        return;
      }

      // Create set of unique leader IDs who have connections this month
      const uniqueLeaderIds = new Set(connections?.map(conn => conn.circle_leader_id) || []);
      setConnectedLeaderIds(uniqueLeaderIds);
    } catch (error) {
      console.error('Error loading connected leaders:', error);
    } finally {
      setConnectionsLoading(false);
    }
  };

  // Load connected leaders when component mounts or circleLeaders change
  useEffect(() => {
    if (circleLeaders.length > 0) {
      loadConnectedLeaders();
    }
  }, [circleLeaders]);

  // Load reference data when component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    loadReferenceData();
  }, [isClient]);

  // Set hasCampusSelection to true if filters are loaded from localStorage with campus selection
  useEffect(() => {
    if (isInitialized && filters.campus.length > 0) {
      console.log('🎯 [DashboardPage] Setting hasCampusSelection to true due to persisted filters:', filters.campus);
      setHasCampusSelection(true);
    } else if (isInitialized && filters.campus.length === 0) {
      console.log('🎯 [DashboardPage] No campus in persisted filters, keeping hasCampusSelection false');
    }
  }, [isInitialized, filters.campus.length, isFirstVisit]);

  // Load all circle leaders without filters for accurate status overview counts
  // Only load if user has made a campus selection to improve performance
  useEffect(() => {
    if (!isClient) return;
    if (!hasCampusSelection) return; // Don't load data until user makes campus selection
    
    // Load all data with no filters to get accurate status counts
    loadAllCircleLeaders({});
  }, [isClient, loadAllCircleLeaders, hasCampusSelection]);

  const clearFilters = () => {
    updateFilters({
      campus: [],
      acpd: [],
      status: [],
      meetingDay: [],
      circleType: [],
      eventSummary: 'all',
      connected: 'all',
      timeOfDay: 'all'
    });
  };

  // Wrapper function to track campus selection for lazy loading
  const handleFiltersChange = (newFilters: Partial<DashboardFilters>) => {
    // If campus is being changed, mark as having made a selection
    if (newFilters.campus !== undefined && !hasCampusSelection && newFilters.campus.length > 0) {
      setHasCampusSelection(true);
    }
    updateFilters(newFilters);
  };

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const [contactModal, setContactModal] = useState<ContactModalData>({
    isOpen: false,
    leaderId: 0,
    name: '',
    email: '',
    phone: ''
  });

  const [logConnectionModal, setLogConnectionModal] = useState<LogConnectionModalData>({
    isOpen: false,
    leaderId: 0,
    name: ''
  });

  const [addNoteModal, setAddNoteModal] = useState<{
    isOpen: boolean;
    leaderId?: number;
    name?: string;
    clearFollowUp?: boolean;
  }>({
    isOpen: false,
    leaderId: undefined,
    name: undefined,
    clearFollowUp: false
  });

  const [exportModal, setExportModal] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });



  // Filter circle leaders - simplified to only campus filtering (handled server-side)
  const filteredLeaders = useMemo(() => {
    // Campus filtering is handled server-side by useCircleLeaders hook
    // Just sort by name for consistent display
    const filtered = [...circleLeaders];
    filtered.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });

    return filtered;
  }, [circleLeaders]);

  // Memoize filtered leader IDs to prevent unnecessary ConnectionsProgress re-renders
  const filteredLeaderIds = useMemo(() => {
    return filteredLeaders.map(leader => leader.id);
  }, [filteredLeaders]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeaders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLeaders = useMemo(() => {
    if (itemsPerPage === -1) return filteredLeaders; // Show all
    return filteredLeaders.slice(startIndex, endIndex);
  }, [filteredLeaders, startIndex, endIndex, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Calculate event summary progress
  const eventSummaryProgress = useMemo(() => {
    const total = filteredLeaders.length;
    const received = filteredLeaders.filter(leader => leader.event_summary_received === true || leader.event_summary_skipped === true).length;
    const percentage = total > 0 ? Math.round((received / total) * 100) : 0;
    
    return {
      total,
      received,
      percentage
    };
  }, [filteredLeaders]);

  // Calculate status distribution for the status bar - filtered by campus only
  const statusData = useMemo(() => {
    const statusCounts = {
      'Invited': 0,
      'Pipeline': 0,
      'Active': 0,
      'Follow-Up': 0,
      'Paused': 0,
      'Off-Boarding': 0
    };

    // Use unfiltered data for status overview, only apply campus filter
    let leadersForStatusOverview = [...allCircleLeaders];
    if (filters.campus.length > 0) {
      // Normalize both filter and leader campus values for comparison
      const normalizedFilterCampuses = filters.campus.map(c => c.trim().toLowerCase());
      leadersForStatusOverview = leadersForStatusOverview.filter(leader => {
        const leaderCampus = (leader.campus || '').trim().toLowerCase();
        return normalizedFilterCampuses.includes(leaderCampus);
      });
    }

    // Count statuses from campus-filtered leaders
    leadersForStatusOverview.forEach(leader => {
      const status = leader.status;
      
      if (status === 'invited') statusCounts['Invited']++;
      else if (status === 'pipeline') statusCounts['Pipeline']++;
      else if (status === 'active') statusCounts['Active']++;
      else if (status === 'paused') statusCounts['Paused']++;
      else if (status === 'off-boarding') statusCounts['Off-Boarding']++;
      
      // Add to Follow-Up if follow_up_required is true
      if (leader.follow_up_required) {
        statusCounts['Follow-Up']++;
      }
    });

    // Convert to the format expected by CircleStatusBar
    return [
      { status: 'Invited' as const, count: statusCounts['Invited'], color: 'bg-blue-500' },
      { status: 'Pipeline' as const, count: statusCounts['Pipeline'], color: 'bg-indigo-500' },
      { status: 'Active' as const, count: statusCounts['Active'], color: 'bg-green-500' },
      { status: 'Follow-Up' as const, count: statusCounts['Follow-Up'], color: 'bg-orange-500' },
      { status: 'Paused' as const, count: statusCounts['Paused'], color: 'bg-yellow-500' },
      { status: 'Off-Boarding' as const, count: statusCounts['Off-Boarding'], color: 'bg-red-500' }
    ];
  }, [allCircleLeaders, filters.campus]);

  // Toggle Recent Notes visibility and persist to localStorage
  const toggleRecentNotesVisibility = () => {
    setRecentNotesVisible(prev => {
      const newVisible = !prev;
      try {
        localStorage.setItem('recentNotesVisible', newVisible.toString());
      } catch (error) {
        console.error('Failed to save recent notes visibility to localStorage:', error);
      }
      return newVisible;
    });
  };

  // Toggle User Notes visibility and persist to localStorage
  const toggleUserNotesVisibility = () => {
    setUserNotesVisible(prev => {
      const newVisible = !prev;
      try {
        localStorage.setItem('userNotesVisible', newVisible.toString());
      } catch (error) {
        console.error('Failed to save user notes visibility to localStorage:', error);
      }
      return newVisible;
    });
  };

  // Function to convert URLs in text to clickable links
  const linkifyText = (text: string) => {
    if (!text) return text;
    
    // First, handle markdown-style links [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    // Split by markdown links first
    const parts = text.split(markdownLinkRegex);
    const elements: React.ReactNode[] = [];
    
    for (let i = 0; i < parts.length; i += 3) {
      const beforeText = parts[i];
      const linkText = parts[i + 1];
      const linkUrl = parts[i + 2];
      
      // Process the text before the link for regular URLs
      if (beforeText) {
        const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
        const urlParts = beforeText.split(urlRegex);
        
        urlParts.forEach((part, index) => {
          if (/^https?:\/\//.test(part)) {
            elements.push(
              <a
                key={`url-${i}-${index}`}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                {part}
              </a>
            );
          } else if (part) {
            // Handle line breaks in regular text
            const lines = part.split('\n');
            lines.forEach((line, lineIndex) => {
              elements.push(<span key={`text-${i}-${index}-${lineIndex}`}>{line}</span>);
              if (lineIndex < lines.length - 1) {
                elements.push(<br key={`br-${i}-${index}-${lineIndex}`} />);
              }
            });
          }
        });
      }
      
      // Add the markdown link if it exists
      if (linkText && linkUrl) {
        elements.push(
          <a
            key={`markdown-${i}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {linkText}
          </a>
        );
      }
    }
    
    return elements.length > 0 ? elements : text;
  };

  // Helper function to convert dashboard filters to server-side filters
  const getServerFilters = (): CircleLeaderFilters => {
    const serverFilters: CircleLeaderFilters = {};
    
    // Campus filter - only filter we need
    if (filters.campus.length > 0) {
      serverFilters.campus = filters.campus;
    }
    
    // Always exclude archive status by default unless explicitly showing all
    serverFilters.statusExclude = ['archive'];
    
    console.log('🎯 [DashboardPage] Server filters (campus only):', serverFilters);
    return serverFilters;
  };

  // Helper function to get current filter parameters as URL string - simplified for campus only
  const getFilterParams = (): string => {
    const params = new URLSearchParams();
    
    filters.campus.forEach(campus => params.append('campus', campus));
    
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };

  // Load data on component mount and when filters change
  // Only load if user has made a campus selection to improve performance
  useEffect(() => {
    if (!hasCampusSelection) return; // Don't load data until user makes campus selection
    
    const serverFilters = getServerFilters();
    console.log('🟦 [DashboardPage] Filters passed to loadCircleLeaders:', serverFilters);
    loadCircleLeaders(serverFilters);
  }, [loadCircleLeaders, 
      hasCampusSelection,
      JSON.stringify(filters.campus),
      JSON.stringify(filters.acpd),
      JSON.stringify(filters.status), 
      JSON.stringify(filters.meetingDay),
      JSON.stringify(filters.circleType),
      filters.eventSummary,
      filters.connected,
      filters.timeOfDay
  ]);

  // Load recent notes when filtered leaders change
  useEffect(() => {
    if (!hasCampusSelection) return;
    // Small delay to ensure filteredLeaders has been calculated
    const timeoutId = setTimeout(() => {
      loadRecentNotes();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [filteredLeaders, hasCampusSelection]);

  // Load user's personal notes on component mount
  useEffect(() => {
    if (user?.id) {
      loadUserNotes();
    }
  }, [user?.id]);

  // Load todos on component mount
  useEffect(() => {
    loadTodos();
  }, [user?.id]);

  // Scroll spy effect to track active section
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['todo-list', 'personal-notes', 'filters', 'status-overview', 'follow-up', 'recent-notes', 'progress'];
      
      // Get current scroll position
      const scrollY = window.scrollY;
      
      // If we're at the very top of the page (within 200px), always highlight the first section
      if (scrollY <= 200) {
        setActiveSection('todo-list');
        return;
      }
      
      // Find the section that's currently most visible in the viewport
      let activeSection = 'todo-list'; // default
      let maxVisibility = 0;
      
      sections.forEach(sectionId => {
        const element = document.getElementById(sectionId);
        if (element) {
          const rect = element.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          
          // Calculate how much of the section is visible
          const visibleTop = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(0, rect.top));
          const sectionHeight = rect.height;
          const visibilityRatio = visibleTop / Math.max(1, sectionHeight);
          
          // Prefer sections that are near the top of the viewport (within 300px from top)
          const distanceFromTop = Math.abs(rect.top);
          const topBonus = distanceFromTop < 300 ? 1.5 : 1;
          
          const score = visibilityRatio * topBonus;
          
          if (score > maxVisibility) {
            maxVisibility = score;
            activeSection = sectionId;
          }
        }
      });
      
      setActiveSection(activeSection);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Custom scroll function to handle offset and show hidden sections
  const scrollToSection = (sectionId: string) => {
    // Auto-show hidden sections when navigating to them
    if (sectionId === 'todo-list' && !todosVisible) {
      setTodosVisible(true);
      try {
        localStorage.setItem('todosVisible', 'true');
      } catch (error) {
        // Ignore localStorage errors
      }
    }
    
    if (sectionId === 'recent-notes' && !recentNotesVisible) {
      setRecentNotesVisible(true);
      try {
        localStorage.setItem('recentNotesVisible', 'true');
      } catch (error) {
        // Ignore localStorage errors
      }
    }
    
    if (sectionId === 'personal-notes' && !userNotesVisible) {
      setUserNotesVisible(true);
      try {
        localStorage.setItem('userNotesVisible', 'true');
      } catch (error) {
        // Ignore localStorage errors
      }
    }
    
    // Small delay to allow section to expand before scrolling
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        const stickyHeader = document.getElementById('dashboard-sticky-header');
        const stickyHeight = stickyHeader?.getBoundingClientRect().height ?? 0;
        const yOffset = -(stickyHeight + 16);
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, sectionId === 'recent-notes' || sectionId === 'personal-notes' ? 100 : 0);
  };

  // Event handlers
  const handleResetCheckboxes = async () => {
    setShowResetConfirm(true);
  };

  const confirmResetCheckboxes = async () => {
    const leaderIds = filteredLeaders.map(leader => leader.id);
    await resetEventSummaryCheckboxes(leaderIds);
    setShowResetConfirm(false);
  };

  const handleBulkUpdateStatus = async (status: string) => {
    try {
      const leaderIds = filteredLeaders.map(leader => leader.id);
      await bulkUpdateStatus(leaderIds, status);
      // Refresh the data
      loadCircleLeaders(getServerFilters());
    } catch (error) {
      console.error('Error bulk updating status:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update status. Please try again.'
      });
    }
  };

  const handleUpdateStatus = async (leaderId: number, newStatus: string, followUpDate?: string) => {
    try {
      await updateStatus(leaderId, newStatus, followUpDate);
      loadCircleLeaders(getServerFilters());
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleStatusBarClick = (status: string) => {
    // Map display status to filter values
    const statusMap: Record<string, string[]> = {
      'Invited': ['invited'],
      'Pipeline': ['pipeline'],
      'Active': ['active'],
      'Follow-Up': ['follow-up'],
      'Paused': ['paused'],
      'Off-Boarding': ['off-boarding']
    };

    const filterValues = statusMap[status] || [];
    
    updateFilters({
      ...filters,
      status: filterValues
    });
  };

  const openContactModal = (leaderId: number, name: string, email: string, phone: string) => {
    setContactModal({
      isOpen: true,
      leaderId,
      name,
      email,
      phone
    });
  };

  const closeContactModal = () => {
    setContactModal({
      isOpen: false,
      leaderId: 0,
      name: '',
      email: '',
      phone: ''
    });
  };

  const openLogConnectionModal = (leaderId: number, name: string) => {
    setLogConnectionModal({
      isOpen: true,
      leaderId,
      name
    });
  };

  const closeLogConnectionModal = () => {
    setLogConnectionModal({
      isOpen: false,
      leaderId: 0,
      name: ''
    });
  };

  // Add Note Modal Functions
  const openAddNoteModal = (leaderId?: number, name?: string, clearFollowUp?: boolean) => {
    setAddNoteModal({
      isOpen: true,
      leaderId,
      name,
      clearFollowUp: clearFollowUp || false
    });
  };

  const closeAddNoteModal = () => {
    setAddNoteModal({
      isOpen: false,
      leaderId: undefined,
      name: undefined,
      clearFollowUp: false
    });
  };

  const handleNoteAdded = () => {
    // Clear cache since notes affect last_note data
    invalidateCache();
    loadCircleLeaders(getServerFilters()); // Refresh the data to show the new note
    loadRecentNotes();   // Refresh recent notes table
    refreshTodayCircles(); // Refresh today's circles since notes affect them too
    // If a follow-up was cleared, refresh the FilterPanel follow-up table
    if (addNoteModal.clearFollowUp) {
      setFilterPanelRefreshKey(prev => prev + 1);
    }
    const messageText = addNoteModal.clearFollowUp ? 'Follow-up cleared and note added successfully.' : 'The note has been successfully added.';
    setShowAlert({
      isOpen: true,
      type: 'success',
      title: addNoteModal.clearFollowUp ? 'Follow-Up Cleared' : 'Note Added',
      message: messageText
    });
  };

  // Clear Follow-Up Handler
  const handleClearFollowUp = (leaderId: number, name: string) => {
    openAddNoteModal(leaderId, name, true);
  };

  const handleConnectionLogged = () => {
    // Clear cache since connections create notes which affect last_note data
    invalidateCache();
    // Refresh the data to update connections progress
    loadCircleLeaders(getServerFilters());
    // Also refresh recent notes (connections create notes)
    loadRecentNotes();
    // Refresh today's circles since connections create notes
    refreshTodayCircles();
  };

  // For now, assume user is admin - in a real app, you'd get this from your auth context
  const isAdmin = true;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="rounded-md bg-red-50 p-4">
            <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={() => loadCircleLeaders(getServerFilters())}
                className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                {lastRefreshedAt && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Last refreshed {lastRefreshedAt.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <div className="mt-4 sm:mt-0 flex space-x-3">
                {/* Import CSV and Add A Circle buttons moved to Settings page */}
                <button
                  onClick={() => {
                    if (!hasCampusSelection) {
                      const filtersElement = document.querySelector('[data-testid="filters-section"]');
                      filtersElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      return;
                    }
                    loadAllCircleLeaders({});
                    loadCircleLeaders(getServerFilters());
                    loadRecentNotes();
                    refreshTodayCircles();
                    setLastRefreshedAt(new Date());
                  }}
                  className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
                <button
                  onClick={() => setExportModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Sticky Section Navigation */}
          <div id="dashboard-sticky-header" className="sticky top-0 z-[1000] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 shadow-sm">
              <nav className="flex space-x-6 overflow-x-auto py-3">
                <button
                  onClick={() => scrollToSection('todo-list')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'todo-list'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  To Do
                </button>

                <button
                  onClick={() => scrollToSection('personal-notes')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'personal-notes'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Personal Notes
                </button>

                <button
                  onClick={() => scrollToSection('filters')}
                  className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeSection === 'filters'
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                </button>

                {hasCampusSelection && (
                  <button
                    onClick={() => scrollToSection('status-overview')}
                    className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeSection === 'status-overview'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Status
                  </button>
                )}

                {hasCampusSelection && (
                  <button
                    onClick={() => scrollToSection('progress')}
                    className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeSection === 'progress'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Event Summaries
                  </button>
                )}

                {hasCampusSelection && (
                  <button
                    onClick={() => scrollToSection('follow-up')}
                    className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeSection === 'follow-up'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Follow Up
                  </button>
                )}

                {hasCampusSelection && (
                  <button
                    onClick={() => scrollToSection('recent-notes')}
                    className={`flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeSection === 'recent-notes'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Recent Notes
                  </button>
                )}
              </nav>

              {/* Active Filter Tags - Simplified for campus only */}
              {filters.campus.length > 0 && (
                <div className="pb-3">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Active Filters:</span>

                    {/* Campus Tags */}
                    {filters.campus.some(campus => campus === 'all' || campus === '__ALL_CAMPUSES__') && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Campus: All
                      </span>
                    )}
                    {filters.campus
                      .filter(campus => campus && campus !== 'all' && campus !== '__ALL_CAMPUSES__')
                      .map(campus => (
                        <span key={`campus-${campus}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Campus: {campus}
                          <button
                            onClick={() => updateFilters({ ...filters, campus: filters.campus.filter(c => c !== campus) })}
                            className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-600 dark:hover:bg-blue-800"
                          >
                            <span className="sr-only">Remove {campus} filter</span>
                            <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                              <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                            </svg>
                          </button>
                        </span>
                      ))}

                    {/* Clear All Button */}
                    <button
                      onClick={clearAllFilters}
                      className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors ml-2"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}
            </div>

          {/* Tab Content */}
          {/* First-time / No-campus empty state */}
          {!hasCampusSelection && (
            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-blue-800 dark:text-blue-200">
                    {isFirstVisit ? 'Welcome to the Dashboard!' : 'Select a campus to begin'}
                  </h3>
                  <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                    <p>
                      Pick a campus in Filters to load leaders, follow-ups, today’s circles, and recent notes.
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        const filtersElement = document.querySelector('[data-testid="filters-section"]');
                        filtersElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                    >
                      Go to Filters
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* To Do List Section */}
          <div id="todo-list" className="mt-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    To Do List
                  </h2>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTodoDueDateSort(prev => (prev === 'asc' ? 'none' : 'asc'))}
                      className={`p-1.5 rounded border text-xs transition-colors ${
                        todoDueDateSort === 'asc'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                      title="Sort by due date (ascending)"
                    >
                      Due ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => setTodoDueDateSort(prev => (prev === 'desc' ? 'none' : 'desc'))}
                      className={`p-1.5 rounded border text-xs transition-colors ${
                        todoDueDateSort === 'desc'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                      title="Sort by due date (descending)"
                    >
                      Due ↓
                    </button>
                  </div>
                </div>
                <button
                  onClick={toggleTodosVisibility}
                  className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                           text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                >
                  {todosVisible ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {todosVisible && (
                <div className="space-y-4">
                  {/* Add New Todo */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newTodoText}
                      onChange={(e) => setNewTodoText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addTodo()}
                      placeholder="Add a new task..."
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />

                    <input
                      type="date"
                      value={newTodoDueDate}
                      onChange={(e) => setNewTodoDueDate(e.target.value)}
                      className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      title="Optional due date"
                    />

                    <select
                      value={newTodoRepeatRule}
                      onChange={(e) => setNewTodoRepeatRule(e.target.value as any)}
                      className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      title="Repeat"
                    >
                      <option value="none">Repeat: None</option>
                      <option value="daily">Repeat: Daily</option>
                      <option value="weekly">Repeat: Weekly</option>
                      <option value="monthly">Repeat: Monthly</option>
                      <option value="yearly">Repeat: Yearly</option>
                    </select>

                    <button
                      onClick={addTodo}
                      disabled={!newTodoText.trim()}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 
                               text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add
                    </button>
                  </div>

                  {/* Todo Items */}
                  {todos.length === 0 ? (
                    <div className="text-center py-6">
                      <span className="text-sm text-gray-500 dark:text-gray-400">No tasks yet. Add your first task above!</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedTodos.map((todo) => (
                        <div
                          key={todo.id}
                          className={`flex items-start gap-3 p-3 rounded-md border ${
                            isTodoOverdue(todo)
                              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
                              : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={() => toggleTodo(todo.id)}
                            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                          />
                          {editingTodoId === todo.id ? (
                            <div className="flex-1 flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={editingTodoText}
                                onChange={(e) => setEditingTodoText(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') saveEditedTodo(todo.id);
                                  if (e.key === 'Escape') cancelEditingTodo();
                                }}
                                className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />

                              <input
                                type="date"
                                value={editingTodoDueDate}
                                onChange={(e) => setEditingTodoDueDate(e.target.value)}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                title="Optional due date"
                              />

                              <select
                                value={editingTodoRepeatRule}
                                onChange={(e) => setEditingTodoRepeatRule(e.target.value as any)}
                                className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                title="Repeat (applies to entire series)"
                              >
                                <option value="none">Repeat: None</option>
                                <option value="daily">Repeat: Daily</option>
                                <option value="weekly">Repeat: Weekly</option>
                                <option value="monthly">Repeat: Monthly</option>
                                <option value="yearly">Repeat: Yearly</option>
                              </select>

                              <button
                                onClick={() => saveEditedTodo(todo.id)}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditingTodo}
                                className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div
                                    className={`text-sm text-gray-800 dark:text-gray-200 ${
                                      todo.completed ? 'line-through text-gray-500 dark:text-gray-400' : ''
                                    }`}
                                  >
                                    {todo.text}
                                  </div>

                                  {isTodoOverdue(todo) && (
                                    <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200 px-2 py-0.5 text-[11px] font-medium border border-red-200 dark:border-red-800">
                                      Overdue
                                    </span>
                                  )}
                                </div>

                                {todo.due_date && (
                                  <div className={`mt-1 text-xs ${isTodoOverdue(todo) ? 'text-red-700 dark:text-red-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                    Due: {todo.due_date}
                                  </div>
                                )}

                                {todo.series_id && (
                                  (() => {
                                    const master = getSeriesMaster(todo.series_id);
                                    const rule = (master?.repeat_rule as any) || null;
                                    if (!rule) return null;
                                    const label = buildRepeatLabel(rule, master?.repeat_interval || 1);
                                    if (!label) return null;
                                    return (
                                      <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                        {label}
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => startEditingTodo(todo)}
                                  className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                  title="Edit"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => deleteTodo(todo.id)}
                                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                  title="Delete"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

              {/* Personal Notes Section */}
              <div id="personal-notes" className="mt-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Personal Notes
                </h2>
                <button
                  onClick={toggleUserNotesVisibility}
                  className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                           text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                >
                  {userNotesVisible ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {userNotesVisible && (
                <div className="space-y-4">
                  {/* Add New Note */}
                  <div className="space-y-3">
                    <div className="space-y-3">
                      <textarea
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder="Add a new personal note..."
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[80px]"
                      />
                      <button
                        onClick={saveNewUserNote}
                        disabled={!newNoteContent.trim() || savingNoteId === -1}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 
                                 text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed mt-2"
                      >
                        {savingNoteId === -1 ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add Note
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      💡 Tip: Type markdown-style links like [Display Text](URL) to create clickable links
                    </div>
                  </div>

                  {/* Existing Notes */}
                  {userNotesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Loading notes...</span>
                    </div>
                  ) : userNotes.length === 0 ? (
                    <div className="text-center py-6">
                      <span className="text-sm text-gray-500 dark:text-gray-400">No notes yet. Add your first note above!</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {userNotes.map((note) => (
                        <div key={note.id} className={`p-3 rounded-md border transition-all ${
                          note.pinned 
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 shadow-md' 
                            : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                        }`}>
                          {editingNoteId === note.id ? (
                            // Edit mode
                            <div className="space-y-3">
                              <textarea
                                value={editingContent}
                                onChange={(e) => {
                                  setEditingContent(e.target.value);
                                  // Auto-resize as user types
                                  const textarea = e.target as HTMLTextAreaElement;
                                  textarea.style.height = 'auto';
                                  textarea.style.height = Math.max(80, Math.min(600, textarea.scrollHeight)) + 'px';
                                }}
                                data-editing-id={note.id}
                                className="w-full min-h-[80px] max-h-[600px] p-3 border border-gray-300 dark:border-gray-600 rounded-md 
                                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white 
                                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                                         resize-y transition-colors"
                                disabled={savingNoteId === note.id}
                                style={{ height: 'auto' }}
                              />
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {editingContent.length} characters
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={cancelEditing}
                                    disabled={savingNoteId === note.id}
                                    className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 
                                             disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => updateUserNote(note.id, editingContent)}
                                    disabled={!editingContent.trim() || savingNoteId === note.id}
                                    className="inline-flex items-center px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 
                                             text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed"
                                  >
                                    {savingNoteId === note.id ? (
                                      <>
                                        <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                      </>
                                    ) : (
                                      'Save'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <div>
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {note.pinned && (
                                    <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(note.updated_at || note.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => togglePinNote(note.id)}
                                    className={`inline-flex items-center px-2 py-1 text-sm font-medium rounded-md transition-colors ${note.pinned 
                                      ? 'text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50' 
                                      : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500'
                                    }`}
                                    title={note.pinned ? 'Unpin note' : 'Pin note to top'}
                                  >
                                    {note.pinned ? (
                                      <>
                                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                        </svg>
                                        Unpin
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
                                        </svg>
                                        Pin
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => startEditingNote(note.id, note.content)}
                                    className="inline-flex items-center px-2 py-1 text-sm font-medium rounded-md transition-colors text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => openDeleteNoteModal(note.id, note.content)}
                                    className="inline-flex items-center px-2 py-1 text-sm font-medium rounded-md transition-colors text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete
                                  </button>
                                </div>
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                                {linkifyText(note.content)}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* Filters */}
        <div id="filters" data-testid="filters-section" className="mt-6">
          {/* Show loading state while reference data is loading */}
          {referenceDataLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-gray-600 dark:text-gray-400">Loading filters...</p>
            </div>
          )}
          
          {/* Show FilterPanel when data is loaded */}
          {!referenceDataLoading && (
            <FilterPanel 
              filters={{ campus: filters.campus }}
              onFiltersChange={(newFilters) => handleFiltersChange({ ...filters, ...newFilters })}
              onClearAllFilters={clearAllFilters}
              totalLeaders={filteredLeaders.length}
              campuses={campuses}
            />
          )}
        </div>

        {hasCampusSelection && (
          <>
            {/* Status Bar */}
            <div id="status-overview" className="mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Status Overview</h2>
                </div>
                <CircleStatusBar
                  data={statusData}
                  total={filters.campus.length > 0 ? 
                    allCircleLeaders.filter(leader => {
                      const normalizedFilterCampuses = filters.campus.map(c => c.trim().toLowerCase());
                      const leaderCampus = (leader.campus || '').trim().toLowerCase();
                      return normalizedFilterCampuses.includes(leaderCampus);
                    }).length : 
                    allCircleLeaders.length
                  }
                  onStatusClick={handleStatusBarClick}
                />
              </div>
            </div>

            {/* Progress Section */}
            <div id="progress">
              {/* Event Summary Progress */}
              <EventSummaryProgress
                receivedCount={eventSummaryProgress.received}
                totalCount={eventSummaryProgress.total}
                onResetCheckboxes={handleResetCheckboxes}
                filters={filters}
              />

              {/* Connections Progress */}
              <ConnectionsProgress
                filteredLeaderIds={filteredLeaderIds}
                totalFilteredLeaders={filteredLeaders.length}
              />
            </div>

            {/* Follow Up Section */}
            <div id="follow-up">
              <FollowUpTable
                selectedCampuses={filters.campus}
                onAddNote={(leaderId, name) => openAddNoteModal(leaderId, name)}
                onClearFollowUp={handleClearFollowUp}
                refreshKey={filterPanelRefreshKey}
              />
            </div>

            {/* Today's Circles */}
            <div id="today-circles">
              <TodayCircles 
                todayCircles={todayCircles}
              />
            </div>

            {/* Recent Notes */}
            <div id="recent-notes" className="mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Notes</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Filtered by current dashboard settings ({filteredLeaders.length} leaders)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {recentNotesLoading && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
                    )}
                    <button
                      onClick={toggleRecentNotesVisibility}
                      className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {recentNotesVisible ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                {recentNotesVisible && (
                  <>
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Circle Leader</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Note</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {recentNotesLoading ? (
                        <tr>
                          <td colSpan={3} className="px-4 sm:px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                              Loading recent notes...
                            </div>
                          </td>
                        </tr>
                      ) : recentNotes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 sm:px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            No recent notes
                          </td>
                        </tr>
                      ) : (
                        recentNotes.map((note) => {
                          const leader = circleLeaders.find(l => l.id === note.circle_leader_id);
                          const leaderName = leader?.name || `Leader #${note.circle_leader_id}`;
                          const dateStr = new Date(note.created_at).toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: 'numeric',
                            minute: '2-digit'
                          });
                          return (
                            <tr key={note.id}>
                              <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                                {leader ? (
                                  <Link href={`/circle/${note.circle_leader_id}`} className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-semibold">
                                    {leaderName}
                                  </Link>
                                ) : (
                                  <span className="text-gray-700 dark:text-gray-300">{leaderName}</span>
                                )}
                              </td>
                              <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                {dateStr}
                              </td>
                              <td className="px-4 sm:px-6 py-3 text-gray-800 dark:text-gray-200">
                                <div className="max-w-3xl whitespace-pre-wrap break-words">
                                  {linkifyText(note.content)}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden space-y-4">
                  {recentNotesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Loading recent notes...</span>
                    </div>
                  ) : recentNotes.length === 0 ? (
                    <div className="text-center py-8">
                      <span className="text-sm text-gray-500 dark:text-gray-400">No recent notes</span>
                    </div>
                  ) : (
                    recentNotes.map((note) => {
                      const leader = circleLeaders.find(l => l.id === note.circle_leader_id);
                      const leaderName = leader?.name || `Leader #${note.circle_leader_id}`;
                      const dateStr = new Date(note.created_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit'
                      });
                      return (
                        <div key={note.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                          {/* Circle Leader Name */}
                          <div className="mb-2">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {leader ? (
                                <Link href={`/circle/${note.circle_leader_id}`} className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-semibold">
                                  {leaderName}
                                </Link>
                              ) : (
                                <span>{leaderName}</span>
                              )}
                            </div>
                          </div>
                          
                          {/* Date of Note */}
                          <div className="mb-3">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {dateStr}
                            </div>
                          </div>
                          
                          {/* Note */}
                          <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                            {linkifyText(note.content)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* Contact Modal */}
      <ContactModal 
        isOpen={contactModal.isOpen}
        name={contactModal.name}
        email={contactModal.email}
        phone={contactModal.phone}
        onClose={closeContactModal}
      />

      {/* Log Connection Modal */}
      <LogConnectionModal
        isOpen={logConnectionModal.isOpen}
        onClose={closeLogConnectionModal}
        circleLeaderId={logConnectionModal.leaderId}
        circleLeaderName={logConnectionModal.name}
        onConnectionLogged={handleConnectionLogged}
      />

      {/* Add Note Modal */}
      <AddNoteModal
        isOpen={addNoteModal.isOpen}
        onClose={closeAddNoteModal}
        circleLeaderId={addNoteModal.leaderId}
        circleLeaderName={addNoteModal.name}
        clearFollowUp={addNoteModal.clearFollowUp}
        onNoteAdded={handleNoteAdded}
      />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={confirmResetCheckboxes}
        title="Reset Event Summary Status"
        message={`This will reset the Event Summary status to "Not Received" for all ${filteredLeaders.length} currently visible Circle Leaders. Are you sure?`}
        confirmText="Reset All"
        cancelText="Cancel"
        type="warning"
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModal}
        onClose={() => setExportModal(false)}
        leaders={filteredLeaders}
      />

      </div>
      
      {/* Delete Note Confirmation Modal - positioned outside main content */}
      {deleteNoteModal.isOpen && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={closeDeleteNoteModal}
        >
          <div 
            className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/20 dark:border-gray-700/50 transform transition-all animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
                  <svg
                    className="h-6 w-6 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
              </div>
              
              <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white text-center mb-4">
                Delete Note
              </h3>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  Are you sure you want to delete this note? This action cannot be undone and the note will be deleted forever.
                </p>
                {deleteNoteModal.content && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border max-h-32 overflow-y-auto">
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {deleteNoteModal.content.length > 200 
                        ? `${deleteNoteModal.content.substring(0, 200)}...` 
                        : deleteNoteModal.content
                      }
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => copyNoteToClipboard(deleteNoteModal.content)}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors touch-manipulation"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Contents
                </button>
                <button
                  onClick={confirmDeleteNote}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors touch-manipulation"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
                <button
                  onClick={closeDeleteNoteModal}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
