'use client';

import { useEffect, useState } from 'react';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';

type Resource = {
  body_html: string;
  updated_at: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CircleSummaryResourcesPage() {
  useMarkCircleAppEntered();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-leader-toolkit/leader-resources/');
        if (!res.ok) throw new Error('Could not load resources.');
        const data = await res.json();
        if (!cancelled) setResource(data.resource || { body_html: '', updated_at: null });
      } catch (error: unknown) {
        if (!cancelled) setError(getErrorMessage(error, 'Could not load resources.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasContent = !!(resource?.body_html && resource.body_html.trim().length > 0);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {loading && (
        <div className="space-y-2.5">
          <div className="cs-card p-5 space-y-3">
            <div className="cs-skeleton h-4 w-2/3" />
            <div className="cs-skeleton h-3 w-full" />
            <div className="cs-skeleton h-3 w-5/6" />
            <div className="cs-skeleton h-3 w-3/4" />
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="cs-alert cs-alert-warning mt-2">{error}</div>
      )}

      {!loading && !error && !hasContent && (
        <div className="cs-card text-center py-14">
          <svg className="w-10 h-10 mx-auto mb-3 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-neutral-500 font-medium">No resources posted yet</p>
          <p className="text-neutral-400 text-sm mt-1">Check back soon — your team will post helpful resources here.</p>
        </div>
      )}

      {!loading && !error && hasContent && (
        <article
          className="cs-card cs-resources p-5 sm:p-7"
          dangerouslySetInnerHTML={{
            __html: renderMessageHtml(resource!.body_html, { includeYouTubeLink: false }),
          }}
        />
      )}
    </main>
  );
}
