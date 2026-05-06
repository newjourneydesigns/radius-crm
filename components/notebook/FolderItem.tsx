'use client';

import { useState, useRef, useEffect } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useNotebookContext } from '../../contexts/NotebookContext';
import { useSidebarPages } from '../../contexts/SidebarPagesContext';
import type { NotebookFolder, NotebookPage } from '../../lib/supabase';
import PageListItem from './PageListItem';
import FolderColorPicker from './FolderColorPicker';

function SortablePageItem({ page, onDelete }: { page: NotebookPage; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        zIndex: isDragging ? 50 : 'auto',
      }}
    >
      <PageListItem
        page={page}
        onDelete={onDelete}
        dragListeners={listeners as unknown as Record<string, unknown>}
        dragAttributes={attributes as unknown as Record<string, unknown>}
      />
    </div>
  );
}

interface FolderItemProps {
  folder: NotebookFolder;
  depth?: number;
  onPageCreated?: (page: NotebookPage) => void;
  onPageDeleted?: (pageId: string) => void;
}

export default function FolderItem({ folder, depth = 0, onPageCreated, onPageDeleted }: FolderItemProps) {
  const {
    activeFolderId, setActiveFolderId,
    updateFolder, deleteFolder, createFolder, createPage,
    fetchPagesForFolder, pages,
  } = useNotebookContext();

  const { getPagesForFolder, setPagesForFolder } = useSidebarPages();

  const [open, setOpen] = useState(activeFolderId === folder.id);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.title);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const folderPages = getPagesForFolder(folder.id);

  // Droppable target for cross-folder drag
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `folder:${folder.id}` });

  // Keep loaded folder pages synchronized with canonical pages state.
  useEffect(() => {
    if (!loaded) return;
    setPagesForFolder(folder.id, pages.filter(p => p.folder_id === folder.id));
  }, [loaded, pages, folder.id, setPagesForFolder]);

  // Auto-open when this folder becomes active
  useEffect(() => {
    if (activeFolderId === folder.id && !open) {
      handleOpen();
    }
  }, [activeFolderId]);

  // If the folder starts open (or is opened externally), ensure pages are loaded.
  useEffect(() => {
    if (!open || loaded) return;
    let mounted = true;
    (async () => {
      const folderPagesData = await fetchPagesForFolder(folder.id);
      if (!mounted) return;
      setPagesForFolder(folder.id, folderPagesData);
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, [open, loaded, folder.id, fetchPagesForFolder, setPagesForFolder]);

  async function handleOpen() {
    setOpen(true);
    setActiveFolderId(folder.id);
    if (!loaded) {
      const p = await fetchPagesForFolder(folder.id);
      setPagesForFolder(folder.id, p);
      setLoaded(true);
    }
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
    } else {
      handleOpen();
    }
  }

  async function handleRename() {
    if (renameValue.trim() && renameValue !== folder.title) {
      await updateFolder(folder.id, { title: renameValue.trim() });
    }
    setRenaming(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${folder.title}"? Pages inside will be moved to Unfiled.`)) return;
    setMenuOpen(false);
    await deleteFolder(folder.id);
  }

  async function handleAddSubfolder() {
    setMenuOpen(false);
    await createFolder('New Folder', '📁', '#6366f1', folder.id);
  }

  async function handleNewPage() {
    const page = await createPage(folder.id);
    if (page) {
      setPagesForFolder(folder.id, [page, ...getPagesForFolder(folder.id)]);
      setLoaded(true);
      setOpen(true);
      onPageCreated?.(page);
    }
  }

  function handlePageDeleted(pageId: string) {
    setPagesForFolder(
      folder.id,
      getPagesForFolder(folder.id).filter(page => page.id !== pageId),
    );
    onPageDeleted?.(pageId);
  }

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const canRenameFolder = true;
  const canDeleteFolder = !folder.is_unfiled;

  return (
    <div>
      {/* Folder header row — also a drop target */}
      <div
        ref={setDropRef}
        className={`group flex items-center gap-1 rounded-md px-2 py-2 cursor-pointer transition-colors ${
          isOver
            ? 'bg-indigo-500/20 border border-indigo-400/40'
            : activeFolderId === folder.id
            ? 'bg-white/[0.04] border border-transparent'
            : 'hover:bg-white/[0.06] border border-transparent'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {/* Collapse toggle */}
        <button
          onClick={handleToggle}
          className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
        >
          <svg
            className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Icon + title */}
        <button onClick={handleToggle} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: folder.color }} />
          {renaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
              className="flex-1 text-sm bg-white/[0.1] border border-indigo-400 rounded px-1 text-white focus:outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-sm text-gray-300 truncate flex-1"
              onDoubleClick={() => { if (canRenameFolder) setRenaming(true); }}
            >
              {folder.title}
            </span>
          )}
        </button>

        {/* New page button */}
        <button
          onClick={e => { e.stopPropagation(); handleNewPage(); }}
          className="sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-500 hover:text-gray-200 active:text-white"
          title="New page"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>

        {/* Folder context menu */}
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); setColorPickerOpen(false); }}
            className={`transition-opacity p-1 rounded text-gray-500 hover:text-gray-200 active:text-white ${menuOpen ? 'opacity-100' : 'sm:opacity-0 group-hover:opacity-100'}`}
            title="Folder options"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setMenuOpen(false); setColorPickerOpen(false); }} />
              <div className="absolute right-0 top-5 z-50 w-48 bg-[#1e2130] border border-white/[0.1] rounded-lg shadow-xl py-1 text-sm">
                {colorPickerOpen ? (
                  <div>
                    <button
                      onClick={() => setColorPickerOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-400 hover:text-white transition-colors text-left"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                      <span className="text-xs">Back</span>
                    </button>
                    <div className="px-3 pb-3">
                      <FolderColorPicker
                        value={folder.color}
                        onChange={async color => { await updateFolder(folder.id, { color }); setColorPickerOpen(false); setMenuOpen(false); }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {canRenameFolder && (
                      <button
                        onClick={() => { setRenaming(true); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                        Rename
                      </button>
                    )}

                    <button
                      onClick={() => setColorPickerOpen(true)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: folder.color }} />
                      Change color
                    </button>

                    {depth === 0 && (
                      <button
                        onClick={handleAddSubfolder}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                        Add sub-folder
                      </button>
                    )}

                    {canDeleteFolder && (
                      <>
                        <div className="h-px bg-white/[0.06] mx-2 my-1" />
                        <button
                          onClick={handleDelete}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-white/[0.08] hover:text-red-300 transition-colors text-left"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete folder
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pages within folder */}
      {open && (
        <div className="pl-5">
          <SortableContext items={folderPages.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {folderPages.map(page => (
              <SortablePageItem key={page.id} page={page} onDelete={() => handlePageDeleted(page.id)} />
            ))}
          </SortableContext>

          {/* Sub-folders (max 1 level) */}
          {depth === 0 && folder.children?.map(child => (
            <FolderItem
              key={child.id}
              folder={child}
              depth={1}
              onPageCreated={onPageCreated}
              onPageDeleted={onPageDeleted}
            />
          ))}

          {folderPages.length === 0 && !folder.children?.length && (
            <p className="text-xs text-gray-600 px-2 py-1">No pages yet</p>
          )}
        </div>
      )}
    </div>
  );
}
