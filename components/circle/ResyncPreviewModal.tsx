'use client';

export interface ResyncChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Confirmation step for "Re-sync from CCB": shows each field CCB would change,
 * with a tick per row. CCB is authoritative for the meeting details but not for
 * everything — a circle led by a couple keeps the RADIUS name, not the single
 * main leader CCB has on the group — so this can't be all-or-nothing.
 */
export default function ResyncPreviewModal({
  changes,
  selected,
  onToggle,
  onCancel,
  onApply,
  isApplying,
}: {
  changes: ResyncChange[];
  selected: Set<string>;
  onToggle: (field: string) => void;
  onCancel: () => void;
  onApply: () => void;
  isApplying: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[10002] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-brand-dark border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700">
          <h3 className="text-base font-semibold text-white">Confirm CCB Sync</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            {selected.size} of {changes.length} change{changes.length !== 1 ? 's' : ''} selected. Untick anything
            CCB has wrong.
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-6 py-4">
          <div className="space-y-1">
            {changes.map((c) => {
              const checked = selected.has(c.field);
              return (
                <label
                  key={c.field}
                  className={`flex gap-3 text-sm rounded-lg px-2 py-2 cursor-pointer transition-colors hover:bg-zinc-700/40 ${
                    checked ? '' : 'opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(c.field)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-700 text-vc-500 focus:ring-vc-500"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-400 mb-1">{c.label}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-1 rounded bg-red-500/10 text-red-300 line-through break-all">{c.from}</span>
                      <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <span className="px-2 py-1 rounded bg-green-500/10 text-green-300 break-all">{c.to}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isApplying}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={isApplying || selected.size === 0}
            title={selected.size === 0 ? 'Select at least one change to apply' : undefined}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.30)', color: 'rgba(147,197,253,1)' }}
          >
            {isApplying ? (
              <div className="w-3.5 h-3.5 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {isApplying ? 'Applying…' : `Apply ${selected.size} Change${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
