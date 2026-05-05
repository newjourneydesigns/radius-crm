'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { NotebookPage } from '../lib/supabase';

interface SidebarPagesContextType {
  getPagesForFolder: (folderId: string) => NotebookPage[];
  setPagesForFolder: (folderId: string, pages: NotebookPage[]) => void;
  findFolderForPage: (pageId: string) => string | undefined;
}

const SidebarPagesContext = createContext<SidebarPagesContextType | null>(null);

export function useSidebarPages() {
  const ctx = useContext(SidebarPagesContext);
  if (!ctx) throw new Error('useSidebarPages must be used within SidebarPagesProvider');
  return ctx;
}

export function SidebarPagesProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Record<string, NotebookPage[]>>({});

  const getPagesForFolder = useCallback((folderId: string): NotebookPage[] => {
    return map[folderId] ?? [];
  }, [map]);

  const setPagesForFolder = useCallback((folderId: string, pages: NotebookPage[]) => {
    setMap(prev => ({ ...prev, [folderId]: pages }));
  }, []);

  const findFolderForPage = useCallback((pageId: string): string | undefined => {
    return Object.entries(map).find(([, pages]) => pages.some(p => p.id === pageId))?.[0];
  }, [map]);

  return (
    <SidebarPagesContext.Provider value={{ getPagesForFolder, setPagesForFolder, findFolderForPage }}>
      {children}
    </SidebarPagesContext.Provider>
  );
}
