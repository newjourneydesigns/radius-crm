'use client';

import { useMemo, useState } from 'react';
import type { TeamRosterPosition } from '../../../../lib/teams-toolkit/roster-data';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Client island for the Team Roster: a live filter over the server-rendered
 * roster. Searching is purely client-side (read-only data, no CCB round-trip) —
 * it matches a person's name, email, or phone, and also a whole position by
 * name so a leader can type "ops" to jump to the Ops Team.
 */
export default function TeamRosterList({
  positions,
  error,
}: {
  positions: TeamRosterPosition[];
  error?: string;
}) {
  const [query, setQuery] = useState('');

  const total = useMemo(
    () => positions.reduce((sum, p) => sum + p.volunteers.length, 0),
    [positions]
  );

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');

  const filtered = useMemo(() => {
    if (!q) return positions;
    return positions
      .map((pos) => {
        // A position-name match keeps everyone in that position.
        if (pos.positionName.toLowerCase().includes(q)) return pos;
        const volunteers = pos.volunteers.filter((v) => {
          const name = v.name.toLowerCase();
          const email = (v.email || '').toLowerCase();
          const phone = (v.mobile || '').replace(/\D/g, '');
          return (
            name.includes(q) ||
            (!!email && email.includes(q)) ||
            (qDigits.length >= 3 && phone.includes(qDigits))
          );
        });
        return { ...pos, volunteers };
      })
      .filter((pos) => pos.volunteers.length > 0);
  }, [positions, q, qDigits]);

  const matchCount = useMemo(
    () => filtered.reduce((sum, p) => sum + p.volunteers.length, 0),
    [filtered]
  );

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
            placeholder="Search by name, phone, or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search your roster"
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

      {!error && positions.length > 0 && q && filtered.length === 0 && (
        <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
          <p className="text-neutral-500 text-sm font-medium">No matches</p>
          <p className="text-neutral-400 text-xs mt-1">
            No one in your positions matches “{query.trim()}”.
          </p>
        </div>
      )}

      {!error && q && filtered.length > 0 && (
        <p className="-mb-2 px-1 text-xs text-neutral-500">
          {matchCount} {matchCount === 1 ? 'match' : 'matches'} for “{query.trim()}”
        </p>
      )}

      {filtered.map((position) => (
        <section key={position.positionId} className="ts-position-card">
          <div className="ts-position-head">
            <span className="ts-position-name">{position.positionName}</span>
            <span className="ts-position-count">
              {position.volunteers.length} {position.volunteers.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          {position.volunteers.map((volunteer) => (
            <div key={volunteer.id} className="ts-roster-row">
              <span className="ts-roster-avatar" aria-hidden="true">
                {initials(volunteer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="ts-roster-name truncate">{volunteer.name}</div>
                <div className="ts-roster-contact truncate">
                  {volunteer.mobile ? (
                    <a className="ts-roster-contact-link" href={`tel:${volunteer.mobile}`}>
                      {volunteer.mobile}
                    </a>
                  ) : null}
                  {volunteer.mobile && volunteer.email ? ' · ' : ''}
                  {volunteer.email ? (
                    <a className="ts-roster-contact-link" href={`mailto:${volunteer.email}`}>
                      {volunteer.email}
                    </a>
                  ) : null}
                  {!volunteer.mobile && !volunteer.email ? 'No contact on file' : ''}
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
