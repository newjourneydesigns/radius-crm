'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { DateTime } from 'luxon';
import { useAuth } from '../../../../contexts/AuthContext';
import { supabase } from '../../../../lib/supabase';
import type { BoardForm, FormField, FormFieldType, BoardColumn, FormSubmission, ProjectBoard } from '../../../../lib/supabase';
import {
  ArrowLeft, Plus, Trash2, GripVertical, ChevronDown,
  Eye, Link2, Check, FileText, Download, Search,
} from 'lucide-react';

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
];

const CARD_MAPPINGS: { value: string; label: string }[] = [
  { value: '', label: 'No mapping (include in description)' },
  { value: 'title', label: 'Card Title' },
  { value: 'description', label: 'Card Description' },
  { value: 'priority', label: 'Card Priority' },
  { value: 'due_date', label: 'Card Due Date' },
  { value: 'assignee', label: 'Card Assignee' },
];

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'];
const LOCKED_TYPE: Array<FormField['maps_to']> = ['priority', 'due_date', 'assignee'];

type Member = { id: string; name: string };

const inputCls =
  'w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-base sm:text-sm text-white placeholder-slate-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-500';
const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400';

let nextFieldNum = 100;

function parseOptionLines(value: string) {
  return value
    .split('\n')
    .map((option) => option.trim())
    .filter(Boolean);
}

function FormEditorInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = params.id as string;

  const [form, setForm] = useState<BoardForm | null>(null);
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [boardMembers, setBoardMembers] = useState<Member[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [boardId, setBoardId] = useState('');
  const [columnId, setColumnId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});

  const [activeTab, setActiveTab] = useState<'edit' | 'submissions'>(
    searchParams.get('tab') === 'submissions' ? 'submissions' : 'edit'
  );
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [subsSearch, setSubsSearch] = useState('');

  const loadColumns = useCallback(async (targetBoardId: string, preferredColumnId?: string) => {
    setLoadingColumns(true);
    try {
      const { data: cols, error: err } = await supabase
        .from('board_columns')
        .select('*')
        .eq('board_id', targetBoardId)
        .order('position');
      if (err) throw err;

      const nextColumns = cols || [];
      setColumns(nextColumns);
      setColumnId(
        preferredColumnId && nextColumns.some((col) => col.id === preferredColumnId)
          ? preferredColumnId
          : nextColumns[0]?.id || ''
      );
    } finally {
      setLoadingColumns(false);
    }
  }, []);

  const fetchForm = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase.from('board_forms').select('*').eq('id', formId).single();
      if (err) throw err;
      if (!data) throw new Error('Form not found');
      setForm(data);
      setTitle(data.title);
      setDescription(data.description || '');
      setBoardId(data.board_id);
      setColumnId(data.column_id);
      setIsActive(data.is_active);
      setFields(data.fields || []);
      setOptionDrafts(
        Object.fromEntries(
          ((data.fields || []) as FormField[])
            .filter((field) => field.type === 'select' && field.maps_to !== 'priority' && field.maps_to !== 'assignee')
            .map((field) => [field.id, (field.options || []).join('\n')])
        )
      );

      const { data: boardsData } = await supabase
        .from('project_boards')
        .select('*')
        .eq('is_archived', false)
        .order('title');
      if (boardsData) setBoards(boardsData);

      await loadColumns(data.board_id, data.column_id);

      // Radius boards are team-shared (no team_id) — every user is a possible
      // assignee, same source the board assignee picker uses (public.users).
      const { data: usersData } = await supabase.from('users').select('id, name').order('name');
      setBoardMembers(((usersData || []) as Member[]).filter((m) => m.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [formId, loadColumns]);

  useEffect(() => {
    if (user) fetchForm();
  }, [user, fetchForm]);

  const fetchSubmissions = useCallback(async () => {
    if (!formId) return;
    setLoadingSubs(true);
    try {
      const { data, error: err } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false });
      if (err) throw err;
      setSubmissions(data || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setLoadingSubs(false);
    }
  }, [formId]);

  useEffect(() => {
    if (user && activeTab === 'submissions') fetchSubmissions();
  }, [user, activeTab, fetchSubmissions]);

  const handleSave = async () => {
    if (!form) return;
    if (!boardId || !columnId) {
      setError('Choose a target board and column before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sanitizedFields = fields.map((field) =>
        field.type === 'select' && field.maps_to !== 'priority' && field.maps_to !== 'assignee'
          ? { ...field, options: parseOptionLines(optionDrafts[field.id] ?? (field.options || []).join('\n')) }
          : field
      );
      const { error: err } = await supabase
        .from('board_forms')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          board_id: boardId,
          column_id: columnId,
          is_active: isActive,
          fields: sanitizedFields,
        })
        .eq('id', form.id);
      if (err) throw err;
      setFields(sanitizedFields);
      setForm((prev) => (prev ? { ...prev, title: title.trim(), description: description.trim() || undefined, board_id: boardId, column_id: columnId, is_active: isActive, fields: sanitizedFields } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // ── Field ops ──
  const addField = () => {
    const id = `field_${++nextFieldNum}_${Date.now()}`;
    setFields((prev) => [...prev, { id, type: 'text', label: 'New Field', required: false, placeholder: '' }]);
    setExpandedField(id);
  };

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
  };

  const removeField = (fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    setOptionDrafts((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    if (expandedField === fieldId) setExpandedField(null);
  };

  const moveField = (from: number, to: number) => {
    if (to < 0 || to >= fields.length) return;
    setFields((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
  };

  const handleMappingChange = (field: FormField, value: string) => {
    const mapping = (value || undefined) as FormField['maps_to'];
    if (mapping === 'priority') {
      updateField(field.id, { maps_to: mapping, type: 'select', options: PRIORITY_OPTIONS });
    } else if (mapping === 'due_date') {
      updateField(field.id, { maps_to: mapping, type: 'date' });
    } else if (mapping === 'assignee') {
      updateField(field.id, { maps_to: mapping, type: 'select', assignee_options: boardMembers });
    } else {
      updateField(field.id, { maps_to: mapping });
    }
  };

  const handleBoardChange = async (nextBoardId: string) => {
    setBoardId(nextBoardId);
    setError(null);
    try {
      await loadColumns(nextBoardId);
    } catch (err) {
      setColumns([]);
      setColumnId('');
      setError(err instanceof Error ? err.message : 'Could not load columns for that board');
    }
  };

  const publicUrl = form ? `${typeof window !== 'undefined' ? window.location.origin : ''}/f/${form.slug}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const exportCsv = () => {
    if (!submissions.length || !fields.length) return;
    const headers = ['Submitted', ...fields.map((f) => f.label)];
    const rows = submissions.map((sub) => [
      DateTime.fromISO(sub.submitted_at).toLocaleString(DateTime.DATETIME_MED),
      ...fields.map((f) => (sub.data[f.id] || '').replace(/"/g, '""')),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(form?.title || 'submissions').replace(/[^a-z0-9]/gi, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0f1117]">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <div className="h-8 w-40 animate-pulse rounded bg-slate-800" />
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-[#0f1117]">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <p className="mt-20 text-center text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const filteredSubs = submissions.filter((sub) => {
    if (!subsSearch.trim()) return true;
    const q = subsSearch.toLowerCase();
    return (
      Object.values(sub.data).some((v) => v && v.toLowerCase().includes(q)) ||
      DateTime.fromISO(sub.submitted_at).toLocaleString(DateTime.DATETIME_MED).toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => router.push('/forms')}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              title="Back to forms"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
            </button>
            <FileText className="h-6 w-6 text-brand-light" strokeWidth={1.8} />
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">Edit Form</h1>
          </div>
          <div className="flex items-center gap-2">
            {form && (
              <a
                href={`/f/${form.slug}`}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <Eye className="h-4 w-4" strokeWidth={1.8} /> Preview
              </a>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !boardId || !columnId}
              className="flex items-center gap-1.5 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : saved ? (<><Check className="h-4 w-4" strokeWidth={2} /> Saved</>) : 'Save'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-slate-700">
          {(['edit', 'submissions'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === t
                  ? 'border-slate-500 text-slate-200'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t === 'edit' ? 'Edit Form' : `Submissions${submissions.length > 0 ? ` (${submissions.length})` : ''}`}
            </button>
          ))}
        </div>

        {error && form && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}

        {activeTab === 'submissions' ? (
          <SubmissionsPanel
            loadingSubs={loadingSubs}
            submissions={submissions}
            filteredSubs={filteredSubs}
            subsSearch={subsSearch}
            setSubsSearch={setSubsSearch}
            fields={fields}
            expandedSub={expandedSub}
            setExpandedSub={setExpandedSub}
            exportCsv={exportCsv}
            onViewCard={(cardId) => form && router.push(`/boards/${form.board_id}?card=${cardId}`)}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[340px_1fr] md:items-start">
            {/* Settings */}
            <div className="rounded-xl border border-zinc-700 bg-brand-dark p-5 shadow-card-glass">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-300">Settings</h2>

              <div className="mb-4">
                <label className={labelCls}>Form Title</label>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="mb-4">
                <label className={labelCls}>Description (shown on public page)</label>
                <textarea
                  className={`${inputCls} resize-y`}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description for the form…"
                />
              </div>

              <div className="mb-4">
                <label className={labelCls}>Target Board</label>
                <select className={inputCls} value={boardId} onChange={(e) => handleBoardChange(e.target.value)}>
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.title}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">Choose which board this form creates cards on.</p>
              </div>

              <div className="mb-4">
                <label className={labelCls}>Target Column</label>
                <select
                  className={inputCls}
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                  disabled={loadingColumns || columns.length === 0}
                >
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.title}
                    </option>
                  ))}
                </select>
                <p className={`mt-1.5 text-xs ${columns.length === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {loadingColumns
                    ? 'Loading columns…'
                    : columns.length === 0
                      ? 'Selected board has no columns. Add a column before saving.'
                      : 'New cards from submissions land in this column.'}
                </p>
              </div>

              <div className="mb-4">
                <label className={labelCls}>Status</label>
                <BinaryChoice
                  checked={isActive}
                  onChange={setIsActive}
                  checkedText="Active"
                  uncheckedText="Inactive"
                  checkedDescription="Public form is open and accepting submissions."
                  uncheckedDescription="Public form is closed to new submissions."
                />
              </div>

              {form && (
                <div>
                  <label className={labelCls}>Public Link</label>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                    <span className="flex-1 select-all truncate text-xs text-slate-300">{publicUrl}</span>
                    <button
                      onClick={copyLink}
                      title="Copy link"
                      className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-400" strokeWidth={2} /> : <Link2 className="h-4 w-4" strokeWidth={1.8} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Fields */}
            <div className="rounded-xl border border-zinc-700 bg-brand-dark p-5 shadow-card-glass">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Fields</h2>
                <button
                  onClick={addField}
                  className="flex items-center gap-1.5 rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add Field
                </button>
              </div>

              {fields.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">No fields yet. Add fields to build your form.</div>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, idx) => {
                    const expanded = expandedField === field.id;
                    const typeLocked = LOCKED_TYPE.includes(field.maps_to);
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragIdx !== null && dragIdx !== idx) {
                            moveField(dragIdx, idx);
                            setDragIdx(idx);
                          }
                        }}
                        onDragEnd={() => setDragIdx(null)}
                        className={`rounded-lg border bg-slate-900/50 transition-colors ${
                          expanded ? 'border-slate-500' : 'border-slate-700 hover:border-slate-600'
                        } ${dragIdx === idx ? 'opacity-50' : ''}`}
                      >
                        <div
                          className="flex cursor-pointer items-center gap-2 p-3"
                          onClick={() => setExpandedField(expanded ? null : field.id)}
                        >
                          <span className="cursor-grab text-slate-600" onClick={(e) => e.stopPropagation()}>
                            <GripVertical className="h-4 w-4" strokeWidth={1.8} />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{field.label}</span>
                            <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                              {FIELD_TYPES.find((t) => t.value === field.type)?.label}
                            </span>
                            {field.required && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                                Required
                              </span>
                            )}
                            {field.maps_to && (
                              <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                                → {field.maps_to}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(field.id);
                            }}
                            title="Remove field"
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/15 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                          </button>
                          <ChevronDown
                            className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            strokeWidth={1.8}
                          />
                        </div>

                        {expanded && (
                          <div className="space-y-4 border-t border-slate-700 p-3 pt-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-3">
                              <div className="min-w-0 flex-1">
                                <label className={labelCls}>Label</label>
                                <input
                                  className={inputCls}
                                  value={field.label}
                                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                                />
                              </div>
                              <div className="w-full sm:w-40">
                                <label className={labelCls}>Type</label>
                                <select
                                  className={`${inputCls} ${typeLocked ? 'opacity-50' : ''}`}
                                  value={field.type}
                                  disabled={typeLocked}
                                  onChange={(e) => updateField(field.id, { type: e.target.value as FormFieldType })}
                                >
                                  {FIELD_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className={labelCls}>Placeholder</label>
                              <input
                                className={inputCls}
                                value={field.placeholder || ''}
                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                placeholder="Placeholder text…"
                              />
                            </div>

                            {field.type === 'select' && field.maps_to !== 'priority' && field.maps_to !== 'assignee' && (
                              <div>
                                <label className={labelCls}>Options (one per line)</label>
                                <textarea
                                  className={`${inputCls} resize-y`}
                                  rows={4}
                                  value={optionDrafts[field.id] ?? (field.options || []).join('\n')}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setOptionDrafts((prev) => ({ ...prev, [field.id]: value }));
                                    updateField(field.id, { options: parseOptionLines(value) });
                                  }}
                                  placeholder={'Option 1\nOption 2\nOption 3'}
                                />
                              </div>
                            )}

                            {field.maps_to === 'priority' && (
                              <p className="text-xs text-slate-500">
                                Options locked to board priorities: {PRIORITY_OPTIONS.join(', ')}
                              </p>
                            )}

                            {field.maps_to === 'assignee' && (
                              <AssigneeSubEditor field={field} boardMembers={boardMembers} updateField={updateField} />
                            )}

                            <div className="flex flex-wrap gap-3">
                              <div className="min-w-0 flex-1">
                                <label className={labelCls}>Maps to Card Field</label>
                                <select
                                  className={inputCls}
                                  value={field.maps_to || ''}
                                  onChange={(e) => handleMappingChange(field, e.target.value)}
                                >
                                  {CARD_MAPPINGS.map((m) => (
                                    <option key={m.value} value={m.value}>
                                      {m.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="w-full sm:w-28">
                                <label className={labelCls}>Required</label>
                                <button
                                  onClick={() => updateField(field.id, { required: !field.required })}
                                  className={`w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                                    field.required
                                      ? 'border-transparent bg-brand-mid text-white'
                                      : 'border-slate-600 bg-slate-700 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {field.required ? 'Yes' : 'No'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assignee visibility sub-editor ──
function AssigneeSubEditor({
  field,
  boardMembers,
  updateField,
}: {
  field: FormField;
  boardMembers: Member[];
  updateField: (id: string, updates: Partial<FormField>) => void;
}) {
  const hidden = field.assignee_visible === false;
  const allChecked = boardMembers.length > 0 && boardMembers.every((m) => (field.assignee_options || []).some((o) => o.id === m.id));

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <div>
        <label className={labelCls}>Visibility on public form</label>
        <BinaryChoice
          checked={!hidden}
          onChange={(checked) =>
            updateField(
              field.id,
              checked
                ? { assignee_visible: true, assignee_default_id: undefined }
                : { assignee_visible: false, assignee_options: [] }
            )
          }
          checkedText="Visible"
          uncheckedText="Hidden"
          checkedDescription="Submitters choose from the checked members below."
          uncheckedDescription="Submitters do not see this field. The default assignee is applied automatically."
        />
      </div>

      {hidden ? (
        <div>
          <label className={labelCls}>Default Assignee</label>
          {boardMembers.length === 0 ? (
            <p className="text-xs text-slate-500">No board members found.</p>
          ) : (
            <select
              className={inputCls}
              value={field.assignee_default_id || ''}
              onChange={(e) => updateField(field.id, { assignee_default_id: e.target.value || undefined })}
            >
              <option value="">None (unassigned)</option>
              {boardMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Available Assignees</label>
            {boardMembers.length > 0 && (
              <button
                onClick={() =>
                  updateField(field.id, {
                    assignee_options: allChecked ? [] : boardMembers.map((m) => ({ id: m.id, name: m.name })),
                  })
                }
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                {allChecked ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          {boardMembers.length === 0 ? (
            <p className="text-xs text-slate-500">No board members found.</p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              {boardMembers.map((m) => {
                const checked = (field.assignee_options || []).some((o) => o.id === m.id);
                return (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const current = field.assignee_options || [];
                        updateField(field.id, {
                          assignee_options: checked
                            ? current.filter((o) => o.id !== m.id)
                            : [...current, { id: m.id, name: m.name }],
                        });
                      }}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-slate-400 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-200">{m.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className={`mt-2 text-xs ${(field.assignee_options || []).length > 0 ? 'text-slate-500' : 'text-amber-400'}`}>
            {(field.assignee_options || []).length === 0
              ? 'No members checked — assignee field will be hidden from the public form.'
              : 'Checked members appear as dropdown options on the public form.'}
          </p>
        </div>
      )}
    </div>
  );
}

function BinaryChoice({
  checked,
  onChange,
  checkedText,
  uncheckedText,
  checkedDescription,
  uncheckedDescription,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  checkedText: string;
  uncheckedText: string;
  checkedDescription: string;
  uncheckedDescription: string;
}) {
  const options = [
    { value: true, label: checkedText, description: checkedDescription },
    { value: false, label: uncheckedText, description: uncheckedDescription },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = checked === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-[76px] rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selected
                ? 'border-green-400 bg-green-500/15 text-white shadow-[0_0_0_1px_rgba(74,222,128,0.28)]'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 hover:bg-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  selected ? 'border-green-300 bg-green-400 text-slate-950' : 'border-slate-500'
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="text-sm font-semibold">{option.label}</span>
            </span>
            <span className={`mt-1.5 block text-xs leading-snug ${selected ? 'text-green-100' : 'text-slate-400'}`}>
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Submissions tab ──
function SubmissionsPanel({
  loadingSubs,
  submissions,
  filteredSubs,
  subsSearch,
  setSubsSearch,
  fields,
  expandedSub,
  setExpandedSub,
  exportCsv,
  onViewCard,
}: {
  loadingSubs: boolean;
  submissions: FormSubmission[];
  filteredSubs: FormSubmission[];
  subsSearch: string;
  setSubsSearch: (v: string) => void;
  fields: FormField[];
  expandedSub: string | null;
  setExpandedSub: (v: string | null) => void;
  exportCsv: () => void;
  onViewCard: (cardId: string) => void;
}) {
  const titleField = fields.find((f) => f.maps_to === 'title');

  return (
    <div className="rounded-xl border border-zinc-700 bg-brand-dark p-5 shadow-card-glass">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">
          {loadingSubs ? 'Loading…' : `${submissions.length} Submission${submissions.length !== 1 ? 's' : ''}`}
        </h2>
        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" strokeWidth={1.8} />
            <input
              value={subsSearch}
              onChange={(e) => setSubsSearch(e.target.value)}
              placeholder="Search submissions…"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <button
            onClick={exportCsv}
            disabled={!submissions.length}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} /> Export CSV
          </button>
        </div>
      </div>

      {submissions.length === 0 && !loadingSubs ? (
        <div className="py-14 text-center">
          <p className="text-sm text-slate-400">No submissions yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Submissions appear here when someone fills out the public form.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSubs.map((sub) => {
            const expanded = expandedSub === sub.id;
            const heading = titleField && sub.data[titleField.id] ? sub.data[titleField.id] : 'Submission';
            const leftover = Object.entries(sub.data).filter(([key]) => !fields.find((f) => f.id === key));
            return (
              <div key={sub.id} className="rounded-lg border border-slate-700 bg-slate-900/50">
                <div
                  className="flex cursor-pointer items-center gap-3 p-3"
                  onClick={() => setExpandedSub(expanded ? null : sub.id)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="mr-2 text-sm font-semibold text-white">{heading}</span>
                    <span className="text-xs text-slate-500">
                      {DateTime.fromISO(sub.submitted_at).toLocaleString(DateTime.DATETIME_MED)}
                    </span>
                  </div>
                  {sub.card_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewCard(sub.card_id!);
                      }}
                      className="shrink-0 rounded-md border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                    >
                      View Card
                    </button>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    strokeWidth={1.8}
                  />
                </div>
                {expanded && (
                  <div className="space-y-2.5 border-t border-slate-700 p-3 pt-3.5">
                    {fields.map((f) => {
                      const val = sub.data[f.id];
                      if (!val) return null;
                      return <SubRow key={f.id} label={f.label} value={val} />;
                    })}
                    {leftover.map(([key, val]) => (
                      <SubRow key={key} label={key} value={val} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="break-words text-sm text-slate-200">{value}</span>
    </div>
  );
}

export default function FormEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f1117]" />}>
      <FormEditorInner />
    </Suspense>
  );
}
