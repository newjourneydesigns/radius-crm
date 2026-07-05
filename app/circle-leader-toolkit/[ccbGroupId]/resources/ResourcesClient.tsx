'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Fuse from 'fuse.js';
import { DateTime } from 'luxon';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';
import { isToolkitHostName, toolkitGroupPath } from '../../../../lib/circle-leader-toolkit/paths';

type ResourcePage = {
  id: string;
  slug: string;
  title: string;
  body_html?: string;
  updated_at?: string | null;
  kind?: 'pro_tips';
};

type ProTip = {
  id: string;
  title: string;
  youtube_url: string;
  body_html: string;
  publish_at: string;
};

type SearchEntry = {
  type: 'page' | 'tip';
  slug: string;
  anchor?: string;
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
 * Renders the Resources section: an ordered set of admin-managed pages shown
 * as pill tabs, with previous/next links chaining the pages in nav order, a
 * Pro Tips video catalog as a virtual last page, and fuzzy search across all
 * of it. `slug` comes from the /resources/[slug] route; the bare /resources
 * route shows the first page.
 */
export default function ResourcesClient({ slug }: { slug?: string }) {
  useMarkCircleAppEntered();
  const params = useParams<{ ccbGroupId: string }>();
  const urlGroupId = params?.ccbGroupId ?? '';
  const isDedicatedToolkitHost =
    typeof window !== 'undefined' && isToolkitHostName(window.location.hostname);

  const [pages, setPages] = useState<ResourcePage[] | null>(null);
  const [tips, setTips] = useState<ProTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const tabsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pagesRes, tipsRes] = await Promise.all([
          fetch('/api/circle-leader-toolkit/leader-resources/'),
          fetch('/api/circle-leader-toolkit/pro-tips/').catch(() => null),
        ]);
        if (!pagesRes.ok) throw new Error('Could not load resources.');
        const pagesData = await pagesRes.json();
        const tipsData = tipsRes?.ok ? await tipsRes.json() : { tips: [] };
        if (!cancelled) {
          setPages(Array.isArray(pagesData.pages) ? pagesData.pages : []);
          setTips(Array.isArray(tipsData.tips) ? tipsData.tips : []);
        }
      } catch (error: unknown) {
        if (!cancelled) setError(getErrorMessage(error, 'Could not load resources.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visiblePages = useMemo(
    () =>
      (pages || []).filter(
        (p) =>
          (p.kind === 'pro_tips' && tips.length > 0) ||
          (p.kind !== 'pro_tips' && p.body_html && p.body_html.trim().length > 0)
      ),
    [pages, tips]
  );
  const activeIndex = slug
    ? Math.max(0, visiblePages.findIndex((p) => p.slug === slug))
    : 0;
  const active = visiblePages[activeIndex] || null;
  const prev = activeIndex > 0 ? visiblePages[activeIndex - 1] : null;
  const next = activeIndex < visiblePages.length - 1 ? visiblePages[activeIndex + 1] : null;
  const isProTipsActive = active?.kind === 'pro_tips';

  // On narrow screens the pill row scrolls horizontally — keep the active
  // page's pill in view when landing on a deep link.
  useEffect(() => {
    const activeTab = tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activeTab?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [loading, activeIndex]);

  // Search deep links land on the Pro Tips page with #tip-<id> — scroll to it.
  useEffect(() => {
    if (!isProTipsActive || typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#tip-')) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [isProTipsActive, loading]);

  const pageHref = (page: ResourcePage, index: number) =>
    toolkitGroupPath(
      urlGroupId,
      index === 0 ? 'resources' : `resources/${encodeURIComponent(page.slug)}`,
      { cleanHost: isDedicatedToolkitHost }
    );

  const searchIndex = useMemo(() => {
    const entries: SearchEntry[] = [];
    for (const page of visiblePages) {
      if (page.kind === 'pro_tips') continue;
      entries.push({
        type: 'page',
        slug: page.slug,
        title: page.title,
        text: htmlToText(page.body_html || ''),
      });
    }
    for (const tip of tips) {
      entries.push({
        type: 'tip',
        slug: 'pro-tips',
        anchor: `tip-${tip.id}`,
        title: tip.title,
        text: htmlToText(tip.body_html),
      });
    }
    return new Fuse(entries, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'text', weight: 1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
    });
  }, [visiblePages, tips]);

  const trimmedQuery = query.trim();
  const searchResults = useMemo(
    () => (trimmedQuery ? searchIndex.search(trimmedQuery).slice(0, 12) : []),
    [searchIndex, trimmedQuery]
  );

  const searchHref = (entry: SearchEntry) => {
    const index = visiblePages.findIndex((p) => p.slug === entry.slug);
    const base = pageHref(
      visiblePages[index] || { id: entry.slug, slug: entry.slug, title: entry.title },
      index === -1 ? visiblePages.length : index
    );
    return entry.anchor ? `${base}#${entry.anchor}` : base;
  };

  const hasAnyContent = visiblePages.length > 0;

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

      {!loading && !error && !hasAnyContent && (
        <div className="cs-card text-center py-14">
          <svg className="w-10 h-10 mx-auto mb-3 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-neutral-500 font-medium">No resources posted yet</p>
          <p className="text-neutral-400 text-sm mt-1">Check back soon — your team will post helpful resources here.</p>
        </div>
      )}

      {!loading && !error && hasAnyContent && (
        <>
          <div className="relative mb-3">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
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
                  <p className="text-neutral-500 font-medium text-sm">No matches for “{trimmedQuery}”</p>
                  <p className="text-neutral-400 text-xs mt-1">Try a different word or browse the tabs below.</p>
                </div>
              )}
              {searchResults.map(({ item }) => (
                <Link
                  key={`${item.type}-${item.anchor || item.slug}`}
                  href={searchHref(item)}
                  onClick={() => setQuery('')}
                  className="cs-card block px-4 py-3"
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {item.type === 'tip' ? 'Pro Tip' : 'Resource page'}
                  </span>
                  <span className="block text-sm font-bold text-neutral-800 mt-0.5">{item.title}</span>
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

              {isProTipsActive ? (
                <div className="space-y-4">
                  {tips.map((tip) => (
                    <article key={tip.id} id={`tip-${tip.id}`} className="cs-card cs-resources p-5 sm:p-7 scroll-mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 !mt-0 !mb-1">
                        {DateTime.fromISO(tip.publish_at).toFormat('LLLL d, yyyy')}
                      </p>
                      <h2 className="!mt-0">{tip.title}</h2>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderMessageHtml(`<p>${tip.youtube_url}</p>${tip.body_html || ''}`, {
                            includeYouTubeLink: false,
                          }),
                        }}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                active && (
                  <article
                    className="cs-card cs-resources p-5 sm:p-7"
                    dangerouslySetInnerHTML={{
                      __html: renderMessageHtml(active.body_html || '', { includeYouTubeLink: false }),
                    }}
                  />
                )
              )}

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
        </>
      )}
    </main>
  );
}
