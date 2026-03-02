'use client';

import { useState } from 'react';

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

export default function AdminPage() {
  const [nameFilter, setNameFilter] = useState('LVT | S1');
  const [includeAll, setIncludeAll] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  async function run(dryRun: boolean) {
    if (dryRun) setIsDryRunning(true);
    else setIsRunning(true);
    setResponse(null);

    try {
      const res = await fetch('/api/admin/bulk-fetch-rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '24px' }}>
        <a href="/dashboard" style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none' }}>← Back to Dashboard</a>
      </div>

      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>Bulk Fetch Rosters</h1>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '28px' }}>
        Finds circles matching the name filter that have a CCB Group ID but no cached roster, then fetches each from CCB.
      </p>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
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
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: includeAll ? '#f3f4f6' : '#fff',
              color: includeAll ? '#9ca3af' : '#111',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '20px' }}>
          <input
            type="checkbox"
            checked={includeAll}
            onChange={(e) => setIncludeAll(e.target.checked)}
          />
          Process ALL leaders missing a roster (ignore name filter)
        </label>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => run(true)}
            disabled={isDryRunning || isRunning}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: '#fff',
              cursor: isDryRunning || isRunning ? 'not-allowed' : 'pointer',
              opacity: isDryRunning || isRunning ? 0.6 : 1,
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
              background: isRunning || isDryRunning ? '#93c5fd' : '#1d4ed8',
              color: '#fff',
              cursor: isRunning || isDryRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {isRunning ? 'Fetching… (this may take a few minutes)' : 'Fetch Missing Rosters'}
          </button>
        </div>
      </div>

      {response && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
          {/* Summary bar */}
          <div style={{ background: response.error ? '#fef2f2' : '#f0fdf4', borderBottom: '1px solid #e5e7eb', padding: '14px 20px' }}>
            {response.error ? (
              <p style={{ margin: 0, color: '#dc2626', fontSize: '14px' }}>Error: {response.error}</p>
            ) : response.dryRun ? (
              <div style={{ fontSize: '14px', color: '#374151' }}>
                <strong>Dry run</strong> — filter: <code style={{ background: '#e5e7eb', padding: '1px 5px', borderRadius: '3px' }}>{response.nameFilter}</code>
                <span style={{ margin: '0 10px', color: '#d1d5db' }}>|</span>
                {response.totalMatching} matching &nbsp;·&nbsp; {response.alreadyCached} already cached &nbsp;·&nbsp;
                <strong style={{ color: response.missingRosters! > 0 ? '#d97706' : '#16a34a' }}> {response.missingRosters} need fetching</strong>
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: '#374151', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                <span>✅ <strong>{response.succeeded}</strong> fetched</span>
                <span>⏭️ <strong>{response.alreadyCached}</strong> already cached</span>
                {response.empty! > 0 && <span>🔲 <strong>{response.empty}</strong> empty</span>}
                {response.failed! > 0 && <span style={{ color: '#dc2626' }}>❌ <strong>{response.failed}</strong> failed</span>}
              </div>
            )}
          </div>

          {/* Leader list */}
          {((response.dryRun ? response.leaders : response.results) || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#374151' }}>Leader</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#374151' }}>Group ID</th>
                  {!response.dryRun && (
                    <>
                      <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 600, color: '#374151' }}>Members</th>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#374151' }}>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(response.dryRun ? response.leaders! : response.results!).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 16px', color: '#111827' }}>
                      <a href={`/circle/${'id' in row ? row.id : (row as any).id}/`} style={{ color: '#1d4ed8', textDecoration: 'none' }}>
                        {row.name}
                      </a>
                      {'campus' in row && row.campus && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af' }}>{row.campus}</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 16px', color: '#6b7280', fontFamily: 'monospace' }}>{row.ccb_group_id}</td>
                    {!response.dryRun && 'status' in row && (
                      <>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: '#374151' }}>
                          {(row as FetchResult).memberCount ?? '—'}
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          {(row as FetchResult).status === 'success' && <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ OK</span>}
                          {(row as FetchResult).status === 'empty' && <span style={{ color: '#d97706' }}>Empty</span>}
                          {(row as FetchResult).status === 'error' && (
                            <span style={{ color: '#dc2626' }} title={(row as FetchResult).error}>❌ {(row as FetchResult).error?.slice(0, 60)}</span>
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
            <div style={{ padding: '16px 20px', fontSize: '14px', color: '#374151' }}>{response.message}</div>
          )}
        </div>
      )}
    </div>
  );
}
