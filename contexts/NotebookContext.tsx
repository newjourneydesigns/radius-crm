'use client';

import { createContext, useContext } from 'react';
import { useNotebook, type SaveStatus } from '../hooks/useNotebook';
import type { NotebookFolder, NotebookPage } from '../lib/supabase';

interface NotebookContextType {
  // State
  folders: NotebookFolder[];
  pages: NotebookPage[];
  activePage: NotebookPage | null;
  activeFolderId: string | null;
  saveStatus: SaveStatus;
  loading: boolean;
  error: string | null;
  // Setters
  setActivePage: (page: NotebookPage | null) => void;
  setActiveFolderId: (id: string | null) => void;
  // Folder operations
  fetchFolders: () => Promise<NotebookFolder[]>;
  createFolder: (title: string, icon?: string, color?: string, parentId?: string | null) => Promise<NotebookFolder | null>;
  updateFolder: (id: string, updates: Partial<Pick<NotebookFolder, 'title' | 'icon' | 'color' | 'position'>>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (orderedIds: string[]) => Promise<void>;
  // Page operations
  fetchPagesForFolder: (folderId: string) => Promise<NotebookPage[]>;
  reorderPages: (orderedIds: string[]) => Promise<void>;
  fetchAllPinnedPages: () => Promise<NotebookPage[]>;
  fetchPage: (pageId: string) => Promise<NotebookPage | null>;
  createPage: (folderId: string) => Promise<NotebookPage | null>;
  updatePage: (id: string, updates: Partial<Pick<NotebookPage, 'title' | 'content' | 'checklists' | 'is_pinned' | 'folder_id'>>) => Promise<void>;
  scheduleSave: (id: string, updates: Partial<Pick<NotebookPage, 'title' | 'content'>>) => void;
  deletePage: (id: string) => Promise<void>;
  searchPages: (query: string) => Promise<NotebookPage[]>;
  // Link operations
  linkLeader: (pageId: string, leaderId: number) => Promise<void>;
  unlinkLeader: (pageId: string, leaderId: number) => Promise<void>;
  linkBoard: (pageId: string, boardId: string) => Promise<void>;
  unlinkBoard: (pageId: string, boardId: string) => Promise<void>;
  linkCard: (pageId: string, cardId: string) => Promise<void>;
  unlinkCard: (pageId: string, cardId: string) => Promise<void>;
  updateLinkedCard: (cardId: string, updates: Partial<{ title: string; description: string; priority: string; due_date: string | null; is_complete: boolean }>) => Promise<void>;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

export function useNotebookContext() {
  const ctx = useContext(NotebookContext);
  if (!ctx) throw new Error('useNotebookContext must be used within a NotebookProvider');
  return ctx;
}

export function NotebookProvider({
  children,
  activeFolderId,
  setActiveFolderId,
}: {
  children: React.ReactNode;
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
}) {
  const notebook = useNotebook();

  const value: NotebookContextType = {
    ...notebook,
    activeFolderId,
    setActiveFolderId,
  };

  return (
    <NotebookContext.Provider value={value}>
      {children}
    </NotebookContext.Provider>
  );
}
