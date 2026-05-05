'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotebookContext } from '../../contexts/NotebookContext';
import NotebookEmptyState from '../../components/notebook/NotebookEmptyState';

export default function NotebookRootPage() {
  const router = useRouter();
  const { fetchFolders, setActiveFolderId, loading } = useNotebookContext();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function init() {
      let redirected = false;
      const { supabase } = await import('../../lib/supabase');

      try {
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
          redirected = true;
          setActiveFolderId(recentPage.folder_id);
          router.replace(`/notebook/${recentPage.id}`);
          return;
        }
      } finally {
        if (!redirected) setInitializing(false);
      }
    }

    init();
  }, []);

  if (loading || initializing) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f1117]">
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <NotebookEmptyState />;
}
