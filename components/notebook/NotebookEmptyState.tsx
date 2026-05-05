'use client';

import { useRouter } from 'next/navigation';
import { useNotebookContext } from '../../contexts/NotebookContext';

export default function NotebookEmptyState() {
  const router = useRouter();
  const { folders, createPage, fetchFolders } = useNotebookContext();

  async function handleCreate() {
    let allFolders = folders.flatMap(f => [f, ...(f.children || [])]);
    if (!allFolders.length) {
      allFolders = await fetchFolders();
    }
    const unfiled = allFolders.find(f => f.is_unfiled);
    const target = unfiled || allFolders[0];
    if (!target) return;

    const page = await createPage(target.id);
    if (page) router.push(`/notebook/${page.id}`);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#0f1117] p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Your notebook is empty</h2>
        <p className="text-sm text-gray-400 max-w-xs">
          Create your first page to start writing. Organize pages into folders and link them to leaders and boards.
        </p>
      </div>
      <button
        onClick={handleCreate}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New page
      </button>
    </div>
  );
}
