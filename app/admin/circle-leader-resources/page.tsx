'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import RichTextEditor from '../../../components/notes/RichTextEditor';
import ToolkitContentPreview from '../../../components/circle-leader-toolkit/ToolkitContentPreview';
import { csOpenSans } from '../../../lib/circle-leader-toolkit/csFont';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CircleLeaderResourcesAdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState('');
  const [savedHtml, setSavedHtml] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [savingThenLeaving, setSavingThenLeaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  const loadLatest = useCallback(async (tok: string, opts: { showSpinner?: boolean } = {}) => {
    if (opts.showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/circle-leader-resources?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${tok}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      const html = data.resource?.body_html || '';
      // Don't clobber unsaved local edits — only adopt the server value if the
      // user hasn't modified anything since the last sync.
      setSavedHtml((prevSaved) => {
        setBodyHtml((prevBody) => (prevBody === prevSaved ? html : prevBody));
        return html;
      });
      setUpdatedAt(data.resource?.updated_at || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (opts.showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    loadLatest(token, { showSpinner: true });
  }, [token, loadLatest]);

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
    if (!token) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/circle-leader-resources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body_html: bodyHtml }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setSavedHtml(bodyHtml);
      setUpdatedAt(data.resource?.updated_at || new Date().toISOString());
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

  const dirty = bodyHtml !== savedHtml;
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

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
      setPendingNav(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  async function saveThenLeave() {
    if (!pendingNav) return;
    setSavingThenLeaving(true);
    const ok = await save();
    setSavingThenLeaving(false);
    if (ok) {
      const dest = pendingNav;
      setPendingNav(null);
      router.push(dest);
    }
  }

  function discardThenLeave() {
    if (!pendingNav) return;
    const dest = pendingNav;
    // Mark current bodyHtml as saved so dirty=false and the beforeunload guard
    // won't fire on the navigation we're about to perform.
    setSavedHtml(bodyHtml);
    setPendingNav(null);
    router.push(dest);
  }

  function cancelLeave() {
    setPendingNav(null);
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
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Circle Leader Resources</h1>
            <p className="text-sm text-slate-400 mt-1">
              The content below appears to all Circle Leaders on the Resources tab of their Circle Summary.
              Use the toolbar for headings, lists, links, horizontal rules, and the{' '}
              <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                <span className="inline-flex items-center justify-center text-[10px] font-bold tracking-wide leading-none px-1.5 py-[2px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">BTN</span>
                button
              </span>
              {' '}action to insert a styled call-to-action button.
            </p>
          </div>
          {updatedAt && (
            <p className="text-xs text-slate-500">Last saved {new Date(updatedAt).toLocaleString()}</p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse bg-zinc-700 rounded-xl h-64" />
        ) : (
          <>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 shadow-card-glass">
              <RichTextEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Add helpful resources, links, and instructions for your Circle Leaders…"
                minHeight="320px"
                allowButton
                toolkitSurface
              />
            </div>

            <ToolkitContentPreview variant="resources" bodyHtml={bodyHtml} className="mt-5" />

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
              {savedFlash && !dirty && (
                <span className="text-xs text-emerald-300">Saved.</span>
              )}
            </div>
          </>
        )}
      </div>

      {pendingNav && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
        >
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 id="unsaved-title" className="text-base font-semibold text-white">You have unsaved edits</h2>
            <p className="text-sm text-slate-300 mt-2">
              Would you like to save them before leaving this page?
            </p>
            {error && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mt-3">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
              <button
                onClick={cancelLeave}
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
                Discard &amp; leave
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
    </div>
  );
}
