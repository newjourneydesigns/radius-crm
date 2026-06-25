'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import ProtectedRoute from '../../components/ProtectedRoute';
import type { BlogArticle } from '../../lib/supabase';
import { DateTime } from 'luxon';

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] || null;
    }
  } catch { return null; }
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(iso: string) {
  return DateTime.fromISO(iso).toFormat('MMMM d, yyyy');
}

export default function BlogPage() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/blog')
      .then(r => r.json())
      .then(data => { setArticles(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fuse = useMemo(() => new Fuse(articles, {
    includeScore: true,
    threshold: 0.35,
    minMatchCharLength: 2,
    ignoreLocation: true,
    keys: [
      { name: 'title', weight: 3 },
      { name: 'descriptionText', weight: 1 },
    ],
    getFn: (obj, path) => {
      if (path[0] === 'descriptionText') return stripHtml(obj.description);
      return (obj as Record<string, string>)[path[0]] ?? '';
    },
  }), [articles]);

  const filtered = useMemo(() => {
    if (!query.trim()) return articles;
    return fuse.search(query.trim()).map(r => r.item);
  }, [query, articles, fuse]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

          {/* Header */}
          <div className="mb-7">
            <div className="flex items-center gap-3 mb-2">
              <Link href="/help" className="text-slate-400 hover:text-white transition-colors" aria-label="Back to Help">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Radius Blog</h1>
            </div>
            <p className="text-sm text-slate-400">
              Video walkthroughs, how-tos, and updates from the Radius team.
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-7">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search articles…"
              className="w-full pl-12 pr-10 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent transition-colors shadow-card-glass"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1.5 rounded-md hover:bg-zinc-700 transition-colors"
                aria-label="Clear"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-zinc-700" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-zinc-700 rounded w-3/4" />
                    <div className="h-3 bg-zinc-700 rounded w-full" />
                    <div className="h-3 bg-zinc-700 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">
                {query ? `No articles match "${query}".` : 'No articles yet.'}
              </p>
              {query && (
                <button onClick={() => setQuery('')} className="mt-3 text-xs text-vc-300 hover:text-vc-200">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              {query && (
                <p className="text-xs text-slate-500 mb-4">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
                </p>
              )}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(article => {
                  const videoId = article.youtube_url ? extractYouTubeId(article.youtube_url) : null;
                  const thumb = videoId
                    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                    : null;
                  const snippet = stripHtml(article.description).slice(0, 120);

                  return (
                    <Link
                      key={article.id}
                      href={`/blog/${article.slug}`}
                      className="group flex flex-col rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden hover:border-zinc-600 hover:bg-zinc-750 transition-all duration-150 shadow-card-glass"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-video bg-zinc-900 overflow-hidden">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.875v1.5m1.5-3.75C19.496 5.004 19 4.5 18.375 4.5H7.125" />
                            </svg>
                          </div>
                        )}
                        {/* Play overlay */}
                        {videoId && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30">
                            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex flex-col flex-1 p-4">
                        <p className="text-[11px] text-slate-500 mb-1.5">{formatDate(article.posted_at)}</p>
                        <h2 className="text-sm font-semibold text-white leading-snug mb-2 group-hover:text-vc-300 transition-colors line-clamp-2">
                          {article.title}
                        </h2>
                        {snippet && (
                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 flex-1">
                            {snippet}{snippet.length === 120 ? '…' : ''}
                          </p>
                        )}
                        <span className="mt-3 text-xs font-medium text-vc-300 group-hover:text-vc-200 transition-colors">
                          Read more →
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
