'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import { useNotebookContext } from '../../contexts/NotebookContext';
import type { NotebookPage } from '../../lib/supabase';

import type { NotebookChecklist } from '../../lib/supabase';

function checklistSummary(checklists: NotebookChecklist[]): { total: number; done: number } | null {
  if (!checklists?.length) return null;
  const total = checklists.reduce((sum, c) => sum + c.items.length, 0);
  const done = checklists.reduce((sum, c) => sum + c.items.filter(i => i.checked).length, 0);
  return total > 0 ? { total, done } : null;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface PageListItemProps {
  page: NotebookPage;
  onDelete?: () => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
}

export default function PageListItem({ page, onDelete, dragListeners, dragAttributes }: PageListItemProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { updatePage, deletePage } = useNotebookContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = pathname === `/notebook/${page.id}`;

  async function handlePin() {
    await updatePage(page.id, { is_pinned: !page.is_pinned });
    setMenuOpen(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this page? This cannot be undone.')) return;
    await deletePage(page.id);
    onDelete?.();
    setMenuOpen(false);
    if (isActive) router.push('/notebook');
  }

  return (
    <div
      className={`group relative flex items-center rounded-md px-2 py-2 transition-colors ${
        isActive
          ? 'bg-white/[0.1] text-white'
          : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
      }`}
    >
      {dragListeners && (
        <div
          {...dragListeners}
          {...dragAttributes}
          className="sm:opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 text-gray-600 hover:text-gray-400 touch-none"
          onClick={e => e.preventDefault()}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="5" cy="3" r="1.2"/><circle cx="11" cy="3" r="1.2"/>
            <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
            <circle cx="5" cy="13" r="1.2"/><circle cx="11" cy="13" r="1.2"/>
          </svg>
        </div>
      )}
      <Link href={`/notebook/${page.id}`} className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm truncate leading-tight">
          {page.title || 'Untitled'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">
            {relativeTime(page.updated_at)}
          </span>
          {(() => {
            const cl = checklistSummary(page.checklists);
            if (!cl) return null;
            const allDone = cl.done === cl.total;
            return (
              <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                allDone
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-white/[0.06] text-gray-400'
              }`}>
                <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {allDone
                    ? <polyline points="2,6 5,9 10,3" />
                    : <><rect x="1" y="1" width="10" height="10" rx="1.5" /><polyline points="3,6 5,8 9,4" /></>
                  }
                </svg>
                {cl.done}/{cl.total}
              </span>
            );
          })()}
        </div>
      </Link>

      {/* Pin indicator */}
      {page.is_pinned && (
        <span className="mr-1 text-indigo-400 opacity-60" title="Pinned">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
        </span>
      )}

      {/* Context menu trigger */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={e => { e.preventDefault(); setMenuOpen(v => !v); }}
          className={`p-1 rounded transition-opacity ${menuOpen ? 'opacity-100' : 'sm:opacity-0 group-hover:opacity-100'}`}
          aria-label="Page options"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-5 z-50 w-36 bg-[#1e2130] border border-white/[0.1] rounded-lg shadow-xl py-1 text-sm">
              <button
                onClick={handlePin}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                </svg>
                {page.is_pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-white/[0.08] hover:text-red-300 transition-colors text-left"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
