'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { setCircleSummaryAppBadge } from '../../../../../../lib/circle-leader-toolkit/badging';
import {
  DID_NOT_MEET_NOTES_KEY,
  DID_NOT_MEET_OTHER_VALUE,
  DID_NOT_MEET_REASON_KEY,
  DYNAMIC_RESPONSE_KEY,
  normalizeQuestionResponseKey,
  type QuestionResponseKey,
} from '../../../../../../lib/circle-leader-toolkit/dynamic-question-response-keys';
import {
  AutoGrowTextarea,
  DynamicQuestionField,
  dynamicValueToString,
  getQuestionOptions,
  getSelectedOption,
  getSelectedOptions,
  optionFollowupKey,
  type DynamicQuestion,
  type DynamicQuestionOption,
  type DynamicValue,
} from '../../../../../../components/circle-leader-toolkit/DynamicQuestionField';

type Participant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
};

type Leader = {
  id: number | string;
  name: string;
  day: string | null;
  time: string | null;
  ccb_group_id: string | number | null;
};

type ManualAttendee = { firstName: string; lastName: string; phone?: string; email?: string };

type CcbSearchResult = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
};

const ABSENCE_THRESHOLD_DAYS = 15;
const ATTENDANCE_CACHE_KEY = 'cs:attendance-cache:v1';
const ROSTER_SORT_KEY = 'cs:roster-sort:v1';

type AttendanceCacheEntry = { groupId: string; lastAttended: Record<string, string>; cachedAt: number };

function readAttendanceCache(groupId: string): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(ATTENDANCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttendanceCacheEntry;
    if (parsed?.groupId !== groupId) return null;
    return parsed.lastAttended || null;
  } catch {
    return null;
  }
}

function writeAttendanceCache(groupId: string, lastAttended: Record<string, string>): void {
  try {
    const entry: AttendanceCacheEntry = { groupId, lastAttended, cachedAt: Date.now() };
    sessionStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

function parseOccurrenceStart(occurrenceDateTime: string): DateTime | null {
  const sqlDate = DateTime.fromSQL(occurrenceDateTime, { zone: 'America/Chicago' });
  if (sqlDate.isValid) return sqlDate;

  const isoDate = DateTime.fromISO(occurrenceDateTime.replace(' ', 'T'), {
    zone: 'America/Chicago',
  });
  return isoDate.isValid ? isoDate : null;
}

function dateLabel(occurrenceDateTime: string): string {
  const datePart = occurrenceDateTime.slice(0, 10);
  return new Date(datePart + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

async function fetchLastAttended(groupId: string): Promise<Record<string, string> | null> {
  const attendanceUrl = groupId
    ? `/api/circle-leader-toolkit/roster/attendance?group_id=${encodeURIComponent(groupId)}`
    : '/api/circle-leader-toolkit/roster/attendance';
  const r = await fetch(attendanceUrl);
  if (!r.ok) return null;
  const d = await r.json();
  return (d?.lastAttended || null) as Record<string, string> | null;
}

function normalizeNoteText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function responseKeyForQuestion(question: DynamicQuestion): QuestionResponseKey {
  return normalizeQuestionResponseKey(question.response_key);
}

function cleanFollowupText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === DID_NOT_MEET_OTHER_VALUE ? '' : text;
}

function cleanDidNotMeetFollowupText(
  value: unknown,
  selectedValue: string,
  questions: DynamicQuestion[]
): string {
  const text = cleanFollowupText(value);
  if (!text) return '';

  const reasonQuestion = questions.find(
    (question) => responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY
  );
  const selectedOption = reasonQuestion ? getSelectedOption(reasonQuestion, selectedValue) : null;
  const genericFallbacks = new Set(
    [
      DID_NOT_MEET_OTHER_VALUE,
      selectedValue,
      selectedOption?.value,
      selectedOption?.label,
      'Other Reason for not meeting',
      'Other reason for not meeting',
    ]
      .filter(Boolean)
      .map((entry) => String(entry).trim().toLowerCase())
  );

  return genericFallbacks.has(text.toLowerCase()) ? '' : text;
}

export type EventFormInitialData = {
  leader: Leader;
  participants: Participant[];
  questions: DynamicQuestion[];
  // Same shape the /draft GET returns: { draft, updatedAt, source, submittedStatus? }.
  draft: {
    draft: Record<string, unknown> | null;
    updatedAt?: string | null;
    source?: 'draft' | 'submitted' | 'ccb' | null;
    submittedStatus?: string;
  };
  lastAttended: Record<string, string>;
};

export default function EventFormClient({ initial }: { initial?: EventFormInitialData }) {
  const router = useRouter();
  const params = useParams<{ ccbGroupId: string; eventId: string; occurrence: string }>();
  const urlGroupId = params?.ccbGroupId ?? '';
  const eventId = params?.eventId ?? '';
  const occurrence = decodeURIComponent(params?.occurrence ?? '');

  // Local mirror of the draft so a leader on a flaky/offline connection never
  // loses typed answers if the 800ms server autosave doesn't reach the server
  // before the tab closes. Keyed per group+event+occurrence.
  const draftStorageKey = `cst-draft:${urlGroupId}:${eventId}:${occurrence}`;

  const [leader, setLeader] = useState<Leader | null>(initial?.leader ?? null);
  const [participants, setParticipants] = useState<Participant[]>(initial?.participants ?? []);
  const [lastAttended, setLastAttended] = useState<Record<string, string>>(initial?.lastAttended ?? {});
  const [attendanceLoaded, setAttendanceLoaded] = useState(Boolean(initial?.lastAttended));
  const [questions, setQuestions] = useState<DynamicQuestion[]>(
    (initial?.questions ?? []).map((q) => ({ ...q, response_key: responseKeyForQuestion(q) }))
  );
  // Server-rendered initial data means the form is interactive on first paint;
  // only fall back to the loading state when we have to fetch client-side.
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [didNotMeet, setDidNotMeet] = useState(false);
  const [didNotMeetReason, setDidNotMeetReason] = useState('');
  const [didNotMeetReasonOther, setDidNotMeetReasonOther] = useState('');
  const [selectedCcbIds, setSelectedCcbIds] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [prayerRequests, setPrayerRequests] = useState('');
  const [info, setInfo] = useState('');
  const [dynamicValues, setDynamicValues] = useState<Record<string, DynamicValue>>({});
  const [optionFollowups, setOptionFollowups] = useState<Record<string, string>>({});
  const [manualAttendees, setManualAttendees] = useState<ManualAttendee[]>([]);
  const [infoUpdateDay, setInfoUpdateDay] = useState('');
  const [infoUpdateTime, setInfoUpdateTime] = useState('');
  const [infoUpdateLocation, setInfoUpdateLocation] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<'firstName' | 'lastName'>('firstName');

  const [addOpen, setAddOpen] = useState(false);
  const [editRoster, setEditRoster] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CcbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualForm, setManualForm] = useState<ManualAttendee>({ firstName: '', lastName: '', phone: '', email: '' });
  const [editingManualIdx, setEditingManualIdx] = useState<number | null>(null);
  const searchRequestId = useRef(0);

  const [showInfoUpdate, setShowInfoUpdate] = useState(false);
  const [loadedFromSubmission, setLoadedFromSubmission] = useState<string | null>(null);
  const [loadedFromCcb, setLoadedFromCcb] = useState(false);
  const [previousNotes, setPreviousNotes] = useState<string>('');
  const [nowMillis, setNowMillis] = useState(() => Date.now());

  const occurrenceStart = useMemo(() => parseOccurrenceStart(occurrence), [occurrence]);
  const isBeforeMeetingTime = Boolean(
    occurrenceStart &&
      DateTime.fromMillis(nowMillis).setZone('America/Chicago').toMillis() <
        occurrenceStart.toMillis()
  );
  const meetingStartLabel = occurrenceStart
    ? occurrenceStart.toFormat('cccc, LLLL d, yyyy \'at\' h:mm a')
    : '';

  useEffect(() => {
    const timer = window.setInterval(() => setNowMillis(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Applies a resolved draft (saved/submitted/CCB) to the form state. Shared
    // by the server-rendered path and the client fetch fallback so the field
    // mapping lives in exactly one place.
    const applyDraft = (
      draftData: {
        draft?: Record<string, DynamicValue | unknown> | null;
        source?: string | null;
        updatedAt?: string | null;
      } | null,
      loadedQuestions: DynamicQuestion[]
    ) => {
      if (!draftData?.draft) return;
      const d = draftData.draft as Record<string, any>;
      if (draftData.source === 'submitted' && draftData.updatedAt) {
        setLoadedFromSubmission(draftData.updatedAt);
      } else if (draftData.source === 'ccb') {
        setLoadedFromCcb(true);
      }
      setDidNotMeet(!!d.didNotMeet);
      const loadedReason = String(d.didNotMeetReason ?? '');
      const loadedReasonOther = cleanDidNotMeetFollowupText(
        d.didNotMeetReasonOther,
        loadedReason,
        loadedQuestions
      );
      if ((loadedReason === 'Other' && loadedReasonOther) || loadedReason === DID_NOT_MEET_OTHER_VALUE) {
        setDidNotMeetReason(DID_NOT_MEET_OTHER_VALUE);
        setDidNotMeetReasonOther(loadedReasonOther);
      } else {
        setDidNotMeetReason(loadedReason);
        setDidNotMeetReasonOther(loadedReasonOther);
      }
      if (Array.isArray(d.attendeeCcbIds)) setSelectedCcbIds(new Set(d.attendeeCcbIds));
      setTopic(d.topic ?? '');
      setNotes(d.notes ?? '');
      setPreviousNotes(d.referenceNotes ?? '');
      setPrayerRequests(d.prayerRequests ?? '');
      setInfo(d.info ?? '');
      setDynamicValues((d.dynamicValues ?? {}) as Record<string, DynamicValue>);
      setOptionFollowups((d.optionFollowups ?? {}) as Record<string, string>);
      setManualAttendees(d.manualAttendees ?? []);
      setInfoUpdateDay(d.infoUpdateDay ?? '');
      setInfoUpdateTime(d.infoUpdateTime ?? '');
      setInfoUpdateLocation(d.infoUpdateLocation ?? '');
      if (d.infoUpdateDay || d.infoUpdateTime || d.infoUpdateLocation) setShowInfoUpdate(true);
    };

    // If a locally-mirrored draft exists and is at least as fresh as the server
    // copy, apply it over the server draft — this is the leader's own typing
    // that may not have reached the server on a flaky connection. Never
    // overrides an already-submitted summary.
    const maybeApplyLocalDraft = (
      serverDraftData: {
        draft?: Record<string, unknown> | null;
        source?: string | null;
        updatedAt?: string | null;
      } | null,
      loadedQuestions: DynamicQuestion[]
    ) => {
      let stored: { payload?: Record<string, unknown>; savedAt?: number } | null = null;
      try {
        const raw = localStorage.getItem(draftStorageKey);
        stored = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!stored?.payload) return;

      const serverSource = serverDraftData?.source ?? null;
      if (serverSource === 'submitted') return; // already submitted — leave it

      const serverUpdatedMs = serverDraftData?.updatedAt ? Date.parse(serverDraftData.updatedAt) : 0;
      const localMs = stored.savedAt ?? 0;
      // Prefer local for a CCB prefill or empty server draft (real typing beats
      // a prefill), or when the local copy is newer than the saved server draft.
      const preferLocal = serverSource !== 'draft' || localMs > serverUpdatedMs;
      if (!preferLocal) return;

      applyDraft(
        {
          // Keep the server's reference notes (not part of the local payload).
          draft: { ...stored.payload, referenceNotes: serverDraftData?.draft?.referenceNotes },
          source: 'draft',
          updatedAt: null,
        },
        loadedQuestions
      );
    };

    // Server-rendered path: leader, roster, questions, and draft are already
    // seeded from props. Apply the draft once and skip the client fetch
    // waterfall entirely (no /me, /roster, /dynamic-questions, /draft round
    // trips). The URL-tampering guard already ran server-side.
    if (initial) {
      const loadedQuestions = (initial.questions || []).map((q) => ({
        ...q,
        response_key: responseKeyForQuestion(q),
      }));
      applyDraft(initial.draft, loadedQuestions);
      maybeApplyLocalDraft(initial.draft, loadedQuestions);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [meRes, rosterRes, qRes, draftRes] = await Promise.all([
          fetch('/api/circle-leader-toolkit/me'),
          fetch('/api/circle-leader-toolkit/roster'),
          fetch('/api/circle-leader-toolkit/dynamic-questions'),
          fetch(
            `/api/circle-leader-toolkit/draft?event_id=${encodeURIComponent(eventId)}&occurrence=${encodeURIComponent(occurrence)}`
          ),
        ]);

        if (meRes.status === 401) {
          router.replace('/circle-leader-toolkit');
          return;
        }
        const meData = await meRes.json();
        if (cancelled) return;
        if (!meData.leader) {
          router.replace('/circle-leader-toolkit');
          return;
        }

        // Guard against URL tampering — if the URL group ID doesn't match
        // the leader's circle, bounce them back to their own events list.
        const leaderGroupId =
          meData.leader.ccb_group_id != null ? String(meData.leader.ccb_group_id) : null;
        if (leaderGroupId && leaderGroupId !== urlGroupId) {
          router.replace(`/circle-leader-toolkit/${leaderGroupId}/events`);
          return;
        }

        setLeader(meData.leader);

        const rosterData = await rosterRes.json();
        setParticipants(rosterData.participants || []);

        const qData = await qRes.json();
        const loadedQuestions = (qData.questions || []).map((q: DynamicQuestion) => ({
            ...q,
            response_key: responseKeyForQuestion(q),
          }));
        setQuestions(loadedQuestions);

        const draftData = await draftRes.json();
        if (!draftRes.ok) {
          setLoadError(draftData?.error || 'Failed to load form.');
          return;
        }
        applyDraft(draftData, loadedQuestions);
        maybeApplyLocalDraft(draftData, loadedQuestions);
      } catch (error: unknown) {
        if (!cancelled) setLoadError(getErrorMessage(error, 'Failed to load form.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, occurrence, router, urlGroupId, initial, draftStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const cached = readAttendanceCache(urlGroupId);

    if (cached) {
      setLastAttended(cached);
      setAttendanceLoaded(true);
    } else if (initial?.lastAttended) {
      // Server already provided attendance — seed the sessionStorage cache so
      // sibling pages reuse it, and don't blank the state while we revalidate.
      writeAttendanceCache(urlGroupId, initial.lastAttended);
      setAttendanceLoaded(true);
    } else {
      setLastAttended({});
      setAttendanceLoaded(false);
    }

    fetchLastAttended(urlGroupId)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setLastAttended(fresh);
        writeAttendanceCache(urlGroupId, fresh);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAttendanceLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [urlGroupId, initial]);

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

  const draftPayload = useMemo(
    () => ({
      didNotMeet,
      didNotMeetReason,
      didNotMeetReasonOther,
      attendeeCcbIds: Array.from(selectedCcbIds),
      topic,
      notes,
      prayerRequests,
      info,
      dynamicValues,
      optionFollowups,
      manualAttendees,
      infoUpdateDay,
      infoUpdateTime,
      infoUpdateLocation,
    }),
    [
      didNotMeet,
      didNotMeetReason,
      didNotMeetReasonOther,
      selectedCcbIds,
      topic,
      notes,
      prayerRequests,
      info,
      dynamicValues,
      optionFollowups,
      manualAttendees,
      infoUpdateDay,
      infoUpdateTime,
      infoUpdateLocation,
    ]
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/circle-leader-toolkit/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, occurrence, payload: draftPayload }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draftPayload, eventId, occurrence, loading]);

  // Mirror every change to localStorage immediately (no debounce) so nothing is
  // lost if the network drops or the tab is closed before the server autosave
  // fires. `pagehide`/`visibilitychange` flush the very last edit on kill.
  const draftPayloadRef = useRef(draftPayload);
  draftPayloadRef.current = draftPayload;
  useEffect(() => {
    if (loading) return;
    const write = () => {
      try {
        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({ payload: draftPayloadRef.current, savedAt: Date.now() })
        );
      } catch {
        // localStorage can throw (private mode / quota) — non-fatal.
      }
    };
    write();
    const onHide = () => write();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('visibilitychange', onHide);
    };
  }, [draftPayload, draftStorageKey, loading]);

  function toggleAll(check: boolean) {
    setSelectedCcbIds(check ? new Set(participants.map((p) => p.id)) : new Set());
  }
  function toggleOne(id: string) {
    setSelectedCcbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!addOpen || editingManualIdx !== null) return;
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
        if (searchRequestId.current === requestId) {
          setSearchResults(data.results || []);
        }
      } catch {
        if (searchRequestId.current === requestId) setSearchResults([]);
      } finally {
        if (searchRequestId.current === requestId) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [addOpen, editingManualIdx, searchQuery]);

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
    const rosterRes = await fetch('/api/circle-leader-toolkit/roster');
    const rosterData = await rosterRes.json();
    setParticipants(rosterData.participants || []);
    setSelectedCcbIds((prev) => new Set(prev).add(String(individual.id)));
    setAddOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  async function removeFromCcb(p: Participant) {
    const name = p.fullName || `${p.firstName} ${p.lastName}`.trim();
    if (!confirm(`Remove ${name} from your Circle's roster?\n\nThis only removes them from this group. Their profile is not changed.`)) {
      return;
    }
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
    setParticipants((prev) => prev.filter((x) => x.id !== p.id));
    setSelectedCcbIds((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
  }

  function addManual() {
    const trimmed = {
      firstName: manualForm.firstName.trim(),
      lastName: manualForm.lastName.trim(),
      phone: manualForm.phone?.trim(),
      email: manualForm.email?.trim(),
    };
    if (!trimmed.firstName || !trimmed.lastName || !trimmed.phone || !trimmed.email) {
      alert('First name, last name, cell phone, and email are required.');
      return;
    }
    if (editingManualIdx !== null) {
      const idx = editingManualIdx;
      setManualAttendees((prev) => prev.map((m, i) => (i === idx ? trimmed : m)));
    } else {
      setManualAttendees((prev) => [...prev, trimmed]);
    }
    setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
    setEditingManualIdx(null);
    setAddOpen(false);
  }

  function removeManual(idx: number) {
    setManualAttendees((prev) => prev.filter((_, i) => i !== idx));
    if (editingManualIdx === idx) {
      setEditingManualIdx(null);
      setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
      setAddOpen(false);
    }
  }

  function startEditManual(idx: number) {
    const m = manualAttendees[idx];
    if (!m) return;
    setManualForm({
      firstName: m.firstName ?? '',
      lastName: m.lastName ?? '',
      phone: m.phone ?? '',
      email: m.email ?? '',
    });
    setEditingManualIdx(idx);
    setAddOpen(true);
  }

  function cancelManualForm() {
    setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
    setEditingManualIdx(null);
    setAddOpen(false);
  }

  function getQuestionValue(question: DynamicQuestion): DynamicValue | undefined {
    const responseKey = responseKeyForQuestion(question);
    if (responseKey === DID_NOT_MEET_REASON_KEY) return didNotMeetReason;
    if (responseKey === DID_NOT_MEET_NOTES_KEY) return notes;
    return dynamicValues[question.id];
  }

  function setQuestionValue(question: DynamicQuestion, value: DynamicValue) {
    const responseKey = responseKeyForQuestion(question);
    if (responseKey === DID_NOT_MEET_REASON_KEY) {
      const nextValue = dynamicValueToString(value);
      const selectedOption = getSelectedOption(question, nextValue);
      setDidNotMeetReason(nextValue);
      if (!selectedOption?.followup_label && !selectedOption?.followup_required) {
        setDidNotMeetReasonOther('');
      }
      return;
    }
    if (responseKey === DID_NOT_MEET_NOTES_KEY) {
      setNotes(dynamicValueToString(value));
      return;
    }
    setDynamicValues((prev) => ({ ...prev, [question.id]: value }));
  }

  function finalDidNotMeetReason() {
    const reasonQuestion = questions.find(
      (question) => responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY
    );
    const selectedOption = reasonQuestion
      ? getSelectedOption(reasonQuestion, didNotMeetReason)
      : null;
    const followup = didNotMeetReasonOther.trim();

    if (selectedOption?.followup_label || selectedOption?.followup_required) {
      return followup || selectedOption.label;
    }

    if (didNotMeetReason === DID_NOT_MEET_OTHER_VALUE || didNotMeetReason === 'Other') {
      return followup || selectedOption?.label || 'Other';
    }
    return didNotMeetReason.trim();
  }

  function getOptionFollowupText(question: DynamicQuestion, option: DynamicQuestionOption): string {
    if (responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY) {
      return didNotMeetReasonOther;
    }
    return optionFollowups[optionFollowupKey(question.id, option.value)] || '';
  }

  function setOptionFollowupText(question: DynamicQuestion, optionValue: string, text: string) {
    if (responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY) {
      setDidNotMeetReasonOther(text);
      return;
    }
    setOptionFollowups((prev) => ({
      ...prev,
      [optionFollowupKey(question.id, optionValue)]: text,
    }));
  }

  function missingRequiredFollowup(question: DynamicQuestion): string | null {
    const selectedOptions = getSelectedOptions(question, getQuestionValue(question));
    for (const option of selectedOptions) {
      if (!option.followup_required) continue;
      if (!getOptionFollowupText(question, option).trim()) {
        return option.followup_label || `${option.label} details`;
      }
    }
    return null;
  }

  function formatDynamicResponseValue(question: DynamicQuestion): DynamicValue {
    const value = dynamicValues[question.id];
    const selectedOptions = getSelectedOptions(question, value);
    if (selectedOptions.length === 0) return value ?? '';

    const formatOption = (option: DynamicQuestionOption) => {
      const followup = getOptionFollowupText(question, option).trim();
      if (followup && (option.followup_label || option.followup_required)) {
        return `${option.label}: ${followup}`;
      }
      return option.label || option.value;
    };

    if (Array.isArray(value)) return selectedOptions.map(formatOption);
    return formatOption(selectedOptions[0]);
  }

  async function handleSubmit() {
    setSubmitError(null);

    if (isBeforeMeetingTime) {
      setSubmitError(`You can submit this summary after the Circle meeting starts on ${meetingStartLabel}.`);
      return;
    }

    if (didNotMeet) {
      const reason = finalDidNotMeetReason();
      if (!reason) {
        setSubmitError('Please tell us why your Circle did not meet.');
        return;
      }
    }

    for (const q of questions) {
      const visible =
        (didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended);
      if (visible && q.required) {
        const v = getQuestionValue(q);
        const empty =
          v === undefined ||
          v === null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0);
        if (empty) {
          setSubmitError(`Please answer: "${q.label}"`);
          return;
        }
      }
      const missingFollowupLabel = visible ? missingRequiredFollowup(q) : null;
      if (missingFollowupLabel) {
        setSubmitError(`Please answer: "${missingFollowupLabel}"`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const dynamicResponses = questions
        .filter(
          (q) =>
            ((didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended)) &&
            responseKeyForQuestion(q) === DYNAMIC_RESPONSE_KEY
        )
        .map((q) => ({ questionId: q.id, label: q.label, value: formatDynamicResponseValue(q) }));

      const infoUpdateChanged =
        showInfoUpdate &&
        (infoUpdateDay !== '' || infoUpdateTime !== '' || infoUpdateLocation !== '');

      const finalReason = finalDidNotMeetReason();

      const res = await fetch('/api/circle-leader-toolkit/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          occurrence,
          didNotMeet,
          didNotMeetReason: didNotMeet ? finalReason : '',
          topic: didNotMeet ? '' : topic,
          notes,
          prayerRequests: didNotMeet ? '' : prayerRequests,
          info: didNotMeet ? '' : info,
          attendeeCcbIds: didNotMeet ? [] : Array.from(selectedCcbIds),
          manualAttendees: didNotMeet ? [] : manualAttendees,
          dynamicResponses,
          infoUpdate: infoUpdateChanged
            ? {
                day: infoUpdateDay || undefined,
                time: infoUpdateTime || undefined,
                location: infoUpdateLocation || undefined,
                current: { day: leader?.day || '', time: leader?.time || '', location: '' },
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data.error || data.ccbError || 'Submission failed.');
        return;
      }
      try {
        const selectedAttendees = participants
          .filter((p) => selectedCcbIds.has(p.id))
          .map((p) => p.fullName || `${p.firstName} ${p.lastName}`.trim());
        window.sessionStorage.setItem(
          `circle-summary-submission:${data.summaryId}`,
          JSON.stringify({
            summaryId: data.summaryId,
            submittedAt: new Date().toISOString(),
            occurrence,
            occurrenceLabel: dateLabel(occurrence),
            didNotMeet,
            didNotMeetReason: didNotMeet ? finalReason : '',
            attendees: didNotMeet ? [] : selectedAttendees,
            requestedRosterAdds: didNotMeet ? [] : manualAttendees,
            manualAttendees: didNotMeet ? [] : manualAttendees,
            topic: didNotMeet ? '' : topic,
            notes,
            prayerRequests: didNotMeet ? '' : prayerRequests,
            info: didNotMeet ? '' : info,
            dynamicResponses,
            infoUpdate: infoUpdateChanged
              ? {
                  day: infoUpdateDay || '',
                  time: infoUpdateTime || '',
                  location: infoUpdateLocation || '',
                }
              : null,
          })
        );
      } catch {
        // The success page can still load the stored submission by id.
      }
      // Tell the events page its cached list is stale: when the leader
      // navigates back, it will skip the cached paint and force-refresh
      // straight from CCB instead of risking a "Pending" badge for an
      // event they just submitted.
      try {
        sessionStorage.setItem(`cs:events:${urlGroupId}:invalidated`, '1');
        localStorage.removeItem(`cs:events:${urlGroupId}`);
        // Submission succeeded — drop the local draft mirror so it can't later
        // shadow the submitted state.
        localStorage.removeItem(draftStorageKey);
        window.dispatchEvent(new CustomEvent('circle-summary-alerts-updated'));
        fetch('/api/circle-leader-toolkit/alerts/', { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((counts) => setCircleSummaryAppBadge(Number(counts?.totalAlertCount || 0)))
          .catch(() => {});
      } catch {}
      router.replace(`/circle-leader-toolkit/success?id=${data.summaryId}`);
    } catch (error: unknown) {
      setSubmitError(getErrorMessage(error, 'Submission failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (sortBy === 'lastName') {
        return (a.lastName || '').localeCompare(b.lastName || '');
      }
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [participants, sortBy]);

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
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

  const allSelected = participants.length > 0 && selectedCcbIds.size === participants.length;
  const visibleQuestions = questions.filter(
    (q) => (didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended)
  );
  const totalAttendees = selectedCcbIds.size + manualAttendees.length;
  const previousNotesTargetQuestion = visibleQuestions.find((q) => q.field_type === 'textarea');
  const previousNotesAlreadyLoaded =
    !!previousNotesTargetQuestion && !!normalizeNoteText(dynamicValues[previousNotesTargetQuestion.id]);

  return (
    <>
      <header className="cs-hero py-8 sm:py-10 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href={`/circle-leader-toolkit/${urlGroupId}/events`}
              aria-label="Back to Events"
              className="shrink-0"
            >
              <Image
                src="/Circles Logo V2-White.png"
                alt="Circles"
                width={80}
                height={79}
                priority
                className="h-16 sm:h-20 w-auto"
              />
            </Link>
            <div className="min-w-0">
              <h1 className="cs-display text-4xl sm:text-5xl">Circles Toolkit</h1>
              <p className="mt-2 text-white/85 font-medium text-base">{dateLabel(occurrence)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-4">
        {loadedFromSubmission && (
          <div className="cs-alert cs-alert-info">
            Editing a summary you submitted on{' '}
            {new Date(loadedFromSubmission).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
            . Saving again will update your records.
          </div>
        )}
        {loadedFromCcb && (
          <div className="cs-alert cs-alert-info">
            Pre-filled with the summary already on file. Edit anything
            below and save to update.
          </div>
        )}
        {/* Step 1 — Did your Circle meet? */}
        <div className="cs-card">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
              <span className="cs-step-num shrink-0">1</span>
              <div>
                <div className="font-semibold text-neutral-900">Did your Circle meet?</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Toggle off if you didn&apos;t gather this time.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              className="cs-toggle"
              checked={!didNotMeet}
              onChange={(e) => setDidNotMeet(!e.target.checked)}
            />
          </label>
        </div>

        {didNotMeet ? null : (
          <>
            {/* Step 2 — Roster */}
            <div className="cs-card">
              <div className="flex items-center justify-between mb-4">
                <div className="cs-step mb-0">
                  <span className="cs-step-num">2</span>
                  <span className="cs-step-title">Who came?</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditRoster((v) => !v)}
                    className={
                      editRoster
                        ? 'inline-flex items-center gap-1.5 rounded-full bg-[color:var(--cs-green)] hover:bg-[color:var(--cs-green-dark)] text-white text-xs font-semibold px-3.5 py-1.5 transition-colors'
                        : 'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cs-border)] hover:border-[color:var(--cs-green)] hover:text-[color:var(--cs-green-darker)] text-[color:var(--cs-ink-soft)] text-xs font-semibold px-3.5 py-1.5 transition-colors'
                    }
                  >
                    {editRoster ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Done
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L4 13.172V16h2.828l7.379-7.379-2.828-2.828z" />
                        </svg>
                        Edit roster
                      </>
                    )}
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
                <div className="flex items-center gap-1.5 text-xs mb-3">
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

              <div className="space-y-1 mb-4">
                {participants.length === 0 && (
                  <p className="text-sm text-neutral-500 py-2">No one on your roster yet.</p>
                )}
                {!editRoster && participants.length > 0 && (
                  <div className="flex items-center gap-2.5 py-0.5 border-b border-neutral-200 mb-1 pb-2">
                    <input
                      type="checkbox"
                      className="cs-check"
                      checked={allSelected}
                      onChange={() => toggleAll(!allSelected)}
                      aria-label="Select all"
                    />
                    <label
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => toggleAll(!allSelected)}
                    >
                      <span className="text-sm font-semibold text-neutral-600">Select all</span>
                    </label>
                  </div>
                )}
                {sortedParticipants.map((p) => {
                  const fullName = p.fullName || `${p.firstName} ${p.lastName}`;
                  const checked = selectedCcbIds.has(p.id);
                  const lastAttendedDate = lastAttended[p.id];
                  const daysAway = lastAttendedDate ? daysSince(lastAttendedDate) : null;
                  const isAbsent = daysAway != null && daysAway >= ABSENCE_THRESHOLD_DAYS;
                  return (
                    <div
                      key={p.id}
                      className={
                        editRoster
                          ? 'group flex items-start gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-red-50/60 transition-colors'
                          : 'flex items-start gap-2.5 py-1'
                      }
                    >
                      {editRoster ? (
                        <button
                          type="button"
                          onClick={() => removeFromCcb(p)}
                          className="mt-0.5 w-6 h-6 rounded-full border-2 border-red-300 text-red-500 hover:bg-red-500 hover:border-red-500 hover:text-white group-hover:border-red-400 flex items-center justify-center shrink-0 transition-colors"
                          aria-label={`Remove ${fullName} from Circle`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          className="cs-check mt-0.5"
                          checked={checked}
                          onChange={() => toggleOne(p.id)}
                          aria-label={fullName}
                        />
                      )}
                      <label className="flex-1 min-w-0 cursor-pointer" onClick={() => !editRoster && toggleOne(p.id)}>
                        <span className="block truncate text-sm font-medium">{fullName}</span>
                        {lastAttendedDate ? (
                          <span
                            className={
                              isAbsent
                                ? 'mt-1 self-start inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] text-red-700 font-semibold'
                                : 'mt-0.5 ml-2 inline-flex items-center gap-1.5 text-[11px] text-neutral-500'
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
                          <span className="mt-1 ml-2 inline-block h-5 w-36 rounded-full cs-skeleton" />
                        ) : null}
                      </label>
                    </div>
                  );
                })}
                {manualAttendees.map((m, i) => (
                  <div key={`m-${i}`} className="flex items-center gap-2.5 py-1 pl-[34px]">
                    <span className="flex-1 min-w-0 text-sm font-medium truncate">
                      {m.firstName} {m.lastName}
                      {(m.phone || m.email) && (
                        <span className="text-xs text-neutral-400 ml-1.5 font-normal">
                          {[m.phone, m.email].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="cs-badge cs-badge-new text-[10px] shrink-0">New</span>
                    <button
                      type="button"
                      onClick={() => startEditManual(i)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[color:var(--cs-green-dark)] hover:bg-[color:var(--cs-bg-soft)] shrink-0 transition-colors"
                      aria-label={`Edit ${m.firstName} ${m.lastName}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L4 13.172V16h2.828l7.379-7.379-2.828-2.828z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeManual(i)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-500 hover:bg-red-50 shrink-0 transition-colors"
                      aria-label={`Remove ${m.firstName} ${m.lastName}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
                {participants.length > 0 && (
                  <div className="pt-1 flex items-center justify-end gap-1.5 text-[11px] text-neutral-500">
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" clipRule="evenodd" />
                    </svg>
                    <span>= Last Attendance Date</span>
                  </div>
                )}
              </div>

              {!addOpen ? (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-neutral-500">
                    Please report everyone who attended your Circle. First-time guests and one-time guests count too, so add them here even if they aren&apos;t on your regular roster yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="cs-btn cs-btn-outline w-full"
                  >
                    + Add someone to my Circle
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-[color:var(--cs-border)] bg-[color:var(--cs-bg-soft)] p-4 space-y-3">
                  {editingManualIdx !== null ? (
                    <p className="text-sm font-semibold text-neutral-700">Edit pending roster request</p>
                  ) : (
                    <>
                      <div className="cs-search-field">
                        <label className="cs-search-field-label" htmlFor="cs-roster-search">
                          Search by full or partial name or by phone number
                        </label>
                        <input
                          id="cs-roster-search"
                          type="text"
                          placeholder="Start typing a name or phone number..."
                          className="cs-input"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
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
                          {searching && searchResults.length > 0 && (
                            <div className="cs-search-results-status">Updating...</div>
                          )}
                        </div>
                      )}
                      <div className="cs-divider">Person not in our system?</div>
                      <p className="text-xs text-neutral-500 -mt-1">Fill in their info and we&apos;ll request they be added to your roster.</p>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-neutral-600">First name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className="cs-input"
                        required
                        value={manualForm.firstName}
                        onChange={(e) => setManualForm((m) => ({ ...m, firstName: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-neutral-600">Last name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className="cs-input"
                        required
                        value={manualForm.lastName}
                        onChange={(e) => setManualForm((m) => ({ ...m, lastName: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-neutral-600">Cell phone <span className="text-red-500">*</span></label>
                      <input
                        type="tel"
                        className="cs-input"
                        required
                        value={manualForm.phone}
                        onChange={(e) => setManualForm((m) => ({ ...m, phone: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-neutral-600">Email <span className="text-red-500">*</span></label>
                      <input
                        type="email"
                        className="cs-input"
                        required
                        value={manualForm.email}
                        onChange={(e) => setManualForm((m) => ({ ...m, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={addManual}
                      className="cs-btn cs-btn-primary flex-1"
                    >
                      {editingManualIdx !== null ? 'Save changes' : 'Request to add to roster'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelManualForm}
                      className="cs-btn cs-btn-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {totalAttendees > 0 && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-base font-semibold text-green-800 ring-1 ring-green-200">
                  <span className="text-lg">{totalAttendees}</span>
                  <span>{totalAttendees === 1 ? 'person' : 'people'} marked present</span>
                </div>
              )}
            </div>

          </>
        )}

        {previousNotes && !didNotMeet && !previousNotesAlreadyLoaded && (() => {
          return (
            <div className="cs-card cs-previous-notes">
              <div className="cs-previous-notes-label">
                Saved Notes
              </div>
              <p className="cs-previous-notes-body">
                {previousNotes}
              </p>
              {previousNotesTargetQuestion && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDynamicValues((prev) => ({ ...prev, [previousNotesTargetQuestion.id]: previousNotes }));
                      setPreviousNotes('');
                    }}
                    className="cs-btn-outline text-xs px-3 py-1.5"
                  >
                    Start with these notes
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Dynamic questions — numbered step relative to whether roster is shown */}
        {visibleQuestions.length > 0 && (
          <div className="cs-card space-y-5">
            <div className="cs-step">
              <span className="cs-step-num">{didNotMeet ? '2' : '3'}</span>
              <span className="cs-step-title">Tell us more</span>
            </div>
            {visibleQuestions.map((q) => (
              <DynamicQuestionField
                key={q.id}
                question={q}
                value={getQuestionValue(q)}
                getFollowupText={(optionValue) => {
                  const option = getQuestionOptions(q).find((o) => o.value === optionValue);
                  return option ? getOptionFollowupText(q, option) : '';
                }}
                onFollowupTextChange={(optionValue, text) =>
                  setOptionFollowupText(q, optionValue, text)
                }
                onChange={(v) => setQuestionValue(q, v)}
              />
            ))}
          </div>
        )}

        {/* Info update request */}
        {!didNotMeet && (
          <div className="cs-card">
            {!showInfoUpdate ? (
              <button
                type="button"
                onClick={() => setShowInfoUpdate(true)}
                className="group flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-neutral-900">
                    Do you need to update any Circle details?
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Ask you Circle team to update your day, time, or location
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-[#34B233] px-4 py-2 text-sm font-bold text-[#1f7320] transition-colors group-hover:bg-[#34B233] group-hover:text-white">
                  Edit Details
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="cs-step mb-0">
                    <span className="cs-step-num">✎</span>
                    <span className="cs-step-title">Requested changes</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInfoUpdate(false);
                      setInfoUpdateDay('');
                      setInfoUpdateTime('');
                      setInfoUpdateLocation('');
                    }}
                    className="text-xs text-neutral-500 hover:text-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
                <div>
                  <label className="cs-label">New meeting day</label>
                  <input
                    type="text"
                    placeholder="e.g. Tuesday"
                    className="cs-input"
                    value={infoUpdateDay}
                    onChange={(e) => setInfoUpdateDay(e.target.value)}
                  />
                </div>
                <div>
                  <label className="cs-label">New meeting time</label>
                  <input
                    type="text"
                    placeholder="e.g. 7:00pm"
                    className="cs-input"
                    value={infoUpdateTime}
                    onChange={(e) => setInfoUpdateTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="cs-label">New location</label>
                  <input
                    type="text"
                    placeholder="Address or description"
                    className="cs-input"
                    value={infoUpdateLocation}
                    onChange={(e) => setInfoUpdateLocation(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {isBeforeMeetingTime && (
          <div className="cs-alert cs-alert-warning">
            You can submit this summary after the Circle meeting starts on {meetingStartLabel}.
          </div>
        )}
        {submitError && <div className="cs-alert cs-alert-error">{submitError}</div>}
      </main>

      {/* Sticky submit footer */}
      <div className="fixed bottom-0 inset-x-0 cs-dark px-4 py-4 z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
        <div className="max-w-2xl mx-auto grid grid-cols-[auto,1fr] gap-3">
          <button
            type="button"
            onClick={() => {
              // Prefer an in-app back navigation when possible: it restores the
              // already-rendered, client-cached events list instantly instead of
              // forcing a fresh server render of the dynamic events page. `idx`
              // is the App Router's history position — > 0 means there is an
              // in-app entry to return to. Fall back to a push for deep links
              // (magic-link / refresh) where back() would leave the app.
              const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
              if (idx > 0) router.back();
              else router.push(`/circle-leader-toolkit/${urlGroupId}/events`);
            }}
            disabled={submitting}
            className="rounded-xl border border-white/30 px-5 py-4 text-base font-semibold text-white/90 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || isBeforeMeetingTime}
            className="cs-btn cs-btn-primary w-full text-lg py-4"
          >
            {submitting ? 'Submitting…' : didNotMeet ? 'Submit "Did Not Meet"' : 'Submit Circle Summary'}
          </button>
        </div>
      </div>
    </>
  );
}
