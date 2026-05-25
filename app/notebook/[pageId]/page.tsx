'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useNotebookContext } from '../../../contexts/NotebookContext';
import NotebookEditorSkeleton from '../../../components/notebook/NotebookEditorSkeleton';
import NotebookEmptyState from '../../../components/notebook/NotebookEmptyState';

const LAST_PAGE_STORAGE_KEY = 'notebook.lastPageId';

// Code-split the heavy editor (rich text, dictation, AI) so it doesn't block
// the initial notebook shell paint.
const NotebookEditor = dynamic(
  () => import('../../../components/notebook/NotebookEditor'),
  { ssr: false, loading: () => <NotebookEditorSkeleton /> }
);

export default function NotebookPageView() {
  const params = useParams<{ pageId: string }>();
  const router = useRouter();
  const pageId = params?.pageId;
  const { activePage, loadPageOptimistic, setActiveFolderId } = useNotebookContext();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!pageId) return;
    setNotFound(false);
    const { revalidate } = loadPageOptimistic(pageId);
    let cancelled = false;
    revalidate.then(page => {
      if (cancelled) return;
      if (!page) {
        // Page was deleted or no longer accessible — clear the stale hint and
        // bounce to /notebook so the user lands somewhere valid.
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(LAST_PAGE_STORAGE_KEY);
          }
        } catch {}
        setNotFound(true);
      }
    });
    return () => { cancelled = true; };
  }, [pageId]);

  useEffect(() => {
    if (activePage && activePage.id === pageId) {
      setActiveFolderId(activePage.folder_id);
      // Persist for the /notebook root redirect on next visit.
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, activePage.id);
        }
      } catch {}
    }
  }, [activePage?.id, pageId]);

  // Redirect after the not-found render so we don't fight React in the same tick.
  useEffect(() => {
    if (notFound) router.replace('/notebook');
  }, [notFound, router]);

  if (notFound && (!activePage || activePage.id !== pageId)) {
    return <NotebookEmptyState />;
  }

  if (!activePage || activePage.id !== pageId) {
    return <NotebookEditorSkeleton />;
  }

  return <NotebookEditor />;
}
