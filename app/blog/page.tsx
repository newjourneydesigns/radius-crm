'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Fuse from 'fuse.js';
import ProtectedRoute from '../../components/ProtectedRoute';
import { BlogArticle } from '../../lib/supabase';
import { extractYouTubeId, youTubeThumbnail } from '../../lib/youtube';
import { DateTime } from 'luxon';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(dateStr: string): string {
  return DateTime.fromISO(dateStr).toFormat('MMMM d, yyyy');
}

function ArticleCard({ article }: { article: BlogArticle }) {
  const videoId = article.youtube_url ? extractYouTubeId(article.youtube_url) : null;
  const thumbnail = videoId ? youTubeThumbnail(videoId) : null;
  const snippet = stripHtml(article.description).slice(0, 160);

  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group flex flex-col bg-zinc-800 border border-zinc-700/80 rounded-xl overflow-hidden hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30 transition-all duration-200"
    >
      {thumbnail ? (
        <div className="relative w-full aspect-video bg-zinc-900 overflow-hidden">
          <Image
            src={thumbnail}
            alt={article.title}
            fill
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
            unoptimized
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm group-hover:bg-black/70 transition-colors">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
          <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
      )}
      <div className="flex-1 flex flex-col p-4">
        <p className="text-xs text-slate-500 mb-1.5">{formatDate(article.posted_at)}</p>
        <h2 className="text-sm font-semibold text-white leading-snug mb-2 group-hover:text-vc-300 transition-colors line-clamp-2">
          {article.title}
        </h2>
        {snippet && (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 flex-1">
            {snippet}
          </p>
        )}
        <div className="mt-3 flex items-center gap-1 text-xs text-vc-400 group-hover:text-vc-300 transition-colors font-medium">
          Read more
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function BlogPage() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/blog')
      .then(r => r.json())
      .then((data: BlogArticle[]) => {
        setArticles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(articles, {
        includeScore: true,
        threshold: 0.35,
        minMatchCharLength: 2,
        ignoreLocation: true,
        keys: [
          { name: 'title', weight: 3 },
          { name: 'description', weight: 1 },
        ],
      }),
    [articles]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return articles;
    return fuse.search(query.trim()).map(r => r.item);
  }, [query, articles, fuse]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/help"
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Back to Help"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Radius Blog</h1>
              </div>
            </div>
            <p className="text-sm text-slate-400">
              Video guides, updates, and how-tos for the Radius team.
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-8">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search articles and videos…"
              className="w-full pl-12 pr-10 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1.5 rounded-md hover:bg-zinc-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-zinc-800 rounded-xl border border-zinc-700/80 overflow-hidden animate-pulse">
                  <div className="w-full aspect-video bg-zinc-700" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-zinc-700 rounded w-1/3" />
                    <div className="h-4 bg-zinc-700 rounded w-3/4" />
                    <div className="h-3 bg-zinc-700 rounded w-full" />
                    <div className="h-3 bg-zinc-700 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              {query ? (
                <>
                  <p className="text-slate-400 text-sm">No articles match &ldquo;{query}&rdquo;</p>
                  <button onClick={() => setQuery('')} className="mt-3 text-sm text-vc-400 hover:text-vc-300 transition-colors">
                    Clear search
                  </button>
                </>
              ) : (
                <p className="text-slate-400 text-sm">No articles yet — check back soon.</p>
              )}
            </div>
          ) : (
            <>
              {query && (
                <p className="text-xs text-slate-500 mb-4">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(article => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
