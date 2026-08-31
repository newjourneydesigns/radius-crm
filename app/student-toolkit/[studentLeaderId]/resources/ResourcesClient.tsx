'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Fuse from 'fuse.js';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import {
  isStudentToolkitHostName,
  studentToolkitLeaderPath,
} from '../../../../lib/student-toolkit/paths';

type ResourcePage = {
  id: string;
  slug: string;
  title: string;
  body_html?: string;
  updated_at?: string | null;
};

type SearchEntry = {
  slug: string;
  title: string;
  text: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function htmlToText(html: string): string {
  if (!html || typeof window === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * The Resources section: an ordered set of staff-authored pages, chained with
 * previous/next links in nav order, plus fuzzy search across all of them.
 * `slug` comes from /resources/[slug]; the bare route shows the first page.
 */
export default function ResourcesClient({ slug }: { slug?: string }) {
  const params = useParams<{ studentLeaderId: string }>();
  const urlLeaderId = params?.studentLeaderId ?? '';
  // On the dedicated Student Toolkit host the /student-toolkit prefix is
  // stripped from visible URLs, so links must omit it or every tap costs a
  // redirect.
  const isDedicatedHost =
    typeof window !== 'undefined' && isStudentToolkitHostName(window.location.hostname);

  const [pages, setPages] = useState<ResourcePage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student-toolkit/leader-resources/');
        if (!res.ok) throw new Error('Could not load resources.');
        const data = await res.json();
        if (!cancelled) setPages(Array.isArray(data.pages) ? data.pages : []);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load resources.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A page staff created but never wrote would render as a blank card.
  const visiblePages = useMemo(
    () => (pages || []).filter((page) => page.body_html && page.body_html.trim().length > 0),
    [pages]
  );

  const activeIndex = slug ? Math.max(0, visiblePages.findIndex((page) => page.slug === slug)) : 0;
  const active = visiblePages[activeIndex] || null;
  const prev = activeIndex > 0 ? visiblePages[activeIndex - 1] : null;
  const next = activeIndex < visiblePages.length - 1 ? visiblePages[activeIndex + 1] : null;

  const pageHref = (page: ResourcePage, index: number) =>
    `${studentToolkitLeaderPath(
      urlLeaderId,
      index === 0 ? 'resources' : `resources/${encodeURIComponent(page.slug)}`,
      { cleanHost: isDedicatedHost }
    )}/`;

  const searchIndex = useMemo(
    () =>
      new Fuse<SearchEntry>(
        visiblePages.map((page) => ({
          slug: page.slug,
          title: page.title,
          text: htmlToText(page.body_html || ''),
        })),
        {
          keys: [
            { name: 'title', weight: 2 },
            { name: 'text', weight: 1 },
          ],
          threshold: 0.35,
          ignoreLocation: true,
        }
      ),
    [visiblePages]
  );

  const trimmedQuery = query.trim();
  const searchResults = useMemo(
    () => (trimmedQuery ? searchIndex.search(trimmedQuery).slice(0, 12) : []),
    [searchIndex, trimmedQuery]
  );

  const searchHref = (entry: SearchEntry) => {
    const index = visiblePages.findIndex((page) => page.slug === entry.slug);
    return pageHref(
      visiblePages[index] || { id: entry.slug, slug: entry.slug, title: entry.title },
      index === -1 ? visiblePages.length : index
    );
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {loading && (
        <div className="cs-card p-5 space-y-3">
          <div className="cs-skeleton h-4 w-2/3" />
          <div className="cs-skeleton h-3 w-full" />
          <div className="cs-skeleton h-3 w-5/6" />
          <div className="cs-skeleton h-3 w-3/4" />
        </div>
      )}

      {!loading && error && <div className="cs-alert cs-alert-warning mt-2">{error}</div>}

      {!loading && !error && visiblePages.length === 0 && (
        <div className="cs-card text-center py-14">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-neutral-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
          <p className="text-neutral-500 font-medium">No resources posted yet</p>
          <p className="text-neutral-400 text-sm mt-1">
            Check back soon — your staff team will post training and guides here.
          </p>
        </div>
      )}

      {!loading && !error && visiblePages.length > 0 && (
        <>
          <div className="relative mb-3">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search resources…"
              aria-label="Search resources"
              className="w-full cs-resources-search"
            />
          </div>

          {trimmedQuery ? (
            <div className="space-y-2.5">
              {searchResults.length === 0 && (
                <div className="cs-card text-center py-10">
                  <p className="text-neutral-500 font-medium text-sm">
                    No matches for “{trimmedQuery}”
                  </p>
                  <p className="text-neutral-400 text-xs mt-1">
                    Try a different word, or clear the search to browse.
                  </p>
                </div>
              )}
              {searchResults.map(({ item }) => (
                <Link
                  key={item.slug}
                  href={searchHref(item)}
                  onClick={() => setQuery('')}
                  className="cs-card block px-4 py-3"
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Resource page
                  </span>
                  <span className="block text-sm font-bold text-neutral-800 mt-0.5">
                    {item.title}
                  </span>
                  {item.text && (
                    <span className="block text-xs text-neutral-500 mt-1 line-clamp-2">
                      {item.text.slice(0, 160)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <>
              {active && (
                <article
                  className="cs-card cs-resources p-5 sm:p-7"
                  dangerouslySetInnerHTML={{
                    __html: renderMessageHtml(active.body_html || '', {
                      includeYouTubeLink: false,
                    }),
                  }}
                />
              )}

              {(prev || next) && (
                <div className="flex items-stretch gap-2.5 mt-4">
                  {prev && (
                    <Link
                      href={pageHref(prev, activeIndex - 1)}
                      className="cs-card flex-1 flex items-center gap-2 px-4 py-3 min-w-0"
                    >
                      <svg
                        className="w-4 h-4 shrink-0 text-neutral-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                          Previous
                        </span>
                        <span className="block text-sm font-bold text-neutral-800 truncate">
                          {prev.title}
                        </span>
                      </span>
                    </Link>
                  )}
                  {next && (
                    <Link
                      href={pageHref(next, activeIndex + 1)}
                      className="cs-card flex-1 flex items-center justify-end gap-2 px-4 py-3 min-w-0 text-right"
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                          Next
                        </span>
                        <span className="block text-sm font-bold text-neutral-800 truncate">
                          {next.title}
                        </span>
                      </span>
                      <svg
                        className="w-4 h-4 shrink-0 text-neutral-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
