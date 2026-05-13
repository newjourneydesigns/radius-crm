'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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

export default function DynamicQuestionsAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Question> | null>(null);
  const [optionsText, setOptionsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

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
    setOptionsText('');
  }
  function startEdit(q: Question) {
    setDraft({ ...q });
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
      active_from: draft.active_from || null,
      active_to: draft.active_to || null,
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

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Dynamic Questions</h1>
            <p className="text-sm text-slate-400 mt-1">
              Questions leaders answer on the Circle Summary form.
            </p>
          </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Active from">
                  <input
                    type="date"
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={draft.active_from || ''}
                    onChange={(e) => setDraft({ ...draft, active_from: e.target.value || null })}
                  />
                </Field>
                <Field label="Active to">
                  <input
                    type="date"
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={draft.active_to || ''}
                    onChange={(e) => setDraft({ ...draft, active_to: e.target.value || null })}
                  />
                </Field>
              </div>
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
            {questions.map((q) => (
              <div
                key={q.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{q.label}</span>
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
                    {q.active_from && ` • from ${q.active_from}`}
                    {q.active_to && ` • to ${q.active_to}`}
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
            ))}
          </div>
        )}
      </div>
    </div>
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
