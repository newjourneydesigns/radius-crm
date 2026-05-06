'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useNotebookContext } from '../../contexts/NotebookContext';
import { useSidebarPages } from '../../contexts/SidebarPagesContext';
import type { NotebookPage } from '../../lib/supabase';
import FolderItem from './FolderItem';
import PageListItem from './PageListItem';
import NotebookSearch from './NotebookSearch';

interface NotebookSidebarProps {
  onClose?: () => void;
}

const dragOverlayCursorOffset: Modifier = ({ transform }) => ({
  ...transform,
  // Keep the drag preview to the side of the pointer for better visual alignment.
  x: transform.x + 16,
  y: transform.y - 14,
});

export default function NotebookSidebar({ onClose }: NotebookSidebarProps) {
  const router = useRouter();
  const {
    folders, activeFolderId, setActiveFolderId,
    createFolder, createPage, fetchFolders, fetchAllPinnedPages,
    reorderPages, updatePage,
  } = useNotebookContext();

  const { getPagesForFolder, setPagesForFolder, findFolderForPage } = useSidebarPages();

  const [pinnedPages, setPinnedPages] = useState<NotebookPage[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  useEffect(() => {
    fetchFolders();
    fetchAllPinnedPages().then(setPinnedPages);
  }, []);

  function handlePageDeleted(pageId: string) {
    setPinnedPages(prev => prev.filter(page => page.id !== pageId));
    const folderId = findFolderForPage(pageId);
    if (!folderId) return;
    setPagesForFolder(
      folderId,
      getPagesForFolder(folderId).filter(page => page.id !== pageId),
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceFolderId = findFolderForPage(activeId);
    if (!sourceFolderId) return;

    const sourcePages = getPagesForFolder(sourceFolderId);
    const overIsFolder = overId.startsWith('folder:');

    let targetFolderId: string;
    if (overIsFolder) {
      targetFolderId = overId.slice(7);
    } else {
      const found = findFolderForPage(overId);
      if (!found) return;
      targetFolderId = found;
    }

    if (sourceFolderId === targetFolderId && !overIsFolder) {
      // Same folder — reorder
      const oldIndex = sourcePages.findIndex(p => p.id === activeId);
      const newIndex = sourcePages.findIndex(p => p.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(sourcePages, oldIndex, newIndex);
      setPagesForFolder(sourceFolderId, reordered);
      reorderPages(reordered.map(p => p.id));
    } else if (sourceFolderId !== targetFolderId) {
      // Cross-folder move
      const movedPage = sourcePages.find(p => p.id === activeId);
      if (!movedPage) return;

      const newSourcePages = sourcePages.filter(p => p.id !== activeId);
      setPagesForFolder(sourceFolderId, newSourcePages);

      const targetPages = getPagesForFolder(targetFolderId);
      let newTargetPages: NotebookPage[];
      if (overIsFolder) {
        // Dropped on folder header — prepend
        newTargetPages = [{ ...movedPage, folder_id: targetFolderId }, ...targetPages];
      } else {
        // Dropped on a page in target — insert before it
        const overIndex = targetPages.findIndex(p => p.id === overId);
        newTargetPages = [...targetPages];
        newTargetPages.splice(
          overIndex >= 0 ? overIndex : targetPages.length,
          0,
          { ...movedPage, folder_id: targetFolderId },
        );
      }
      setPagesForFolder(targetFolderId, newTargetPages);

      // Persist
      updatePage(activeId, { folder_id: targetFolderId });
      if (newSourcePages.length > 0) reorderPages(newSourcePages.map(p => p.id));
      reorderPages(newTargetPages.map(p => p.id));
    }
  }

  async function handleNewPage() {
    const allFolders = folders.flatMap(f => [f, ...(f.children || [])]);
    let target = activeFolderId
      ? allFolders.find(f => f.id === activeFolderId)
      : allFolders.find(f => f.is_unfiled) || allFolders[0];

    if (!target) {
      const loaded = await fetchFolders();
      target = loaded.find(f => f.is_unfiled) || loaded[0];
    }
    if (!target) return;

    const page = await createPage(target.id);
    if (page) {
      setActiveFolderId(target.id);
      router.push(`/notebook/${page.id}`);
      onClose?.();
    }
  }

  async function handleCreateFolder() {
    if (!newFolderTitle.trim()) { setCreatingFolder(false); return; }
    await createFolder(newFolderTitle.trim());
    setNewFolderTitle('');
    setCreatingFolder(false);
  }

  function handlePageCreated(page: NotebookPage) {
    router.push(`/notebook/${page.id}`);
    onClose?.();
  }

  const activeDragPage = activeDragId
    ? (() => {
        const folderId = findFolderForPage(activeDragId);
        return folderId ? getPagesForFolder(folderId).find(p => p.id === activeDragId) : null;
      })()
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Notebook</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCreatingFolder(true)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
            title="New folder"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </button>
          <button
            onClick={handleNewPage}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
            title="New page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        <NotebookSearch />

        {creatingFolder && (
          <div className="px-2 mb-1">
            <input
              autoFocus
              value={newFolderTitle}
              onChange={e => setNewFolderTitle(e.target.value)}
              onBlur={handleCreateFolder}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setCreatingFolder(false);
              }}
              placeholder="Folder name…"
              className="w-full bg-white/[0.08] border border-indigo-400/60 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none"
            />
          </div>
        )}

        {pinnedPages.length > 0 && (
          <div className="mb-1">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider px-3 mb-0.5">Pinned</p>
            {pinnedPages.map(page => (
              <PageListItem key={page.id} page={page} onDelete={() => handlePageDeleted(page.id)} />
            ))}
          </div>
        )}

        {/* Folder tree — single DndContext spans all folders for cross-folder drag */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div>
            {folders.map(folder => (
              <FolderItem
                key={folder.id}
                folder={folder}
                onPageCreated={handlePageCreated}
                onPageDeleted={handlePageDeleted}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null} modifiers={[dragOverlayCursorOffset]}>
            {activeDragPage ? (
              <div className="bg-[#1e2130] border border-indigo-400/30 rounded-md px-3 py-2 text-sm text-gray-200 shadow-2xl cursor-grabbing select-none">
                {activeDragPage.title || 'Untitled'}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
