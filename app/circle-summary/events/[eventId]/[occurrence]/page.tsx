'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Participant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
};

type DynamicQuestion = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: 'text' | 'textarea' | 'dropdown' | 'multiselect' | 'checkbox' | 'radio';
  options: Array<string | { label: string; value: string }>;
  required: boolean;
  show_when_did_not_meet: boolean;
  show_when_attended: boolean;
};

type Leader = {
  id: number | string;
  name: string;
  day: string | null;
  time: string | null;
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

const DID_NOT_MEET_REASONS = [
  'Holiday weekend',
  'Leader out of town',
  'Low attendance',
  'Weather',
  'Other',
];

function dateLabel(occurrenceDateTime: string): string {
  const datePart = occurrenceDateTime.slice(0, 10);
  return new Date(datePart + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CircleSummaryFormPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string; occurrence: string }>();
  const eventId = params.eventId;
  const occurrence = decodeURIComponent(params.occurrence);

  const [leader, setLeader] = useState<Leader | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [didNotMeet, setDidNotMeet] = useState(false);
  const [didNotMeetReason, setDidNotMeetReason] = useState('');
  const [didNotMeetReasonOther, setDidNotMeetReasonOther] = useState('');
  const [selectedCcbIds, setSelectedCcbIds] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [prayerRequests, setPrayerRequests] = useState('');
  const [info, setInfo] = useState('');
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  const [manualAttendees, setManualAttendees] = useState<ManualAttendee[]>([]);
  const [infoUpdateDay, setInfoUpdateDay] = useState('');
  const [infoUpdateTime, setInfoUpdateTime] = useState('');
  const [infoUpdateLocation, setInfoUpdateLocation] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CcbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualForm, setManualForm] = useState<ManualAttendee>({ firstName: '', lastName: '', phone: '', email: '' });

  const [showInfoUpdate, setShowInfoUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, rosterRes, qRes, draftRes] = await Promise.all([
          fetch('/api/circle-summary/me'),
          fetch('/api/circle-summary/roster'),
          fetch('/api/circle-summary/dynamic-questions'),
          fetch(
            `/api/circle-summary/draft?event_id=${encodeURIComponent(eventId)}&occurrence=${encodeURIComponent(occurrence)}`
          ),
        ]);

        if (meRes.status === 401) {
          router.replace('/circle-summary');
          return;
        }
        const meData = await meRes.json();
        if (cancelled) return;
        if (!meData.leader) {
          router.replace('/circle-summary');
          return;
        }
        setLeader(meData.leader);

        const rosterData = await rosterRes.json();
        setParticipants(rosterData.participants || []);

        const qData = await qRes.json();
        setQuestions(qData.questions || []);

        const draftData = await draftRes.json();
        if (draftData?.draft) {
          const d = draftData.draft;
          setDidNotMeet(!!d.didNotMeet);
          setDidNotMeetReason(d.didNotMeetReason ?? '');
          setDidNotMeetReasonOther(d.didNotMeetReasonOther ?? '');
          if (Array.isArray(d.attendeeCcbIds)) setSelectedCcbIds(new Set(d.attendeeCcbIds));
          setTopic(d.topic ?? '');
          setNotes(d.notes ?? '');
          setPrayerRequests(d.prayerRequests ?? '');
          setInfo(d.info ?? '');
          setDynamicValues(d.dynamicValues ?? {});
          setManualAttendees(d.manualAttendees ?? []);
          setInfoUpdateDay(d.infoUpdateDay ?? '');
          setInfoUpdateTime(d.infoUpdateTime ?? '');
          setInfoUpdateLocation(d.infoUpdateLocation ?? '');
          if (d.infoUpdateDay || d.infoUpdateTime || d.infoUpdateLocation) setShowInfoUpdate(true);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load form.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, occurrence, router]);

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
      fetch('/api/circle-summary/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, occurrence, payload: draftPayload }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draftPayload, eventId, occurrence, loading]);

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

  async function runSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch('/api/circle-summary/roster/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } finally {
      setSearching(false);
    }
  }

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
    const rosterRes = await fetch('/api/circle-summary/roster');
    const rosterData = await rosterRes.json();
    setParticipants(rosterData.participants || []);
    setSelectedCcbIds((prev) => new Set(prev).add(String(individual.id)));
    setAddOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function addManual() {
    const trimmed = {
      firstName: manualForm.firstName.trim(),
      lastName: manualForm.lastName.trim(),
      phone: manualForm.phone?.trim(),
      email: manualForm.email?.trim(),
    };
    if (!trimmed.firstName || !trimmed.lastName) {
      alert('First and last name are required.');
      return;
    }
    setManualAttendees((prev) => [...prev, trimmed]);
    setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
    setAddOpen(false);
  }

  function removeManual(idx: number) {
    setManualAttendees((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setSubmitError(null);

    if (didNotMeet) {
      const reason =
        didNotMeetReason === 'Other'
          ? didNotMeetReasonOther.trim()
          : didNotMeetReason.trim();
      if (!reason) {
        setSubmitError('Please tell us why your Circle did not meet.');
        return;
      }
    }

    for (const q of questions) {
      const visible =
        (didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended);
      if (visible && q.required) {
        const v = dynamicValues[q.id];
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
    }

    setSubmitting(true);
    try {
      const dynamicResponses = questions
        .filter(
          (q) =>
            (didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended)
        )
        .map((q) => ({ questionId: q.id, label: q.label, value: dynamicValues[q.id] ?? '' }));

      const infoUpdateChanged =
        showInfoUpdate &&
        (infoUpdateDay !== '' || infoUpdateTime !== '' || infoUpdateLocation !== '');

      const finalReason =
        didNotMeetReason === 'Other' ? didNotMeetReasonOther.trim() : didNotMeetReason;

      const res = await fetch('/api/circle-summary/submit', {
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
      router.replace(`/circle-summary/success?id=${data.summaryId}`);
    } catch (e: any) {
      setSubmitError(e?.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <header className="cs-hero py-10 px-6">
          <div className="max-w-2xl mx-auto">
            <div className="cs-skeleton h-10 w-2/3 mb-2" style={{ background: 'rgba(255,255,255,0.25)' }} />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="cs-skeleton h-24 w-full" />
          <div className="cs-skeleton h-40 w-full" />
        </main>
      </>
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

  return (
    <>
      <header className="cs-hero py-8 sm:py-10 px-6">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => router.push('/circle-summary/events')}
            className="text-white/85 hover:text-white text-sm mb-3"
          >
            ← Back to events
          </button>
          <h1 className="cs-display text-4xl sm:text-5xl">Circle Summary</h1>
          <p className="mt-2 text-white/90 font-medium">{dateLabel(occurrence)}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-4">
        {/* Did your Circle meet? */}
        <div className="cs-card">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="font-semibold text-neutral-900">Did your Circle meet?</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                Toggle off if you didn't gather this time.
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

        {didNotMeet ? (
          <div className="cs-card">
            <h2 className="cs-display text-2xl text-neutral-900 mb-3">What kept you from meeting?</h2>
            <div className="space-y-2">
              {DID_NOT_MEET_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="dnm-reason"
                    className="cs-radio"
                    checked={didNotMeetReason === r}
                    onChange={() => setDidNotMeetReason(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
              {didNotMeetReason === 'Other' && (
                <input
                  type="text"
                  placeholder="Tell us more"
                  className="cs-input mt-2"
                  value={didNotMeetReasonOther}
                  onChange={(e) => setDidNotMeetReasonOther(e.target.value)}
                />
              )}
            </div>
            <div className="mt-5">
              <label className="cs-label" htmlFor="dnm-notes">
                Anything else worth noting? (optional)
              </label>
              <textarea
                id="dnm-notes"
                rows={3}
                className="cs-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Roster */}
            <div className="cs-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="cs-display text-2xl text-neutral-900">Who came?</h2>
                <button
                  type="button"
                  onClick={() => toggleAll(!allSelected)}
                  className="text-sm font-semibold text-[color:var(--cs-green-dark)] hover:text-[color:var(--cs-green-darker)]"
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2 mb-4">
                {participants.length === 0 && (
                  <p className="text-sm text-neutral-500">No one on your roster yet.</p>
                )}
                {participants.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 cursor-pointer py-1.5">
                    <input
                      type="checkbox"
                      className="cs-check"
                      checked={selectedCcbIds.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                    />
                    <span>{p.fullName || `${p.firstName} ${p.lastName}`}</span>
                  </label>
                ))}
                {manualAttendees.map((m, i) => (
                  <div key={`m-${i}`} className="flex items-center gap-3 py-1.5">
                    <span className="cs-badge cs-badge-new shrink-0">New</span>
                    <span className="flex-1">
                      {m.firstName} {m.lastName}
                      {m.phone || m.email ? (
                        <span className="text-xs text-neutral-500 ml-2">
                          {[m.phone, m.email].filter(Boolean).join(' • ')}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeManual(i)}
                      className="text-xs text-neutral-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
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
                  <input
                    type="text"
                    placeholder="Search name or phone…"
                    className="cs-input"
                    value={searchQuery}
                    onChange={(e) => runSearch(e.target.value)}
                  />
                  {searching && <div className="text-xs text-neutral-500">Searching…</div>}
                  {searchResults.length > 0 && (
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {searchResults.slice(0, 8).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => addFromCcb(r)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-white border border-transparent hover:border-[color:var(--cs-border)] text-sm transition-colors"
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
                  )}
                  <div className="cs-divider">Not finding them?</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="First name *"
                      className="cs-input"
                      value={manualForm.firstName}
                      onChange={(e) => setManualForm((m) => ({ ...m, firstName: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Last name *"
                      className="cs-input"
                      value={manualForm.lastName}
                      onChange={(e) => setManualForm((m) => ({ ...m, lastName: e.target.value }))}
                    />
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      className="cs-input"
                      value={manualForm.phone}
                      onChange={(e) => setManualForm((m) => ({ ...m, phone: e.target.value }))}
                    />
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      className="cs-input"
                      value={manualForm.email}
                      onChange={(e) => setManualForm((m) => ({ ...m, email: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={addManual}
                      className="cs-btn cs-btn-primary flex-1"
                    >
                      Add to this meeting
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddOpen(false)}
                      className="cs-btn cs-btn-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {totalAttendees > 0 && (
                <p className="text-xs text-neutral-500 mt-3">
                  {totalAttendees} {totalAttendees === 1 ? 'person' : 'people'} marked present
                </p>
              )}
            </div>

            {/* Reflection */}
            <div className="cs-card space-y-5">
              <h2 className="cs-display text-2xl text-neutral-900">Tell us about it</h2>
              <div>
                <label className="cs-label" htmlFor="topic">
                  Discussion topic (optional)
                </label>
                <input
                  id="topic"
                  type="text"
                  className="cs-input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div>
                <label className="cs-label" htmlFor="notes">
                  What stood out?
                </label>
                <p className="cs-help">
                  What did God do? What conversations mattered most?
                </p>
                <textarea
                  id="notes"
                  rows={5}
                  className="cs-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="cs-label" htmlFor="prayer">
                  Praises &amp; prayer requests
                </label>
                <textarea
                  id="prayer"
                  rows={3}
                  className="cs-textarea"
                  value={prayerRequests}
                  onChange={(e) => setPrayerRequests(e.target.value)}
                />
              </div>
              <div>
                <label className="cs-label" htmlFor="info">
                  Pastoral care / follow-up
                </label>
                <p className="cs-help">Anyone needing care or follow-up from your ACPD</p>
                <textarea
                  id="info"
                  rows={3}
                  className="cs-textarea"
                  value={info}
                  onChange={(e) => setInfo(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {/* Dynamic questions */}
        {visibleQuestions.length > 0 && (
          <div className="cs-card space-y-5">
            <h2 className="cs-display text-2xl text-neutral-900">A few more things</h2>
            {visibleQuestions.map((q) => (
              <DynamicQuestionField
                key={q.id}
                question={q}
                value={dynamicValues[q.id]}
                onChange={(v) => setDynamicValues((prev) => ({ ...prev, [q.id]: v }))}
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
                className="text-left w-full"
              >
                <div className="font-semibold text-neutral-900">
                  Do any Circle details need to update?
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Day, time, or location changes — your ACPD will review.
                </div>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="cs-display text-xl text-neutral-900">Requested changes</h2>
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
                <p className="text-xs text-neutral-500">
                  Currently: {leader?.day || 'no day'} at {leader?.time || 'no time'}
                </p>
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

        {submitError && <div className="cs-alert cs-alert-error">{submitError}</div>}
      </main>

      {/* Sticky submit footer */}
      <div className="fixed bottom-0 inset-x-0 cs-dark px-4 py-4 z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="cs-btn cs-btn-primary w-full text-lg py-4"
          >
            {submitting ? 'Submitting…' : didNotMeet ? 'Submit "Did Not Meet"' : 'Submit Circle Summary'}
          </button>
        </div>
      </div>
    </>
  );
}

function DynamicQuestionField({
  question,
  value,
  onChange,
}: {
  question: DynamicQuestion;
  value: any;
  onChange: (v: any) => void;
}) {
  const opts = (question.options || []).map((o) =>
    typeof o === 'string' ? { label: o, value: o } : o
  );

  return (
    <div>
      <label className="cs-label">
        {question.label}
        {question.required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {question.help_text && <p className="cs-help -mt-1 mb-2">{question.help_text}</p>}

      {question.field_type === 'text' && (
        <input
          type="text"
          className="cs-input"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {question.field_type === 'textarea' && (
        <textarea
          rows={3}
          className="cs-textarea"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {question.field_type === 'dropdown' && (
        <select
          className="cs-select"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {question.field_type === 'radio' && (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                className="cs-radio"
                name={question.id}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
      {question.field_type === 'multiselect' && (
        <div className="space-y-1.5">
          {opts.map((o) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="cs-check"
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                  }
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
      {question.field_type === 'checkbox' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="cs-check"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>Yes</span>
        </label>
      )}
    </div>
  );
}
