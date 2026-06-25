'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Campaign, CampaignPerson } from '../../../hooks/useCampaigns';
import { normalizePhone } from '../../../lib/phoneUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'missing' | 'submitted' | 'not_in_group' | 'needs_review' | 'contacted';

const TABS: { key: TabKey; label: string; statusKey: string }[] = [
  { key: 'missing',       label: 'Missing',        statusKey: 'missing' },
  { key: 'submitted',     label: 'Submitted',      statusKey: 'submitted' },
  { key: 'not_in_group',  label: 'Not in Group',   statusKey: 'submitted_not_in_group' },
  { key: 'needs_review',  label: 'Needs Review',   statusKey: 'needs_review' },
  { key: 'contacted',     label: 'Contacted',      statusKey: 'contacted' },
];

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
  if (pct === null) return 'text-base-content/30';
  if (pct >= 80) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-error';
}

function bestPhone(p: CampaignPerson) {
  return p.mobile_phone || p.phone || '';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, className }: { label: string; value: string | number | null; className?: string }) {
  return (
    <div className="stat px-4 py-3">
      <div className="stat-title text-xs">{label}</div>
      <div className={`stat-value text-2xl ${className ?? ''}`}>{value ?? '—'}</div>
    </div>
  );
}

function SubmissionDetail({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-base-content/40 text-xs italic">No form data stored.</p>;
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('@_') && k !== 'phones' && k !== 'addresses');
  if (entries.length === 0) return <p className="text-base-content/40 text-xs italic">No readable fields.</p>;
  return (
    <table className="table table-xs w-full text-xs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td className="text-base-content/50 font-mono w-40 whitespace-nowrap">{k}</td>
            <td className="break-all">{String(v ?? '')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const admin = isAdmin();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [people, setPeople] = useState<CampaignPerson[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('missing');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [msgTemplate, setMsgTemplate] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [contacting, setContacting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);

  // Load campaign
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

  // Load people for current tab
  const loadPeople = useCallback(async (status?: string) => {
    setLoadingPeople(true);
    const headers = await authHeader();
    const url = status
      ? `/api/campaigns/${id}/people?status=${status}`
      : `/api/campaigns/${id}/people`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const json = await res.json();
      setPeople(json.people ?? []);
    }
    setLoadingPeople(false);
  }, [id]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);

  useEffect(() => {
    const tab = TABS.find(t => t.key === activeTab);
    if (tab) loadPeople(tab.statusKey);
    setSelected(new Set());
  }, [activeTab, loadPeople]);

  // Reconcile
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
      if (json.error === 'ccb_permission') {
        setReconcileError(json.message);
      } else {
        setReconcileError(json.message || json.error || 'Reconcile failed');
      }
    } else {
      await loadCampaign();
      const tab = TABS.find(t => t.key === activeTab);
      if (tab) await loadPeople(tab.statusKey);
    }
    setReconciling(false);
  }, [id, activeTab, loadCampaign, loadPeople]);

  // Selection helpers
  const tabPeople = people;
  const allSelected = tabPeople.length > 0 && tabPeople.every(p => selected.has(p.id));

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) tabPeople.forEach(p => next.delete(p.id));
      else tabPeople.forEach(p => next.add(p.id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Selected people objects
  const selectedPeople = useMemo(
    () => tabPeople.filter(p => selected.has(p.id)),
    [tabPeople, selected],
  );

  // First selected person for message preview
  const previewPerson = selectedPeople[0] ?? null;
  const previewMessage = campaign && previewPerson
    ? resolveMessage(msgTemplate, previewPerson, campaign)
    : '';

  // Mark as contacted
  async function handleMarkContacted() {
    if (!selectedPeople.length) return;
    setContacting(true);
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
      const tab = TABS.find(t => t.key === activeTab);
      if (tab) await loadPeople(tab.statusKey);
    }
    setContacting(false);
    setTimeout(() => setContactSuccess(false), 3000);
  }

  function openSMS(person: CampaignPerson) {
    if (!campaign) return;
    const phone = normalizePhone(bestPhone(person));
    if (!phone) return;
    const msg = resolveMessage(msgTemplate, person, campaign);
    window.location.href = `sms:${phone}&body=${encodeURIComponent(msg)}`;
  }

  function copyMessage(person: CampaignPerson) {
    if (!campaign) return;
    const msg = resolveMessage(msgTemplate, person, campaign);
    navigator.clipboard.writeText(msg).catch(() => {});
  }

  const showCheckboxes = activeTab === 'missing' || activeTab === 'needs_review';

  if (loadingCampaign) {
    return (
      <ProtectedRoute>
        <div className="flex justify-center py-24">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!campaign) {
    return (
      <ProtectedRoute>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-base-content/40">Campaign not found.</p>
          <Link href="/campaigns" className="btn btn-sm btn-ghost mt-4">← Campaigns</Link>
        </div>
      </ProtectedRoute>
    );
  }

  const expectedCount = (campaign.submitted_count ?? 0) + (campaign.missing_count ?? 0) + (campaign.needs_review_count ?? 0) + (campaign.contacted_count ?? 0);

  return (
    <ProtectedRoute>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 pb-32">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/campaigns" className="text-sm text-base-content/40 hover:text-base-content/70 transition-colors">
              ← Campaigns
            </Link>
            <h1 className="text-2xl font-bold mt-1">{campaign.name}</h1>
            <p className="text-sm text-base-content/40 mt-0.5">
              Due {formatDate(campaign.due_date)}
              {campaign.form_link && (
                <>
                  {' · '}
                  <a href={campaign.form_link} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                    Open form ↗
                  </a>
                </>
              )}
            </p>
          </div>
          {admin && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-base-content/30">
                {campaign.last_reconciled_at
                  ? `Last reconciled ${formatDate(campaign.last_reconciled_at)}`
                  : 'Not yet reconciled'}
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleReconcile}
                disabled={reconciling}
              >
                {reconciling
                  ? <><span className="loading loading-spinner loading-xs" /> Reconciling…</>
                  : 'Reconcile Now'}
              </button>
            </div>
          )}
        </div>

        {/* CCB permission error */}
        {reconcileError && (
          <div className="alert alert-error text-sm">
            <span>{reconcileError}</span>
          </div>
        )}

        {/* Contact success toast */}
        {contactSuccess && (
          <div className="alert alert-success text-sm">
            Marked as contacted.
          </div>
        )}

        {/* Stats bar */}
        {campaign.last_reconciled_at && (
          <div className="stats stats-horizontal bg-base-200 border border-base-300 w-full overflow-x-auto shadow-none">
            <StatBox label="Expected" value={expectedCount || null} />
            <StatBox label="Submitted" value={campaign.submitted_count} className="text-success" />
            <StatBox label="Missing" value={campaign.missing_count} className="text-error" />
            <StatBox label="Not in Group" value={campaign.not_in_group_count} />
            <StatBox label="Needs Review" value={campaign.needs_review_count} className="text-warning" />
            <StatBox label="Contacted" value={campaign.contacted_count} className="text-info" />
            <div className="stat px-4 py-3">
              <div className="stat-title text-xs">Completion</div>
              <div className={`stat-value text-2xl ${pctColor(campaign.completion_pct)}`}>
                {campaign.completion_pct !== null ? `${campaign.completion_pct.toFixed(0)}%` : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Not yet reconciled nudge */}
        {!campaign.last_reconciled_at && (
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body items-center text-center py-12">
              <p className="text-base-content/50 text-sm">This campaign hasn't been reconciled yet.</p>
              {admin && (
                <button
                  className="btn btn-primary btn-sm mt-3"
                  onClick={handleReconcile}
                  disabled={reconciling}
                >
                  {reconciling ? <span className="loading loading-spinner loading-xs" /> : 'Reconcile Now'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        {campaign.last_reconciled_at && (
          <>
            <div role="tablist" className="tabs tabs-boxed bg-base-200 w-fit">
              {TABS.map(t => (
                <button
                  key={t.key}
                  role="tab"
                  className={`tab text-sm ${activeTab === t.key ? 'tab-active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* People table */}
            <div className="card bg-base-200 border border-base-300 overflow-x-auto">
              {loadingPeople ? (
                <div className="flex justify-center py-10">
                  <span className="loading loading-spinner loading-md" />
                </div>
              ) : tabPeople.length === 0 ? (
                <div className="py-12 text-center text-base-content/30 text-sm">No people in this bucket.</div>
              ) : (
                <table className="table table-zebra w-full text-sm">
                  <thead>
                    <tr className="text-base-content/50 text-xs uppercase tracking-wider">
                      {showCheckboxes && (
                        <th className="w-8">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={allSelected}
                            onChange={toggleAll}
                          />
                        </th>
                      )}
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      {activeTab === 'needs_review' && <th>Form Name</th>}
                      {activeTab === 'submitted' && <th>Match</th>}
                      {activeTab === 'contacted' && <th>Contacted</th>}
                      {activeTab === 'contacted' && <th>Note</th>}
                      {activeTab === 'submitted' && <th className="w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tabPeople.map(p => (
                      <React.Fragment key={p.id}>
                        <tr className="align-top">
                          {showCheckboxes && (
                            <td className="pt-3">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={selected.has(p.id)}
                                onChange={() => toggleRow(p.id)}
                              />
                            </td>
                          )}
                          <td className="font-medium whitespace-nowrap">
                            {p.first_name} {p.last_name}
                          </td>
                          <td className="text-base-content/60">{p.email || '—'}</td>
                          <td className="text-base-content/60 whitespace-nowrap">
                            {bestPhone(p) || '—'}
                          </td>
                          {activeTab === 'needs_review' && (
                            <td className="text-warning text-xs">
                              {p.form_first_name || p.form_last_name
                                ? `${p.form_first_name || ''} ${p.form_last_name || ''}`.trim()
                                : '—'}
                            </td>
                          )}
                          {activeTab === 'submitted' && (
                            <td className="text-xs text-base-content/40">{p.match_method || '—'}</td>
                          )}
                          {activeTab === 'contacted' && (
                            <td className="text-xs text-base-content/40 whitespace-nowrap">
                              {p.contacted_at ? formatDate(p.contacted_at) : '—'}
                            </td>
                          )}
                          {activeTab === 'contacted' && (
                            <td className="text-xs text-base-content/50 max-w-xs truncate">
                              {p.contact_note || '—'}
                            </td>
                          )}
                          {activeTab === 'submitted' && (
                            <td>
                              <button
                                className="btn btn-ghost btn-xs text-base-content/40"
                                title="View submission"
                                onClick={() => toggleExpand(p.id)}
                              >
                                {expandedRows.has(p.id) ? '▲' : '▼'}
                              </button>
                            </td>
                          )}
                        </tr>
                        {/* Expanded submission detail */}
                        {activeTab === 'submitted' && expandedRows.has(p.id) && (
                          <tr key={`${p.id}-detail`} className="bg-base-300/50">
                            <td colSpan={5} className="py-3 px-4">
                              <p className="text-xs font-semibold text-base-content/50 mb-2 uppercase tracking-wider">
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
              )}
            </div>
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {showCheckboxes && selected.size > 0 && !showFollowUp && (
        <div className="fixed bottom-0 left-0 right-0 bg-base-300 border-t border-base-content/10 shadow-xl z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowFollowUp(true)}>
              Follow Up
            </button>
            <button className="btn btn-ghost btn-sm text-base-content/40" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Follow-up modal */}
      {showFollowUp && campaign && (
        <div className="modal modal-open modal-bottom sm:modal-middle z-50">
          <div className="modal-box w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">
                Follow Up — {selectedPeople.length} {selectedPeople.length === 1 ? 'person' : 'people'}
              </h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowFollowUp(false)}>✕</button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4">
              {/* Template editor */}
              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium text-sm">Message template</span>
                </label>
                {/* Variable chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { tag: '{{first_name}}' },
                    { tag: '{{form_link}}' },
                    { tag: '{{campaign_name}}' },
                    { tag: '{{due_date}}' },
                  ].map(v => (
                    <button
                      key={v.tag}
                      type="button"
                      className="btn btn-xs btn-ghost border border-base-300 font-mono text-xs"
                      onClick={() => {
                        const ta = document.getElementById('follow-up-template') as HTMLTextAreaElement | null;
                        if (!ta) return;
                        const start = ta.selectionStart;
                        const end = ta.selectionEnd;
                        const next = ta.value.slice(0, start) + v.tag + ta.value.slice(end);
                        setMsgTemplate(next);
                      }}
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
                <textarea
                  id="follow-up-template"
                  className="textarea textarea-bordered w-full h-24 text-sm font-mono leading-relaxed"
                  value={msgTemplate}
                  onChange={e => setMsgTemplate(e.target.value)}
                />
              </div>

              {/* Preview for first selected person */}
              {previewPerson && (
                <div className="bg-base-300 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                    Preview — {previewPerson.first_name} {previewPerson.last_name}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{previewMessage}</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="btn btn-xs btn-ghost border border-base-300"
                      onClick={() => copyMessage(previewPerson)}
                    >
                      Copy
                    </button>
                    {bestPhone(previewPerson) && (
                      <button
                        className="btn btn-xs btn-ghost border border-base-300"
                        onClick={() => openSMS(previewPerson)}
                      >
                        Open SMS
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Multi-person list */}
              {selectedPeople.length > 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
                    All selected
                  </p>
                  <div className="divide-y divide-base-content/10 rounded-lg border border-base-300 overflow-hidden">
                    {selectedPeople.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-base-200">
                        <span className="text-sm flex-1">
                          {p.first_name} {p.last_name}
                          {bestPhone(p) && <span className="text-base-content/40 ml-2 text-xs">{bestPhone(p)}</span>}
                        </span>
                        <button
                          className="btn btn-ghost btn-xs border border-base-300"
                          onClick={() => copyMessage(p)}
                        >
                          Copy
                        </button>
                        {bestPhone(p) && (
                          <button
                            className="btn btn-ghost btn-xs border border-base-300"
                            onClick={() => openSMS(p)}
                          >
                            SMS
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note + mark contacted */}
              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text text-sm">Note (optional)</span>
                </label>
                <textarea
                  className="textarea textarea-bordered text-sm h-16"
                  placeholder="e.g. Texted all, most replied they'd submit by EOD"
                  value={contactNote}
                  onChange={e => setContactNote(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-action mt-4 pt-4 border-t border-base-content/10">
              <button
                className="btn btn-primary"
                onClick={handleMarkContacted}
                disabled={contacting}
              >
                {contacting
                  ? <span className="loading loading-spinner loading-sm" />
                  : `Mark ${selectedPeople.length} as Contacted`}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowFollowUp(false)}>
                Close
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" onClick={() => setShowFollowUp(false)} />
        </div>
      )}
    </ProtectedRoute>
  );
}
