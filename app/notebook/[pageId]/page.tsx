'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useNotebookContext } from '../../../contexts/NotebookContext';
import NotebookEditor from '../../../components/notebook/NotebookEditor';
import NotebookEmptyState from '../../../components/notebook/NotebookEmptyState';

export default function NotebookPageView() {
  const { pageId } = useParams<{ pageId: string }>();
  const { fetchPage, fetchFolders, activePage, setActiveFolderId } = useNotebookContext();

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      const [page] = await Promise.all([fetchPage(pageId), fetchFolders()]);
      if (page) setActiveFolderId(page.folder_id);
    })();
  }, [pageId]);

  if (!activePage) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f1117]">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <NotebookEditor />;
}
