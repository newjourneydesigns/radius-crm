'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { BlogArticle } from '../../lib/supabase';
import { DateTime } from 'luxon';
import ConfirmModal from '../ui/ConfirmModal';

const RichTextEditor = dynamic(() => import('../notes/RichTextEditor'), { ssr: false });

function formatDate(dateStr: string): string {
  return DateTime.fromISO(dateStr).toFormat('MMM d, yyyy');
}

interface FormState {
  title: string;
  youtube_url: string;
  description: string;
  posted_at: string;
  published: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  youtube_url: '',
  description: '',
  posted_at: DateTime.now().toFormat('yyyy-MM-dd'),
  published: true,
};

export default function BlogManager() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlogArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<BlogArticle | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/blog?all=true');
      const data = await res.json();
      setArticles(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setCreating(true);
  };

  const openEdit = (a: BlogArticle) => {
    setCreating(false);
    setForm({
      title: a.title,
      youtube_url: a.youtube_url ?? '',
      description: a.description,
      posted_at: a.posted_at,
      published: a.published,
    });
    setError('');
    setEditing(a);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setError('');
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `/api/blog/${editing.id}` : '/api/blog';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await res.json();
        setError(e.error || 'Failed to save');
        return;
      }
      await load();
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: BlogArticle) => {
    const res = await fetch(`/api/blog/${a.id}`, { method: 'DELETE' });
    if (!res.ok) { setError('Failed to delete'); return; }
    setDeleteConfirm(null);
    await load();
  };

  const isOpen = creating || !!editing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{articles.length} article{articles.length !== 1 ? 's' : ''}</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-btn-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Article
        </button>
      </div>

      {/* Article list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-zinc-700/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          No articles yet. Create one to get started.
        </div>
      ) : (
        <div className="divide-y divide-zinc-700/60 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden">
          {articles.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-700/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{a.title}</span>
                  {!a.published && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-600/60 text-slate-400 ring-1 ring-zinc-600/40">
                      Draft
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{formatDate(a.posted_at)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`/blog/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-zinc-600/50 transition-colors"
                  title="View article"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
                <button
                  onClick={() => openEdit(a)}
                  className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-zinc-600/50 transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteConfirm(a)}
                  className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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

      {/* Create / Edit form */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl mt-8 mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700/60">
              <h2 className="text-base font-semibold text-white">
                {creating ? 'New Article' : 'Edit Article'}
              </h2>
              <button
                onClick={closeForm}
                className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Article title…"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent"
                />
              </div>

              {/* YouTube URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">YouTube URL</label>
                <input
                  type="url"
                  value={form.youtube_url}
                  onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent"
                />
              </div>

              {/* Posted date + Published */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Posted date</label>
                  <input
                    type="date"
                    value={form.posted_at}
                    onChange={e => setForm(f => ({ ...f, posted_at: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input
                    type="checkbox"
                    id="blog-published"
                    checked={form.published}
                    onChange={e => setForm(f => ({ ...f, published: e.target.checked }))}
                    className="w-4 h-4 accent-vc-500 rounded"
                  />
                  <label htmlFor="blog-published" className="text-sm text-slate-300 select-none cursor-pointer">
                    Published
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                <div className="rounded-lg border border-zinc-700 overflow-hidden">
                  <RichTextEditor
                    value={form.description}
                    onChange={html => setForm(f => ({ ...f, description: html }))}
                    placeholder="Write a description, add links, include formatting…"
                    minHeight="180px"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-700/60">
              <button
                onClick={closeForm}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-btn-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving…' : (creating ? 'Publish' : 'Save changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete article"
        message={`Delete "${deleteConfirm?.title}"? This cannot be undone.`}
        confirmText="Delete"
        type="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
