'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/ui/Modal';
import { Campaign, CampaignPerson } from '../../../hooks/useCampaigns';
import { normalizePhone } from '../../../lib/phoneUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'missing' | 'submitted' | 'not_in_group' | 'needs_review' | 'contacted';

const TABS: { key: TabKey; label: string; statusKey: string }[] = [
  { key: 'missing',       label: 'Unsubmitted',    statusKey: 'missing' },
  { key: 'submitted',     label: 'Submitted',      statusKey: 'submitted' },
  { key: 'not_in_group',  label: 'Not in Group',   statusKey: 'submitted_not_in_group' },
  { key: 'needs_review',  label: 'Review Matches', statusKey: 'needs_review' },
  { key: 'contacted',     label: 'Contacted',      statusKey: 'contacted' },
];

const VARIABLES = ['{{first_name}}', '{{form_link}}', '{{campaign_name}}', '{{due_date}}'];

const inputCls = 'w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function resolveMessage(template: string, person: CampaignPerson, campaign: Campaign): string {
  const due = campaign.due_date
    ? DateTime.fromISO(campaign.due_date).toFormat('MMMM d')
    : '';
  return template
    .replace(/\{\{first_name\}\}/g, person.first_name || '')
    .replace(/\{\{form_link\}\}/g, campaign.form_link || '')
    .replace(/\{\{campaign_name\}\}/g, campaign.name || '')
    .replace(/\{\{due_date\}\}/g, due);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return DateTime.fromISO(iso).toFormat('MMM d, yyyy');
}

function pctColor(pct: number | null) {
  if (pct === null) return 'text-slate-500';
  if (pct >= 80) return 'text-green-400';
  if (pct >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function bestPhone(p: CampaignPerson) {
  return p.mobile_phone || p.phone || '';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: string | number | null;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold mt-1 ${accent}`}>{value ?? '—'}</p>
    </div>
  );
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  return (
    <div className={`${sz} border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin`} />
  );
}

function formatValue(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (depth > 2) return '';
  if (Array.isArray(v)) return v.map(item => formatValue(item, depth + 1)).filter(Boolean).join(', ');
  const rec = v as Record<string, unknown>;
  if ('#text' in rec) return String(rec['#text']);
  const leaves = Object.entries(rec)
    .filter(([k]) => !k.startsWith('@_'))
    .map(([, val]) => formatValue(val, depth + 1))
    .filter(Boolean);
  return leaves.join(' | ');
}

function SubmissionDetail({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-slate-500 text-xs italic">No form data stored.</p>;
  const entries = Object.entries(data).filter(([k, v]) =>
    !k.startsWith('@_') && k !== 'phones' && k !== 'addresses' && v !== null && v !== ''
  );
  if (entries.length === 0) return <p className="text-slate-500 text-xs italic">No readable fields.</p>;
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-zinc-800/60">
        {entries.map(([k, v]) => {
          const formatted = formatValue(v);
          if (!formatted) return null;
          return (
            <tr key={k}>
              <td className="text-slate-500 font-mono w-40 whitespace-nowrap py-1.5 pr-4">{k}</td>
              <td className="break-all text-slate-300 py-1.5">{formatted}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { isAdmin } = useAuth();
  const admin = isAdmin();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [allPeople, setAllPeople] = useState<CampaignPerson[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [enrichingPhones, setEnrichingPhones] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('missing');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [msgTemplate, setMsgTemplate] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [contacting, setContacting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  // Edit campaign modal
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>(['']);
  const [editFormId, setEditFormId] = useState('');
  const [editFormLink, setEditFormLink] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editTemplate, setEditTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add person modal
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    id: string; firstName: string; lastName: string; fullName: string;
    email: string; phone: string; mobilePhone: string;
  }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCampaign = useCallback(async () => {
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}`, { headers });
    if (res.ok) {
      const json = await res.json();
      setCampaign(json.campaign);
      setMsgTemplate(json.campaign?.message_template || '');
    }
    setLoadingCampaign(false);
  }, [id]);

  const loadPeople = useCallback(async () => {
    setLoadingPeople(true);
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}/people`, { headers });
    if (res.ok) {
      const json = await res.json();
      setAllPeople(json.people ?? []);
    }
    setLoadingPeople(false);
  }, [id]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);

  useEffect(() => {
    if (campaign?.last_reconciled_at) loadPeople();
  }, [campaign?.last_reconciled_at, loadPeople]);

  useEffect(() => {
    setSelected(new Set());
    setGroupFilter(null);
  }, [activeTab]);

  const handleReconcile = useCallback(async () => {
    setReconciling(true);
    setReconcileError(null);
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}/reconcile`, {
      method: 'POST',
      headers,
    });
    const json = await res.json();
    if (!res.ok) {
      setReconcileError(json.message || json.error || 'Reconcile failed');
    } else {
      await loadCampaign();
      await loadPeople();
      // Enrich missing phone numbers via throttled CCB individual profile calls.
      // Runs after the UI is already showing data — no circuit breaker risk.
      setEnrichingPhones(true);
      fetch(`/api/campaigns/${id}/enrich-phones`, { method: 'POST', headers })
        .then(() => loadPeople())
        .catch(() => {})
        .finally(() => setEnrichingPhones(false));
    }
    setReconciling(false);
  }, [id, loadCampaign, loadPeople]);

  const tabPeople = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab) return [];
    return allPeople.filter(p => p.reconcile_status === tab.statusKey);
  }, [allPeople, activeTab]);

  const uniqueGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: string[] = [];
    for (const p of allPeople) {
      if (p.source_group_name && !seen.has(p.source_group_name)) {
        seen.add(p.source_group_name);
        groups.push(p.source_group_name);
      }
    }
    return groups;
  }, [allPeople]);

  const filteredPeople = useMemo(
    () => (groupFilter ? tabPeople.filter(p => p.source_group_name === groupFilter) : tabPeople),
    [tabPeople, groupFilter],
  );

  const filteredStats = useMemo(() => {
    if (!groupFilter) return null;
    const base = allPeople.filter(p => p.source_group_name === groupFilter);
    const submitted = base.filter(p => p.reconcile_status === 'submitted').length;
    const missing = base.filter(p => p.reconcile_status === 'missing').length;
    const needsReview = base.filter(p => p.reconcile_status === 'needs_review').length;
    const contacted = base.filter(p => p.reconcile_status === 'contacted').length;
    const expected = submitted + missing + needsReview + contacted;
    return {
      submitted,
      missing,
      needs_review: needsReview,
      contacted,
      expected,
      completion_pct: expected > 0 ? Math.round(((submitted + contacted) / expected) * 100) : 0,
    };
  }, [allPeople, groupFilter]);

  const allSelected = filteredPeople.length > 0 && filteredPeople.every(p => selected.has(p.id));

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) filteredPeople.forEach(p => next.delete(p.id));
      else filteredPeople.forEach(p => next.add(p.id));
      return next;
    });
  }

  function toggleRow(personId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function toggleExpand(personId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  const selectedPeople = useMemo(
    () => filteredPeople.filter(p => selected.has(p.id)),
    [filteredPeople, selected],
  );

  const previewPerson = selectedPeople[0] ?? null;
  const previewMessage = campaign && previewPerson
    ? resolveMessage(msgTemplate, previewPerson, campaign)
    : '';

  async function handleMarkContacted() {
    if (!selectedPeople.length) return;
    setContacting(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/contact`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_ids: selectedPeople.map(p => p.id),
          note: contactNote.trim() || undefined,
        }),
      });
      if (res.ok) {
        setContactSuccess(true);
        setSelected(new Set());
        setShowFollowUp(false);
        setContactNote('');
        await loadCampaign();
        await loadPeople();
        setTimeout(() => setContactSuccess(false), 3000);
      }
    } finally {
      setContacting(false);
    }
  }

  function sendMessage(person: CampaignPerson) {
    if (!campaign) return;
    const msg = resolveMessage(msgTemplate, person, campaign);
    navigator.clipboard.writeText(msg).catch(() => {});
    setCopiedId(person.id);
    setTimeout(() => setCopiedId(prev => prev === person.id ? null : prev), 2000);
    const phone = normalizePhone(bestPhone(person));
    if (phone) window.location.href = `sms:${phone}&body=${encodeURIComponent(msg)}`;
  }

  function openEdit() {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditGroupIds(campaign.ccb_group_ids?.length ? [...campaign.ccb_group_ids] : ['']);
    setEditFormId(campaign.ccb_form_id ?? '');
    setEditFormLink(campaign.form_link ?? '');
    setEditDueDate(campaign.due_date ?? '');
    setEditTemplate(campaign.message_template ?? '');
    setSaveError(null);
    setShowEdit(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    const cleanGroupIds = editGroupIds.map(gid => gid.trim()).filter(Boolean);
    if (cleanGroupIds.length === 0) { setSaveError('At least one CCB Group ID is required'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          ccb_group_ids: cleanGroupIds,
          ccb_form_id: editFormId.trim(),
          form_link: editFormLink.trim(),
          due_date: editDueDate,
          message_template: editTemplate.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      await loadCampaign();
      setShowEdit(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setSearchError(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const headers = await authHeader();
        const res = await fetch(`/api/campaigns/${id}/ccb-search?q=${encodeURIComponent(q.trim())}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Search failed');
        setSearchResults(json.individuals ?? []);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : 'Search failed');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  async function handleAddPerson(individual: typeof searchResults[0]) {
    setAddingId(individual.id);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/people`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ccb_individual: individual }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to add person');
      }
      setAddedIds(prev => new Set(prev).add(individual.id));
      await loadPeople();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Failed to add person');
    } finally {
      setAddingId(null);
    }
  }

  async function handleRemoveManual(personId: string) {
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}/people?person_id=${personId}`, {
      method: 'DELETE',
      headers,
    });
    if (res.ok) {
      await loadPeople();
    }
  }

  const showCheckboxes = activeTab === 'missing' || activeTab === 'needs_review';

  if (loadingCampaign) {
    return (
      <ProtectedRoute>
        <div className="flex justify-center items-center py-24">
          <Spinner size="lg" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!campaign) {
    return (
      <ProtectedRoute>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-slate-500 text-sm">Campaign not found.</p>
          <Link href="/campaigns" className="text-slate-400 hover:text-white text-sm mt-4 inline-block transition-colors">
            ← Campaigns
          </Link>
        </div>
      </ProtectedRoute>
    );
  }

  const expectedCount = (campaign.submitted_count ?? 0) + (campaign.missing_count ?? 0) + (campaign.needs_review_count ?? 0) + (campaign.contacted_count ?? 0);

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 lg:p-8 max-w-screen-xl mx-auto pb-32">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <Link
              href="/campaigns"
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wide"
            >
              ← Campaigns
            </Link>
            <h1 className="text-xl font-semibold text-white tracking-tight mt-1">{campaign.name}</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Due {formatDate(campaign.due_date)}
              {campaign.form_link && (
                <>
                  {' · '}
                  <a
                    href={campaign.form_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Open form ↗
                  </a>
                </>
              )}
            </p>
          </div>

          {admin && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-600">
                {campaign.last_reconciled_at
                  ? `Last reconciled ${formatDate(campaign.last_reconciled_at)}`
                  : 'Not yet reconciled'}
              </span>
              <button
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                onClick={openEdit}
              >
                Edit
              </button>
              <button
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                onClick={() => {
                  setShowAddPerson(true);
                  setSearchQuery('');
                  setSearchResults([]);
                  setAddedIds(new Set());
                  setSearchError(null);
                }}
              >
                + Add Person
              </button>
              <button
                className="bg-btn-success text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                onClick={handleReconcile}
                disabled={reconciling}
              >
                {reconciling ? <><Spinner size="sm" /> Reconciling…</> : 'Reconcile Now'}
              </button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {reconcileError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {reconcileError}
          </div>
        )}

        {/* Success toast */}
        {contactSuccess && (
          <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            Marked as contacted.
          </div>
        )}

        {/* Stats — top row: Expected / Submitted / Missing / Completion */}
        {campaign.last_reconciled_at && (
          <div className="space-y-3 mb-6">
            {groupFilter && (
              <p className="text-xs text-indigo-400/70 font-medium uppercase tracking-wide">
                Showing stats for: {groupFilter}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Invited" value={(filteredStats?.expected ?? expectedCount) || null} />
              <StatCard label="Submitted" value={filteredStats?.submitted ?? campaign.submitted_count} accent="text-green-400" />
              <StatCard label="Unsubmitted" value={filteredStats?.missing ?? campaign.missing_count} accent="text-red-400" />
              <StatCard
                label="Completion"
                value={(filteredStats?.completion_pct ?? campaign.completion_pct) !== null
                  ? `${(filteredStats?.completion_pct ?? campaign.completion_pct)?.toFixed(0)}%`
                  : null}
                accent={pctColor(filteredStats?.completion_pct ?? campaign.completion_pct)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Not in Group" value={filteredStats ? null : campaign.not_in_group_count} />
              <StatCard label="Review Matches" value={filteredStats?.needs_review ?? campaign.needs_review_count} accent="text-amber-400" />
              <StatCard label="Contacted" value={filteredStats?.contacted ?? campaign.contacted_count} accent="text-indigo-400" />
            </div>
          </div>
        )}

        {/* Not yet reconciled nudge */}
        {!campaign.last_reconciled_at && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col items-center justify-center py-16 mb-6 text-center">
            <p className="text-slate-500 text-sm">This campaign hasn&apos;t been reconciled yet.</p>
            {admin && (
              <button
                className="bg-btn-success text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity mt-4 flex items-center gap-2"
                onClick={handleReconcile}
                disabled={reconciling}
              >
                {reconciling ? <><Spinner size="sm" /> Reconciling…</> : 'Reconcile Now'}
              </button>
            )}
          </div>
        )}

        {/* Tabs + table */}
        {campaign.last_reconciled_at && (
          <>
            {/* Underline tabs */}
            <div className="border-b border-zinc-800 mb-4 flex gap-1 overflow-x-auto">
              {TABS.map(t => {
                const pool = groupFilter
                  ? allPeople.filter(p => p.source_group_name === groupFilter)
                  : allPeople;
                const count = allPeople.length > 0
                  ? pool.filter(p => p.reconcile_status === t.statusKey).length
                  : null;
                return (
                  <button
                    key={t.key}
                    className={`px-3 pb-2.5 pt-1 text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === t.key
                        ? 'border-b-2 border-indigo-400 text-indigo-300 -mb-px'
                        : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent -mb-px'
                    }`}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                    {count !== null && (
                      <span className="ml-1.5 text-xs opacity-50">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Group filter pills — only shown when 2+ groups */}
            {uniqueGroups.length >= 2 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    groupFilter === null
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-zinc-800 text-slate-400 border border-zinc-700 hover:text-slate-200'
                  }`}
                  onClick={() => setGroupFilter(null)}
                >
                  All groups
                </button>
                {uniqueGroups.map(g => (
                  <button
                    key={g}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      groupFilter === g
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-zinc-800 text-slate-400 border border-zinc-700 hover:text-slate-200'
                    }`}
                    onClick={() => setGroupFilter(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {/* People table */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              {loadingPeople ? (
                <div className="flex justify-center items-center py-12">
                  <Spinner />
                </div>
              ) : filteredPeople.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="text-slate-500 text-sm">No people in this bucket.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {showCheckboxes && (
                          <th className="w-10 px-4 py-3">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                              checked={allSelected}
                              onChange={toggleAll}
                            />
                          </th>
                        )}
                        <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Name</th>
                        <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Email</th>
                        <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                          Phone
                          {enrichingPhones && (
                            <span className="ml-2 text-xs font-normal text-slate-500 normal-case tracking-normal">
                              updating missing numbers…
                            </span>
                          )}
                        </th>
                        {uniqueGroups.length >= 2 && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Group</th>
                        )}
                        {activeTab === 'needs_review' && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Form Name</th>
                        )}
                        {activeTab === 'submitted' && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Match</th>
                        )}
                        {activeTab === 'contacted' && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Contacted</th>
                        )}
                        {activeTab === 'contacted' && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Note</th>
                        )}
                        {activeTab === 'submitted' && <th className="w-10 px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {filteredPeople.map(p => (
                        <React.Fragment key={p.id}>
                          <tr className="hover:bg-zinc-800/40 transition-colors align-top">
                            {showCheckboxes && (
                              <td className="px-4 pt-3.5">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                                  checked={selected.has(p.id)}
                                  onChange={() => toggleRow(p.id)}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 font-medium text-slate-200 whitespace-nowrap">
                              {p.first_name} {p.last_name}
                              {p.manually_added && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  <span className="text-xs text-slate-500 border border-zinc-700 rounded px-1 py-0.5 leading-none">manual</span>
                                  {(activeTab === 'missing' || activeTab === 'needs_review') && (
                                    <button
                                      className="text-slate-600 hover:text-red-400 transition-colors ml-0.5 leading-none"
                                      title="Remove from campaign"
                                      onClick={() => handleRemoveManual(p.id)}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400">{p.email || '—'}</td>
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{bestPhone(p) || '—'}</td>
                            {uniqueGroups.length >= 2 && (
                              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                {p.source_group_name || '—'}
                              </td>
                            )}
                            {activeTab === 'needs_review' && (
                              <td className="px-4 py-3 text-amber-400 text-xs">
                                {p.form_first_name || p.form_last_name
                                  ? `${p.form_first_name || ''} ${p.form_last_name || ''}`.trim()
                                  : '—'}
                              </td>
                            )}
                            {activeTab === 'submitted' && (
                              <td className="px-4 py-3 text-xs text-slate-500">{p.match_method || '—'}</td>
                            )}
                            {activeTab === 'contacted' && (
                              <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                {p.contacted_at ? formatDate(p.contacted_at) : '—'}
                              </td>
                            )}
                            {activeTab === 'contacted' && (
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                                {p.contact_note || '—'}
                              </td>
                            )}
                            {activeTab === 'submitted' && (
                              <td className="px-4 py-3">
                                <button
                                  className="text-slate-600 hover:text-slate-300 transition-colors text-xs"
                                  title="View submission"
                                  onClick={() => toggleExpand(p.id)}
                                >
                                  {expandedRows.has(p.id) ? '▲' : '▼'}
                                </button>
                              </td>
                            )}
                          </tr>
                          {activeTab === 'submitted' && expandedRows.has(p.id) && (
                            <tr key={`${p.id}-detail`} className="bg-zinc-900/60">
                              <td colSpan={uniqueGroups.length >= 2 ? 6 : 5} className="px-6 py-4">
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                                  Form Submission
                                </p>
                                <SubmissionDetail data={p.form_response_data} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {showCheckboxes && selected.size > 0 && !showFollowUp && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 shadow-xl z-40">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-medium text-white">{selected.size} selected</span>
            <button
              className="bg-btn-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              onClick={() => setShowFollowUp(true)}
            >
              Follow Up
            </button>
            <button
              className="text-slate-400 hover:text-white hover:bg-zinc-800 px-3 py-1.5 rounded-lg text-sm transition-colors"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Edit Campaign modal */}
      <Modal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit Campaign"
        size="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
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

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">CCB Group IDs</label>
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
                    required={i === 0}
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

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Form link</label>
            <input
              type="url"
              className={inputCls}
              placeholder="https://yourchurch.ccbchurch.com/goto/forms/56/responses/new"
              value={editFormLink}
              onChange={e => setEditFormLink(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Message template</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {VARIABLES.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-slate-300 font-mono text-xs px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    const ta = document.getElementById('edit-template-detail') as HTMLTextAreaElement | null;
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
              id="edit-template-detail"
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
              onClick={() => setShowEdit(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              disabled={saving}
            >
              {saving ? <><Spinner size="sm" /> Saving…</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Person modal */}
      <Modal
        isOpen={showAddPerson}
        onClose={() => setShowAddPerson(false)}
        title="Add Person from CCB"
        size="md"
      >
        <div className="space-y-4">
          <input
            type="text"
            className="w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Search by name or phone…"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            autoFocus
          />

          {searchError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {searchError}
            </div>
          )}

          <div className="overflow-y-auto max-h-72 -mx-1 px-1">
            {searching && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}

            {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">No results found.</p>
            )}

            {!searching && searchQuery.trim().length < 2 && (
              <p className="text-center text-slate-500 text-sm py-8">Type at least 2 characters to search.</p>
            )}

            {searchResults.length > 0 && (
              <div className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-700 overflow-hidden">
                {searchResults.map(ind => {
                  const isAdded = addedIds.has(ind.id);
                  const isAdding = addingId === ind.id;
                  const phone = ind.mobilePhone || ind.phone;
                  return (
                    <div key={ind.id} className="flex items-center gap-3 px-3 py-2.5 bg-zinc-800/60">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-200">{ind.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {[ind.email, phone].filter(Boolean).join(' · ') || 'No contact info'}
                        </p>
                      </div>
                      <button
                        className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isAdded
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-zinc-600'
                        }`}
                        disabled={isAdded || isAdding}
                        onClick={() => !isAdded && handleAddPerson(ind)}
                      >
                        {isAdding ? <Spinner size="sm" /> : isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-600 flex-1">
              People added here appear in the Missing tab. Run Reconcile to check their form status.
            </p>
            <button
              className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-zinc-800"
              onClick={() => setShowAddPerson(false)}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Follow-up modal */}
      <Modal
        isOpen={showFollowUp && !!campaign}
        onClose={() => setShowFollowUp(false)}
        title={`Follow Up — ${selectedPeople.length} ${selectedPeople.length === 1 ? 'person' : 'people'}`}
        size="lg"
      >
        <div className="space-y-5">
          {/* Template editor */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Message template</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {['{{first_name}}', '{{form_link}}', '{{campaign_name}}', '{{due_date}}'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-slate-300 font-mono text-xs px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    const ta = document.getElementById('follow-up-template') as HTMLTextAreaElement | null;
                    if (!ta) return;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    setMsgTemplate(ta.value.slice(0, start) + tag + ta.value.slice(end));
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              id="follow-up-template"
              className="w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              value={msgTemplate}
              onChange={e => setMsgTemplate(e.target.value)}
            />
          </div>

          {/* Preview */}
          {previewPerson && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Preview — {previewPerson.first_name} {previewPerson.last_name}
              </p>
              <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{previewMessage}</p>
              <div className="pt-1">
                <button
                  className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!bestPhone(previewPerson) ? 'No phone number on file' : undefined}
                  onClick={() => sendMessage(previewPerson)}
                >
                  {copiedId === previewPerson.id ? 'Sent' : 'Send iMessage'}
                </button>
              </div>
            </div>
          )}

          {/* Multi-person list */}
          {selectedPeople.length > 1 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">All selected</p>
              <div className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-700 overflow-hidden">
                {selectedPeople.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-800/40">
                    <span className="text-sm text-slate-200 flex-1">
                      {p.first_name} {p.last_name}
                      {bestPhone(p) && (
                        <span className="text-slate-500 ml-2 text-xs">{bestPhone(p)}</span>
                      )}
                    </span>
                    <button
                      className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!bestPhone(p) ? 'No phone number on file' : undefined}
                      onClick={() => sendMessage(p)}
                    >
                      {copiedId === p.id ? 'Sent' : 'Send iMessage'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Note (optional)</p>
            <textarea
              className="w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm h-16 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder="e.g. Texted all, most replied they'd submit by EOD"
              value={contactNote}
              onChange={e => setContactNote(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800"
              onClick={() => setShowFollowUp(false)}
            >
              Close
            </button>
            <button
              className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              onClick={handleMarkContacted}
              disabled={contacting}
            >
              {contacting
                ? <><Spinner size="sm" /> Marking…</>
                : 'Done'}
            </button>
          </div>
        </div>
      </Modal>
    </ProtectedRoute>
  );
}
