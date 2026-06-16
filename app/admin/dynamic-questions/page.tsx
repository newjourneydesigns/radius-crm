'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  DID_NOT_MEET_NOTES_KEY,
  DID_NOT_MEET_REASON_KEY,
  DYNAMIC_RESPONSE_KEY,
  type QuestionResponseKey,
} from '../../../lib/circle-leader-toolkit/dynamic-question-response-keys';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FieldType = 'text' | 'textarea' | 'dropdown' | 'multiselect' | 'checkbox' | 'radio';

type QuestionOption = {
  label: string;
  value: string;
  followup_label?: string;
  followup_required?: boolean;
};

type EditableOption = QuestionOption & {
  id: string;
  followup_enabled: boolean;
};

type Question = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: FieldType;
  options: Array<string | QuestionOption>;
  required: boolean;
  active_from: string | null;
  active_to: string | null;
  sort_order: number;
  response_key: QuestionResponseKey;
  show_when_did_not_meet: boolean;
  show_when_attended: boolean;
};

type VisibilityMode = 'always' | 'range';

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
    response_key: DYNAMIC_RESPONSE_KEY,
    show_when_did_not_meet: false,
    show_when_attended: true,
  };
}

function questionStatus(q: Question): 'always' | 'active' | 'upcoming' | 'expired' {
  if (!q.active_from && !q.active_to) return 'always';
  const today = new Date().toISOString().slice(0, 10);
  if (q.active_to && q.active_to < today) return 'expired';
  if (q.active_from && q.active_from > today) return 'upcoming';
  return 'active';
}

const STATUS_STYLES = {
  always: 'bg-emerald-500/20 text-emerald-300',
  active: 'bg-sky-500/20 text-sky-300',
  upcoming: 'bg-violet-500/20 text-violet-300',
  expired: 'bg-zinc-600/50 text-slate-400',
};

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error ? error.message : fallback;
}

function normalizeOption(option: Question['options'][number]): QuestionOption {
  if (typeof option === 'string') return { label: option, value: option };
  return { ...option, value: option.value || option.label };
}

function createEditableOption(option?: Partial<QuestionOption>): EditableOption {
  const label = option?.label || '';
  const value = option?.value || label;
  const followupLabel = option?.followup_label || '';
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    value,
    followup_label: followupLabel,
    followup_required: !!option?.followup_required,
    followup_enabled: !!(followupLabel || option?.followup_required),
  };
}

function optionsToEditableRows(options: Question['options'] | undefined): EditableOption[] {
  return (options || []).map((option) => createEditableOption(normalizeOption(option)));
}

function editableRowsToOptions(rows: EditableOption[]): QuestionOption[] {
  return rows
    .map((row) => ({
      label: row.label.trim(),
      value: (row.value || row.label).trim(),
      followup_label: row.followup_enabled ? row.followup_label?.trim() || '' : '',
      followup_required: row.followup_enabled ? !!row.followup_required : false,
      followup_enabled: row.followup_enabled,
    }))
    .filter((row) => row.label)
    .map((row) => ({
      label: row.label,
      value: row.value || row.label,
      ...(row.followup_label ? { followup_label: row.followup_label } : {}),
      ...(row.followup_enabled ? { followup_required: row.followup_required } : {}),
    }));
}

const RESPONSE_KEY_LABELS: Record<QuestionResponseKey, string> = {
  [DYNAMIC_RESPONSE_KEY]: 'Standard response',
  [DID_NOT_MEET_REASON_KEY]: 'Did not meet reason',
  [DID_NOT_MEET_NOTES_KEY]: 'Did not meet notes',
};

export default function DynamicQuestionsAdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Circle Summary Questions</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure the questions leaders answer on the Circle Summary form.
          </p>
        </div>

        <QuestionsPanel token={token} />
      </div>
    </div>
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
  const [optionRows, setOptionRows] = useState<EditableOption[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dynamic-questions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      setQuestions(data.questions || []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refresh();
  }, [token, refresh]);

  function startNew() {
    setDraft(emptyDraft());
    setVisibilityMode('always');
    setOptionRows([]);
  }

  function startEdit(q: Question) {
    setDraft({ ...q });
    setVisibilityMode(q.active_from || q.active_to ? 'range' : 'always');
    setOptionRows(optionsToEditableRows(q.options));
  }

  function cancelEdit() {
    setDraft(null);
    setOptionRows([]);
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

    const opts = editableRowsToOptions(optionRows);

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
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Save failed.'));
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
    draft?.field_type === 'checkbox' ||
    draft?.field_type === 'radio';

  function addOption(option?: Partial<QuestionOption>) {
    setOptionRows((rows) => [...rows, createEditableOption(option)]);
  }

  function addOtherOption() {
    addOption({
      label: 'Other',
      value: 'Other',
      followup_label: 'Tell us more',
      followup_required: true,
    });
  }

  function updateOption(id: string, patch: Partial<EditableOption>) {
    setOptionRows((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if ('label' in patch && (!row.value || row.value === row.label)) {
          next.value = patch.label || '';
        }
        if (patch.followup_enabled === false) {
          next.followup_label = '';
          next.followup_required = false;
        }
        return next;
      })
    );
  }

  function removeOption(id: string) {
    setOptionRows((rows) => rows.filter((row) => row.id !== id));
  }

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
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 shadow-card-glass mb-6">
          <h2 className="text-base font-semibold text-white mb-4">
            {(draft as Question).id ? 'Edit question' : 'New question'}
          </h2>
          <div className="space-y-4">
            <Field label="Label" required>
              <input
                className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                value={draft.label || ''}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <Field label="Help text">
              <input
                className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                value={draft.help_text || ''}
                onChange={(e) => setDraft({ ...draft, help_text: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Field type" required>
                <select
                  className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
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
              <Field label="Response purpose">
                <select
                  className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                  value={draft.response_key || DYNAMIC_RESPONSE_KEY}
                  onChange={(e) => {
                    const responseKey = e.target.value as QuestionResponseKey;
                    setDraft({
                      ...draft,
                      response_key: responseKey,
                      show_when_did_not_meet:
                        responseKey === DYNAMIC_RESPONSE_KEY ? draft.show_when_did_not_meet : true,
                      show_when_attended:
                        responseKey === DYNAMIC_RESPONSE_KEY ? draft.show_when_attended : false,
                    });
                  }}
                >
                  {Object.entries(RESPONSE_KEY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Sort order">
                <input
                  type="number"
                  className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
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
                hint="Use follow-up text when an option should ask for extra details after it is selected."
              >
                <div className="space-y-3">
                  {optionRows.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-600 px-3 py-4 text-sm text-slate-400">
                      No options yet.
                    </div>
                  )}
                  {optionRows.map((option, index) => (
                    <div
                      key={option.id}
                      className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Option {index + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeOption(option.id)}
                          className="text-xs text-red-300 hover:text-red-200"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Label</label>
                          <input
                            className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                            value={option.label}
                            onChange={(e) => updateOption(option.id, { label: e.target.value })}
                            placeholder="Other"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Stored value</label>
                          <input
                            className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                            value={option.value}
                            onChange={(e) => updateOption(option.id, { value: e.target.value })}
                            placeholder="Other"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={option.followup_enabled}
                          onChange={(e) =>
                            updateOption(option.id, {
                              followup_enabled: e.target.checked,
                              followup_label: e.target.checked
                                ? option.followup_label || 'Tell us more'
                                : '',
                              followup_required: e.target.checked
                                ? option.followup_required
                                : false,
                            })
                          }
                        />
                        Add text field when this option is selected
                      </label>
                      {option.followup_enabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              Text field title
                            </label>
                            <input
                              className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                              value={option.followup_label || ''}
                              onChange={(e) =>
                                updateOption(option.id, { followup_label: e.target.value })
                              }
                              placeholder="Tell us more"
                            />
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 pb-2">
                            <input
                              type="checkbox"
                              checked={!!option.followup_required}
                              onChange={(e) =>
                                updateOption(option.id, {
                                  followup_required: e.target.checked,
                                })
                              }
                            />
                            Required
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addOption()}
                      className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
                    >
                      + Add option
                    </button>
                    <button
                      type="button"
                      onClick={addOtherOption}
                      className="bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                    >
                      + Add Other with text field
                    </button>
                  </div>
                </div>
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
                      className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
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
                      className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
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
                Show when Circle didn&apos;t meet
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
      ) : questions.length === 0 ? (
        <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
          <p className="text-slate-400 text-sm">No dynamic questions yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Click &quot;New question&quot; to add one to the Circle Summary form.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => {
            const status = questionStatus(q);
            return (
              <div
                key={q.id}
                className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{q.label}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}
                    >
                      {status}
                    </span>
                    <span className="bg-vc-500/20 text-vc-300 text-xs font-medium px-2 py-0.5 rounded-full">
                      {q.field_type}
                    </span>
                    {q.response_key && q.response_key !== DYNAMIC_RESPONSE_KEY && (
                      <span className="bg-fuchsia-500/20 text-fuchsia-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        {RESPONSE_KEY_LABELS[q.response_key]}
                      </span>
                    )}
                    {q.required && (
                      <span className="bg-amber-500/20 text-amber-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        required
                      </span>
                    )}
                    {!q.show_when_attended && (
                      <span className="bg-zinc-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">
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
