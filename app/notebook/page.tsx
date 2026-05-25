'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotebookContext } from '../../contexts/NotebookContext';
import NotebookEmptyState from '../../components/notebook/NotebookEmptyState';
import NotebookEditorSkeleton from '../../components/notebook/NotebookEditorSkeleton';
import { supabase } from '../../lib/supabase';

const LAST_PAGE_STORAGE_KEY = 'notebook.lastPageId';

export default function NotebookRootPage() {
  const router = useRouter();
  const { setActiveFolderId, setActivePage } = useNotebookContext();
  const [resolving, setResolving] = useState(true);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;

    // Warm path: remember the last page we opened so reloads of /notebook
    // redirect immediately with no DB lookup. The [pageId] page handles the
    // case where that page has since been deleted (renders skeleton then
    // falls back via fetchPage error path).
    if (typeof window !== 'undefined') {
      try {
        const lastId = window.localStorage.getItem(LAST_PAGE_STORAGE_KEY);
        if (lastId) {
          router.replace(`/notebook/${lastId}`);
          return;
        }
      } catch {}
    }

    (async () => {
      try {
        // Pull the full detail in one query so the [pageId] page can render
        // from cache without a second round-trip.
        const { data: recentPage } = await supabase
          .from('notebook_pages')
          .select('id, title, content, editor_mode, ink, has_ink, ink_stroke_count, ink_updated_at, checklists, folder_id, is_pinned, position, user_id, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentPage) {
          setActiveFolderId(recentPage.folder_id);
          setActivePage(recentPage);
          try { window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, recentPage.id); } catch {}
          router.replace(`/notebook/${recentPage.id}`);
          return;
        }
        setResolving(false);
      } catch {
        setResolving(false);
      }
    })();
  }, [router, setActiveFolderId, setActivePage]);

  if (resolving) {
    return <NotebookEditorSkeleton />;
  }

  return <NotebookEmptyState />;
}
