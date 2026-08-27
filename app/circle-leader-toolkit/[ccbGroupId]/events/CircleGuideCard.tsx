import type { CircleGuideLink } from '../../../../lib/circle-leader-toolkit/circle-guide';

/**
 * Links out to the newest Circle Guide on valleycreek.plus.
 *
 * Deliberately matches the Message Center card it sits under rather than using
 * `cs-card` — the two are adjacent, and `cs-card` has a tighter radius and a
 * softer shadow, so mixing them reads as a mistake.
 *
 * Presentational only. The eyebrow and formatted date are resolved server-side
 * (see readCircleGuideLink) so the viewer's timezone can't cause a hydration
 * mismatch.
 */
export default function CircleGuideCard({ guide }: { guide: CircleGuideLink }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
        <svg className="w-3.5 h-3.5 text-neutral-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C10.5 5.2 8.4 4.5 6 4.5H4v13h2c2.4 0 4.5.7 6 2m0-13c1.5-1.3 3.6-2 6-2h2v13h-2c-2.4 0-4.5.7-6 2m0-13v13" />
        </svg>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">
          {guide.eyebrow}
        </span>
      </div>

      <div className="px-4 py-4">
        <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
          {guide.title ?? 'Every Circle Guide, newest first'}
        </h2>
        {guide.dateDisplay && (
          <p className="text-xs text-neutral-500 mt-1">{guide.dateDisplay}</p>
        )}
        <a
          href={guide.url}
          target="_blank"
          rel="noopener noreferrer"
          className="cs-message-cta"
        >
          <span>{guide.title ? 'Open the guide' : 'Browse the guides'}</span>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  );
}
