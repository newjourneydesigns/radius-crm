'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import { isTeamsToolkitHostName, teamsToolkitGroupPath } from '../../../lib/teams-toolkit/paths';

type Person = {
  id: number | string;
  name: string;
  mobile: string;
  email: string;
  /** Position names this person serves in (for display). */
  positions: string[];
};

type RosterPosition = {
  positionId: string;
  positionName: string;
  volunteers: Array<{ id: number | string; name: string; mobile: string; email: string }>;
};

/**
 * Search any person on the leader's team and jump to their profile. Lives above
 * the toolkit tabs. People come from the roster (the leader's managed positions),
 * so scope matches the roster/person views. The roster is fetched on first focus
 * to avoid an extra CCB round trip on every page load.
 */
export default function TeamPersonSearch({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [personNavigating, setPersonNavigating] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDedicatedToolkitHost =
    typeof window !== 'undefined' && isTeamsToolkitHostName(window.location.hostname);

  const loadPeople = useCallback(async () => {
    if (people || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/teams-toolkit/roster/', { cache: 'no-store' });
      const data = await res.json();
      const positions: RosterPosition[] = Array.isArray(data.positions) ? data.positions : [];
      // Flatten + dedupe by person id, collecting the positions they serve in.
      const byId = new Map<string, Person>();
      for (const pos of positions) {
        for (const v of pos.volunteers || []) {
          const key = String(v.id);
          const existing = byId.get(key);
          if (existing) {
            if (!existing.positions.includes(pos.positionName)) existing.positions.push(pos.positionName);
          } else {
            byId.set(key, {
              id: v.id,
              name: v.name,
              mobile: v.mobile,
              email: v.email,
              positions: [pos.positionName],
            });
          }
        }
      }
      setPeople(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [people, loading]);

  const fuse = useMemo(
    () =>
      new Fuse(people || [], {
        keys: [
          { name: 'name', weight: 3 },
          { name: 'positions', weight: 1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [people]
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return (people || []).slice(0, 8);
    return fuse.search(q, { limit: 8 }).map((r) => r.item);
  }, [query, fuse, people]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    setPersonNavigating(false);
  }, [pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function goToPerson(id: number | string) {
    const href = teamsToolkitGroupPath(categoryId, `people/${encodeURIComponent(String(id))}`, {
      cleanHost: isDedicatedToolkitHost,
    });

    setOpen(false);
    setQuery('');
    if ((pathname ?? '').replace(/\/+$/, '') !== href.replace(/\/+$/, '')) {
      setPersonNavigating(true);
    }
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const pick = results[activeIndex];
      if (pick) goToPerson(pick.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <>
      {personNavigating && (
        <div className="ts-person-loading-overlay" role="status" aria-live="polite" aria-label="Loading person">
          <div className="ts-person-loading-mark" aria-hidden="true">
            <span className="ts-person-loading-ring" />
            <span className="ts-person-loading-ring ts-person-loading-ring-delay" />
            <Image
              src="/VCC Icon (White).png"
              alt=""
              width={756}
              height={757}
              className="ts-person-loading-logo"
              priority
            />
          </div>
        </div>
      )}

      <div ref={containerRef} className="ts-person-search relative">
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="m14 14 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              loadPeople();
            }}
            onKeyDown={onKeyDown}
            placeholder="Search anyone on your team…"
            aria-label="Search anyone on your team"
            className="ts-person-search-input w-full rounded-full pl-10 pr-4 py-2.5 text-sm font-medium outline-none"
          />
        </div>

        {open && (
          <div className="ts-person-search-panel absolute z-30 mt-2 w-full rounded-2xl overflow-hidden">
            {loading && (
              <div className="px-4 py-3 text-xs text-neutral-400">Loading your team…</div>
            )}
            {!loading && results.length === 0 && (
              <div className="px-4 py-3 text-xs text-neutral-400">
                {query.trim() ? 'No one matches that name.' : 'No one on your team yet.'}
              </div>
            )}
            {!loading &&
              results.map((p, i) => (
                <button
                  key={String(p.id)}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => goToPerson(p.id)}
                  className={`ts-person-search-row w-full text-left flex items-center gap-3 px-4 py-2.5 ${
                    i === activeIndex ? 'is-active' : ''
                  }`}
                >
                  <span className="ts-person-search-avatar" aria-hidden="true">
                    {p.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-900 truncate">{p.name}</span>
                    {p.positions.length > 0 && (
                      <span className="block text-xs text-neutral-500 truncate">{p.positions.join(' · ')}</span>
                    )}
                  </span>
                </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
