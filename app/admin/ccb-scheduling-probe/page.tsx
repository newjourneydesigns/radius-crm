'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * Admin discovery tool for the Teams Toolkit Schedule tab. Click "Run probe"
 * and it asks CCB for a team category's scheduling data across a spread of
 * candidate endpoints, then shows the raw JSON to copy. Read-only.
 */
export default function CcbSchedulingProbePage() {
  const [categoryId, setCategoryId] = useState('238');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  async function runProbe() {
    setLoading(true);
    setError(null);
    setOutput('');
    setCopied(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setError('Not signed in — please sign in again.');
        return;
      }
      const res = await fetch(`/api/ccb/scheduling-probe?category_id=${encodeURIComponent(categoryId.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        return;
      }
      setOutput(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-1">CCB Scheduling Probe</h1>
      <p className="text-sm text-slate-400 mb-6">
        Discovery tool for the Teams Toolkit Schedule tab. Enter a team's CCB scheduling category ID,
        click <strong>Run probe</strong>, then copy the result and send it back. Read-only — it only
        reads from CCB.
      </p>

      <div className="flex items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1" htmlFor="cat">
            Category ID
          </label>
          <input
            id="cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="w-40 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-slate-100"
            placeholder="238"
          />
        </div>
        <button
          type="button"
          onClick={runProbe}
          disabled={loading || !categoryId.trim()}
          className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run probe'}
        </button>
        {output && (
          <button
            type="button"
            onClick={copyOutput}
            className="h-10 rounded-lg border border-zinc-600 bg-zinc-700 px-4 text-sm font-semibold text-slate-100 hover:bg-zinc-600"
          >
            {copied ? 'Copied!' : 'Copy result'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-700/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {output && (
        <textarea
          readOnly
          value={output}
          className="h-[28rem] w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs text-slate-200"
        />
      )}
    </div>
  );
}
