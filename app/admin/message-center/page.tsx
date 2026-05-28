'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import RichTextEditor from '../../../components/notes/RichTextEditor';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Message = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
  campus_filter: string[];
  start_date: string | null;
  end_date: string | null;
  priority: number;
};

type CampusRow = {
  value: string | null;
};

type VisibilityMode = 'always' | 'range';

const STATUS_STYLES = {
  always: 'bg-emerald-500/20 text-emerald-300',
  active: 'bg-sky-500/20 text-sky-300',
  upcoming: 'bg-violet-500/20 text-violet-300',
  expired: 'bg-zinc-600/50 text-slate-400',
};

function emptyMessage(): Partial<Message> {
  return {
    header: '',
    body_html: '',
    url: '',
    url_label: '',
    campus_filter: [],
    start_date: null,
    end_date: null,
    priority: 0,
  };
}

function messageStatus(m: Message): 'always' | 'active' | 'upcoming' | 'expired' {
  if (!m.start_date && !m.end_date) return 'always';
  const today = new Date().toISOString().slice(0, 10);
  if (m.end_date && m.end_date < today) return 'expired';
  if (m.start_date && m.start_date > today) return 'upcoming';
  return 'active';
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error ? error.message : fallback;
}

export default function MessageCenterAdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Message Center</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage banner messages shown on the Circle Summary events page.
          </p>
        </div>

        <MessagesPanel token={token} />
      </div>
    </div>
  );
}

function MessagesPanel({ token }: { token: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Message> | null>(null);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>('always');
  const [position, setPosition] = useState(1);
  const [saving, setSaving] = useState(false);

  const fetchCampuses = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('campuses').select('value').order('value');
      if (error) throw error;
      const rows = (data || []) as CampusRow[];
      setCampuses(rows.map((c) => c.value).filter((value): value is string => Boolean(value)));
    } catch {
      // Non-fatal: admins can still create all-campus messages.
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/circle-summary-messages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { messages?: Message[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      setMessages(data.messages || []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refresh();
    fetchCampuses();
  }, [token, refresh, fetchCampuses]);

  function startNew() {
    setDraft(emptyMessage());
    setVisibilityMode('always');
    setPosition(messages.length + 1);
  }

  function startEdit(m: Message) {
    setDraft({ ...m });
    setVisibilityMode(m.start_date || m.end_date ? 'range' : 'always');
    const idx = messages.findIndex((x) => x.id === m.id);
    setPosition(idx >= 0 ? idx + 1 : messages.length);
  }

  function cancelEdit() {
    setDraft(null);
  }

  function setMode(mode: VisibilityMode) {
    setVisibilityMode(mode);
    if (mode === 'always') {
      setDraft((d) => (d ? { ...d, start_date: null, end_date: null } : d));
    }
  }

  function toggleCampus(campus: string) {
    setDraft((d) => {
      if (!d) return d;
      const cur = d.campus_filter || [];
      return {
        ...d,
        campus_filter: cur.includes(campus)
          ? cur.filter((c) => c !== campus)
          : [...cur, campus],
      };
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.header?.trim()) {
      setError('Header is required.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      ...draft,
      url: draft.url?.trim() || null,
      url_label: draft.url_label?.trim() || null,
      campus_filter: draft.campus_filter || [],
      start_date: visibilityMode === 'always' ? null : draft.start_date || null,
      end_date: visibilityMode === 'always' ? null : draft.end_date || null,
      priority: Number(draft.priority) || 0,
    };

    try {
      const isEdit = !!(draft as Message).id;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/circle-summary-messages', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { message?: Message; error?: string };
      if (!res.ok) throw new Error(data.error || 'Save failed.');

      const savedId = data.message?.id;
      if (!savedId) throw new Error('Save failed.');

      const remaining = messages.filter((m) => m.id !== savedId);
      const insertAt = Math.max(0, Math.min(remaining.length, position - 1));
      const orderedIds = [
        ...remaining.slice(0, insertAt).map((m) => m.id),
        savedId,
        ...remaining.slice(insertAt).map((m) => m.id),
      ];

      if (orderedIds.length > 1) {
        await fetch('/api/admin/circle-summary-messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderedIds }),
        });
      }

      cancelEdit();
      refresh();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  }

  function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  async function remove(id: string) {
    if (!confirm('Delete this message? Leaders will stop seeing it immediately.')) return;
    const res = await fetch(`/api/admin/circle-summary-messages?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || 'Delete failed.');
      return;
    }
    refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">
          Banner messages shown on the Circle Summary events page. Higher priority shows first.
        </p>
        {!draft && (
          <button
            onClick={startNew}
            className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New message
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {draft && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 shadow-card-glass mb-6">
          <h2 className="text-base font-semibold text-white mb-4">
            {(draft as Message).id ? 'Edit message' : 'New message'}
          </h2>
          <div className="space-y-4">
            <Field label="Header" required>
              <input
                className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                value={draft.header || ''}
                onChange={(e) => setDraft({ ...draft, header: e.target.value })}
                placeholder="e.g. Holiday schedule update"
              />
            </Field>

            <Field label="Message" hint="Rich text - supports bold, italics, lists, and inline links.">
              <div className="rte-on-dark">
                <RichTextEditor
                  value={draft.body_html || ''}
                  onChange={(html) => setDraft({ ...draft, body_html: html })}
                  placeholder="What do you want leaders to know?"
                  minHeight="120px"
                />
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Call-to-action URL" hint="Optional link button.">
                <input
                  type="url"
                  className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                  value={draft.url || ''}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Button label" hint='Defaults to "Learn more" if blank.'>
                <input
                  className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                  value={draft.url_label || ''}
                  onChange={(e) => setDraft({ ...draft, url_label: e.target.value })}
                  placeholder="Learn more"
                />
              </Field>
            </div>

            <Field
              label="Campus filter"
              hint="Leave all unchecked to show to every leader."
            >
              {campuses.length === 0 ? (
                <p className="text-xs text-slate-500">Loading campuses...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {campuses.map((c) => {
                    const checked = (draft.campus_filter || []).includes(c);
                    return (
                      <label
                        key={c}
                        className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          checked
                            ? 'bg-vc-500/20 text-vc-200 border-vc-500/40'
                            : 'bg-zinc-700/50 text-slate-300 border-zinc-600 hover:bg-zinc-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() => toggleCampus(c)}
                        />
                        {c}
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>

            <Field label="Visibility">
              <div className="flex gap-4 text-sm text-slate-300 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="msgVisibilityMode"
                    checked={visibilityMode === 'always'}
                    onChange={() => setMode('always')}
                  />
                  Always show
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="msgVisibilityMode"
                    checked={visibilityMode === 'range'}
                    onChange={() => setMode('range')}
                  />
                  Active between dates
                </label>
              </div>
              {visibilityMode === 'range' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Start date</p>
                    <input
                      type="date"
                      className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                      value={draft.start_date || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, start_date: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-500">End date (optional)</p>
                      {draft.end_date && (
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, end_date: null })}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                      value={draft.end_date || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, end_date: e.target.value || null })
                      }
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Leave blank to keep showing indefinitely.
                    </p>
                  </div>
                </div>
              )}
            </Field>

            {(() => {
              const isEdit = !!(draft as Message).id;
              const slots = isEdit ? Math.max(1, messages.length) : messages.length + 1;
              if (slots <= 1) return null;
              return (
                <Field
                  label="Display order"
                  hint="Where this message appears when multiple are active."
                >
                  <select
                    className="w-48 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                    value={position}
                    onChange={(e) => setPosition(parseInt(e.target.value, 10))}
                  >
                    {Array.from({ length: slots }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Show {ordinal(n)}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })()}

            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="animate-pulse bg-zinc-700 rounded-xl h-16" />
          <div className="animate-pulse bg-zinc-700 rounded-xl h-16" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
          <p className="text-slate-400 text-sm">No messages yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Click &quot;New message&quot; to post one to the Circle Summary events page.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((m, idx) => {
            const status = messageStatus(m);
            const ord = ['1st', '2nd', '3rd'][idx] || `${idx + 1}th`;
            return (
              <div
                key={m.id}
                className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{m.header}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}
                    >
                      {status}
                    </span>
                    {m.campus_filter && m.campus_filter.length > 0 ? (
                      <span className="bg-vc-500/20 text-vc-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        {m.campus_filter.join(', ')}
                      </span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        all campuses
                      </span>
                    )}
                    {m.url && (
                      <span className="bg-sky-500/20 text-sky-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        link
                      </span>
                    )}
                  </div>
                  {m.body_html && (
                    <div
                      className="text-xs text-slate-400 mt-1 line-clamp-2 prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: m.body_html }}
                    />
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Shows {ord}
                    {m.start_date && ` - from ${m.start_date}`}
                    {m.end_date && ` - to ${m.end_date}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(m)}
                    className="text-slate-300 hover:text-white text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
