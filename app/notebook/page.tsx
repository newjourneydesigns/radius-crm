'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotebookContext } from '../../contexts/NotebookContext';
import NotebookEmptyState from '../../components/notebook/NotebookEmptyState';
import NotebookEditorSkeleton from '../../components/notebook/NotebookEditorSkeleton';
import { supabase } from '../../lib/supabase';

export default function NotebookRootPage() {
  const router = useRouter();
  const { setActiveFolderId } = useNotebookContext();
  const [resolving, setResolving] = useState(true);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;

    (async () => {
      try {
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
  }, [router, setActiveFolderId]);

  if (resolving) {
    return <NotebookEditorSkeleton />;
  }

  return <NotebookEmptyState />;
}
