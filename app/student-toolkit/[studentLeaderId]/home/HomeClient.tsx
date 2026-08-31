'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import {
  isStudentToolkitHostName,
  studentToolkitLeaderPath,
} from '../../../../lib/student-toolkit/paths';

type StudentMessage = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function HomeClient() {
  const params = useParams<{ studentLeaderId: string }>();
  const leaderId = params?.studentLeaderId ?? '';
  // On the dedicated Student Toolkit host the visible URL drops the
  // /student-toolkit prefix, so links built with it would each cost a redirect.
  const cleanHost =
    typeof window !== 'undefined' && isStudentToolkitHostName(window.location.hostname);
  const hrefFor = (segment: string) =>
    `${studentToolkitLeaderPath(leaderId, segment, { cleanHost })}/`;

  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student-toolkit/messages/', { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not load updates.');
        const data = await res.json();
        if (!cancelled) setMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load updates.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-neutral-900 tracking-tight">Latest updates</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          What&apos;s happening in student ministry right now.
        </p>
      </div>

      {loading && (
        <div className="cs-card p-5 space-y-3">
          <div className="cs-skeleton h-4 w-2/3" />
          <div className="cs-skeleton h-3 w-full" />
          <div className="cs-skeleton h-3 w-5/6" />
        </div>
      )}

      {!loading && error && <div className="cs-alert cs-alert-warning">{error}</div>}

      {!loading && !error && messages.length > 0 && (
        <section className="bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
            <svg
              className="w-3.5 h-3.5 text-neutral-400 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
              />
            </svg>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">
              Message Center
            </span>
          </div>
          <div className="divide-y divide-neutral-100">
            {messages.map((message) => (
              <article key={message.id} className="px-4 py-4">
                <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
                  {message.header}
                </h2>
                {message.body_html && (
                  <div
                    className="cs-message-body text-sm text-neutral-700 mt-1.5 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMessageHtml(message.body_html) }}
                  />
                )}
                {message.url && (
                  <a
                    href={message.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cs-message-cta"
                  >
                    <span>{message.url_label || 'Learn more'}</span>
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="cs-card text-center py-12 px-5">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-neutral-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
            />
          </svg>
          <p className="text-neutral-500 font-medium">No updates right now</p>
          <p className="text-neutral-400 text-sm mt-1">
            When your staff team posts something, it shows up here.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href={hrefFor('roster')}
              className="st-cta inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-extrabold shadow-sm transition-colors"
            >
              Check your roster
            </Link>
            <Link
              href={hrefFor('resources')}
              className="st-cta-secondary inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-extrabold transition-colors"
            >
              Browse resources
            </Link>
          </div>
        </div>
      )}

      <div className="pt-1 text-center">
        <Link
          href={hrefFor('settings')}
          className="text-xs font-semibold text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-700"
        >
          Notification settings
        </Link>
      </div>
    </main>
  );
}
