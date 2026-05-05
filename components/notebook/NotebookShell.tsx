'use client';

import { useState } from 'react';
import NotebookSidebar from './NotebookSidebar';
import NotebookRightPanel from './NotebookRightPanel';
import { useNotebookContext } from '../../contexts/NotebookContext';

interface NotebookShellProps {
  children: React.ReactNode;
}

export default function NotebookShell({ children }: NotebookShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const { activePage } = useNotebookContext();

  return (
    <div className="flex h-[calc(100vh-57px)] bg-[#0f1117] overflow-hidden">

      {/* ── Mobile sidebar backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar ── */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          w-[280px] md:w-[260px] flex-shrink-0
          h-full overflow-hidden
          bg-[#13151c] border-r border-white/[0.06]
          transform transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <NotebookSidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* ── Center Editor ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="flex md:hidden items-center gap-3 px-3 py-2.5 border-b border-white/[0.06] bg-[#13151c]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          <span className="flex-1 min-w-0 text-sm font-medium text-white/80 truncate">
            {activePage?.title || 'Notebook'}
          </span>

          <button
            onClick={() => setRightPanelOpen(v => !v)}
            className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
              rightPanelOpen
                ? 'text-indigo-400 bg-indigo-500/15'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12]'
            }`}
            aria-label="Toggle links panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </button>
        </div>

        {children}
      </main>

      {/* ── Right Panel — desktop ── */}
      <aside className="hidden lg:flex flex-col w-[260px] flex-shrink-0 h-full overflow-y-auto bg-[#13151c] border-l border-white/[0.06]">
        <NotebookRightPanel />
      </aside>

      {/* ── Right Panel — mobile bottom sheet ── */}
      {rightPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-[10001] bg-black/60 lg:hidden"
            onClick={() => setRightPanelOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[10002] bg-[#13151c] border-t border-white/[0.08] max-h-[80vh] flex flex-col rounded-t-2xl lg:hidden">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
              <span className="text-sm font-semibold text-white">Links</span>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <NotebookRightPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
