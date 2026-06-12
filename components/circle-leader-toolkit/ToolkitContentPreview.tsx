'use client';

import { renderMessageHtml } from '../../lib/renderMessageHtml';
import { csOpenSans } from '../../lib/circle-leader-toolkit/csFont';

type ToolkitPreviewVariant = 'events' | 'inbox' | 'resources';

interface ToolkitContentPreviewProps {
  /** Which toolkit surface this content lands on, so the card chrome matches. */
  variant: ToolkitPreviewVariant;
  /** Rich-text HTML from the editor. Run through renderMessageHtml() here, the
      same transform the real toolkit applies (YouTube embeds, bare-URL links). */
  bodyHtml: string;
  /** events: Message Center heading. */
  header?: string;
  /** inbox: message title. */
  title?: string;
  /** events: call-to-action link + label. */
  url?: string | null;
  urlLabel?: string | null;
  className?: string;
}

// Faithful, read-only render of admin content exactly as Circle Leaders see it in
// the Circle Leader Toolkit. The markup below mirrors the real toolkit pages
// (events/EventsClient.tsx, inbox/page.tsx, resources/page.tsx) and is wrapped in
// `.cs-canvas` so the toolkit content styles apply without leaking onto the dark
// admin page. Keep these layouts in sync with their source pages.
export default function ToolkitContentPreview({
  variant,
  bodyHtml,
  header,
  title,
  url,
  urlLabel,
  className = '',
}: ToolkitContentPreviewProps) {
  const hasBody = !!bodyHtml && bodyHtml.trim().length > 0;
  const renderedBody = hasBody ? renderMessageHtml(bodyHtml) : '';

  return (
    <div className={`cs-canvas ${csOpenSans.variable} ${className}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Preview — what leaders see
        </span>
      </div>

      <div className="rounded-2xl bg-[#f7f8f6] ring-1 ring-black/5 shadow-inner p-4 sm:p-5">
        {variant === 'resources' && <ResourcesPreview hasBody={hasBody} renderedBody={renderedBody} />}
        {variant === 'inbox' && <InboxPreview title={title} hasBody={hasBody} renderedBody={renderedBody} />}
        {variant === 'events' && (
          <EventsPreview header={header} hasBody={hasBody} renderedBody={renderedBody} url={url} urlLabel={urlLabel} />
        )}
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-neutral-400">{children}</p>;
}

// Mirrors app/circle-leader-toolkit/[ccbGroupId]/resources/page.tsx
function ResourcesPreview({ hasBody, renderedBody }: { hasBody: boolean; renderedBody: string }) {
  if (!hasBody) {
    return (
      <div className="cs-card text-center py-10">
        <svg className="w-9 h-9 mx-auto mb-2.5 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <p className="text-neutral-500 font-medium text-sm">No resources posted yet</p>
        <p className="text-neutral-400 text-xs mt-1">Start typing above to see the page take shape.</p>
      </div>
    );
  }
  return (
    <article
      className="cs-card cs-resources p-5"
      dangerouslySetInnerHTML={{ __html: renderedBody }}
    />
  );
}

// Mirrors the unread message card in app/circle-leader-toolkit/[ccbGroupId]/inbox/page.tsx
function InboxPreview({ title, hasBody, renderedBody }: { title?: string; hasBody: boolean; renderedBody: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#34B233]/60 bg-white shadow-sm ring-1 ring-[#34B233]/20">
      <div className="flex items-start justify-between gap-3 border-b border-[#34B233]/20 bg-[#34B233]/5 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-[#34B233]" />
            <h3 className="text-sm font-extrabold text-neutral-950">
              {title?.trim() || <span className="text-neutral-400 font-bold italic">Message title</span>}
            </h3>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Unread · just now</p>
        </div>
      </div>
      <div className="p-4">
        {hasBody ? (
          <div className="cs-resources text-sm" dangerouslySetInnerHTML={{ __html: renderedBody }} />
        ) : (
          <EmptyHint>Write a message above to preview it here.</EmptyHint>
        )}
        <button
          type="button"
          disabled
          className="mt-4 w-full bg-[#34B233] text-white rounded-xl py-2.5 text-sm font-bold shadow-sm opacity-90 cursor-default"
        >
          Mark read
        </button>
      </div>
    </article>
  );
}

// Mirrors the Message Center card in app/circle-leader-toolkit/[ccbGroupId]/events/EventsClient.tsx
function EventsPreview({
  header,
  hasBody,
  renderedBody,
  url,
  urlLabel,
}: {
  header?: string;
  hasBody: boolean;
  renderedBody: string;
  url?: string | null;
  urlLabel?: string | null;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
        <svg className="w-3.5 h-3.5 text-neutral-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">Message Center</span>
      </div>
      <div className="px-4 py-4">
        <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
          {header?.trim() || <span className="text-neutral-400 font-bold italic">Message header</span>}
        </h2>
        {hasBody ? (
          <div
            className="cs-message-body text-sm text-neutral-700 mt-1.5 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderedBody }}
          />
        ) : (
          <div className="mt-1.5">
            <EmptyHint>Add a message above to preview it here.</EmptyHint>
          </div>
        )}
        {url?.trim() && (
          <span className="cs-message-cta">
            <span>{urlLabel?.trim() || 'Learn more'}</span>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
