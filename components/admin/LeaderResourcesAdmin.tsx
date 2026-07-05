'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import RichTextEditor from '../notes/RichTextEditor';
import ToolkitContentPreview from '../circle-leader-toolkit/ToolkitContentPreview';
import { csOpenSans } from '../../lib/circle-leader-toolkit/csFont';
import type { CircleLeaderResourcePage, ResourcePageAudience } from '../../lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = {
  audience: ResourcePageAudience;
  title: string;
  /** Short sentence describing who sees this content (e.g. "all Circle Leaders"). */
  audienceLabel: string;
};

/** Where the user is trying to go while they have unsaved edits. */
type PendingLeave = { type: 'nav'; href: string } | { type: 'page'; id: string };

/**
 * Admin manager for the toolkit Resources pages. Leaders see these as tabs on
 * their Resources page (in this sidebar's order) plus a dropdown in the main
 * nav. The same component backs both the Circle Leader and Host Team editors —
 * the `audience` prop selects which set of pages is managed
 * (see /api/admin/circle-leader-resources).
 */
export default function LeaderResourcesAdmin({ audience, title, audienceLabel }: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [pages, setPages] = useState<CircleLeaderResourcePage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);
  const [savingThenLeaving, setSavingThenLeaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [addingPage, setAddingPage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CircleLeaderResourcePage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selected = pages.find((p) => p.id === selectedId) || null;
  const dirty = !!selected && (draftTitle !== selected.title || draftHtml !== selected.body_html);
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  const applyPages = useCallback((next: CircleLeaderResourcePage[]) => {
    setPages(next);
    setSelectedId((prev) => {
      const keep = prev && next.some((p) => p.id === prev) ? prev : next[0]?.id || null;
      return keep;
    });
  }, []);

  const loadLatest = useCallback(
    async (tok: string, opts: { showSpinner?: boolean } = {}) => {
      if (opts.showSpinner) setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/circle-leader-resources?audience=${audience}&t=${Date.now()}`,
          { headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store' }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load.');
        const next: CircleLeaderResourcePage[] = data.pages || [];
        // Don't clobber unsaved local edits — only adopt server state when the
        // user hasn't modified anything since the last sync.
        if (!dirtyRef.current) {
          applyPages(next);
        } else {
          setPages((prev) => {
            const editingId = prev.find((p) => p.id === selectedId)?.id;
            return next.map((p) => (p.id === editingId ? prev.find((q) => q.id === editingId)! : p));
          });
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        if (opts.showSpinner) setLoading(false);
      }
    },
    [audience, applyPages, selectedId]
  );

  useEffect(() => {
    if (!token) return;
    loadLatest(token, { showSpinner: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Sync the editor drafts whenever the selected page changes.
  useEffect(() => {
    if (!selected) {
      setDraftTitle('');
      setDraftHtml('');
      return;
    }
    setDraftTitle(selected.title);
    setDraftHtml(selected.body_html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loading]);

  // Re-fetch when the tab regains focus or the page is restored from bfcache
  // (browser back/forward). Otherwise stale state shows after navigating away.
  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadLatest(token);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) loadLatest(token);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [token, loadLatest]);

  async function save(): Promise<boolean> {
    if (!token || !selected) return false;
    setSaving(true);
    setError(null);
    const sentTitle = draftTitle;
    const sentHtml = draftHtml;
    try {
      const res = await fetch('/api/admin/circle-leader-resources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: selected.id, title: sentTitle, body_html: sentHtml }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setPages((prev) => prev.map((p) => (p.id === selected.id ? { ...p, ...data.page } : p)));
      // Adopt server-normalized values (e.g. trimmed title) so the editor
      // doesn't stay "dirty" after a save — unless the user kept typing.
      setDraftTitle((t) => (t === sentTitle ? data.page.title : t));
      setDraftHtml((h) => (h === sentHtml ? data.page.body_html : h));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createPage() {
    const titleTrimmed = newTitle.trim();
    if (!token || !titleTrimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/circle-leader-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audience, title: titleTrimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed.');
      setPages((prev) => [...prev, data.page]);
      setSelectedId(data.page.id);
      setNewTitle('');
      setAddingPage(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deletePage() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/circle-leader-resources?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setPages((prev) => {
        const next = prev.filter((p) => p.id !== deleteTarget.id);
        if (selectedId === deleteTarget.id) setSelectedId(next[0]?.id || null);
        return next;
      });
      setDeleteTarget(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !token) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(pages, oldIndex, newIndex);
    setPages(reordered);
    fetch('/api/admin/circle-leader-resources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ audience, order: reordered.map((p) => p.id) }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Reorder failed.');
        }
      })
      .catch((e) => setError(e.message));
  }

  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      if (!token) throw new Error('Not signed in.');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/resource-images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed.');
      return data.url;
    },
    [token]
  );

  function selectPage(id: string) {
    if (id === selectedId) return;
    if (dirtyRef.current) {
      setPendingLeave({ type: 'page', id });
      return;
    }
    setSelectedId(id);
  }

  // Intercept in-app navigation clicks while there are unsaved edits. Native
  // beforeunload handles tab close / refresh; this handles `<Link>` clicks.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return; // only left-click
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // modifier = new tab/window
      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingLeave({ type: 'nav', href: url.pathname + url.search + url.hash });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  function completeLeave(leave: PendingLeave) {
    setPendingLeave(null);
    if (leave.type === 'nav') {
      router.push(leave.href);
    } else {
      setSelectedId(leave.id);
    }
  }

  async function saveThenLeave() {
    if (!pendingLeave) return;
    setSavingThenLeaving(true);
    const ok = await save();
    setSavingThenLeaving(false);
    if (ok) completeLeave(pendingLeave);
  }

  function discardThenLeave() {
    if (!pendingLeave) return;
    // Reset the drafts to the saved page state so dirty=false and the
    // beforeunload guard won't fire on the navigation we're about to perform.
    if (selected) {
      setDraftTitle(selected.title);
      setDraftHtml(selected.body_html);
    }
    dirtyRef.current = false;
    completeLeave(pendingLeave);
  }

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <div className={`min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8 ${csOpenSans.variable}`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">{title}</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              These pages appear to {audienceLabel} as tabs on the Resources section of their
              toolkit, and in a dropdown under Resources in the main nav. Drag pages to change
              the nav order — leaders can move from one page to the next in that order.
            </p>
          </div>
          {selected?.updated_at && (
            <p className="text-xs text-slate-500">
              Last saved {new Date(selected.updated_at).toLocaleString()}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <div className="animate-pulse bg-zinc-700 rounded-xl h-40" />
            <div className="animate-pulse bg-zinc-700 rounded-xl h-64" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[16rem_1fr] items-start">
            {/* ── Page list / nav order ─────────────────────────── */}
            <aside className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 lg:sticky lg:top-4">
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Pages
                </h2>
                <span className="text-[10px] text-slate-500">drag to reorder</span>
              </div>

              {pages.length === 0 && (
                <p className="text-sm text-slate-500 px-1 py-2">
                  No pages yet — add your first page below.
                </p>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1">
                    {pages.map((page, i) => (
                      <SortablePageItem
                        key={page.id}
                        page={page}
                        index={i}
                        isSelected={page.id === selectedId}
                        isDirty={page.id === selectedId && dirty}
                        onSelect={() => selectPage(page.id)}
                        onDelete={() => setDeleteTarget(page)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>

              {addingPage ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createPage();
                  }}
                >
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Page title"
                    maxLength={60}
                    className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={creating || !newTitle.trim()}
                      className="flex-1 bg-btn-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {creating ? 'Adding…' : 'Add page'}
                    </button>
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => {
                        setAddingPage(false);
                        setNewTitle('');
                      }}
                      className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAddingPage(true)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed border-zinc-600 text-slate-300 hover:text-white hover:border-zinc-400 rounded-lg px-3 py-2 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New page
                </button>
              )}
            </aside>

            {/* ── Editor + preview ──────────────────────────────── */}
            {selected ? (
              <div className="min-w-0">
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 shadow-card-glass">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                    Page title
                  </label>
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    maxLength={60}
                    placeholder="Short title (shows on the tab)"
                    className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 mb-4"
                  />
                  <RichTextEditor
                    value={draftHtml}
                    onChange={setDraftHtml}
                    placeholder="Add helpful resources, links, and instructions…"
                    minHeight="320px"
                    allowButton
                    onUploadImage={uploadImage}
                    toolkitSurface
                  />
                </div>

                <ToolkitContentPreview variant="resources" bodyHtml={draftHtml} className="mt-5" />

                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={save}
                    disabled={saving || !dirty}
                    className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {dirty && !saving && (
                    <span className="text-xs text-amber-300">Unsaved changes</span>
                  )}
                  {savedFlash && !dirty && <span className="text-xs text-emerald-300">Saved.</span>}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-800/60 border border-dashed border-zinc-700 rounded-xl p-10 text-center">
                <p className="text-slate-400 text-sm">
                  Add a page to start building the Resources section.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Unsaved-changes guard ───────────────────────────────── */}
      {pendingLeave && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
        >
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 id="unsaved-title" className="text-base font-semibold text-white">
              You have unsaved edits
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              Would you like to save them before {pendingLeave.type === 'page' ? 'switching pages' : 'leaving this page'}?
            </p>
            {error && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mt-3">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setPendingLeave(null)}
                disabled={savingThenLeaving}
                className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={discardThenLeave}
                disabled={savingThenLeaving}
                className="text-red-300 hover:text-red-200 hover:bg-red-500/10 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Discard changes
              </button>
              <button
                onClick={saveThenLeave}
                disabled={savingThenLeaving}
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingThenLeaving ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ──────────────────────────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 id="delete-title" className="text-base font-semibold text-white">
              Delete “{deleteTarget.title}”?
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              This removes the page and its content for {audienceLabel}. This can’t be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deletePage}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortablePageItem({
  page,
  index,
  isSelected,
  isDirty,
  onSelect,
  onDelete,
}: {
  page: CircleLeaderResourcePage;
  index: number;
  isSelected: boolean;
  isDirty: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        'group flex items-center gap-1.5 rounded-lg px-1.5 py-1 ' +
        (isDragging ? 'opacity-60 bg-zinc-700 ' : '') +
        (isSelected ? 'bg-zinc-700/70' : 'hover:bg-zinc-700/40')
      }
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${page.title}`}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 p-1 touch-none"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="7" cy="5" r="1.3" />
          <circle cx="13" cy="5" r="1.3" />
          <circle cx="7" cy="10" r="1.3" />
          <circle cx="13" cy="10" r="1.3" />
          <circle cx="7" cy="15" r="1.3" />
          <circle cx="13" cy="15" r="1.3" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={
          'flex-1 min-w-0 text-left text-sm py-1 truncate transition-colors ' +
          (isSelected ? 'text-white font-medium' : 'text-slate-300 hover:text-white')
        }
      >
        <span className="text-zinc-500 text-xs mr-1.5">{index + 1}.</span>
        {page.title}
        {isDirty && <span className="text-amber-300 ml-1" title="Unsaved changes">•</span>}
      </button>
      <button
        type="button"
        aria-label={`Delete ${page.title}`}
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-zinc-500 hover:text-red-400 p-1 transition-opacity"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </li>
  );
}
