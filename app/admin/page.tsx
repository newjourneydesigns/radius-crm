'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Cake, CheckCircle2, CircleSlash2, SkipForward, XCircle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface FetchResult {
  id: number;
  name: string;
  ccb_group_id: string;
  status: 'success' | 'error' | 'empty';
  memberCount?: number;
  error?: string;
}

interface ApiResponse {
  success?: boolean;
  dryRun?: boolean;
  nameFilter?: string;
  totalMatching?: number;
  alreadyCached?: number;
  missingRosters?: number;
  attempted?: number;
  succeeded?: number;
  empty?: number;
  failed?: number;
  results?: FetchResult[];
  leaders?: { id: number; name: string; campus?: string; ccb_group_id: string }[];
  message?: string;
  error?: string;
}

interface BirthdayResult {
  id: number;
  name: string;
  birthday: string | null;
  matchType: string;
}

interface BirthdayResponse {
  dryRun?: boolean;
  totalMissing?: number;
  matched?: number;
  unmatched?: number;
  updated?: number;
  failed?: number;
  results?: BirthdayResult[];
  error?: string;
  success?: boolean;
}

export default function AdminPage() {
  const [nameFilter, setNameFilter] = useState('LVT | S1');
  const [includeAll, setIncludeAll] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Birthday backfill state
  const [bdayRunning, setBdayRunning] = useState(false);
  const [bdayDryRunning, setBdayDryRunning] = useState(false);
  const [bdayResponse, setBdayResponse] = useState<BirthdayResponse | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || null);
    });
  }, []);

  async function run(dryRun: boolean) {
    if (dryRun) setIsDryRunning(true);
    else setIsRunning(true);
    setResponse(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch('/api/admin/bulk-fetch-rosters', {
        method: 'POST',
        headers,
        body: JSON.stringify({ nameFilter, includeAll, dryRun }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setResponse({ error: err.message });
    } finally {
      setIsRunning(false);
      setIsDryRunning(false);
    }
  }

  async function runBirthday(dryRun: boolean) {
    if (dryRun) setBdayDryRunning(true);
    else setBdayRunning(true);
    setBdayResponse(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch('/api/admin/backfill-birthdays', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      setBdayResponse(data);
    } catch (err: any) {
      setBdayResponse({ error: err.message });
    } finally {
      setBdayRunning(false);
      setBdayDryRunning(false);
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif', color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <a href="/boards" style={{ fontSize: '13px', color: '#94a3b8', textDecoration: 'none' }}>← Back to Boards</a>
      </div>

      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#f1f5f9' }}>Bulk Fetch Rosters</h1>
      <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '28px' }}>
        Finds circles matching the name filter that have a CCB Group ID but no cached roster, then fetches each from CCB.
      </p>

      <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
            Name filter (case-insensitive substring match)
          </label>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            disabled={includeAll}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '6px',
              background: includeAll ? 'rgba(30, 41, 59, 0.5)' : 'rgba(15, 23, 42, 0.8)',
              color: includeAll ? '#64748b' : '#f1f5f9',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '20px', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={includeAll}
            onChange={(e) => setIncludeAll(e.target.checked)}
          />
          Process ALL leaders missing a roster (ignore name filter)
        </label>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => run(true)}
            disabled={isDryRunning || isRunning}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '6px',
              background: 'rgba(51, 65, 85, 0.6)',
              color: '#e2e8f0',
              cursor: isDryRunning || isRunning ? 'not-allowed' : 'pointer',
              opacity: isDryRunning || isRunning ? 0.5 : 1,
            }}
          >
            {isDryRunning ? 'Checking…' : 'Dry Run (preview only)'}
          </button>
          <button
            onClick={() => run(false)}
            disabled={isRunning || isDryRunning}
            style={{
              padding: '8px 22px',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              borderRadius: '6px',
              background: isRunning || isDryRunning ? '#1e40af' : '#2563eb',
              color: '#fff',
              cursor: isRunning || isDryRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning || isDryRunning ? 0.6 : 1,
            }}
          >
            {isRunning ? 'Fetching… (this may take a few minutes)' : 'Fetch Missing Rosters'}
          </button>
        </div>
      </div>

      {response && (
        <div style={{ border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '10px', overflow: 'hidden' }}>
          {/* Summary bar */}
          <div style={{ background: response.error ? 'rgba(127, 29, 29, 0.3)' : response.dryRun ? 'rgba(30, 58, 95, 0.5)' : 'rgba(20, 83, 45, 0.3)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)', padding: '14px 20px' }}>
            {response.error ? (
              <p style={{ margin: 0, color: '#fca5a5', fontSize: '14px', fontWeight: 600 }}>Error: {response.error}</p>
            ) : response.dryRun ? (
              <div style={{ fontSize: '14px', color: '#cbd5e1' }}>
                <strong style={{ color: '#93c5fd' }}>Dry run</strong> — filter: <code style={{ background: 'rgba(51, 65, 85, 0.8)', padding: '2px 6px', borderRadius: '3px', color: '#e2e8f0' }}>{response.nameFilter}</code>
                <span style={{ margin: '0 10px', color: '#475569' }}>|</span>
                {response.totalMatching} matching &nbsp;·&nbsp; {response.alreadyCached} already cached &nbsp;·&nbsp;
                <strong style={{ color: response.missingRosters! > 0 ? '#fbbf24' : '#4ade80' }}>{response.missingRosters} need fetching</strong>
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: '#cbd5e1', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} color="#4ade80" /><strong style={{ color: '#4ade80' }}>{response.succeeded}</strong> fetched</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><SkipForward size={14} /><strong>{response.alreadyCached}</strong> already cached</span>
                {response.empty! > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CircleSlash2 size={14} color="#fbbf24" /><strong style={{ color: '#fbbf24' }}>{response.empty}</strong> empty</span>}
                {response.failed! > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><XCircle size={14} color="#fca5a5" /><strong style={{ color: '#fca5a5' }}>{response.failed}</strong> failed</span>}
              </div>
            )}
          </div>

          {/* Leader list */}
          {((response.dryRun ? response.leaders : response.results) || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Leader</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Group ID</th>
                  {!response.dryRun && (
                    <>
                      <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Members</th>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(response.dryRun ? response.leaders! : response.results!).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                    <td style={{ padding: '9px 16px', color: '#e2e8f0' }}>
                      <a href={`/circle/${'id' in row ? row.id : (row as any).id}/`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                        {row.name}
                      </a>
                      {'campus' in row && row.campus && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: '#64748b' }}>{row.campus}</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 16px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px' }}>{row.ccb_group_id}</td>
                    {!response.dryRun && 'status' in row && (
                      <>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: '#cbd5e1' }}>
                          {(row as FetchResult).memberCount ?? '—'}
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          {(row as FetchResult).status === 'success' && <span style={{ color: '#4ade80', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} />OK</span>}
                          {(row as FetchResult).status === 'empty' && <span style={{ color: '#fbbf24' }}>Empty</span>}
                          {(row as FetchResult).status === 'error' && (
                            <span style={{ color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '6px' }} title={(row as FetchResult).error}><XCircle size={14} />{(row as FetchResult).error?.slice(0, 60)}</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {response.message && (
            <div style={{ padding: '16px 20px', fontSize: '14px', color: '#cbd5e1' }}>{response.message}</div>
          )}
        </div>
      )}

      {/* ── Birthday Backfill Section ── */}
      <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)', marginTop: '40px', paddingTop: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', color: '#f1f5f9', display: 'inline-flex', alignItems: 'center', gap: '8px' }}><Cake size={20} />Backfill Leader Birthdays</h2>
        <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '20px' }}>
          Matches circle leader names to roster members and copies their birthday from the cached roster data.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button
            onClick={() => runBirthday(true)}
            disabled={bdayDryRunning || bdayRunning}
            style={{
              padding: '8px 18px', fontSize: '13px', fontWeight: 600,
              border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '6px',
              background: 'rgba(51, 65, 85, 0.6)', color: '#e2e8f0',
              cursor: bdayDryRunning || bdayRunning ? 'not-allowed' : 'pointer',
              opacity: bdayDryRunning || bdayRunning ? 0.5 : 1,
            }}
          >
            {bdayDryRunning ? 'Checking…' : 'Dry Run (preview matches)'}
          </button>
          <button
            onClick={() => runBirthday(false)}
            disabled={bdayRunning || bdayDryRunning}
            style={{
              padding: '8px 22px', fontSize: '13px', fontWeight: 700,
              border: 'none', borderRadius: '6px',
              background: bdayRunning || bdayDryRunning ? '#92400e' : '#d97706',
              color: '#fff',
              cursor: bdayRunning || bdayDryRunning ? 'not-allowed' : 'pointer',
              opacity: bdayRunning || bdayDryRunning ? 0.6 : 1,
            }}
          >
            {bdayRunning ? 'Updating…' : 'Backfill Birthdays'}
          </button>
        </div>

        {bdayResponse && (
          <div style={{ border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Summary */}
            <div style={{ background: bdayResponse.error ? 'rgba(127, 29, 29, 0.3)' : bdayResponse.dryRun ? 'rgba(30, 58, 95, 0.5)' : 'rgba(20, 83, 45, 0.3)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)', padding: '14px 20px' }}>
              {bdayResponse.error ? (
                <p style={{ margin: 0, color: '#fca5a5', fontSize: '14px', fontWeight: 600 }}>Error: {bdayResponse.error}</p>
              ) : (
                <div style={{ fontSize: '14px', color: '#cbd5e1', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  {bdayResponse.dryRun && <span style={{ color: '#93c5fd', fontWeight: 700 }}>Dry run</span>}
                  <span><strong>{bdayResponse.totalMissing}</strong> leaders missing birthday</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Cake size={14} /><strong style={{ color: '#4ade80' }}>{bdayResponse.matched}</strong> matched</span>
                  <span style={{ color: '#94a3b8' }}>{bdayResponse.unmatched} unmatched</span>
                  {!bdayResponse.dryRun && bdayResponse.updated !== undefined && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} color="#4ade80" /><strong style={{ color: '#4ade80' }}>{bdayResponse.updated}</strong> updated</span>
                  )}
                  {!bdayResponse.dryRun && (bdayResponse.failed || 0) > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><XCircle size={14} color="#fca5a5" /><strong style={{ color: '#fca5a5' }}>{bdayResponse.failed}</strong> failed</span>
                  )}
                </div>
              )}
            </div>

            {/* Results table */}
            {bdayResponse.results && bdayResponse.results.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Leader</th>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Birthday</th>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#94a3b8' }}>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {bdayResponse.results.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                      <td style={{ padding: '9px 16px', color: '#e2e8f0' }}>
                        <a href={`/circle/${row.id}/`} style={{ color: '#60a5fa', textDecoration: 'none' }}>{row.name}</a>
                      </td>
                      <td style={{ padding: '9px 16px', color: row.birthday ? '#fbbf24' : '#475569', fontFamily: 'monospace', fontSize: '12px' }}>
                        {row.birthday || '—'}
                      </td>
                      <td style={{ padding: '9px 16px' }}>
                        {row.matchType === 'own-roster' && <span style={{ color: '#4ade80', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} />Own roster</span>}
                        {row.matchType === 'cross-roster' && <span style={{ color: '#93c5fd' }}>↗ Cross-roster</span>}
                        {row.matchType === 'no-match' && <span style={{ color: '#475569' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
