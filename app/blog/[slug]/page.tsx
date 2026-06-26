'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { BlogArticle } from '../../../lib/supabase';
import { extractYouTubeId, youTubeEmbedUrl } from '../../../lib/youtube';
import { renderMessageHtml } from '../../../lib/renderMessageHtml';
import { DateTime } from 'luxon';

function formatDate(dateStr: string): string {
  return DateTime.fromISO(dateStr).toFormat('MMMM d, yyyy');
}

function wasEdited(article: BlogArticle): boolean {
  const posted = DateTime.fromISO(article.posted_at);
  const updated = DateTime.fromISO(article.updated_at);
  return updated.diff(posted, 'days').days > 0.5;
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
        if (data) setArticle(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const videoId = article?.youtube_url ? extractYouTubeId(article.youtube_url) : null;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Radius Blog
          </Link>

          {loading && (
            <div className="animate-pulse space-y-4">
              <div className="w-full aspect-video bg-zinc-800 rounded-xl" />
              <div className="h-6 bg-zinc-800 rounded w-2/3" />
              <div className="h-4 bg-zinc-800 rounded w-1/3" />
              <div className="space-y-2 mt-6">
                <div className="h-3 bg-zinc-800 rounded w-full" />
                <div className="h-3 bg-zinc-800 rounded w-5/6" />
                <div className="h-3 bg-zinc-800 rounded w-4/6" />
              </div>
            </div>
          )}

          {notFound && !loading && (
            <div className="text-center py-20">
              <p className="text-slate-400 text-sm">Article not found.</p>
              <Link href="/blog" className="mt-3 inline-block text-sm text-vc-400 hover:text-vc-300">
                Back to blog
              </Link>
            </div>
          )}

          {article && !loading && (
            <article>
              {/* YouTube embed */}
              {videoId && (
                <div className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 mb-6 shadow-2xl shadow-black/40">
                  <iframe
                    src={youTubeEmbedUrl(videoId)}
                    title={article.title}
                    className="w-full h-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              )}

              {/* Meta */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-snug mb-3">
                  {article.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>Posted {formatDate(article.posted_at)}</span>
                  {wasEdited(article) && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span>Updated {formatDate(article.updated_at)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-700/60 mb-6" />

              {/* Rich text description */}
              {article.description && (
                <div
                  className="prose-blog"
                  dangerouslySetInnerHTML={{ __html: renderMessageHtml(article.description) }}
                />
              )}
            </article>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
