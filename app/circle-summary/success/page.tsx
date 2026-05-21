'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type DynamicResponse = {
  questionId: string;
  label: string;
  value: unknown;
};

type SubmissionSnapshot = {
  summaryId: string;
  submittedAt?: string;
  occurrence?: string;
  occurrenceLabel?: string;
  didNotMeet: boolean;
  didNotMeetReason?: string;
  attendees?: string[];
  attendeeCount?: number;
  requestedRosterAdds?: Array<string | { firstName?: string; lastName?: string; phone?: string; email?: string }>;
  manualAttendees?: Array<{ firstName?: string; lastName?: string; phone?: string; email?: string }>;
  topic?: string;
  notes?: string;
  prayerRequests?: string;
  info?: string;
  dynamicResponses?: DynamicResponse[];
  infoUpdate?: { day?: string; time?: string; location?: string } | null;
};

function formatDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null) return '';
  return String(value);
}

function ReviewItem({ label, children }: { label: string; children: React.ReactNode }) {
  if (
    children === null ||
    children === undefined ||
    children === '' ||
    (Array.isArray(children) && children.length === 0)
  ) {
    return null;
  }
  return (
    <div className="border-t border-[color:var(--cs-border)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-neutral-900 whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function RosterAddList({
  people,
}: {
  people: Array<string | { firstName?: string; lastName?: string; phone?: string; email?: string }>;
}) {
  if (!people.length) return null;
  return (
    <div className="grid gap-2">
      {people.map((person, index) => {
        const name =
          typeof person === 'string'
            ? person
            : `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
        const phone = typeof person === 'string' ? '' : person.phone;
        const email = typeof person === 'string' ? '' : person.email;
        return (
          <div key={`${name}-${index}`} className="rounded-lg border border-[color:var(--cs-border)] bg-[color:var(--cs-bg-soft)] px-3 py-2">
            <div className="font-semibold">{name || 'New person'}</div>
            {(phone || email) && (
              <div className="mt-0.5 text-xs font-normal text-neutral-500">
                {[phone, email].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SuccessInner() {
  const searchParams = useSearchParams();
  const summaryId = searchParams?.get('id') ?? null;
  const [submission, setSubmission] = useState<SubmissionSnapshot | null>(null);
  const [loading, setLoading] = useState(!!summaryId);

  useEffect(() => {
    let cancelled = false;
    async function loadSubmission() {
      if (!summaryId) {
        setLoading(false);
        return;
      }

      try {
        const stored = window.sessionStorage.getItem(`circle-summary-submission:${summaryId}`);
        if (stored) {
          const parsed = JSON.parse(stored) as SubmissionSnapshot;
          if (!cancelled) {
            setSubmission(parsed);
            setLoading(false);
          }
          return;
        }
      } catch {}

      try {
        const res = await fetch(`/api/circle-summary/submission?id=${encodeURIComponent(summaryId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSubmission(data.submission || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSubmission();
    return () => {
      cancelled = true;
    };
  }, [summaryId]);

  const attendeeText = useMemo(() => {
    if (!submission || submission.didNotMeet) return '';
    const names = submission.attendees || [];
    if (names.length > 0) return names.join('\n');
    const count = submission.attendeeCount ?? 0;
    return count > 0 ? `${count} ${count === 1 ? 'person' : 'people'} marked present` : '';
  }, [submission]);

  const rosterAdds = useMemo(() => {
    if (!submission || submission.didNotMeet) return '';
    const requested = submission.requestedRosterAdds || [];
    if (requested.length > 0) return requested;
    const manual = submission.manualAttendees || [];
    return manual.filter((m) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim());
  }, [submission]);

  const infoUpdateText = submission?.infoUpdate
    ? [
        submission.infoUpdate.day && `Day: ${submission.infoUpdate.day}`,
        submission.infoUpdate.time && `Time: ${submission.infoUpdate.time}`,
        submission.infoUpdate.location && `Location: ${submission.infoUpdate.location}`,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <>
      <header className="cs-hero py-14 sm:py-20 px-6 text-center">
        <img
          src="/Circles Logo V2-White.png"
          alt="Circles"
          className="mx-auto h-16 sm:h-20 w-auto mb-6"
        />
        <h1 className="cs-display text-5xl sm:text-6xl text-white">Thank you</h1>
        <p className="mt-3 text-white/90 font-medium text-base sm:text-lg max-w-md mx-auto">
          Your Circle summary has been submitted.
        </p>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-4">
        {loading && <div className="cs-card text-sm text-neutral-500">Loading your summary…</div>}

        {!loading && submission && (
          <div className="cs-card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="cs-step-title">Your submission</h2>
                <p className="text-sm text-neutral-500 mt-1">
                  {submission.occurrenceLabel || formatDate(submission.occurrence)}
                </p>
              </div>
              <span className="cs-badge cs-badge-success">
                {submission.didNotMeet ? 'Did not meet' : 'Submitted'}
              </span>
            </div>

            <ReviewItem label="Did your Circle meet?">
              {submission.didNotMeet ? 'No' : 'Yes'}
            </ReviewItem>
            <ReviewItem label="Reason">{submission.didNotMeetReason}</ReviewItem>
            <ReviewItem label="Who came?">{attendeeText}</ReviewItem>
            {Array.isArray(rosterAdds) && rosterAdds.length > 0 && (
              <ReviewItem label="Roster additions requested">
                <RosterAddList people={rosterAdds} />
              </ReviewItem>
            )}
            <ReviewItem label="Topic">{submission.topic}</ReviewItem>
            <ReviewItem label="Notes">{submission.notes}</ReviewItem>
            <ReviewItem label="Prayer requests">{submission.prayerRequests}</ReviewItem>
            <ReviewItem label="Information for leaders">{submission.info}</ReviewItem>
            {submission.dynamicResponses?.map((response) => (
              <ReviewItem key={response.questionId} label={response.label}>
                {formatValue(response.value)}
              </ReviewItem>
            ))}
            <ReviewItem label="Requested Circle detail changes">{infoUpdateText}</ReviewItem>
          </div>
        )}

        <div className="cs-card text-center">
          <Link href="/circle-summary/events" className="cs-btn cs-btn-primary w-full">
            See my Circle events
          </Link>
        </div>
      </main>
    </>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <SuccessInner />
    </Suspense>
  );
}
