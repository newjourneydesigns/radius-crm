import ProtectedRoute from '../../components/ProtectedRoute';
import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ChangelogEntry {
  date: string;
  description: string;
  page?: string;
  type?: 'feature' | 'improvement' | 'fix';
}

const badgeConfig = {
  feature:     { label: 'New Feature',  bg: 'rgba(99,102,241,0.15)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.25)'  },
  improvement: { label: 'Improvement',  bg: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: 'rgba(139,92,246,0.25)' },
  fix:         { label: 'Bug Fix',      bg: 'rgba(251,191,36,0.12)',  color: '#fde68a', border: 'rgba(251,191,36,0.25)'  },
} as const;

function getChangelog(): ChangelogEntry[] {
  try {
    const filePath = join(process.cwd(), 'public', 'changelog.json');
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function UpdateLogPage() {
  const entries = getChangelog();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-900">
        <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">

          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Link
              href="/help"
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 -ml-1 rounded-lg hover:bg-slate-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white tracking-tight">Update Log</h1>
              <p className="text-xs text-slate-500 mt-0.5">What's changed in RADIUS</p>
            </div>
          </div>

          {/* Timeline */}
          {entries.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-10 h-10 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <p className="text-slate-500 text-sm">No updates logged yet.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-700/60" />

              <div className="space-y-6">
                {entries.map((entry, index) => (
                  <div key={index} className="flex gap-4 relative">
                    {/* Dot */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center z-10">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    </div>

                    {/* Content */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex-1 shadow-card-glass">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">
                          {formatDate(entry.date)}
                        </p>
                        {entry.type && (() => {
                          const b = badgeConfig[entry.type];
                          return (
                            <span style={{ background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                              {b.label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">{entry.description}</p>
                      {entry.page && (
                        <div className="mt-2">
                          <Link
                            href={entry.page}
                            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            View page
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}
