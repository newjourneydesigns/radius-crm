'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import NotebookSidebar from './NotebookSidebar';
import NotebookRightPanel from './NotebookRightPanel';
import { useNotebookContext } from '../../contexts/NotebookContext';

interface NotebookShellProps {
  children: React.ReactNode;
}

export default function NotebookShell({ children }: NotebookShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const { activePage } = useNotebookContext();

  const desktopColumns = [
    !sidebarCollapsed ? '300px' : null,
    'minmax(0,1fr)',
    !rightPanelCollapsed ? '260px' : null,
  ].filter(Boolean).join(' ');
  const isInkMode = activePage?.editor_mode === 'ink';
  const selectionGuardStyle = isInkMode
    ? {
        '--notebook-columns': desktopColumns,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }
    : { '--notebook-columns': desktopColumns };

  function preventSelectionGesture(event: React.PointerEvent<HTMLElement>) {
    if (!isInkMode) return;
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      event.currentTarget.blur();
      window.getSelection()?.removeAllRanges();
    }
  }

  useEffect(() => {
    if (!isInkMode) return;

    document.documentElement.classList.add('notebook-ink-active');
    document.body.classList.add('notebook-ink-active');

    const clearSelection = () => window.getSelection()?.removeAllRanges();
    const preventSelection = (event: Event) => {
      event.preventDefault();
      clearSelection();
    };

    document.addEventListener('selectionchange', clearSelection);
    document.addEventListener('selectstart', preventSelection, { capture: true });

    return () => {
      document.documentElement.classList.remove('notebook-ink-active');
      document.body.classList.remove('notebook-ink-active');
      document.removeEventListener('selectionchange', clearSelection);
      document.removeEventListener('selectstart', preventSelection, { capture: true });
    };
  }, [isInkMode]);

  return (
    <div
      className="grid grid-cols-1 h-[calc(100vh-57px)] bg-[#0f1117] overflow-hidden min-[1100px]:grid-cols-[var(--notebook-columns)]"
      style={selectionGuardStyle as CSSProperties}
      onPointerUpCapture={preventSelectionGesture}
      onPointerCancelCapture={preventSelectionGesture}
      onSelect={event => {
        if (!isInkMode) return;
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
      }}
    >

      {/* ── Mobile sidebar backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 min-[1100px]:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar — desktop grid column ── */}
      {!sidebarCollapsed && (
        <aside className="hidden min-[1100px]:block min-w-0 h-full overflow-hidden bg-[#13151c] border-r border-white/[0.06]">
          <NotebookSidebar onCollapse={() => setSidebarCollapsed(true)} />
        </aside>
      )}

      {/* ── Left Sidebar — mobile/tablet overlay ── */}
      {sidebarOpen && (
        <aside
          className="min-[1100px]:hidden z-50 w-[300px] max-w-[86vw] h-full overflow-hidden bg-[#13151c] border-r border-white/[0.06] shadow-2xl"
          style={{ position: 'fixed', left: 0, top: 57, bottom: 0 }}
        >
          <NotebookSidebar onClose={() => setSidebarOpen(false)} />
        </aside>
      )}

      {/* ── Center Editor ── */}
      <main className="min-w-0 flex flex-col overflow-hidden">

        {/* Mobile / tablet top bar */}
        <div
          className="flex min-[1100px]:hidden items-center gap-3 px-3 py-2.5 border-b border-white/[0.06] bg-[#13151c] select-none"
          style={selectionGuardStyle as CSSProperties}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          <span className="flex-1 min-w-0 text-sm font-medium text-white/80 truncate select-none">
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

        {(sidebarCollapsed || rightPanelCollapsed) && (
          <div
            className="hidden min-[1100px]:flex items-center gap-2 px-4 py-2 border-b border-white/[0.06] bg-[#10131b] select-none"
            style={selectionGuardStyle as CSSProperties}
          >
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs font-medium text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                aria-label="Open notebook sidebar"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
                Notebook
              </button>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{activePage?.title || 'Notebook'}</span>
            {rightPanelCollapsed && (
              <button
                onClick={() => setRightPanelCollapsed(false)}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs font-medium text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                aria-label="Open links panel"
              >
                Links
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5 15.75 12l-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>
        )}

        {children}
      </main>

      {/* ── Right Panel — desktop ── */}
      {!rightPanelCollapsed && (
        <aside className="hidden min-[1100px]:flex min-w-0 flex-col h-full overflow-y-auto bg-[#13151c] border-l border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Links</span>
            <button
              onClick={() => setRightPanelCollapsed(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/[0.08] hover:text-gray-200 active:bg-white/[0.12]"
              title="Collapse links panel"
              aria-label="Collapse links panel"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5 15.75 12l-7.5 7.5" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NotebookRightPanel />
          </div>
        </aside>
      )}

      {/* ── Right Panel — mobile / tablet bottom sheet ── */}
      {rightPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-[10001] bg-black/60 min-[1100px]:hidden"
            onClick={() => setRightPanelOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[10002] bg-[#13151c] border-t border-white/[0.08] max-h-[80vh] flex flex-col rounded-t-2xl min-[1100px]:hidden">
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
