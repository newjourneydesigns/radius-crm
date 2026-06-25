'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProtectedRoute from '../../../components/ProtectedRoute';
import type { BlogArticle } from '../../../lib/supabase';
import { renderMessageHtml } from '../../../lib/renderMessageHtml';
import { DateTime } from 'luxon';

function formatDate(iso: string) {
  return DateTime.fromISO(iso).toFormat('MMMM d, yyyy');
}

function wasUpdated(article: BlogArticle): boolean {
  const posted = DateTime.fromISO(article.posted_at);
  const updated = DateTime.fromISO(article.updated_at);
  return updated.diff(posted, 'hours').hours > 1;
}

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<BlogArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/blog/${slug}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(data => {
        if (data) { setArticle(data); setLoading(false); }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

          {/* Back */}
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Radius Blog
          </Link>

          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-zinc-800 rounded w-3/4" />
              <div className="h-4 bg-zinc-800 rounded w-1/4" />
              <div className="aspect-video bg-zinc-800 rounded-xl mt-6" />
              <div className="space-y-2 mt-6">
                <div className="h-4 bg-zinc-800 rounded" />
                <div className="h-4 bg-zinc-800 rounded w-5/6" />
                <div className="h-4 bg-zinc-800 rounded w-4/5" />
              </div>
            </div>
          ) : notFound || !article ? (
            <div className="text-center py-16">
              <p className="text-white font-semibold mb-2">Article not found</p>
              <p className="text-sm text-slate-400 mb-4">This post may have been removed or the link is incorrect.</p>
              <Link href="/blog" className="text-sm text-vc-300 hover:text-vc-200">← Back to Radius Blog</Link>
            </div>
          ) : (
            <article>
              {/* Meta */}
              <div className="mb-5">
                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-snug mb-3">
                  {article.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>Posted {formatDate(article.posted_at)}</span>
                  {wasUpdated(article) && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span>Updated {formatDate(article.updated_at)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* YouTube embed */}
              {article.youtube_url && (
                <div className="mb-6 prose-blog">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMessageHtml(article.youtube_url),
                    }}
                  />
                </div>
              )}

              {/* Rich-text description */}
              {article.description && (
                <div
                  className="prose-blog"
                  dangerouslySetInnerHTML={{
                    __html: renderMessageHtml(article.description),
                  }}
                />
              )}
            </article>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
