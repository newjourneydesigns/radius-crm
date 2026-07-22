'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../components/ProtectedRoute';
import Modal from '../../components/ui/Modal';
import { useCampaigns, Campaign } from '../../hooks/useCampaigns';

const VARIABLES = ['{{first_name}}', '{{form_link}}', '{{campaign_name}}', '{{due_date}}'];

function CompletionPill({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-600 text-sm">—</span>;
  const color =
    pct >= 80
      ? 'bg-green-500/20 text-green-400'
      : pct >= 50
      ? 'bg-amber-500/20 text-amber-400'
      : 'bg-red-500/20 text-red-400';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return DateTime.fromISO(iso).toFormat('MMM d, yyyy');
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />;
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return filled ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </svg>
  );
}

const inputCls =
  'w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

export default function CampaignsPage() {
  const { campaigns, loading, error, fetchCampaigns, updateCampaign, archiveCampaign, restoreCampaign, toggleFavorite } = useCampaigns();
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [favoriting, setFavoriting] = useState<string | null>(null);

  // Edit modal state
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>(['']);
  const [editFormId, setEditFormId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editTemplate, setEditTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Always fetch including archived so count is accurate
  useEffect(() => {
    fetchCampaigns(true);
  }, [fetchCampaigns]);

  const active = campaigns.filter(c => !c.archived_at);
  const archived = campaigns.filter(c => !!c.archived_at);
  const visible = showArchived ? campaigns : active;
  // Archived campaigns never pin to Favorites, even when favorited before archiving
  const favorites = visible.filter(c => c.favorited_at && !c.archived_at);
  const rest = visible.filter(c => !c.favorited_at || c.archived_at);

  function openEdit(c: Campaign) {
    setEditingCampaign(c);
    setEditName(c.name);
    setEditGroupIds(c.ccb_group_ids?.length ? [...c.ccb_group_ids] : ['']);
    setEditFormId(c.ccb_form_id ?? '');
    setEditDueDate(c.due_date ?? '');
    setEditTemplate(c.message_template ?? '');
    setSaveError(null);
  }

  function closeEdit() {
    setEditingCampaign(null);
    setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCampaign) return;
    const cleanGroupIds = editGroupIds.map(id => id.trim()).filter(Boolean);
    setSaving(true);
    setSaveError(null);
    try {
      await updateCampaign(editingCampaign.id, {
        name: editName.trim(),
        ccb_group_ids: cleanGroupIds,
        ccb_form_id: editFormId.trim(),
        due_date: editDueDate,
        message_template: editTemplate.trim(),
      });
      closeEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(c: Campaign) {
    setArchiving(c.id);
    try { await archiveCampaign(c.id); await fetchCampaigns(true); } finally { setArchiving(null); }
  }

  async function handleRestore(c: Campaign) {
    setArchiving(c.id);
    try { await restoreCampaign(c.id); } finally { setArchiving(null); }
  }

  async function handleToggleFavorite(c: Campaign) {
    setFavoriting(c.id);
    try { await toggleFavorite(c.id, !c.favorited_at); } finally { setFavoriting(null); }
  }

  const renderStar = (c: Campaign) => (
    <button
      className={`p-1 -m-1 transition-colors disabled:opacity-40 ${
        c.favorited_at ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-amber-400'
      }`}
      disabled={favoriting === c.id}
      onClick={() => handleToggleFavorite(c)}
      title={c.favorited_at ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={c.favorited_at ? 'Remove from favorites' : 'Add to favorites'}
    >
      <StarIcon filled={!!c.favorited_at} className="w-4 h-4" />
    </button>
  );

  const renderCards = (items: Campaign[]) => (
    <div className="space-y-3 sm:hidden">
      {items.map(c => (
        <div
          key={c.id}
          className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 ${c.archived_at ? 'opacity-60' : ''}`}
        >
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/campaigns/${c.id}`}
              className="font-semibold text-slate-100 hover:text-white transition-colors leading-snug"
            >
              {c.name}
            </Link>
            <div className="flex items-center gap-2 flex-shrink-0">
              {renderStar(c)}
              {c.archived_at && (
                <span className="text-xs text-slate-500 border border-zinc-700 rounded px-1.5 py-0.5 leading-none">
                  archived
                </span>
              )}
              <CompletionPill pct={c.completion_pct} />
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">Invited</p>
              <p className="text-base font-semibold text-slate-200 tabular-nums">{c.expected_count ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">Submitted</p>
              <p className="text-base font-semibold text-green-400 tabular-nums">{c.submitted_count ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">Unsubmitted</p>
              <p className="text-base font-semibold text-red-400 tabular-nums">{c.missing_count ?? '—'}</p>
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
            <span>Due {formatDate(c.due_date)}</span>
            <span>
              {c.last_reconciled_at
                ? `Reconciled ${formatDate(c.last_reconciled_at)}`
                : 'Not yet reconciled'}
            </span>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-zinc-800">
            <Link
              href={`/campaigns/${c.id}`}
              className="text-center bg-zinc-800 text-slate-200 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              View
            </Link>
            <button
              className="text-center bg-zinc-800 text-slate-200 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              onClick={() => openEdit(c)}
            >
              Edit
            </button>
            <Link
              href={`/campaigns/new?from=${c.id}`}
              className="text-center bg-zinc-800 text-slate-200 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              title="Start a new campaign from this one's settings"
            >
              Duplicate
            </Link>
            {c.archived_at ? (
              <button
                className="flex items-center justify-center bg-zinc-800 text-slate-200 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                disabled={archiving === c.id}
                onClick={() => handleRestore(c)}
              >
                {archiving === c.id ? <Spinner /> : 'Restore'}
              </button>
            ) : (
              <button
                className="flex items-center justify-center bg-zinc-800 text-slate-400 hover:text-slate-200 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                disabled={archiving === c.id}
                onClick={() => handleArchive(c)}
              >
                {archiving === c.id ? <Spinner /> : 'Archive'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTable = (items: Campaign[]) => (
    <div className="hidden sm:block rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-5 py-3">Campaign</th>
              <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Invited</th>
              <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Submitted</th>
              <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Unsubmitted</th>
              <th className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Done</th>
              <th className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Due</th>
              <th className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Last Reconciled</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {items.map(c => (
              <tr
                key={c.id}
                className={`hover:bg-zinc-800/40 transition-colors ${c.archived_at ? 'opacity-50' : ''}`}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    {renderStar(c)}
                    <div>
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-slate-200 hover:text-white transition-colors"
                      >
                        {c.name}
                      </Link>
                      {c.archived_at && (
                        <span className="ml-2 text-xs text-slate-500 border border-zinc-700 rounded px-1 py-0.5 leading-none">
                          archived
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-300">{c.expected_count ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-400">{c.submitted_count ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums text-red-400">{c.missing_count ?? '—'}</td>
                <td className="px-4 py-3"><CompletionPill pct={c.completion_pct} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-400">{formatDate(c.due_date)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {c.last_reconciled_at
                    ? formatDate(c.last_reconciled_at)
                    : <span className="italic text-slate-600">Not yet</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-slate-400 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors"
                    >
                      View
                    </Link>
                    <button
                      className="text-slate-400 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors"
                      onClick={() => openEdit(c)}
                    >
                      Edit
                    </button>
                    <Link
                      href={`/campaigns/new?from=${c.id}`}
                      className="text-slate-400 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors"
                      title="Start a new campaign from this one's settings"
                    >
                      Duplicate
                    </Link>
                    {c.archived_at ? (
                      <button
                        className="text-slate-400 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 flex items-center gap-1"
                        disabled={archiving === c.id}
                        onClick={() => handleRestore(c)}
                      >
                        {archiving === c.id ? <Spinner /> : 'Restore'}
                      </button>
                    ) : (
                      <button
                        className="text-slate-500 hover:text-slate-300 hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 flex items-center gap-1"
                        disabled={archiving === c.id}
                        onClick={() => handleArchive(c)}
                      >
                        {archiving === c.id ? <Spinner /> : 'Archive'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 lg:p-8 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Follow-Up Campaigns</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Reconcile a CCB group against a CCB form to track who&apos;s submitted and follow up with those who haven&apos;t.
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Campaign
          </Link>
        </div>

        {/* Archived toggle — always visible */}
        <div className="flex items-center gap-2 mb-5">
          <button
            role="switch"
            aria-checked={showArchived}
            className={`w-9 h-5 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${showArchived ? 'bg-indigo-500' : 'bg-zinc-700'}`}
            onClick={() => setShowArchived(v => !v)}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showArchived ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span
            className="text-sm text-slate-400 cursor-pointer select-none"
            onClick={() => setShowArchived(v => !v)}
          >
            Show archived
            {archived.length > 0 && (
              <span className="ml-1.5 text-xs text-slate-600">({archived.length})</span>
            )}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-16">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && visible.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col items-center justify-center py-16 text-center">
            <p className="text-slate-500 text-sm">
              {showArchived ? 'No campaigns found.' : 'No active campaigns.'}
            </p>
            {!showArchived && (
              <Link
                href="/campaigns/new"
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity mt-4"
              >
                Create your first campaign
              </Link>
            )}
          </div>
        )}

        {/* Favorites — pinned above the main list */}
        {!loading && favorites.length > 0 && (
          <div className="mb-8">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">
              <StarIcon filled className="w-3.5 h-3.5" />
              Favorites
            </h2>
            {renderCards(favorites)}
            {renderTable(favorites)}
          </div>
        )}

        {/* All remaining campaigns */}
        {!loading && rest.length > 0 && (
          <div>
            {favorites.length > 0 && (
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                All Campaigns
              </h2>
            )}
            {renderCards(rest)}
            {renderTable(rest)}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal
        isOpen={!!editingCampaign}
        onClose={closeEdit}
        title="Edit Campaign"
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Campaign name</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Fall Kickoff RSVP"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              required
            />
          </div>

          {/* CCB Group IDs */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">CCB Group IDs <span className="text-slate-600 normal-case">(optional for pasted lists)</span></label>
            <div className="space-y-2">
              {editGroupIds.map((gid, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputCls}
                    placeholder={i === 0 ? 'e.g. 1234' : 'e.g. 5678'}
                    value={gid}
                    onChange={e => setEditGroupIds(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  />
                  {editGroupIds.length > 1 && (
                    <button
                      type="button"
                      className="text-slate-500 hover:text-red-400 transition-colors px-2"
                      onClick={() => setEditGroupIds(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-600">Found in the CCB group URL</span>
              <button
                type="button"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                onClick={() => setEditGroupIds(prev => [...prev, ''])}
              >
                + Add another group
              </button>
            </div>
          </div>

          {/* Two-col: Form ID + Due date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">CCB Form ID</label>
              <input
                type="text"
                inputMode="numeric"
                className={inputCls}
                placeholder="e.g. 56"
                value={editFormId}
                onChange={e => setEditFormId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Due date</label>
              <input
                type="date"
                className={inputCls}
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Message template */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Message template</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {VARIABLES.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-slate-300 font-mono text-xs px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    const ta = document.getElementById('edit-template') as HTMLTextAreaElement | null;
                    if (!ta) return;
                    const s = ta.selectionStart, e = ta.selectionEnd;
                    setEditTemplate(ta.value.slice(0, s) + tag + ta.value.slice(e));
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              id="edit-template"
              className="w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              value={editTemplate}
              onChange={e => setEditTemplate(e.target.value)}
            />
          </div>

          {saveError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              type="button"
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800"
              onClick={closeEdit}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              disabled={saving}
            >
              {saving ? <><Spinner /> Saving…</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </ProtectedRoute>
  );
}
