'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import CCBGroupPicker, { type PickedGroup } from '../../../components/admin/student/CCBGroupPicker';
import { currentTerm, formatTerm, isValidTerm, termSortKey } from '../../../lib/student-toolkit/terms';

type GroupKind = 'circle' | 'movement' | 'leaders';

type MinistryGroup = {
  id: number;
  campus: string;
  term: string;
  kind: GroupKind;
  ccb_group_id: string;
  label: string | null;
  active: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

type SyncState = { term: string; groups: { id: number }[] };

const KIND_ORDER: GroupKind[] = ['circle', 'movement', 'leaders'];

const KIND_META: Record<GroupKind, { title: string; help: string; addLabel: string }> = {
  circle: {
    title: 'Circle groups',
    help: 'Where students check in for their circle. One group per grade is normal — add as many as this campus has.',
    addLabel: 'Add a circle group',
  },
  movement: {
    title: 'Movement group',
    help: 'The main student gathering, where attendance for the whole campus is taken.',
    addLabel: 'Add the movement group',
  },
  leaders: {
    title: 'Student leaders group',
    help: 'The group Import Students reads from. It is not part of the nightly attendance sync.',
    addLabel: 'Add the leaders group',
  },
};

const inputClass =
  'w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? '' : when.toLocaleString();
}

/** Terms staff can pick: everything already in use, plus the seasons around today. */
function termOptions(fromData: string[]): string[] {
  const year = new Date().getFullYear();
  const generated = [
    `${year - 1}-fall`,
    `${year}-spring`,
    `${year}-fall`,
    `${year + 1}-spring`,
    `${year + 1}-fall`,
  ];
  return Array.from(new Set([...fromData, ...generated, currentTerm()]))
    .filter(isValidTerm)
    .sort((a, b) => termSortKey(b) - termSortKey(a));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function StudentGroupsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f1117]" />}>
      <StudentGroupsAdmin />
    </Suspense>
  );
}

function StudentGroupsAdmin() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [groups, setGroups] = useState<MinistryGroup[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ campus: string; kind: GroupKind } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ label: string; ccb_group_id: string }>({
    label: '',
    ccb_group_id: '',
  });

  // Term and campus live in the URL so a half-finished map is shareable.
  const term = useMemo(() => {
    const requested = searchParams?.get('term');
    return isValidTerm(requested) ? requested : currentTerm();
  }, [searchParams]);
  const campusFilter = searchParams?.get('campus') || '';

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (value) next.set(key, value);
      else next.delete(key);
      const query = next.toString();
      // next.config.js sets trailingSlash: true, so keep the slash before the
      // query string — and don't double it if usePathname already has one.
      const base = pathname.endsWith('/') ? pathname : `${pathname}/`;
      router.replace(query ? `${base}?${query}` : base, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
      setAuthChecked(true);
      if (!data.session?.access_token) setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase
      .from('campuses')
      .select('value')
      .order('value')
      .then(({ data }) => {
        setCampuses(
          ((data || []) as { value: string | null }[])
            .map((row) => row.value)
            .filter((value): value is string => Boolean(value))
        );
      });
  }, []);

  const loadGroups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/student-ministry-groups/?term=${encodeURIComponent(term)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the group map.');
      setGroups(data.groups || []);
      setTerms(data.terms || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load the group map.'));
    } finally {
      setLoading(false);
    }
  }, [token, term]);

  /**
   * Which term the nightly sync will actually run. It follows the newest term
   * with active groups, not the calendar — so staff editing next term need to
   * see that tonight's run is still on this one.
   */
  const loadSyncState = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/student-toolkit/sync/', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      setSyncState(await res.json());
    } catch {
      // The status line is a nicety — a failure here must not block editing.
    }
  }, [token]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadSyncState();
  }, [loadSyncState]);

  async function addGroup(picked: PickedGroup) {
    if (!adding || !token) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/student-ministry-groups/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          campus: adding.campus,
          term,
          kind: adding.kind,
          ccb_group_id: picked.ccb_group_id,
          label: picked.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the group.');
      setAdding(null);
      setSuccess(
        adding.kind === 'leaders'
          ? 'Leaders group saved. Import the leaders from Import Students.'
          : 'Group saved. Run Sync now to confirm the ID works.'
      );
      await loadGroups();
      await loadSyncState();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not save the group.'));
    } finally {
      setSaving(false);
    }
  }

  async function patchGroup(id: number, body: Record<string, unknown>, successMessage: string) {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/student-ministry-groups/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update the group.');
      setEditingId(null);
      setSuccess(successMessage);
      await loadGroups();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not update the group.'));
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(group: MinistryGroup) {
    if (!token) return;
    const name = group.label || `group #${group.ccb_group_id}`;
    if (!confirm(`Remove ${name} from ${group.campus}? Attendance already pulled for it is kept.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/student-ministry-groups/?id=${group.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove the group.');
      setSuccess('Group removed.');
      await loadGroups();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not remove the group.'));
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    if (!token) return;
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/student-toolkit/sync/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ term }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed.');
      setSuccess(data.message || 'Sync finished.');
      await loadGroups();
      await loadSyncState();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Sync failed.'));
    } finally {
      setSyncing(false);
    }
  }

  const visibleCampuses = useMemo(() => {
    const mapped = Array.from(new Set(groups.map((g) => g.campus)));
    const all = Array.from(new Set([...campuses, ...mapped])).sort((a, b) => a.localeCompare(b));
    return campusFilter ? all.filter((campus) => campus === campusFilter) : all;
  }, [campuses, groups, campusFilter]);

  const failing = useMemo(() => groups.filter((g) => g.last_sync_error), [groups]);
  const syncTermMismatch = !!syncState && syncState.term !== term;

  if (authChecked && !token) {
    return (
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto bg-zinc-800 border border-zinc-700 rounded-xl p-6 shadow-card-glass">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Groups</h1>
          <p className="text-sm text-slate-400 mt-2">Sign in to Radius to map student CCB groups.</p>
          <a
            href="/login/"
            className="inline-flex mt-5 bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Groups</h1>
          <p className="text-sm text-slate-400 mt-1">
            Map each campus&apos;s CCB groups for the term. The nightly sync reads these to fill student
            rosters and attendance — until a campus is mapped, its leaders see &quot;attendance is not
            connected&quot;.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg p-3 mb-4">
            {success}
          </div>
        )}

        {/* Term + sync controls */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 sm:p-5 shadow-card-glass mb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="sm:w-48">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Term
              </label>
              <select
                className={inputClass}
                value={term}
                onChange={(e) => setParam('term', e.target.value)}
              >
                {termOptions(terms).map((option) => (
                  <option key={option} value={option}>
                    {formatTerm(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-56">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Campus
              </label>
              <select
                className={inputClass}
                value={campusFilter}
                onChange={(e) => setParam('campus', e.target.value)}
              >
                <option value="">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus} value={campus}>
                    {campus}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <button
                onClick={syncNow}
                disabled={syncing || loading}
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                onClick={loadGroups}
                disabled={loading}
                className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500 space-y-1">
            <p>
              Sync now pulls this term&apos;s groups from CCB straight away — use it to check a group ID
              the moment you save it, instead of waiting for tonight.
            </p>
            {syncTermMismatch && (
              <p className="text-amber-300">
                Tonight&apos;s automatic sync runs on {formatTerm(syncState!.term)}, not{' '}
                {formatTerm(term)}. It follows the newest term that has active groups, so{' '}
                {formatTerm(term)} takes over once you activate a group in it.
              </p>
            )}
          </div>

          {failing.length > 0 && (
            <div className="mt-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
              {failing.length} group{failing.length === 1 ? '' : 's'} failed the last sync. A failed
              sync usually means the CCB group ID is wrong — fix the ID below, then run Sync now.
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="animate-pulse bg-zinc-800 rounded-xl h-40" />
            <div className="animate-pulse bg-zinc-800 rounded-xl h-40" />
          </div>
        ) : visibleCampuses.length === 0 ? (
          <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
            <p className="text-slate-400 text-sm">No campuses to map.</p>
            <p className="text-slate-500 text-xs mt-1">
              Add campuses in Settings first, then come back to wire their CCB groups.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleCampuses.map((campus) => {
              const campusGroups = groups.filter((group) => group.campus === campus);
              const attendanceMapped = campusGroups.some((group) => group.kind !== 'leaders');
              return (
                <section
                  key={campus}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 sm:p-5 shadow-card-glass"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <h2 className="text-base font-semibold text-white">{campus}</h2>
                    {attendanceMapped ? (
                      <span className="bg-emerald-500/20 text-emerald-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        {campusGroups.length} group{campusGroups.length === 1 ? '' : 's'} mapped
                      </span>
                    ) : (
                      <span className="bg-amber-500/20 text-amber-300 text-xs font-medium px-2 py-0.5 rounded-full">
                        Not mapped yet
                      </span>
                    )}
                  </div>

                  <div className="space-y-5">
                    {KIND_ORDER.map((kind) => {
                      const kindGroups = campusGroups.filter((group) => group.kind === kind);
                      const isAdding = adding?.campus === campus && adding.kind === kind;
                      return (
                        <div key={kind}>
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <h3 className="text-sm font-medium text-slate-200">{KIND_META[kind].title}</h3>
                            {!isAdding && (
                              <button
                                onClick={() => {
                                  setAdding({ campus, kind });
                                  setEditingId(null);
                                }}
                                className="text-vc-300 hover:text-vc-200 text-sm transition-colors"
                              >
                                {KIND_META[kind].addLabel}
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 mb-2">{KIND_META[kind].help}</p>

                          {kindGroups.length === 0 && !isAdding ? (
                            <p className="text-xs text-slate-500 rounded-lg border border-dashed border-zinc-700 px-3 py-2.5">
                              {kind === 'leaders'
                                ? "No leaders group yet. Add it to import this campus's student leaders."
                                : 'No group yet. Add one so this campus starts collecting attendance.'}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {kindGroups.map((group) => (
                                <GroupRow
                                  key={group.id}
                                  group={group}
                                  saving={saving}
                                  editing={editingId === group.id}
                                  editDraft={editDraft}
                                  onEditDraft={setEditDraft}
                                  onStartEdit={() => {
                                    setAdding(null);
                                    setEditingId(group.id);
                                    setEditDraft({
                                      label: group.label || '',
                                      ccb_group_id: group.ccb_group_id,
                                    });
                                  }}
                                  onCancelEdit={() => setEditingId(null)}
                                  onSaveEdit={() =>
                                    patchGroup(
                                      group.id,
                                      { label: editDraft.label, ccb_group_id: editDraft.ccb_group_id },
                                      editDraft.ccb_group_id !== group.ccb_group_id
                                        ? 'Group ID updated. Run Sync now to check it.'
                                        : 'Group updated.'
                                    )
                                  }
                                  onToggleActive={() =>
                                    patchGroup(
                                      group.id,
                                      { active: !group.active },
                                      group.active
                                        ? 'Group paused — the nightly sync will skip it.'
                                        : 'Group active — it syncs tonight.'
                                    )
                                  }
                                  onRemove={() => removeGroup(group)}
                                />
                              ))}
                            </div>
                          )}

                          {isAdding && (
                            <div className="mt-2">
                              <CCBGroupPicker
                                token={token}
                                initialQuery={campus}
                                busy={saving}
                                submitLabel="Save group"
                                onCancel={() => setAdding(null)}
                                onSubmit={addGroup}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-500 mt-6">
          Once a campus has a leaders group, import its people from{' '}
          <Link href="/import-students/" className="text-vc-300 hover:text-vc-200">
            Import Students
          </Link>
          . Imported leaders are managed on{' '}
          <Link href="/admin/student-leaders/" className="text-vc-300 hover:text-vc-200">
            Student Leaders
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function GroupRow({
  group,
  saving,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onRemove,
}: {
  group: MinistryGroup;
  saving: boolean;
  editing: boolean;
  editDraft: { label: string; ccb_group_id: string };
  onEditDraft: (draft: { label: string; ccb_group_id: string }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const syncedAt = formatWhen(group.last_synced_at);
  const isLeaders = group.kind === 'leaders';

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Label</label>
              <input
                className={inputClass}
                value={editDraft.label}
                onChange={(e) => onEditDraft({ ...editDraft, label: e.target.value })}
                placeholder="e.g. Denton 7th Grade Guys"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">CCB group ID</label>
              <input
                className={inputClass}
                value={editDraft.ccb_group_id}
                onChange={(e) => onEditDraft({ ...editDraft, ccb_group_id: e.target.value })}
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSaveEdit}
              disabled={saving}
              className="bg-btn-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onCancelEdit}
              className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-slate-100">{group.label || 'Untitled group'}</p>
              <span className="text-xs font-mono text-slate-500">#{group.ccb_group_id}</span>
              {isLeaders ? (
                <span className="bg-sky-500/20 text-sky-300 text-xs font-medium px-2 py-0.5 rounded-full">
                  Import source
                </span>
              ) : !group.active ? (
                <span className="bg-zinc-600/50 text-slate-400 text-xs font-medium px-2 py-0.5 rounded-full">
                  Paused
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isLeaders
                ? 'Read by Import Students. The attendance sync skips it.'
                : syncedAt
                ? `Last synced ${syncedAt}`
                : 'Never synced. Run Sync now to check this ID.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onStartEdit}
              className="text-slate-300 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-sm transition-colors"
            >
              Edit
            </button>
            {!isLeaders && (
              <button
                onClick={onToggleActive}
                disabled={saving}
                className="text-slate-300 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {group.active ? 'Pause' : 'Activate'}
              </button>
            )}
            <button
              onClick={onRemove}
              disabled={saving}
              className="text-red-300 hover:text-red-200 hover:bg-red-500/10 px-2.5 py-1 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {group.last_sync_error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-xs font-semibold text-red-300">Last sync failed</p>
          <p className="text-xs text-red-200/90 mt-1 break-words">{group.last_sync_error}</p>
          <p className="text-xs text-red-200/70 mt-2">
            Check this group in CCB — the ID is the number at the end of its URL. Fix it above, then
            run Sync now.
          </p>
        </div>
      )}
    </div>
  );
}
