'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';

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
const ABSENT_DISMISS_STORAGE_KEY = 'cs:absent-dismiss:v1';
const ABSENT_SNOOZE_STORAGE_KEY = 'cs:absent-snooze:v1';
const ABSENCE_THRESHOLD_DAYS = 15;
const SNOOZE_DURATION_DAYS = 7;
const ROSTER_CACHE_KEY = 'cs:roster-cache:v1';
const ATTENDANCE_CACHE_KEY = 'cs:attendance-cache:v1';
const ROSTER_SORT_KEY = 'cs:roster-sort:v1';

type RosterCacheEntry = { groupId: string; participants: Participant[]; cachedAt: number };
type AttendanceCacheEntry = { groupId: string; lastAttended: Record<string, string>; cachedAt: number };

function writeRosterCache(groupId: string, participants: Participant[]): void {
  try {
    const entry: RosterCacheEntry = { groupId, participants, cachedAt: Date.now() };
    sessionStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

// Last-attended map is cached client-side (stale-while-revalidate) so the
// "Last attended" badges and absent alerts paint instantly with the roster
// instead of popping in after a separate network round trip.
function writeAttendanceCache(groupId: string, lastAttended: Record<string, string>): void {
  try {
    const entry: AttendanceCacheEntry = { groupId, lastAttended, cachedAt: Date.now() };
    sessionStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(entry));
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

function daysSince(isoDate: string, now = new Date()): number {
  const d = new Date(isoDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function formatLastAttended(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
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

function normalizeParticipants(input: unknown): Participant[] {
  return (Array.isArray(input) ? input : []).map((p: Participant) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: p.fullName,
    email: p.email,
    phone: p.phone,
    birthday: p.birthday || '',
    detailsLoaded: !!p.detailsLoaded,
  }));
}

async function fetchProfileDetails(ids: string[]) {
  if (ids.length === 0) return [];
  const r = await fetch('/api/circle-leader-toolkit/roster/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.profiles || []) as Array<{ id: string; phone: string; email: string; birthday: string }>;
}

async function fetchLastAttended(groupId: string): Promise<Record<string, string> | null> {
  const attendanceUrl = groupId
    ? `/api/circle-leader-toolkit/roster/attendance?group_id=${encodeURIComponent(groupId)}`
    : '/api/circle-leader-toolkit/roster/attendance';
  const r = await fetch(attendanceUrl);
  if (!r.ok) return null;
  const d = await r.json();
  return (d?.lastAttended || null) as Record<string, string> | null;
}

/**
 * Client island for the roster tab. First paint is server-rendered (initial
 * roster + last-attended map are seeded from the shared loaders), so there's no
 * skeleton flash. The existing stale-while-revalidate fetches still run in the
 * background to pick up missing contact details and fresher attendance.
 */
export default function RosterClient({
  groupId,
  initialParticipants,
  initialLastAttended,
  initialError,
}: {
  groupId: string;
  initialParticipants: Participant[];
  initialLastAttended: Record<string, string>;
  initialError: string | null;
}) {
  useMarkCircleAppEntered();
  const router = useRouter();
  const urlGroupId = groupId;

  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [lastAttended, setLastAttended] = useState<Record<string, string>>(initialLastAttended);
  const [attendanceLoaded, setAttendanceLoaded] = useState(true);
  const [loading, setLoading] = useState(initialParticipants.length === 0 && !initialError);
  const [loadError, setLoadError] = useState<string | null>(initialError);

  const [editRoster, setEditRoster] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CcbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRequestId = useRef(0);

  const [sortBy, setSortBy] = useState<'firstName' | 'lastName'>('firstName');

  const [actionSheet, setActionSheet] = useState<{ name: string; phone: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const [removing, setRemoving] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [absentDismissed, setAbsentDismissed] = useState<Record<string, string>>({});
  // Snooze hides an absent alert for a fixed window (7 days), then it resurfaces
  // if the person is still absent. Value is the epoch-ms expiry, paired with the
  // last-attended date so the snooze auto-voids if they come back and leave again.
  const [absentSnoozed, setAbsentSnoozed] = useState<Record<string, { until: number; last: string }>>({});
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function applyLastAttended(fresh: Record<string, string>) {
    setLastAttended(fresh);
    writeAttendanceCache(urlGroupId, fresh);
    // Auto-clear absent dismissals once the person has attended again.
    // Stored value is the lastAttended date at dismissal time — if the
    // current date differs (they came back), the dismissal is stale.
    try {
      const raw = localStorage.getItem(ABSENT_DISMISS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        const reconciled: Record<string, string> = {};
        for (const [id, stamp] of Object.entries(parsed)) {
          if (fresh[id] === stamp) reconciled[id] = stamp;
        }
        setAbsentDismissed(reconciled);
        if (Object.keys(reconciled).length !== Object.keys(parsed).length) {
          localStorage.setItem(ABSENT_DISMISS_STORAGE_KEY, JSON.stringify(reconciled));
        }
      }
    } catch {}
  }

  async function refreshFromCcb() {
    if (refreshing || participants.length === 0) return;
    setRefreshing(true);
    try {
      let ids = participants.map((p) => p.id);
      const rosterRes = await fetch('/api/circle-leader-toolkit/roster?refresh=1');
      if (rosterRes.ok) {
        const rosterData = (await rosterRes.json()) as { participants?: Participant[] };
        const freshList = normalizeParticipants(rosterData.participants);
        if (freshList.length > 0) {
          ids = freshList.map((p) => p.id);
          setParticipants(freshList);
          writeRosterCache(urlGroupId, freshList);
        }
      }

      const profiles = await fetchProfileDetails(ids);
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
      const attendance = await fetchLastAttended(urlGroupId);
      if (attendance) applyLastAttended(attendance);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    // Seed the SWR caches with the server's fresh data so other tabs/visits and
    // the background revalidation below start from the same baseline.
    writeRosterCache(urlGroupId, initialParticipants);
    if (Object.keys(initialLastAttended).length > 0) {
      writeAttendanceCache(urlGroupId, initialLastAttended);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Already seeded from the server; just revalidate attendance in the
    // background so badges/alerts stay current.
    fetchLastAttended(urlGroupId)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        applyLastAttended(fresh);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAttendanceLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [urlGroupId]);

  useEffect(() => {
    if (!actionSheet && !removeTarget) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [actionSheet, removeTarget]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ABSENT_SNOOZE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, { until: number; last: string }>;
      // Drop snoozes whose window has elapsed so the alert can resurface.
      const now = Date.now();
      const fresh: Record<string, { until: number; last: string }> = {};
      for (const [id, entry] of Object.entries(parsed)) {
        if (entry && entry.until > now) fresh[id] = entry;
      }
      setAbsentSnoozed(fresh);
      if (Object.keys(fresh).length !== Object.keys(parsed).length) {
        localStorage.setItem(ABSENT_SNOOZE_STORAGE_KEY, JSON.stringify(fresh));
      }
    } catch {}
  }, []);

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
    try {
      const saved = localStorage.getItem(ROSTER_SORT_KEY);
      if (saved === 'firstName' || saved === 'lastName') setSortBy(saved);
    } catch {}
  }, []);

  function updateSort(next: 'firstName' | 'lastName') {
    setSortBy(next);
    try { localStorage.setItem(ROSTER_SORT_KEY, next); } catch {}
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const rosterRes = await fetch('/api/circle-leader-toolkit/roster');
        if (rosterRes.status === 401) {
          router.replace('/circle-leader-toolkit');
          return;
        }

        let rosterData = (await rosterRes.json()) as {
          participants?: Participant[];
          staleIds?: string[];
          needsRosterRefresh?: boolean;
        };
        let list = normalizeParticipants(rosterData.participants);
        if (cancelled) return;
        if (list.length > 0) {
          setParticipants(list);
          writeRosterCache(urlGroupId, list);
        }
        setLoading(false);

        if (rosterData.needsRosterRefresh) {
          try {
            setRefreshing(true);
            const freshRes = await fetch('/api/circle-leader-toolkit/roster?refresh=1');
            if (freshRes.ok) {
              rosterData = (await freshRes.json()) as {
                participants?: Participant[];
                staleIds?: string[];
                needsRosterRefresh?: boolean;
              };
              list = normalizeParticipants(rosterData.participants);
              if (!cancelled && list.length > 0) {
                setParticipants(list);
                writeRosterCache(urlGroupId, list);
              }
            }
          } finally {
            if (!cancelled) setRefreshing(false);
          }
        }

        // Revalidate stale or missing-profile members in one batched, parallel
        // request. The server fans out to CCB with bounded concurrency and
        // upserts the cache, so future page loads are instant.
        const staleIds: string[] = Array.isArray(rosterData.staleIds)
          ? rosterData.staleIds
          : list.filter((p) => !p.detailsLoaded).map((p) => p.id);

        if (staleIds.length === 0) return;

        try {
          const profiles = await fetchProfileDetails(staleIds);
          if (profiles.length === 0 && !cancelled) {
            setParticipants((prev) => prev.map((x) => ({ ...x, detailsLoaded: true })));
            return;
          }
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
        if (!cancelled && participants.length === 0) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load roster.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const res = await fetch('/api/circle-leader-toolkit/roster/search', {
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
    const res = await fetch('/api/circle-leader-toolkit/roster/add', {
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
      const r = await fetch('/api/circle-leader-toolkit/roster/refresh', {
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

  async function performRemove(p: Participant) {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/circle-leader-toolkit/roster/remove', {
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
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  }

  // Compute upcoming birthdays (next 14 days) and filter out ones the leader
  // has already dismissed for this cycle.
  const upcomingBirthdays = useMemo(() => {
    const out: Array<{ id: string; name: string; phone?: string; daysAway: number; label: string }> = [];
    for (const p of participants) {
      const b = parseBirthday(p.birthday);
      if (!b) continue;
      const d = daysUntilBirthday(b);
      if (d <= 14 && !dismissed[p.id]) {
        out.push({
          id: p.id,
          name: p.fullName || `${p.firstName} ${p.lastName}`.trim(),
          phone: p.phone,
          daysAway: d,
          label: birthdayLabel(b),
        });
      }
    }
    out.sort((a, b) => a.daysAway - b.daysAway);
    return out;
  }, [participants, dismissed]);

  const absentMembers = useMemo(() => {
    const out: Array<{
      id: string;
      name: string;
      phone?: string;
      daysAway: number;
      lastAttended: string;
    }> = [];
    for (const p of participants) {
      const last = lastAttended[p.id];
      if (!last) continue;
      const days = daysSince(last);
      if (days < ABSENCE_THRESHOLD_DAYS) continue;
      if (absentDismissed[p.id] === last) continue;
      // Active snooze for this absence run (same last-attended date) hides it.
      const snooze = absentSnoozed[p.id];
      if (snooze && snooze.last === last && snooze.until > Date.now()) continue;
      out.push({
        id: p.id,
        name: p.fullName || `${p.firstName} ${p.lastName}`.trim(),
        phone: p.phone,
        daysAway: days,
        lastAttended: last,
      });
    }
    out.sort((a, b) => b.daysAway - a.daysAway);
    return out;
  }, [participants, lastAttended, absentDismissed, absentSnoozed]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (sortBy === 'lastName') {
        return (a.lastName || '').localeCompare(b.lastName || '');
      }
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [participants, sortBy]);

  function dismissAbsent(id: string, lastAttendedDate: string) {
    setAbsentDismissed((prev) => {
      const next = { ...prev, [id]: lastAttendedDate };
      try {
        localStorage.setItem(ABSENT_DISMISS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function persistSnoozed(next: Record<string, { until: number; last: string }>) {
    try {
      localStorage.setItem(ABSENT_SNOOZE_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function snoozeAbsent(id: string, lastAttendedDate: string) {
    const until = Date.now() + SNOOZE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    setAbsentSnoozed((prev) => {
      const next = { ...prev, [id]: { until, last: lastAttendedDate } };
      persistSnoozed(next);
      return next;
    });
  }

  // Global "snooze all" — quiet every currently-visible absent alert for the
  // same window. New absences that cross the threshold later still surface.
  function snoozeAllAbsent() {
    const until = Date.now() + SNOOZE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    setAbsentSnoozed((prev) => {
      const next = { ...prev };
      for (const m of absentMembers) {
        next[m.id] = { until, last: m.lastAttended };
      }
      persistSnoozed(next);
      return next;
    });
  }

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
        {absentMembers.length > 0 && (
          <div className="space-y-2">
            {absentMembers.length > 1 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={snoozeAllAbsent}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-red-200 text-red-700 hover:bg-red-100 text-xs font-semibold px-3 py-1.5 shadow-sm transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" clipRule="evenodd" />
                  </svg>
                  Snooze all · 7 days
                </button>
              </div>
            )}
            {absentMembers.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none" aria-hidden>👀</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-900">
                      {m.name} hasn&apos;t attended in {m.daysAway} days
                    </p>
                    <p className="text-xs text-red-800/80 mt-0.5">
                      Last seen {formatLastAttended(m.lastAttended)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissAbsent(m.id, m.lastAttended)}
                    className="shrink-0 text-red-700/70 hover:text-red-900 -mt-0.5 -mr-1 p-1"
                    aria-label="Dismiss"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {m.phone && (
                    <>
                      <a
                        href={phoneHref(m.phone, 'sms')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 !text-white hover:!text-white text-xs font-semibold px-3 py-2 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
                        </svg>
                        Text
                      </a>
                      <a
                        href={phoneHref(m.phone, 'tel')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 !text-white hover:!text-white text-xs font-semibold px-3 py-2 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        Call
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => snoozeAbsent(m.id, m.lastAttended)}
                    title="Hide this alert for 7 days"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white border border-red-200 text-red-700 hover:bg-red-100 text-xs font-semibold px-3 py-2 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" clipRule="evenodd" />
                    </svg>
                    Snooze
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRemoveTarget(
                        participants.find((x) => x.id === m.id) ?? {
                          id: m.id,
                          firstName: '',
                          lastName: '',
                          fullName: m.name,
                          phone: m.phone,
                        }
                      )
                    }
                    className="cs-remove-roster-btn inline-flex items-center justify-center gap-1.5 rounded-full bg-white border text-xs font-semibold px-3 py-2 shadow-sm transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
                {b.phone && (
                  <button
                    type="button"
                    onClick={() => setActionSheet({ name: b.name, phone: b.phone! })}
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                    aria-label={`Call or text ${b.name}`}
                    title={`Call or text ${b.name}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                  </button>
                )}
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

          {participants.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs mb-3 -mt-1">
              <span className="text-neutral-500">Sort:</span>
              <button
                type="button"
                onClick={() => updateSort('firstName')}
                className={`px-2.5 py-1 rounded-full transition-colors font-semibold ${sortBy === 'firstName' ? 'bg-[color:var(--cs-green)] text-white' : 'border border-[color:var(--cs-border)] text-neutral-600 hover:border-[color:var(--cs-green)] hover:text-[color:var(--cs-green-darker)]'}`}
              >
                First name
              </button>
              <button
                type="button"
                onClick={() => updateSort('lastName')}
                className={`px-2.5 py-1 rounded-full transition-colors font-semibold ${sortBy === 'lastName' ? 'bg-[color:var(--cs-green)] text-white' : 'border border-[color:var(--cs-border)] text-neutral-600 hover:border-[color:var(--cs-green)] hover:text-[color:var(--cs-green-darker)]'}`}
              >
                Last name
              </button>
            </div>
          )}

          <div className="space-y-2 mb-4">
            {participants.length === 0 && (
              <p className="text-sm text-neutral-500 py-2">No one on your roster yet.</p>
            )}
            {sortedParticipants.map((p) => {
              const fullName = p.fullName || `${p.firstName} ${p.lastName}`.trim();
              const bday = parseBirthday(p.birthday);
              const lastAttendedDate = lastAttended[p.id];
              const daysAway = lastAttendedDate ? daysSince(lastAttendedDate) : null;
              const isAbsent = daysAway != null && daysAway >= ABSENCE_THRESHOLD_DAYS;
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
                      onClick={() => setRemoveTarget(p)}
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
                          className="self-start inline-flex items-center gap-1.5 !text-[color:var(--cs-green-darker)] hover:underline truncate max-w-full"
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
                        <span className="inline-flex items-center gap-1.5 text-[color:var(--cs-green-darker)]">
                          <svg
                            className="w-3.5 h-3.5 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
                            <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
                            <path d="M2 21h20" />
                            <path d="M7 8v3" />
                            <path d="M12 8v3" />
                            <path d="M17 8v3" />
                            <path d="M7 4h.01" />
                            <path d="M12 4h.01" />
                            <path d="M17 4h.01" />
                          </svg>
                          {birthdayLabel(bday)}
                        </span>
                      ) : p.detailsLoaded ? null : (
                        <span className="inline-block h-3 w-24 rounded cs-skeleton" />
                      )}
                      {p.detailsLoaded && !p.phone && !p.email && !bday && (
                        <span className="text-neutral-400 italic">No contact info on file</span>
                      )}
                      {lastAttendedDate ? (
                        <span
                          className={
                            isAbsent
                              ? 'self-start inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-red-700 font-semibold'
                              : 'ml-2 inline-flex items-center gap-1.5 text-neutral-500'
                          }
                          title={isAbsent ? `Hasn't attended in ${daysAway} days` : undefined}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" clipRule="evenodd" />
                          </svg>
                          {isAbsent
                            ? `${formatLastAttended(lastAttendedDate)} · ${daysAway}d ago`
                            : formatLastAttended(lastAttendedDate)}
                        </span>
                      ) : !attendanceLoaded ? (
                        <span className="ml-2 inline-block h-5 w-36 rounded-full cs-skeleton" />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {participants.length > 0 && (
              <div className="pt-1 flex items-center justify-end gap-1.5 text-xs text-neutral-500">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" clipRule="evenodd" />
                </svg>
                <span>= Last Attendance Date</span>
              </div>
            )}
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

      {/* Remove-from-roster confirmation — same bottom-sheet idiom as the phone
          action sheet, with an encouraging note that removals are reversible. */}
      {mounted && removeTarget && createPortal(
        <div
          className="cs-sheet-overlay"
          onClick={() => !removing && setRemoveTarget(null)}
        >
          <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-sheet-handle" />
            <div className="cs-sheet-header">
              <p className="cs-sheet-eyebrow">Remove from roster</p>
              <p className="cs-sheet-phone">
                {removeTarget.fullName || `${removeTarget.firstName} ${removeTarget.lastName}`.trim()}
              </p>
            </div>
            <p className="cs-sheet-body">
              Keep your roster focused on who&apos;s actually showing up. If someone is no
              longer engaged in the Circle, it&apos;s good to remove them.
            </p>
            <div className="cs-sheet-note">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>You can add them back anytime if they return to the Circle.</span>
            </div>
            <div className="cs-sheet-actions">
              <button
                type="button"
                onClick={() => performRemove(removeTarget)}
                disabled={removing}
                className="cs-sheet-action cs-sheet-action-danger"
                style={{ opacity: removing ? 0.7 : 1 }}
              >
                <span>{removing ? 'Removing…' : 'Remove from roster'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
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
