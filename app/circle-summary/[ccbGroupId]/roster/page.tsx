'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';

type Participant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
  birthday?: string;
  detailsLoaded?: boolean;
};

type CcbSearchResult = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
};

const DISMISS_STORAGE_KEY = 'cs:bday-dismiss:v1';
const ROSTER_CACHE_KEY = 'cs:roster-cache:v1';

type RosterCacheEntry = { groupId: string; participants: Participant[]; cachedAt: number };

function readRosterCache(groupId: string): Participant[] | null {
  try {
    const raw = sessionStorage.getItem(ROSTER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RosterCacheEntry;
    if (parsed?.groupId !== groupId) return null;
    return parsed.participants || null;
  } catch {
    return null;
  }
}

function writeRosterCache(groupId: string, participants: Participant[]): void {
  try {
    const entry: RosterCacheEntry = { groupId, participants, cachedAt: Date.now() };
    sessionStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Parse a CCB birthday string (commonly "YYYY-MM-DD" or "MM/DD/YYYY") into
// { month, day }. Year is ignored — we only care about upcoming birthdays.
function parseBirthday(raw: string | undefined): { month: number; day: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (us) {
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  return null;
}

function daysUntilBirthday(b: { month: number; day: number }, now = new Date()): number {
  const year = now.getFullYear();
  let next = new Date(year, b.month - 1, b.day);
  // Compare on date-only (strip time) so "today" reads as 0 days.
  const today = new Date(year, now.getMonth(), now.getDate());
  if (next.getTime() < today.getTime()) {
    next = new Date(year + 1, b.month - 1, b.day);
  }
  return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function birthdayLabel(b: { month: number; day: number }): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[b.month - 1]} ${b.day}`;
}

function formatPhoneForDisplay(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return p;
}

function phoneHref(p: string, scheme: 'tel' | 'sms'): string {
  return `${scheme}:${p.replace(/[^\d+]/g, '')}`;
}

export default function CircleRosterPage() {
  const router = useRouter();
  const params = useParams<{ ccbGroupId: string }>();
  const urlGroupId = params?.ccbGroupId ?? '';

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editRoster, setEditRoster] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CcbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRequestId = useRef(0);

  const [actionSheet, setActionSheet] = useState<{ name: string; phone: string } | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshFromCcb() {
    if (refreshing || participants.length === 0) return;
    setRefreshing(true);
    try {
      const ids = participants.map((p) => p.id);
      const r = await fetch('/api/circle-summary/roster/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) return;
      const j = await r.json();
      const profiles: Array<{ id: string; phone: string; email: string; birthday: string }> = j.profiles || [];
      const byId = new Map(profiles.map((p) => [String(p.id), p]));
      setParticipants((prev) => {
        const next = prev.map((x) => {
          const prof = byId.get(String(x.id));
          if (!prof) return { ...x, detailsLoaded: true };
          return {
            ...x,
            phone: prof.phone || x.phone,
            email: prof.email || x.email,
            birthday: prof.birthday || x.birthday || '',
            detailsLoaded: true,
          };
        });
        writeRosterCache(urlGroupId, next);
        return next;
      });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!actionSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [actionSheet]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      // Drop stale dismissals whose birthday has passed.
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fresh: Record<string, string> = {};
      for (const [id, until] of Object.entries(parsed)) {
        if (until >= todayKey) fresh[id] = until;
      }
      setDismissed(fresh);
      if (Object.keys(fresh).length !== Object.keys(parsed).length) {
        localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(fresh));
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Show cached roster immediately (stale-while-revalidate).
    const cached = typeof window !== 'undefined' ? readRosterCache(urlGroupId) : null;
    if (cached && cached.length > 0) {
      setParticipants(cached);
      setLoading(false);
    }

    (async () => {
      try {
        const rosterRes = await fetch('/api/circle-summary/roster');
        if (rosterRes.status === 401) {
          router.replace('/circle-summary');
          return;
        }

        const rosterData = await rosterRes.json();
        const list: Participant[] = (rosterData.participants || []).map((p: Participant) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone,
          birthday: p.birthday || '',
          detailsLoaded: !!p.detailsLoaded,
        }));
        if (cancelled) return;
        setParticipants(list);
        setLoading(false);
        writeRosterCache(urlGroupId, list);

        // Revalidate stale or missing-profile members in one batched, parallel
        // request. The server fans out to CCB with bounded concurrency and
        // upserts the cache, so future page loads are instant.
        const staleIds: string[] = Array.isArray(rosterData.staleIds)
          ? rosterData.staleIds
          : list.filter((p) => !p.detailsLoaded).map((p) => p.id);

        if (staleIds.length === 0) return;

        try {
          const r = await fetch('/api/circle-summary/roster/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: staleIds }),
          });
          if (!r.ok) {
            if (!cancelled) {
              setParticipants((prev) => prev.map((x) => ({ ...x, detailsLoaded: true })));
            }
            return;
          }
          const j = await r.json();
          const profiles: Array<{ id: string; phone: string; email: string; birthday: string }> = j.profiles || [];
          const byId = new Map(profiles.map((p) => [String(p.id), p]));
          if (cancelled) return;
          setParticipants((prev) => {
            const next = prev.map((x) => {
              const prof = byId.get(String(x.id));
              if (!prof) return { ...x, detailsLoaded: true };
              return {
                ...x,
                phone: prof.phone || x.phone,
                email: prof.email || x.email,
                birthday: prof.birthday || x.birthday || '',
                detailsLoaded: true,
              };
            });
            writeRosterCache(urlGroupId, next);
            return next;
          });
        } catch {
          if (!cancelled) {
            setParticipants((prev) => prev.map((x) => ({ ...x, detailsLoaded: true })));
          }
        }
      } catch (e: unknown) {
        if (!cancelled && !cached) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load roster.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, urlGroupId]);

  // Search for new members (mirrors the events form behavior).
  useEffect(() => {
    if (!addOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchRequestId.current += 1;
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/circle-summary/roster/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const data = await res.json();
        if (searchRequestId.current === requestId) setSearchResults(data.results || []);
      } catch {
        if (searchRequestId.current === requestId) setSearchResults([]);
      } finally {
        if (searchRequestId.current === requestId) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [addOpen, searchQuery]);

  async function addFromCcb(individual: CcbSearchResult) {
    if (!individual.id) return;
    const res = await fetch('/api/circle-summary/roster/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ individualId: individual.id }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Could not add to your Circle.');
      return;
    }
    // Optimistically append; refresh details in the background.
    setParticipants((prev) => {
      if (prev.some((x) => x.id === individual.id)) return prev;
      const next = [
        ...prev,
        {
          id: individual.id,
          firstName: individual.firstName || '',
          lastName: individual.lastName || '',
          fullName: individual.fullName || `${individual.firstName || ''} ${individual.lastName || ''}`.trim(),
          email: individual.email,
          phone: individual.phone,
          detailsLoaded: false,
        },
      ];
      writeRosterCache(urlGroupId, next);
      return next;
    });
    setAddOpen(false);
    setSearchQuery('');
    setSearchResults([]);

    try {
      const r = await fetch('/api/circle-summary/roster/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [individual.id] }),
      });
      if (r.ok) {
        const j = await r.json();
        const prof = (j.profiles || []).find(
          (p: { id: string | number }) => String(p.id) === String(individual.id)
        );
        if (prof) {
          setParticipants((prev) => {
            const next = prev.map((x) =>
              x.id === individual.id
                ? {
                    ...x,
                    phone: prof.phone || x.phone,
                    email: prof.email || x.email,
                    birthday: prof.birthday || '',
                    detailsLoaded: true,
                  }
                : x
            );
            writeRosterCache(urlGroupId, next);
            return next;
          });
        }
      }
    } catch {}
  }

  async function removeFromCcb(p: Participant) {
    const name = p.fullName || `${p.firstName} ${p.lastName}`.trim();
    if (!confirm(`Remove ${name} from your Circle's roster?\n\nThis only removes them from this group. Their profile is not changed.`)) {
      return;
    }
    const res = await fetch('/api/circle-summary/roster/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ individualId: p.id }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Could not remove from your Circle.');
      return;
    }
    setParticipants((prev) => {
      const next = prev.filter((x) => x.id !== p.id);
      writeRosterCache(urlGroupId, next);
      return next;
    });
  }

  // Compute upcoming birthdays (next 14 days) and filter out ones the leader
  // has already dismissed for this cycle.
  const upcomingBirthdays = useMemo(() => {
    const out: Array<{ id: string; name: string; daysAway: number; label: string }> = [];
    for (const p of participants) {
      const b = parseBirthday(p.birthday);
      if (!b) continue;
      const d = daysUntilBirthday(b);
      if (d <= 14 && !dismissed[p.id]) {
        out.push({
          id: p.id,
          name: p.fullName || `${p.firstName} ${p.lastName}`.trim(),
          daysAway: d,
          label: birthdayLabel(b),
        });
      }
    }
    out.sort((a, b) => a.daysAway - b.daysAway);
    return out;
  }, [participants, dismissed]);

  function dismissBirthday(id: string) {
    // Persist a dismissal that expires after this person's birthday passes —
    // simplest correct way is to store the next-birthday date so the cleanup
    // pass on next mount removes it.
    const p = participants.find((x) => x.id === id);
    const b = p ? parseBirthday(p.birthday) : null;
    if (!b) return;
    const now = new Date();
    let until = new Date(now.getFullYear(), b.month - 1, b.day);
    if (until.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      until = new Date(now.getFullYear() + 1, b.month - 1, b.day);
    }
    const untilKey = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, '0')}-${String(until.getDate()).padStart(2, '0')}`;
    setDismissed((prev) => {
      const next = { ...prev, [id]: untilKey };
      try {
        localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="cs-skeleton h-12 w-full" />
        <div className="cs-skeleton h-24 w-full" />
        <div className="cs-skeleton h-40 w-full" />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="cs-alert cs-alert-error">{loadError}</div>
      </main>
    );
  }

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-4">
        {upcomingBirthdays.length > 0 && (
          <div className="space-y-2">
            {upcomingBirthdays.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
              >
                <span className="text-2xl leading-none" aria-hidden>🎂</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {b.name}&apos;s birthday is {b.daysAway === 0
                      ? 'today'
                      : b.daysAway === 1
                        ? 'tomorrow'
                        : `in ${b.daysAway} days`}
                  </p>
                  <p className="text-xs text-amber-800/80 mt-0.5">{b.label}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissBirthday(b.id)}
                  className="shrink-0 text-amber-700/70 hover:text-amber-900 -mt-0.5 -mr-1 p-1"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="cs-card">
          <div className="flex items-center justify-between mb-4">
            <div className="cs-step mb-0">
              <span className="cs-step-title">
                {participants.length} {participants.length === 1 ? 'person' : 'people'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshFromCcb}
                disabled={refreshing || participants.length === 0}
                title="Re-sync contact info and birthdays from CCB"
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cs-border)] hover:border-[color:var(--cs-green)] hover:text-[color:var(--cs-green-darker)] text-[color:var(--cs-ink-soft)] text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Refresh from CCB"
              >
                <svg
                  className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setEditRoster((v) => !v)}
                className={
                  editRoster
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-[color:var(--cs-green)] hover:bg-[color:var(--cs-green-dark)] text-white text-xs font-semibold px-3.5 py-1.5 transition-colors'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cs-border)] hover:border-[color:var(--cs-green)] hover:text-[color:var(--cs-green-darker)] text-[color:var(--cs-ink-soft)] text-xs font-semibold px-3.5 py-1.5 transition-colors'
                }
              >
                {editRoster ? 'Done' : 'Edit roster'}
              </button>
            </div>
          </div>

          {editRoster && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mt-0.5 shrink-0 text-amber-500">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span>Tap the minus button to remove someone from your Circle&apos;s roster. Their profile isn&apos;t deleted — they&apos;re just removed from this Circle.</span>
            </div>
          )}

          <div className="space-y-2 mb-4">
            {participants.length === 0 && (
              <p className="text-sm text-neutral-500 py-2">No one on your roster yet.</p>
            )}
            {participants.map((p) => {
              const fullName = p.fullName || `${p.firstName} ${p.lastName}`.trim();
              const bday = parseBirthday(p.birthday);
              return (
                <div
                  key={p.id}
                  className={
                    editRoster
                      ? 'group flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-md hover:bg-red-50/60 transition-colors'
                      : 'flex items-start gap-3 py-2.5 border-b border-neutral-100 last:border-b-0'
                  }
                >
                  {editRoster ? (
                    <button
                      type="button"
                      onClick={() => removeFromCcb(p)}
                      className="mt-0.5 w-6 h-6 rounded-full border-2 border-red-300 text-red-500 hover:bg-red-500 hover:border-red-500 hover:text-white group-hover:border-red-400 flex items-center justify-center shrink-0 transition-colors"
                      aria-label={`Remove ${fullName} from Circle`}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[color:var(--cs-bg-soft)] text-[color:var(--cs-green-darker)] flex items-center justify-center shrink-0 text-xs font-semibold">
                      {getInitials(fullName)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 truncate">{fullName}</div>
                    <div className="mt-1 flex flex-col gap-1 text-xs">
                      {p.phone ? (
                        <button
                          type="button"
                          onClick={() => setActionSheet({ name: fullName, phone: p.phone! })}
                          className="self-start inline-flex items-center gap-1.5 text-[color:var(--cs-green-darker)] hover:underline"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                          </svg>
                          {formatPhoneForDisplay(p.phone)}
                        </button>
                      ) : p.detailsLoaded ? null : (
                        <span className="inline-block h-3 w-32 rounded cs-skeleton" />
                      )}
                      {p.email ? (
                        <a
                          href={`mailto:${p.email}`}
                          className="self-start inline-flex items-center gap-1.5 text-[color:var(--cs-green-darker)] hover:underline truncate max-w-full"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                          <span className="truncate">{p.email}</span>
                        </a>
                      ) : p.detailsLoaded ? null : (
                        <span className="inline-block h-3 w-40 rounded cs-skeleton" />
                      )}
                      {bday ? (
                        <span className="inline-flex items-center gap-1.5 text-neutral-500">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a2 2 0 00-2 2v1H6a3 3 0 00-3 3v2h14V8a3 3 0 00-3-3h-2V4a2 2 0 00-2-2zM3 11v5a3 3 0 003 3h8a3 3 0 003-3v-5H3z" />
                          </svg>
                          {birthdayLabel(bday)}
                        </span>
                      ) : p.detailsLoaded ? null : (
                        <span className="inline-block h-3 w-24 rounded cs-skeleton" />
                      )}
                      {p.detailsLoaded && !p.phone && !p.email && !bday && (
                        <span className="text-neutral-400 italic">No contact info on file</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!addOpen ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="cs-btn cs-btn-outline w-full"
            >
              + Add someone to my Circle
            </button>
          ) : (
            <div className="rounded-lg border border-[color:var(--cs-border)] bg-[color:var(--cs-bg-soft)] p-4 space-y-3">
              <div className="cs-search-field">
                <label className="cs-search-field-label" htmlFor="cs-roster-search">
                  Search by full or partial name
                </label>
                <input
                  id="cs-roster-search"
                  type="text"
                  placeholder="Start typing a name..."
                  className="cs-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              {searchQuery.trim().length >= 2 && (
                <div className={`cs-search-results-shell${searching ? ' is-searching' : ''}`}>
                  {searchResults.length > 0 ? (
                    <div className="cs-search-results-list">
                      {searchResults.slice(0, 8).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => addFromCcb(r)}
                          className="cs-search-result-item"
                        >
                          <div className="font-semibold text-neutral-900">
                            {r.fullName || `${r.firstName || ''} ${r.lastName || ''}`.trim()}
                          </div>
                          {(r.email || r.phone) && (
                            <div className="text-xs text-neutral-500">
                              {[r.phone, r.email].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="cs-search-results-empty">
                      {searching ? 'Searching...' : 'No matching people found'}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="cs-btn cs-btn-ghost flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Phone action sheet (bottom drawer) — portaled to body to escape
          containing-block constraints from overflow-x:hidden on html/body. */}
      {mounted && actionSheet && createPortal(
        <div
          className="cs-sheet-overlay"
          onClick={() => setActionSheet(null)}
        >
          <div
            className="cs-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cs-sheet-handle" />
            <div className="cs-sheet-header">
              <p className="cs-sheet-eyebrow">{actionSheet.name}</p>
              <p className="cs-sheet-phone">{formatPhoneForDisplay(actionSheet.phone)}</p>
            </div>
            <div className="cs-sheet-actions">
              <a
                href={phoneHref(actionSheet.phone, 'tel')}
                onClick={() => setActionSheet(null)}
                className="cs-sheet-action cs-sheet-action-primary"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                <span>Call</span>
              </a>
              <a
                href={phoneHref(actionSheet.phone, 'sms')}
                onClick={() => setActionSheet(null)}
                className="cs-sheet-action cs-sheet-action-secondary"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
                </svg>
                <span>Text</span>
              </a>
            </div>
            <button
              type="button"
              onClick={() => setActionSheet(null)}
              className="cs-sheet-cancel"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
