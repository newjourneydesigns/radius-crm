'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { TeamRosterPosition } from '../../../../lib/teams-toolkit/roster-data';
import { isTeamsToolkitHostName, teamsToolkitGroupPath } from '../../../../lib/teams-toolkit/paths';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Person = {
  id: number | string;
  name: string;
  email: string;
  mobile: string;
  positions: string[];
};

/**
 * Roster tab island: a global person search pinned at the top (type a name,
 * phone, or email — or a position name — and open that person's profile), with
 * the full grouped roster shown underneath when not searching.
 */
export default function TeamRosterList({
  categoryId,
  positions,
  error,
  buildPersonHref,
}: {
  categoryId: string;
  positions: TeamRosterPosition[];
  error?: string;
  /** Optional override for the per-person link target (used by local previews). */
  buildPersonHref?: (id: number | string) => string;
}) {
  const [query, setQuery] = useState('');

  const cleanHost =
    typeof window !== 'undefined' && isTeamsToolkitHostName(window.location.hostname);
  const personHref = (id: number | string) =>
    buildPersonHref
      ? buildPersonHref(id)
      : teamsToolkitGroupPath(categoryId, `people/${encodeURIComponent(String(id))}`, { cleanHost });

  const total = useMemo(
    () => positions.reduce((sum, p) => sum + p.volunteers.length, 0),
    [positions]
  );

  // Dedupe people across positions for the search index — someone can serve in
  // more than one position, but the search should show them once.
  const people = useMemo<Person[]>(() => {
    const byId = new Map<string, Person>();
    for (const pos of positions) {
      for (const v of pos.volunteers) {
        const key = String(v.id);
        const existing = byId.get(key);
        if (existing) {
          if (!existing.positions.includes(pos.positionName)) existing.positions.push(pos.positionName);
        } else {
          byId.set(key, {
            id: v.id,
            name: v.name,
            email: v.email,
            mobile: v.mobile,
            positions: [pos.positionName],
          });
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [positions]);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');

  const matches = useMemo(() => {
    if (!q) return [];
    return people.filter((p) => {
      const name = p.name.toLowerCase();
      const email = (p.email || '').toLowerCase();
      const phone = (p.mobile || '').replace(/\D/g, '');
      const pos = p.positions.join(' ').toLowerCase();
      return (
        name.includes(q) ||
        pos.includes(q) ||
        (!!email && email.includes(q)) ||
        (qDigits.length >= 3 && phone.includes(qDigits))
      );
    });
  }, [people, q, qDigits]);

  return (
    <>
      <section className="cs-card">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Team Roster</h2>
          {total > 0 && (
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {total} {total === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500">The volunteers serving in the positions you lead.</p>
      </section>

      {error && <div className="cs-alert cs-alert-warning">{error}</div>}

      {!error && total > 0 && (
        <div className="ts-search">
          <svg className="ts-search-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            inputMode="search"
            className="ts-search-input"
            placeholder="Find a person by name, phone, or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find a person"
          />
          {query && (
            <button
              type="button"
              className="ts-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {!error && positions.length === 0 && (
        <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
          <p className="text-neutral-500 text-sm font-medium">No roster yet</p>
          <p className="text-neutral-400 text-xs mt-1">
            Once positions are assigned to your team, your roster will appear here.
          </p>
        </div>
      )}

      {/* Search results → tap to open a profile */}
      {!error && q && (
        matches.length > 0 ? (
          <section className="ts-position-card">
            <div className="ts-position-head">
              <span className="ts-position-name">Search</span>
              <span className="ts-position-count">
                {matches.length} {matches.length === 1 ? 'match' : 'matches'}
              </span>
            </div>
            {matches.map((p) => (
              <Link key={p.id} href={personHref(p.id)} className="ts-roster-row ts-person-link">
                <span className="ts-roster-avatar" aria-hidden="true">{initials(p.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="ts-roster-name truncate">{p.name}</div>
                  <div className="ts-roster-contact truncate">{p.positions.join(' · ')}</div>
                </div>
                <span className="ts-person-chevron" aria-hidden="true">›</span>
              </Link>
            ))}
          </section>
        ) : (
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
            <p className="text-neutral-500 text-sm font-medium">No matches</p>
            <p className="text-neutral-400 text-xs mt-1">
              No one in your positions matches “{query.trim()}”.
            </p>
          </div>
        )
      )}

      {/* Full roster — hidden while searching */}
      {!error && !q && positions.map((position) => (
        <section key={position.positionId} className="ts-position-card">
          <div className="ts-position-head">
            <span className="ts-position-name">{position.positionName}</span>
            <span className="ts-position-count">
              {position.volunteers.length} {position.volunteers.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          {position.volunteers.map((volunteer) => (
            <Link
              key={volunteer.id}
              href={personHref(volunteer.id)}
              className="ts-roster-row ts-person-link"
            >
              <span className="ts-roster-avatar" aria-hidden="true">
                {initials(volunteer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="ts-roster-name truncate">{volunteer.name}</div>
                <div className="ts-roster-contact truncate">
                  {volunteer.mobile || volunteer.email || 'No contact on file'}
                </div>
              </div>
              <span className="ts-person-chevron" aria-hidden="true">›</span>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}
