'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';
import { isToolkitHostName, toolkitGroupPath } from '../../../../lib/circle-leader-toolkit/paths';

type ResourcePage = {
  id: string;
  slug: string;
  title: string;
  body_html: string;
  updated_at: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Renders the Resources section: an ordered set of admin-managed pages shown
 * as pill tabs, with previous/next links chaining the pages in nav order.
 * `slug` comes from the /resources/[slug] route; the bare /resources route
 * shows the first page.
 */
export default function ResourcesClient({ slug }: { slug?: string }) {
  useMarkCircleAppEntered();
  const params = useParams<{ ccbGroupId: string }>();
  const urlGroupId = params?.ccbGroupId ?? '';
  const isDedicatedToolkitHost =
    typeof window !== 'undefined' && isToolkitHostName(window.location.hostname);

  const [pages, setPages] = useState<ResourcePage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-leader-toolkit/leader-resources/');
        if (!res.ok) throw new Error('Could not load resources.');
        const data = await res.json();
        if (!cancelled) setPages(Array.isArray(data.pages) ? data.pages : []);
      } catch (error: unknown) {
        if (!cancelled) setError(getErrorMessage(error, 'Could not load resources.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visiblePages = useMemo(
    () => (pages || []).filter((p) => p.body_html && p.body_html.trim().length > 0),
    [pages]
  );
  const activeIndex = slug
    ? Math.max(0, visiblePages.findIndex((p) => p.slug === slug))
    : 0;
  const active = visiblePages[activeIndex] || null;
  const prev = activeIndex > 0 ? visiblePages[activeIndex - 1] : null;
  const next = activeIndex < visiblePages.length - 1 ? visiblePages[activeIndex + 1] : null;

  // On narrow screens the pill row scrolls horizontally — keep the active
  // page's pill in view when landing on a deep link.
  useEffect(() => {
    const activeTab = tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activeTab?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [loading, activeIndex]);

  const pageHref = (page: ResourcePage, index: number) =>
    toolkitGroupPath(
      urlGroupId,
      index === 0 ? 'resources' : `resources/${encodeURIComponent(page.slug)}`,
      { cleanHost: isDedicatedToolkitHost }
    );

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {loading && (
        <div className="space-y-2.5">
          <div className="cs-card p-5 space-y-3">
            <div className="cs-skeleton h-4 w-2/3" />
            <div className="cs-skeleton h-3 w-full" />
            <div className="cs-skeleton h-3 w-5/6" />
            <div className="cs-skeleton h-3 w-3/4" />
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="cs-alert cs-alert-warning mt-2">{error}</div>
      )}

      {!loading && !error && !active && (
        <div className="cs-card text-center py-14">
          <svg className="w-10 h-10 mx-auto mb-3 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-neutral-500 font-medium">No resources posted yet</p>
          <p className="text-neutral-400 text-sm mt-1">Check back soon — your team will post helpful resources here.</p>
        </div>
      )}

      {!loading && !error && active && (
        <>
          {visiblePages.length > 1 && (
            <nav
              ref={tabsRef}
              aria-label="Resource pages"
              className="flex gap-1 overflow-x-auto bg-neutral-100 border border-neutral-200 rounded-full p-1 mb-4"
            >
              {visiblePages.map((page, i) => (
                <Link
                  key={page.id}
                  href={pageHref(page, i)}
                  aria-current={i === activeIndex ? 'page' : undefined}
                  className={
                    'cs-inbox-folder-tab shrink-0 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all ' +
                    (i === activeIndex
                      ? 'cs-inbox-folder-tab-active shadow-sm'
                      : 'cs-inbox-folder-tab-inactive')
                  }
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          )}

          <article
            className="cs-card cs-resources p-5 sm:p-7"
            dangerouslySetInnerHTML={{
              __html: renderMessageHtml(active.body_html, { includeYouTubeLink: false }),
            }}
          />

          {(prev || next) && (
            <div className="flex items-stretch gap-2.5 mt-4">
              {prev && (
                <Link
                  href={pageHref(prev, activeIndex - 1)}
                  className="cs-card flex-1 flex items-center gap-2 px-4 py-3 min-w-0"
                >
                  <svg className="w-4 h-4 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Previous
                    </span>
                    <span className="block text-sm font-bold text-neutral-800 truncate">{prev.title}</span>
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
                    <span className="block text-sm font-bold text-neutral-800 truncate">{next.title}</span>
                  </span>
                  <svg className="w-4 h-4 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
