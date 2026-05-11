'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotebookContext } from '../../contexts/NotebookContext';
import NotebookEmptyState from '../../components/notebook/NotebookEmptyState';
import NotebookEditorSkeleton from '../../components/notebook/NotebookEditorSkeleton';

export default function NotebookRootPage() {
  const router = useRouter();
  const { folders, initialized, setActiveFolderId } = useNotebookContext();
  const [resolving, setResolving] = useState(true);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    // Wait until the provider has finished its initial folder load.
    if (!initialized || hasResolvedRef.current) return;
    hasResolvedRef.current = true;

    (async () => {
      try {
        // No folders → no pages possible — render empty state immediately.
        const flat = folders.flatMap(f => [f, ...(f.children || [])]);
        if (!flat.length) {
          setResolving(false);
          return;
        }

        const { supabase } = await import('../../lib/supabase');
        const { data: recentPage } = await supabase
          .from('notebook_pages')
          .select('id, folder_id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentPage) {
          setActiveFolderId(recentPage.folder_id);
          router.replace(`/notebook/${recentPage.id}`);
          return;
        }
        setResolving(false);
      } catch {
        setResolving(false);
      }
    })();
  }, [initialized, folders, router, setActiveFolderId]);

  if (!initialized || resolving) {
    return <NotebookEditorSkeleton />;
  }

  return <NotebookEmptyState />;
}
