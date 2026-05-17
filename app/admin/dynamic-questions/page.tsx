'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import RichTextEditor from '../../../components/notes/RichTextEditor';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FieldType = 'text' | 'textarea' | 'dropdown' | 'multiselect' | 'checkbox' | 'radio';

type Question = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: FieldType;
  options: Array<string | { label: string; value: string }>;
  required: boolean;
  active_from: string | null;
  active_to: string | null;
  sort_order: number;
  show_when_did_not_meet: boolean;
  show_when_attended: boolean;
};

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

type VisibilityMode = 'always' | 'range';
type Tab = 'questions' | 'messages';

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'dropdown', 'multiselect', 'checkbox', 'radio'];

function emptyDraft(): Partial<Question> {
  return {
    label: '',
    help_text: '',
    field_type: 'text',
    options: [],
    required: false,
    active_from: null,
    active_to: null,
    sort_order: 0,
    show_when_did_not_meet: false,
    show_when_attended: true,
  };
}

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

function questionStatus(q: Question): 'always' | 'active' | 'upcoming' | 'expired' {
  if (!q.active_from && !q.active_to) return 'always';
  const today = new Date().toISOString().slice(0, 10);
  if (q.active_to && q.active_to < today) return 'expired';
  if (q.active_from && q.active_from > today) return 'upcoming';
  return 'active';
}

function messageStatus(m: Message): 'always' | 'active' | 'upcoming' | 'expired' {
  if (!m.start_date && !m.end_date) return 'always';
  const today = new Date().toISOString().slice(0, 10);
  if (m.end_date && m.end_date < today) return 'expired';
  if (m.start_date && m.start_date > today) return 'upcoming';
  return 'active';
}

const STATUS_STYLES = {
  always: 'bg-emerald-500/20 text-emerald-300',
  active: 'bg-sky-500/20 text-sky-300',
  upcoming: 'bg-violet-500/20 text-violet-300',
  expired: 'bg-slate-600/50 text-slate-400',
};

export default function DynamicQuestionsAdminPage() {
  const [tab, setTab] = useState<Tab>('questions');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Circle Summary Admin</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure the questions leaders answer and the messages they see on the events page.
          </p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-slate-700">
          <TabButton active={tab === 'questions'} onClick={() => setTab('questions')}>
            Dynamic Questions
          </TabButton>
          <TabButton active={tab === 'messages'} onClick={() => setTab('messages')}>
            Message Center
          </TabButton>
        </div>

        {tab === 'questions' && <QuestionsPanel token={token} />}
        {tab === 'messages' && <MessagesPanel token={token} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active
          ? 'text-white border-indigo-400'
          : 'text-slate-400 border-transparent hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Questions Panel (existing behavior, extracted)
   ──────────────────────────────────────────────────────────────────────── */

function QuestionsPanel({ token }: { token: string | null }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Question> | null>(null);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>('always');
  const [optionsText, setOptionsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    refresh();
  }, [token]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dynamic-questions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      setQuestions(data.questions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setDraft(emptyDraft());
    setVisibilityMode('always');
    setOptionsText('');
  }

  function startEdit(q: Question) {
    setDraft({ ...q });
    setVisibilityMode(q.active_from || q.active_to ? 'range' : 'always');
    setOptionsText(
      (q.options || [])
        .map((o) => (typeof o === 'string' ? o : `${o.label}|${o.value}`))
        .join('\n')
    );
  }

  function cancelEdit() {
    setDraft(null);
    setOptionsText('');
  }

  function setMode(mode: VisibilityMode) {
    setVisibilityMode(mode);
    if (mode === 'always') {
      setDraft((d) => (d ? { ...d, active_from: null, active_to: null } : d));
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.label || !draft.field_type) {
      setError('Label and field type are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const opts = optionsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value] = line.split('|').map((s) => s.trim());
        return value ? { label, value } : line;
      });

    const payload = {
      ...draft,
      options: opts,
      active_from: visibilityMode === 'always' ? null : draft.active_from || null,
      active_to: visibilityMode === 'always' ? null : draft.active_to || null,
    };

    try {
      const method = (draft as Question).id ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/dynamic-questions', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      cancelEdit();
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this question? Leaders will stop seeing it on new submissions.')) return;
    const res = await fetch(`/api/admin/dynamic-questions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Delete failed.');
      return;
    }
    refresh();
  }

  const needsOptions =
    draft?.field_type === 'dropdown' ||
    draft?.field_type === 'multiselect' ||
    draft?.field_type === 'radio';

  const activeCount = questions.filter((q) => {
    const s = questionStatus(q);
    return s === 'always' || s === 'active';
  }).length;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">
          Questions leaders answer on the Circle Summary form.
        </p>
        {!draft && (
          <button
            onClick={startNew}
            className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New question
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {!loading && !draft && activeCount === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
          <div>
            <p className="text-amber-300 text-sm font-medium">No active questions</p>
            <p className="text-amber-400/80 text-xs mt-0.5">
              Leaders will see a blank form with nothing to fill out. Add at least one question to
              make the Circle Summary form useful.
            </p>
          </div>
        </div>
      )}

      {draft && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-card-glass mb-6">
          <h2 className="text-base font-semibold text-white mb-4">
            {(draft as Question).id ? 'Edit question' : 'New question'}
          </h2>
          <div className="space-y-4">
            <Field label="Label" required>
              <input
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.label || ''}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <Field label="Help text">
              <input
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.help_text || ''}
                onChange={(e) => setDraft({ ...draft, help_text: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Field type" required>
                <select
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={draft.field_type}
                  onChange={(e) =>
                    setDraft({ ...draft, field_type: e.target.value as FieldType })
                  }
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sort order">
                <input
                  type="number"
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={draft.sort_order ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: parseInt(e.target.value || '0', 10) })
                  }
                />
              </Field>
            </div>
            {needsOptions && (
              <Field
                label="Options"
                hint="One per line. Use `Label|value` for distinct value, or just `Label` for both."
              >
                <textarea
                  rows={4}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder={'Yes\nNo\nNot sure'}
                />
              </Field>
            )}

            <Field label="Visibility">
              <div className="flex gap-4 text-sm text-slate-300 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visibilityMode"
                    checked={visibilityMode === 'always'}
                    onChange={() => setMode('always')}
                  />
                  Always show
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visibilityMode"
                    checked={visibilityMode === 'range'}
                    onChange={() => setMode('range')}
                  />
                  Active between dates
                </label>
              </div>
              {visibilityMode === 'range' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Start date (required)</p>
                    <input
                      type="date"
                      className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={draft.active_from || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, active_from: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      End date (optional — leave blank for no end)
                    </p>
                    <input
                      type="date"
                      className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={draft.active_to || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, active_to: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              )}
            </Field>

            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.required}
                  onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                />
                Required
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.show_when_attended !== false}
                  onChange={(e) => setDraft({ ...draft, show_when_attended: e.target.checked })}
                />
                Show when Circle met
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.show_when_did_not_meet}
                  onChange={(e) =>
                    setDraft({ ...draft, show_when_did_not_meet: e.target.checked })
                  }
                />
                Show when Circle didn't meet
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="animate-pulse bg-slate-700 rounded-xl h-16" />
          <div className="animate-pulse bg-slate-700 rounded-xl h-16" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <p className="text-slate-400 text-sm">No dynamic questions yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Click "New question" to add one to the Circle Summary form.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => {
            const status = questionStatus(q);
            return (
              <div
                key={q.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{q.label}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}
                    >
                      {status}
                    </span>
                    <span className="bg-indigo-500/20 text-indigo-300 text-xs font-medium px-2 py-0.5 rounded-full">
                      {q.field_type}
                    </span>
                    {q.required && (
                      <span className="bg-amber-500/20 text-amber-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        required
                      </span>
                    )}
                    {!q.show_when_attended && (
                      <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">
                        DNM only
                      </span>
                    )}
                  </div>
                  {q.help_text && (
                    <p className="text-xs text-slate-400 mt-1">{q.help_text}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    sort #{q.sort_order}
                    {q.active_from && ` · from ${q.active_from}`}
                    {q.active_to && ` · to ${q.active_to}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(q)}
                    className="text-slate-300 hover:text-white text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(q.id)}
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

/* ──────────────────────────────────────────────────────────────────────────
   Messages Panel (new — Message Center)
   ──────────────────────────────────────────────────────────────────────── */

function MessagesPanel({ token }: { token: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Message> | null>(null);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>('always');
  const [position, setPosition] = useState(1); // 1-based desired slot
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    refresh();
    fetchCampuses();
  }, [token]);

  async function fetchCampuses() {
    try {
      const { data, error } = await supabase
        .from('campuses')
        .select('value')
        .order('value');
      if (error) throw error;
      setCampuses((data || []).map((c: any) => c.value).filter(Boolean));
    } catch {
      // non-fatal
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/circle-summary-messages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      setMessages(data.messages || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setDraft(emptyMessage());
    setVisibilityMode('always');
    // New messages default to the bottom of the list.
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');

      // Build the new ordering with the saved message at the chosen position,
      // then send a single bulk reorder so priorities reflect what the admin picked.
      const savedId: string = data.message?.id;
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
    } catch (e: any) {
      setError(e.message);
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
    const data = await res.json();
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
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-card-glass mb-6">
          <h2 className="text-base font-semibold text-white mb-4">
            {(draft as Message).id ? 'Edit message' : 'New message'}
          </h2>
          <div className="space-y-4">
            <Field label="Header" required>
              <input
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.header || ''}
                onChange={(e) => setDraft({ ...draft, header: e.target.value })}
                placeholder="e.g. Holiday schedule update"
              />
            </Field>

            <Field label="Message" hint="Rich text — supports bold, italics, lists, and inline links.">
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
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={draft.url || ''}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Button label" hint='Defaults to "Learn more" if blank.'>
                <input
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                <p className="text-xs text-slate-500">Loading campuses…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {campuses.map((c) => {
                    const checked = (draft.campus_filter || []).includes(c);
                    return (
                      <label
                        key={c}
                        className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          checked
                            ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                            : 'bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700'
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
                      className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="w-48 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                className="text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="animate-pulse bg-slate-700 rounded-xl h-16" />
          <div className="animate-pulse bg-slate-700 rounded-xl h-16" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <p className="text-slate-400 text-sm">No messages yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Click "New message" to post one to the Circle Summary events page.
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
                className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start justify-between gap-4"
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
                      <span className="bg-indigo-500/20 text-indigo-300 text-xs font-medium px-2 py-0.5 rounded-full">
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
                    {m.start_date && ` · from ${m.start_date}`}
                    {m.end_date && ` · to ${m.end_date}`}
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
