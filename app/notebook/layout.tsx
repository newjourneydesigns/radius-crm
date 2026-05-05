'use client';

import { useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import NotebookShell from '../../components/notebook/NotebookShell';
import { NotebookProvider } from '../../contexts/NotebookContext';
import { SidebarPagesProvider } from '../../contexts/SidebarPagesContext';

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  return (
    <ProtectedRoute>
      <NotebookProvider activeFolderId={activeFolderId} setActiveFolderId={setActiveFolderId}>
        <SidebarPagesProvider>
          <NotebookShell>
            {children}
          </NotebookShell>
        </SidebarPagesProvider>
      </NotebookProvider>
    </ProtectedRoute>
  );
}
