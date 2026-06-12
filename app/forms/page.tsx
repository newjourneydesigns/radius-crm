'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateTime } from 'luxon';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { BoardForm, ProjectBoard } from '../../lib/supabase';
import Modal from '../../components/ui/Modal';
import {
  FileText, Plus, Trash2, Pencil, Calendar, Link2,
  Eye, ToggleLeft, ToggleRight, FolderKanban, ArrowLeft, List, Check, Copy,
} from 'lucide-react';

type FormWithBoard = BoardForm & { board_title?: string };
type Member = { id: string; name: string };

function generateSlug(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}

function FormsListInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [forms, setForms] = useState<FormWithBoard[]>([]);
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterBoardId, setFilterBoardId] = useState<string>(searchParams.get('board') || '');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBoardId, setNewBoardId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<Member[]>([]);
  const [creating, setCreating] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FormWithBoard | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('board_forms')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (err) throw err;

      const boardIds = [...new Set((data || []).map((f) => f.board_id))];
      let boardMap: Record<string, string> = {};
      if (boardIds.length > 0) {
        const { data: boardsData } = await supabase
          .from('project_boards')
          .select('id, title')
          .in('id', boardIds);
        if (boardsData) boardMap = Object.fromEntries(boardsData.map((b) => [b.id, b.title]));
      }
      setForms((data || []).map((f) => ({ ...f, board_title: boardMap[f.board_id] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchBoards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('project_boards')
      .select('*')
      .eq('is_archived', false)
      .order('title');
    if (data) setBoards(data);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchForms();
      fetchBoards();
    }
  }, [user, fetchForms, fetchBoards]);

  // Load board members when a board is selected. Radius boards are team-shared
  // (no team_id), so every user is a potential assignee — same source the board
  // assignee picker uses (public.users).
  useEffect(() => {
    if (!newBoardId || !user) {
      setMembers([]);
      setAssigneeOptions([]);
      return;
    }
    (async () => {
      const { data } = await supabase.from('users').select('id, name').order('name');
      const list = ((data || []) as Member[]).filter((m) => m.name);
      setMembers(list);
      setAssigneeOptions(list); // all checked by default
    })();
  }, [newBoardId, user]);

  const openCreate = () => {
    setNewTitle('');
    setNewBoardId(filterBoardId || '');
    setMembers([]);
    setAssigneeOptions([]);
    setError(null);
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBoardId || !user) return;
    setCreating(true);
    setError(null);
    try {
      const { data: columns } = await supabase
        .from('board_columns')
        .select('id')
        .eq('board_id', newBoardId)
        .order('position')
        .limit(1);

      if (!columns || columns.length === 0) {
        setError('Selected board has no columns. Add a column first.');
        setCreating(false);
        return;
      }

      const slug = generateSlug(newTitle);

      const { data: form, error: err } = await supabase
        .from('board_forms')
        .insert([
          {
            user_id: user.id,
            board_id: newBoardId,
            column_id: columns[0].id,
            title: newTitle.trim(),
            slug,
            fields: [
              { id: 'field_1', type: 'text', label: 'Title', required: true, placeholder: 'Enter a title...', maps_to: 'title' },
              { id: 'field_2', type: 'textarea', label: 'Description', required: false, placeholder: 'Describe in detail...', maps_to: 'description' },
              { id: 'field_3', type: 'select', label: 'Priority', required: false, placeholder: 'Select priority...', options: ['Low', 'Medium', 'High', 'Urgent'], maps_to: 'priority' },
              { id: 'field_4', type: 'date', label: 'Due Date', required: false, maps_to: 'due_date' },
              { id: 'field_5', type: 'select', label: 'Assignee', required: false, placeholder: 'Select assignee...', maps_to: 'assignee', assignee_options: assigneeOptions },
            ],
            is_active: true,
          },
        ])
        .select()
        .single();

      if (err) throw err;
      if (form) router.push(`/forms/${form.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (form: FormWithBoard) => {
    const { error: err } = await supabase
      .from('board_forms')
      .update({ is_active: !form.is_active })
      .eq('id', form.id);
    if (!err) {
      setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, is_active: !f.is_active } : f)));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('board_forms').delete().eq('id', deleteTarget.id);
    setForms((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleDuplicate = async (sourceForm: FormWithBoard) => {
    if (!user || duplicatingId) return;
    setDuplicatingId(sourceForm.id);
    setError(null);
    try {
      const title = `${sourceForm.title} Copy`;
      const { data: duplicated, error: err } = await supabase
        .from('board_forms')
        .insert([
          {
            user_id: user.id,
            board_id: sourceForm.board_id,
            column_id: sourceForm.column_id,
            title,
            description: sourceForm.description || null,
            slug: generateSlug(title),
            fields: JSON.parse(JSON.stringify(sourceForm.fields || [])),
            is_active: sourceForm.is_active,
          },
        ])
        .select()
        .single();

      if (err) throw err;
      if (duplicated) router.push(`/forms/${duplicated.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate form');
    } finally {
      setDuplicatingId(null);
    }
  };

  const publicUrl = (slug: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}/f/${slug}` : `/f/${slug}`;

  const copyLink = (form: FormWithBoard) => {
    navigator.clipboard.writeText(publicUrl(form.slug));
    setCopiedId(form.id);
    setTimeout(() => setCopiedId((id) => (id === form.id ? null : id)), 1800);
  };

  const allChecked = members.length > 0 && members.every((m) => assigneeOptions.some((o) => o.id === m.id));

  const visibleForms = forms.filter((form) => {
    if (filterStatus === 'active' && !form.is_active) return false;
    if (filterStatus === 'inactive' && form.is_active) return false;
    if (filterBoardId && form.board_id !== filterBoardId) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => router.push('/boards')}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              title="Back to boards"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
            </button>
            <FileText className="h-6 w-6 text-brand-light" strokeWidth={1.8} />
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">Forms</h1>
          </div>
          <button
            onClick={openCreate}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New Form
          </button>
        </div>

        {/* Filters */}
        {!loading && forms.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
              {(['all', 'active', 'inactive'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    filterStatus === s ? 'bg-brand-mid text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <select
              value={filterBoardId}
              onChange={(e) => setFilterBoardId(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">All boards</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-zinc-700 bg-brand-dark" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-xl border border-zinc-700 bg-brand-dark py-16 text-center shadow-card-glass">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-600" strokeWidth={1.5} />
            <p className="text-sm text-slate-300">No forms yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
              Create a form to collect submissions that automatically become cards on your board.
            </p>
            <button
              onClick={openCreate}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2} /> New Form
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleForms.map((form) => (
              <div
                key={form.id}
                className="flex flex-col rounded-xl border border-zinc-700 bg-brand-dark p-5 shadow-card-glass transition-colors hover:border-slate-500"
              >
                <div className="mb-2 flex items-start gap-2.5">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.8} />
                  <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{form.title}</h3>
                  <button
                    onClick={() => handleToggleActive(form)}
                    title={form.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                    className="shrink-0 rounded-md p-0.5 transition-colors hover:bg-slate-700"
                  >
                    {form.is_active ? (
                      <ToggleRight className="h-6 w-6 text-green-400" strokeWidth={1.8} />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-slate-500" strokeWidth={1.8} />
                    )}
                  </button>
                </div>

                <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                    <span className="truncate">{form.board_title || 'Unknown board'}</span>
                  </span>
                  <span className={form.is_active ? 'text-green-400' : 'text-slate-500'}>
                    {form.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-700/60 pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {DateTime.fromISO(form.created_at).toLocaleString(DateTime.DATE_MED)}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <IconBtn
                      title={copiedId === form.id ? 'Copied!' : 'Copy public link'}
                      onClick={() => copyLink(form)}
                    >
                      {copiedId === form.id ? (
                        <Check className="h-4 w-4 text-green-400" strokeWidth={2} />
                      ) : (
                        <Link2 className="h-4 w-4" strokeWidth={1.8} />
                      )}
                    </IconBtn>
                    <IconLink title="Preview form" href={`/f/${form.slug}`}>
                      <Eye className="h-4 w-4" strokeWidth={1.8} />
                    </IconLink>
                    <IconBtn
                      title="View submissions"
                      onClick={() => router.push(`/forms/${form.id}/edit?tab=submissions`)}
                    >
                      <List className="h-4 w-4" strokeWidth={1.8} />
                    </IconBtn>
                    <IconBtn
                      title={duplicatingId === form.id ? 'Duplicating…' : 'Duplicate form'}
                      onClick={() => handleDuplicate(form)}
                      disabled={!!duplicatingId}
                    >
                      <Copy className="h-4 w-4" strokeWidth={1.8} />
                    </IconBtn>
                    <IconBtn title="Edit form" onClick={() => router.push(`/forms/${form.id}/edit`)}>
                      <Pencil className="h-4 w-4" strokeWidth={1.8} />
                    </IconBtn>
                    <IconBtn title="Delete form" danger onClick={() => setDeleteTarget(form)}>
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                    </IconBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Form" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Form Title</label>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Prayer Request Intake"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Target Board</label>
            <select
              value={newBoardId}
              onChange={(e) => setNewBoardId(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">Select a board…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          {newBoardId && members.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Assignees on public form</label>
                <button
                  onClick={() =>
                    setAssigneeOptions(allChecked ? [] : members.map((m) => ({ id: m.id, name: m.name })))
                  }
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                >
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                {members.map((m) => {
                  const checked = assigneeOptions.some((o) => o.id === m.id);
                  return (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAssigneeOptions((prev) =>
                            checked ? prev.filter((o) => o.id !== m.id) : [...prev, { id: m.id, name: m.name }]
                          )
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-slate-400 focus:ring-slate-500"
                      />
                      <span className="text-sm text-slate-200">{m.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className={`mt-2 text-xs ${assigneeOptions.length > 0 ? 'text-slate-500' : 'text-amber-400'}`}>
                {assigneeOptions.length === 0
                  ? 'No members selected — the assignee field will be hidden from the form.'
                  : `${assigneeOptions.length} member${assigneeOptions.length !== 1 ? 's' : ''} will appear as assignee options.`}
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim() || !newBoardId}
              className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Form'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Form" size="sm">
        <p className="text-sm text-slate-300">
          Delete <span className="font-semibold text-white">{deleteTarget?.title}</span>? Existing submissions will be
          removed. This can&apos;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => setDeleteTarget(null)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-btn-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`group relative rounded-lg p-2 text-slate-400 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : danger
            ? 'hover:bg-red-500/15 hover:text-red-400'
            : 'hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {title}
      </span>
    </button>
  );
}

function IconLink({
  children,
  title,
  href,
}: {
  children: React.ReactNode;
  title: string;
  href: string;
}) {
  return (
    <a
      aria-label={title}
      href={href}
      className="group relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
    >
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {title}
      </span>
    </a>
  );
}

export default function FormsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f1117]" />}>
      <FormsListInner />
    </Suspense>
  );
}
