'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useNotebookContext } from '../../../contexts/NotebookContext';
import NotebookEditorSkeleton from '../../../components/notebook/NotebookEditorSkeleton';

// Code-split the heavy editor (rich text, dictation, AI) so it doesn't block
// the initial notebook shell paint.
const NotebookEditor = dynamic(
  () => import('../../../components/notebook/NotebookEditor'),
  { ssr: false, loading: () => <NotebookEditorSkeleton /> }
);

export default function NotebookPageView() {
  const params = useParams<{ pageId: string }>();
  const pageId = params?.pageId;
  const { activePage, loadPageOptimistic, setActiveFolderId } = useNotebookContext();

  useEffect(() => {
    if (!pageId) return;
    // Optimistic: if cached, setActivePage runs synchronously and the editor
    // renders this same tick. Otherwise we keep the skeleton until fetch lands.
    loadPageOptimistic(pageId);
  }, [pageId]);

  useEffect(() => {
    if (activePage && activePage.id === pageId) {
      setActiveFolderId(activePage.folder_id);
    }
  }, [activePage?.id, pageId]);

  if (!activePage || activePage.id !== pageId) {
    return <NotebookEditorSkeleton />;
  }

  return <NotebookEditor />;
}
