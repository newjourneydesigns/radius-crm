'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { DateTime } from 'luxon';
import type { BlogArticle } from '../../lib/supabase';
import { apiFetch } from '../../lib/apiClient';

const RichTextEditor = dynamic(() => import('../notes/RichTextEditor'), { ssr: false });

function formatDate(iso: string) {
  return DateTime.fromISO(iso).toFormat('MMM d, yyyy');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface FormState {
  title: string;
  description: string;
  youtube_url: string;
  posted_at: string;
  published: boolean;
  slug: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  youtube_url: '',
  posted_at: DateTime.now().toFormat('yyyy-MM-dd'),
  published: true,
  slug: '',
};

export default function BlogManager() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<BlogArticle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<BlogArticle | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/blog?admin=true')
      .then(r => r.json())
      .then(data => { setArticles(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setError('');
    setModal('create');
  }

  function openEdit(article: BlogArticle) {
    setForm({
      title: article.title,
      description: article.description,
      youtube_url: article.youtube_url || '',
      posted_at: article.posted_at,
      published: article.published,
      slug: article.slug,
    });
    setEditTarget(article);
    setError('');
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  // Auto-generate slug from title while creating
  function handleTitleChange(title: string) {
    setForm(prev => ({
      ...prev,
      title,
      slug: modal === 'create' ? slugify(title) : prev.slug,
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.slug.trim()) { setError('Slug is required.'); return; }
    setSaving(true);
    setError('');

    try {
      let res: Response;
      if (modal === 'create') {
        res = await apiFetch('/api/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        res = await apiFetch(`/api/blog/${editTarget!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg || 'Save failed.');
        setSaving(false);
        return;
      }
      closeModal();
      load();
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(article: BlogArticle) {
    setDeleting(article.id);
    try {
      await apiFetch(`/api/blog/${article.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      load();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Radius Blog</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Articles appear at <a href="/blog" className="text-vc-300 hover:text-vc-200">/blog</a> and at the top of the Help page.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-btn-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New post
        </button>
      </div>

      {/* Article list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
          <p className="text-sm text-slate-500">No posts yet. Create your first one.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-700 overflow-hidden bg-zinc-800/50 divide-y divide-zinc-700">
          {articles.map(article => (
            <div key={article.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-700/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate">{article.title}</span>
                  {!article.published && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-700 text-slate-400 ring-1 ring-zinc-600">
                      Draft
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                  <span>{formatDate(article.posted_at)}</span>
                  <span className="text-zinc-600">·</span>
                  <a href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer" className="text-vc-400 hover:text-vc-300 truncate max-w-[200px]">
                    /blog/{article.slug}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(article)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  onClick={() => setConfirmDelete(article)}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto py-8 px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#1a1c22] border border-white/[0.08] rounded-2xl shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h3 className="text-base font-semibold text-white">
                {modal === 'create' ? 'New post' : 'Edit post'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="e.g. How to use the Boards feature"
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent"
                />
              </div>

              {/* YouTube URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">YouTube URL</label>
                <input
                  type="url"
                  value={form.youtube_url}
                  onChange={e => setForm(prev => ({ ...prev, youtube_url: e.target.value }))}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                <div className="rounded-lg border border-zinc-700 overflow-hidden">
                  <RichTextEditor
                    value={form.description}
                    onChange={html => setForm(prev => ({ ...prev, description: html }))}
                    placeholder="Add context, instructions, or links…"
                    minHeight="160px"
                  />
                </div>
              </div>

              {/* Posted date + Slug row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Posted date</label>
                  <input
                    type="date"
                    value={form.posted_at}
                    onChange={e => setForm(prev => ({ ...prev, posted_at: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Slug</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={e => setForm(prev => ({ ...prev, slug: slugify(e.target.value) }))}
                    placeholder="my-post-title"
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Published toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setForm(prev => ({ ...prev, published: !prev.published }))}
                  className={`relative w-9 h-5 rounded-full transition-colors ${form.published ? 'bg-vc-500' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.published ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-slate-300">{form.published ? 'Published' : 'Draft'}</span>
              </label>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-btn-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? 'Saving…' : modal === 'create' ? 'Publish' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1a1c22] border border-white/[0.08] rounded-2xl shadow-2xl p-6">
            <h3 className="text-base font-semibold text-white mb-2">Delete post?</h3>
            <p className="text-sm text-slate-400 mb-5">
              <strong className="text-white">&ldquo;{confirmDelete.title}&rdquo;</strong> will be permanently removed.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 transition-colors disabled:opacity-60"
              >
                {deleting === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
