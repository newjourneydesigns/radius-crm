'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotebookContext } from '../../contexts/NotebookContext';
import NotebookEmptyState from '../../components/notebook/NotebookEmptyState';

export default function NotebookRootPage() {
  const router = useRouter();
  const { fetchFolders, createPage, setActiveFolderId, loading } = useNotebookContext();

  useEffect(() => {
    async function init() {
      const { supabase } = await import('../../lib/supabase');

      // Fetch folders and most recent page in parallel — RLS scopes pages to current user
      const [allFolders, { data: recentPage }] = await Promise.all([
        fetchFolders(),
        supabase
          .from('notebook_pages')
          .select('id, folder_id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (!allFolders.length) return;

      if (recentPage) {
        setActiveFolderId(recentPage.folder_id);
        router.replace(`/notebook/${recentPage.id}`);
      }
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f1117]">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <NotebookEmptyState />;
}
