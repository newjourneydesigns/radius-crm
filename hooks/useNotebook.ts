'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type {
  NotebookFolder,
  NotebookPage,
  NotebookPageCard,
  NotebookPageShare,
} from '../lib/supabase';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict';

type NotebookPageUpdates = Partial<Pick<
  NotebookPage,
  'title' | 'content' | 'checklists' | 'is_pinned' | 'folder_id' | 'editor_mode' | 'ink' | 'has_ink' | 'ink_stroke_count' | 'ink_updated_at'
>>;

const NOTEBOOK_PAGE_LIST_SELECT = 'id, title, editor_mode, has_ink, ink_stroke_count, ink_updated_at, checklists, folder_id, is_pinned, position, user_id, created_at, updated_at';
const NOTEBOOK_PAGE_DETAIL_SELECT = 'id, title, content, editor_mode, ink, has_ink, ink_stroke_count, ink_updated_at, checklists, folder_id, is_pinned, position, user_id, created_at, updated_at';
const NOTEBOOK_PAGE_SHARE_SELECT = `
  page_id,
  user_id,
  shared_by,
  created_at,
  shared_with:users!notebook_page_shares_user_id_fkey(id, name, email),
  shared_by_user:users!notebook_page_shares_shared_by_fkey(id, name, email)
`;

type NotebookPageShareRow = Omit<NotebookPageShare, 'shared_with' | 'shared_by_user'> & {
  shared_with?: NotebookPageShare['shared_with'];
  shared_by_user?: NotebookPageShare['shared_by_user'];
};

function firstUser(value: NotebookPageShare['shared_with']) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeShare(row: NotebookPageShareRow): NotebookPageShare {
  return {
    ...row,
    shared_with: firstUser(row.shared_with),
    shared_by_user: firstUser(row.shared_by_user),
  };
}

function withInkMetadata(updates: NotebookPageUpdates): NotebookPageUpdates {
  if (!Object.prototype.hasOwnProperty.call(updates, 'ink')) return updates;
  const strokeCount = updates.ink?.strokes?.length ?? 0;
  return {
    ...updates,
    has_ink: strokeCount > 0,
    ink_stroke_count: strokeCount,
    ink_updated_at: strokeCount > 0 ? new Date().toISOString() : null,
  };
}

export function useNotebook() {
  const [folders, setFolders] = useState<NotebookFolder[]>([]);
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [sharedPages, setSharedPages] = useState<NotebookPage[]>([]);
  const [activePage, setActivePage] = useState<NotebookPage | null>(null);
  const [pagesById, setPagesById] = useState<Record<string, NotebookPage>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveStatusPageId, setSaveStatusPageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ pageId: string; updates: NotebookPageUpdates; baseUpdatedAt?: string } | null>(null);
  const foldersInFlightRef = useRef<Promise<NotebookFolder[]> | null>(null);
  const pinnedPagesInFlightRef = useRef<Promise<NotebookPage[]> | null>(null);
  const sharedPagesInFlightRef = useRef<Promise<NotebookPage[]> | null>(null);
  const activePageRef = useRef<NotebookPage | null>(null);
  const lastLocalSaveUpdatedAtRef = useRef<Record<string, string>>({});
  const realtimePageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRealtimePageRef = useRef<NotebookPage | null>(null);
  const realtimeLinksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyRealtimePage = useCallback((page: NotebookPage) => {
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, ...page } : p));
    setSharedPages(prev => prev.map(p => p.id === page.id ? { ...p, ...page } : p));
    setActivePage(prev => prev?.id === page.id ? { ...prev, ...page } : prev);
    setPagesById(prev => ({
      ...prev,
      [page.id]: { ...prev[page.id], ...page },
    }));
  }, []);

  useEffect(() => {
    activePageRef.current = activePage;

    if (pendingSaveRef.current && pendingSaveRef.current.pageId !== activePage?.id) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
    }

    if (saveStatusPageId && saveStatusPageId !== activePage?.id) {
      setSaveStatus('idle');
      setSaveStatusPageId(null);
    }
  }, [activePage, saveStatusPageId]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      if (realtimePageTimerRef.current) clearTimeout(realtimePageTimerRef.current);
      if (realtimeLinksTimerRef.current) clearTimeout(realtimeLinksTimerRef.current);
    };
  }, []);

  const isActivePageShared = useMemo(() => {
    if (!activePage?.id || !currentUserId) return false;
    return (
      activePage.user_id !== currentUserId ||
      Boolean(activePage.shares?.length) ||
      Boolean(activePage.shared_with_me?.length)
    );
  }, [
    activePage?.id,
    activePage?.user_id,
    activePage?.shares?.length,
    activePage?.shared_with_me?.length,
    currentUserId,
  ]);

  const activeSaveStatus = saveStatusPageId && saveStatusPageId !== activePage?.id
    ? 'idle'
    : saveStatus;

  // ── Helpers ─────────────────────────────────────────────────

  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return user;
  }

  function buildFolderTree(flat: NotebookFolder[]): NotebookFolder[] {
    const roots = flat.filter(f => f.parent_id === null);
    const children = flat.filter(f => f.parent_id !== null);
    return roots.map(root => ({
      ...root,
      children: children.filter(c => c.parent_id === root.id),
    }));
  }

  // ── Folders ─────────────────────────────────────────────────

  const fetchFolders = useCallback(async () => {
    // Dedupe concurrent calls — provider mount + child effects can fire together
    if (foldersInFlightRef.current) return foldersInFlightRef.current;

    setLoading(true);
    setError(null);
    const run = (async () => {
      try {
        const user = await getCurrentUser();

        const { data, error: err } = await supabase
          .from('notebook_folders')
          .select('*')
          .eq('user_id', user.id)
          .order('is_unfiled', { ascending: false })
          .order('position', { ascending: true });
        if (err) throw err;

        const existing = data || [];

        // Auto-create Unfiled folder if it doesn't exist yet
        if (!existing.some(f => f.is_unfiled)) {
          const { data: newFolder, error: createErr } = await supabase
            .from('notebook_folders')
            .insert({
              user_id: user.id,
              title: 'Unfiled',
              icon: 'Folder',
              color: '#6b7280',
              position: 9999,
              is_unfiled: true,
            })
            .select()
            .single();
          if (createErr) throw createErr;
          existing.push(newFolder);
        }

        setFolders(buildFolderTree(existing));
        return existing;
      } catch (err: any) {
        setError(err.message);
        return [];
      } finally {
        setLoading(false);
        setInitialized(true);
        foldersInFlightRef.current = null;
      }
    })();

    foldersInFlightRef.current = run;
    return run;
  }, []);

  const createFolder = useCallback(async (
    title: string,
    icon = 'Folder',
    color = '#6366f1',
    parentId: string | null = null,
  ): Promise<NotebookFolder | null> => {
    setError(null);
    try {
      const user = await getCurrentUser();

      const { data, error: err } = await supabase
        .from('notebook_folders')
        .insert({ user_id: user.id, title, icon, color, parent_id: parentId, position: 0 })
        .select()
        .single();
      if (err) throw err;

      await fetchFolders();
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [fetchFolders]);

  const updateFolder = useCallback(async (
    folderId: string,
    updates: Partial<Pick<NotebookFolder, 'title' | 'icon' | 'color' | 'position'>>,
  ) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('notebook_folders')
        .update(updates)
        .eq('id', folderId);
      if (err) throw err;

      setFolders(prev => {
        const flat = prev.flatMap(f => [f, ...(f.children || [])]);
        const updated = flat.map(f => f.id === folderId ? { ...f, ...updates } : f);
        return buildFolderTree(updated);
      });
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const deleteFolder = useCallback(async (folderId: string) => {
    setError(null);
    try {
      const user = await getCurrentUser();

      // Find the Unfiled folder to move pages into
      const flat = folders.flatMap(f => [f, ...(f.children || [])]);
      const unfiled = flat.find(f => f.is_unfiled);

      if (unfiled) {
        await supabase
          .from('notebook_pages')
          .update({ folder_id: unfiled.id })
          .eq('folder_id', folderId)
          .eq('user_id', user.id);
      }

      const { error: err } = await supabase
        .from('notebook_folders')
        .delete()
        .eq('id', folderId);
      if (err) throw err;

      await fetchFolders();
    } catch (err: any) {
      setError(err.message);
    }
  }, [folders, fetchFolders]);

  const reorderFolders = useCallback(async (orderedIds: string[]) => {
    setError(null);
    try {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('notebook_folders').update({ position: idx }).eq('id', id)
        )
      );
      await fetchFolders();
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchFolders]);

  // ── Pages ────────────────────────────────────────────────────

  const fetchPagesForFolder = useCallback(async (folderId: string): Promise<NotebookPage[]> => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('notebook_pages')
        .select(NOTEBOOK_PAGE_LIST_SELECT)
        .eq('folder_id', folderId)
        .order('is_pinned', { ascending: false })
        .order('position', { ascending: true })
        .order('updated_at', { ascending: false });
      if (err) throw err;
      const folderPages = (data || []) as unknown as NotebookPage[];

      setPages(prev => {
        const withoutFolder = prev.filter(p => p.folder_id !== folderId);
        return [...withoutFolder, ...folderPages];
      });
      if (folderPages.length) {
        setPagesById(prev => {
          const next = { ...prev };
          for (const p of folderPages) next[p.id] = { ...next[p.id], ...p };
          return next;
        });
      }
      return folderPages;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  const reorderPages = useCallback(async (orderedIds: string[]) => {
    // Optimistically update local state
    setPages(prev => {
      const indexMap = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map(p =>
        indexMap.has(p.id)
          ? { ...p, position: indexMap.get(p.id) as number }
          : p
      );
    });
    try {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('notebook_pages').update({ position: idx }).eq('id', id)
        )
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchAllPinnedPages = useCallback(async () => {
    if (pinnedPagesInFlightRef.current) return pinnedPagesInFlightRef.current;

    setError(null);
    const run = (async () => {
      try {
        const user = await getCurrentUser();

        const { data, error: err } = await supabase
          .from('notebook_pages')
          .select(NOTEBOOK_PAGE_LIST_SELECT)
          .eq('user_id', user.id)
          .eq('is_pinned', true)
          .order('updated_at', { ascending: false });
        if (err) throw err;
        if (data && data.length) {
          setPagesById(prev => {
            const next = { ...prev };
            for (const p of data) next[p.id] = { ...next[p.id], ...p };
            return next;
          });
        }
        return (data || []) as unknown as NotebookPage[];
      } catch (err: any) {
        setError(err.message);
        return [];
      } finally {
        pinnedPagesInFlightRef.current = null;
      }
    })();

    pinnedPagesInFlightRef.current = run;
    return run;
  }, []);

  const fetchSharedPages = useCallback(async () => {
    if (sharedPagesInFlightRef.current) return sharedPagesInFlightRef.current;

    setError(null);
    const run = (async () => {
      try {
        const user = await getCurrentUser();

        const { data, error: err } = await supabase
          .from('notebook_pages')
          .select(`
            ${NOTEBOOK_PAGE_LIST_SELECT},
            shared_with_me:notebook_page_shares!inner(${NOTEBOOK_PAGE_SHARE_SELECT})
          `)
          .eq('shared_with_me.user_id', user.id)
          .order('updated_at', { ascending: false });
        if (err) throw err;

        const normalized = ((data || []) as unknown as Array<NotebookPage & { shared_with_me?: NotebookPageShareRow[] }>).map(page => ({
          ...page,
          shared_with_me: (page.shared_with_me || []).map(normalizeShare),
        })) as NotebookPage[];

        setSharedPages(normalized);
        if (normalized.length) {
          setPagesById(prev => {
            const next = { ...prev };
            for (const p of normalized) next[p.id] = { ...next[p.id], ...p };
            return next;
          });
        }
        return normalized;
      } catch (err: any) {
        setError(err.message);
        return [];
      } finally {
        sharedPagesInFlightRef.current = null;
      }
    })();

    sharedPagesInFlightRef.current = run;
    return run;
  }, []);

  // Fast: content only — shows editor immediately
  const fetchPageContent = useCallback(async (pageId: string): Promise<NotebookPage | null> => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('notebook_pages')
        .select(NOTEBOOK_PAGE_DETAIL_SELECT)
        .eq('id', pageId)
        .single();
      if (err) throw err;
      setActivePage(prev => {
        // Preserve existing link data if we're refreshing a cached page
        if (prev?.id === pageId) {
          return { ...prev, ...data };
        }
        return data;
      });
      setPagesById(prev => ({ ...prev, [pageId]: { ...prev[pageId], ...data } }));
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  // Deferred: links only — runs after editor is visible
  const fetchPageLinks = useCallback(async (pageId: string): Promise<void> => {
    try {
      const { data, error: err } = await supabase
        .from('notebook_pages')
        .select(`
          id,
          linked_leaders:notebook_page_leaders(
            *,
            circle_leader:circle_leaders(id, name, campus, status)
          ),
          linked_boards:notebook_page_boards(
            *,
            project_board:project_boards(id, title, description)
          ),
          linked_cards:notebook_page_cards(
            *,
            board_card:board_cards(
              id, title, description, priority, due_date, is_complete, board_id, column_id,
              project_board:project_boards(id, title),
              board_column:board_columns(id, title)
            )
          ),
          shares:notebook_page_shares(${NOTEBOOK_PAGE_SHARE_SELECT})
        `)
        .eq('id', pageId)
        .single();
      if (err || !data) return;
      const linkPatch = {
        linked_leaders: data.linked_leaders,
        linked_boards: data.linked_boards,
        linked_cards: data.linked_cards,
        shares: ((data.shares || []) as NotebookPageShareRow[]).map(normalizeShare),
      } satisfies Partial<NotebookPage>;
      setActivePage(prev =>
        prev?.id === pageId ? { ...prev, ...linkPatch } : prev
      );
      setPagesById(prev =>
        prev[pageId] ? { ...prev, [pageId]: { ...prev[pageId], ...linkPatch } } : prev
      );
    } catch {
      // non-critical — right panel just stays empty
    }
  }, []);

  const fetchPage = useCallback(async (pageId: string): Promise<NotebookPage | null> => {
    const page = await fetchPageContent(pageId);
    if (page) fetchPageLinks(pageId); // fire-and-forget
    return page;
  }, [fetchPageContent, fetchPageLinks]);

  // Optimistic load: render cached page instantly, revalidate in background.
  // Returns the cached page (or null) synchronously plus the revalidation
  // Promise so callers can detect deleted pages.
  const loadPageOptimistic = useCallback((pageId: string): { cached: NotebookPage | null; revalidate: Promise<NotebookPage | null> } => {
    const cached = pagesById[pageId];
    if (cached) {
      const hasContent = Object.prototype.hasOwnProperty.call(cached, 'content');
      const hasInkPayload = cached.editor_mode !== 'ink' || Object.prototype.hasOwnProperty.call(cached, 'ink');
      if (hasContent && hasInkPayload) setActivePage(cached);
      return {
        cached: hasContent && hasInkPayload ? cached : null,
        revalidate: fetchPage(pageId),
      };
    }
    return { cached: null, revalidate: fetchPage(pageId) };
  }, [pagesById, fetchPage]);

  const createPage = useCallback(async (folderId: string): Promise<NotebookPage | null> => {
    setError(null);
    try {
      const user = await getCurrentUser();

      const { data, error: err } = await supabase
        .from('notebook_pages')
        .insert({ user_id: user.id, folder_id: folderId, title: 'Untitled', content: '', editor_mode: 'text' })
        .select()
        .single();
      if (err) throw err;

      setPages(prev => [data, ...prev]);
      setPagesById(prev => ({ ...prev, [data.id]: data }));
      setActivePage(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  // Immediate update (for pin toggle etc.)
  const updatePage = useCallback(async (
    pageId: string,
    updates: NotebookPageUpdates,
  ) => {
    setError(null);
    const updatePayload = withInkMetadata(updates);
    try {
      const { data, error: err } = await supabase
        .from('notebook_pages')
        .update(updatePayload)
        .eq('id', pageId)
        .select(NOTEBOOK_PAGE_DETAIL_SELECT)
        .single();
      if (err) throw err;

      const page = data as unknown as NotebookPage;
      lastLocalSaveUpdatedAtRef.current[pageId] = page.updated_at;
      applyRealtimePage(page);
    } catch (err: any) {
      setError(err.message);
    }
  }, [applyRealtimePage]);

  // Debounced save called by the editor on every keystroke
  const scheduleSave = useCallback((
    pageId: string,
    updates: NotebookPageUpdates,
  ) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const updatePayload = withInkMetadata(updates);
    const currentPage = activePageRef.current?.id === pageId ? activePageRef.current : pagesById[pageId];
    pendingSaveRef.current = pendingSaveRef.current?.pageId === pageId
      ? { ...pendingSaveRef.current, updates: { ...pendingSaveRef.current.updates, ...updatePayload } }
      : { pageId, updates: updatePayload, baseUpdatedAt: currentPage?.updated_at };
    setSaveStatusPageId(pageId);
    setSaveStatus('saving');

    saveTimerRef.current = setTimeout(async () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      if (activePageRef.current?.id !== pending.pageId) {
        setSaveStatus('idle');
        setSaveStatusPageId(null);
        return;
      }
      try {
        let query = supabase
          .from('notebook_pages')
          .update(pending.updates)
          .eq('id', pending.pageId);
        if (pending.baseUpdatedAt) query = query.eq('updated_at', pending.baseUpdatedAt);

        const { data, error: err } = await query
          .select(NOTEBOOK_PAGE_DETAIL_SELECT)
          .maybeSingle();
        if (err) throw err;
        if (!data) {
          await fetchPage(pending.pageId);
          if (activePageRef.current?.id === pending.pageId) {
            setError('This note changed elsewhere. Review the shared update before saving again.');
            setSaveStatusPageId(pending.pageId);
            setSaveStatus('conflict');
          }
          return;
        }

        // If the user kept writing while this request was in flight, a newer
        // debounced payload is already queued. Do not echo this older payload
        // back into activePage or it can clobber the live ink canvas.
        const currentPending = pendingSaveRef.current as typeof pending | null;
        const hasNewerPendingSave = currentPending?.pageId === pending.pageId;
        if (hasNewerPendingSave) return;

        const page = data as unknown as NotebookPage;
        lastLocalSaveUpdatedAtRef.current[pending.pageId] = page.updated_at;
        applyRealtimePage(page);
        if (activePageRef.current?.id === pending.pageId) {
          setSaveStatusPageId(pending.pageId);
          setSaveStatus('saved');
        }
      } catch (err: any) {
        if (activePageRef.current?.id === pending.pageId) {
          setError(err.message);
          setSaveStatus('idle');
          setSaveStatusPageId(pending.pageId);
        }
      }
    }, 1000);
  }, [applyRealtimePage, fetchPage, pagesById]);

  const deletePage = useCallback(async (pageId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('notebook_pages')
        .delete()
        .eq('id', pageId);
      if (err) throw err;

      setPages(prev => prev.filter(p => p.id !== pageId));
      setSharedPages(prev => prev.filter(p => p.id !== pageId));
      setPagesById(prev => {
        if (!prev[pageId]) return prev;
        const rest = { ...prev };
        delete rest[pageId];
        return rest;
      });
      if (activePage?.id === pageId) setActivePage(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [activePage]);

  const searchPages = useCallback(async (query: string): Promise<NotebookPage[]> => {
    if (!query.trim()) return [];
    try {
      const { data, error: err } = await supabase
        .from('notebook_pages')
        .select(NOTEBOOK_PAGE_LIST_SELECT)
        .textSearch('fts', query, { type: 'websearch', config: 'english' })
        .order('updated_at', { ascending: false })
        .limit(20);
      if (err) throw err;
      return (data || []) as unknown as NotebookPage[];
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  // ── Sharing ────────────────────────────────────────────────

  const fetchSystemUsers = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id, name, email')
        .order('name');
      if (err) throw err;
      return (data || []) as { id: string; name: string; email: string }[];
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  const fetchPageShares = useCallback(async (pageId: string): Promise<NotebookPageShare[]> => {
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('notebook_page_shares')
        .select(NOTEBOOK_PAGE_SHARE_SELECT)
        .eq('page_id', pageId)
        .order('created_at', { ascending: true });
      if (err) throw err;

      const shares = ((data || []) as unknown as NotebookPageShareRow[]).map(normalizeShare);
      setActivePage(prev => prev?.id === pageId ? { ...prev, shares } : prev);
      setPagesById(prev => (prev[pageId] ? { ...prev, [pageId]: { ...prev[pageId], shares } } : prev));
      return shares;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  const sharePage = useCallback(async (pageId: string, userId: string) => {
    setError(null);
    try {
      const user = await getCurrentUser();

      const { error: err } = await supabase
        .from('notebook_page_shares')
        .insert({ page_id: pageId, user_id: userId, shared_by: user.id });
      if (err) throw err;

      await fetchPageShares(pageId);
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchPageShares]);

  const unsharePage = useCallback(async (pageId: string, userId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('notebook_page_shares')
        .delete()
        .eq('page_id', pageId)
        .eq('user_id', userId);
      if (err) throw err;

      await fetchPageShares(pageId);
      setSharedPages(prev => prev.filter(p => p.id !== pageId || p.user_id === userId));
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchPageShares]);

  // ── Leader Links ─────────────────────────────────────────────

  const linkLeader = useCallback(async (pageId: string, leaderId: number) => {
    setError(null);
    try {
      const user = await getCurrentUser();

      const { error: err } = await supabase
        .from('notebook_page_leaders')
        .insert({ page_id: pageId, circle_leader_id: leaderId, linked_by: user.id });
      if (err) throw err;

      // Refresh full page to get joined leader data
      await fetchPage(pageId);
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchPage]);

  const unlinkLeader = useCallback(async (pageId: string, leaderId: number) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('notebook_page_leaders')
        .delete()
        .eq('page_id', pageId)
        .eq('circle_leader_id', leaderId);
      if (err) throw err;

      setActivePage(prev =>
        prev?.id !== pageId ? prev : {
          ...prev,
          linked_leaders: prev.linked_leaders?.filter(l => l.circle_leader_id !== leaderId),
        }
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ── Board Links ──────────────────────────────────────────────

  const linkBoard = useCallback(async (pageId: string, boardId: string) => {
    setError(null);
    try {
      const user = await getCurrentUser();

      const { error: err } = await supabase
        .from('notebook_page_boards')
        .insert({ page_id: pageId, board_id: boardId, linked_by: user.id });
      if (err) throw err;

      await fetchPage(pageId);
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchPage]);

  const unlinkBoard = useCallback(async (pageId: string, boardId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('notebook_page_boards')
        .delete()
        .eq('page_id', pageId)
        .eq('board_id', boardId);
      if (err) throw err;

      setActivePage(prev =>
        prev?.id !== pageId ? prev : {
          ...prev,
          linked_boards: prev.linked_boards?.filter(b => b.board_id !== boardId),
        }
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ── Card Links ───────────────────────────────────────────────

  const linkCard = useCallback(async (pageId: string, cardId: string) => {
    setError(null);
    try {
      const user = await getCurrentUser();

      const { error: err } = await supabase
        .from('notebook_page_cards')
        .insert({ page_id: pageId, card_id: cardId, linked_by: user.id });
      if (err) throw err;

      await fetchPage(pageId);
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchPage]);

  const unlinkCard = useCallback(async (pageId: string, cardId: string) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('notebook_page_cards')
        .delete()
        .eq('page_id', pageId)
        .eq('card_id', cardId);
      if (err) throw err;

      setActivePage(prev =>
        prev?.id !== pageId ? prev : {
          ...prev,
          linked_cards: prev.linked_cards?.filter(c => c.card_id !== cardId),
        }
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Update a linked card's fields directly (title, priority, due_date, is_complete, description)
  const updateLinkedCard = useCallback(async (
    cardId: string,
    updates: Partial<{ title: string; description: string; priority: string; due_date: string | null; is_complete: boolean }>,
  ) => {
    setError(null);
    try {
      const { error: err } = await supabase
        .from('board_cards')
        .update(updates)
        .eq('id', cardId);
      if (err) throw err;

      // Optimistically update the linked card in activePage
      setActivePage(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          linked_cards: prev.linked_cards?.map(lc =>
            lc.card_id !== cardId ? lc : {
              ...lc,
              board_card: lc.board_card ? { ...lc.board_card, ...updates } : lc.board_card,
            } as NotebookPageCard
          ),
        };
      });
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const handleNotebookRealtime = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    if (payload.table === 'notebook_pages') {
      const page = payload.new as unknown as NotebookPage | undefined;
      if (!page?.id) return;
      if (lastLocalSaveUpdatedAtRef.current[page.id] === page.updated_at) return;

      pendingRealtimePageRef.current = page;
      if (realtimePageTimerRef.current) clearTimeout(realtimePageTimerRef.current);
      realtimePageTimerRef.current = setTimeout(() => {
        const pendingPage = pendingRealtimePageRef.current;
        pendingRealtimePageRef.current = null;
        if (pendingPage) applyRealtimePage(pendingPage);
      }, 500);
      return;
    }

    if (!activePage?.id) return;
    if (realtimeLinksTimerRef.current) clearTimeout(realtimeLinksTimerRef.current);
    realtimeLinksTimerRef.current = setTimeout(() => {
      if (activePageRef.current?.id) fetchPageLinks(activePageRef.current.id);
    }, 500);
  }, [activePage?.id, applyRealtimePage, fetchPageLinks]);

  useRealtimeSubscription(
    `notebook-page-${activePage?.id ?? 'none'}`,
    activePage?.id && isActivePageShared ? [
      { table: 'notebook_pages', event: 'UPDATE', filter: `id=eq.${activePage.id}` },
      { table: 'notebook_page_shares', filter: `page_id=eq.${activePage.id}` },
      { table: 'notebook_page_leaders', filter: `page_id=eq.${activePage.id}` },
      { table: 'notebook_page_boards', filter: `page_id=eq.${activePage.id}` },
      { table: 'notebook_page_cards', filter: `page_id=eq.${activePage.id}` },
    ] : [],
    handleNotebookRealtime,
    Boolean(activePage?.id && isActivePageShared),
  );

  return {
    // State
    folders,
    pages,
    sharedPages,
    pagesById,
    activePage,
    saveStatus: activeSaveStatus,
    isRealtimeActive: isActivePageShared,
    loading,
    initialized,
    error,
    // Setters
    setActivePage,
    setPages,
    // Folder operations
    fetchFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    reorderFolders,
    // Page operations
    fetchPagesForFolder,
    reorderPages,
    fetchAllPinnedPages,
    fetchSharedPages,
    fetchPage,
    loadPageOptimistic,
    createPage,
    updatePage,
    scheduleSave,
    deletePage,
    searchPages,
    fetchSystemUsers,
    fetchPageShares,
    sharePage,
    unsharePage,
    // Link operations
    linkLeader,
    unlinkLeader,
    linkBoard,
    unlinkBoard,
    linkCard,
    unlinkCard,
    updateLinkedCard,
  };
}
