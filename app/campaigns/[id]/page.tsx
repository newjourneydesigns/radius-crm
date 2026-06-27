'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/ui/Modal';
import { Campaign, CampaignPerson } from '../../../hooks/useCampaigns';
import { normalizePhone } from '../../../lib/phoneUtils';
import { attrValues } from '../../../lib/campaigns/parseRoster';
import { StickyNote, ChevronDown, ChevronUp, Download, Trash2, Check, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'summary' | 'missing' | 'submitted' | 'not_in_group' | 'needs_review';

const TABS: { key: TabKey; label: string; statusKey: string }[] = [
  { key: 'missing',       label: 'Unsubmitted',    statusKey: 'missing' },
  { key: 'submitted',     label: 'Submitted',      statusKey: 'submitted' },
  { key: 'not_in_group',  label: 'Not in Group',   statusKey: 'submitted_not_in_group' },
  { key: 'needs_review',  label: 'Review Matches', statusKey: 'needs_review' },
];

const VARIABLES = ['{{first_name}}', '{{form_link}}', '{{campaign_name}}', '{{due_date}}'];

const inputCls = 'w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

// Sentinel dimension for the CCB source-group name (CCB-group campaigns).
// Pasted rosters expose their own free-form columns (attributes) as dimensions.
const SOURCE_DIM = '__source_group__';

// A person can belong to several values of one dimension (e.g. multiple teams),
// so grouping works on the set of values, not a single string.
function groupValuesOf(p: CampaignPerson, dim: string | null): string[] {
  if (!dim) return [];
  if (dim === SOURCE_DIM) return p.source_group_name ? [p.source_group_name] : [];
  return attrValues(p.attributes?.[dim]);
}

// Editable draft for a person's row (inline editor). Attribute values are edited
// as text; multiple values are shown/entered separated by "; ".
type PersonDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  note: string;
  attributes: Record<string, string>;
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  missing: 'Unsubmitted',
  submitted_not_in_group: 'Not in Group',
  needs_review: 'Needs Review',
  contacted: 'Contacted',
  expected: 'Expected',
};

// Quote a CSV cell only when it contains a comma, quote, or newline.
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Pull the Yes/No RSVP answer out of a CCB form submission. The RSVP question is
// the one whose title mentions attending/RSVP (distinct from e.g. a commitments
// agreement). Returns null when the form has no such question.
function rsvpAnswer(formData: Record<string, unknown> | null): 'yes' | 'no' | null {
  if (!formData) return null;
  const answers = (formData as { answers?: { title?: unknown; choice?: unknown } }).answers;
  if (!answers) return null;
  const titles = Array.isArray(answers.title) ? answers.title : answers.title != null ? [answers.title] : [];
  const choices = Array.isArray(answers.choice) ? answers.choice : answers.choice != null ? [answers.choice] : [];
  const idx = titles.findIndex((t: unknown) => /\b(attend|rsvp)\b|will you be able/i.test(String(t)));
  if (idx < 0) return null;
  const choice = choices[idx] as { '#text'?: unknown } | string | undefined;
  const text = choice && typeof choice === 'object' ? choice['#text'] : choice;
  const v = String(text ?? '').trim().toLowerCase();
  if (v.startsWith('yes')) return 'yes';
  if (v.startsWith('no')) return 'no';
  return null;
}

// Tidy a CCB form question into a short filter label: drop a leading "(Optional)",
// a trailing "(… Campus)", and any "– long description", and collapse the
// campus-specific RSVP question to a single "Attending".
function cleanQuestionLabel(title: unknown): string {
  let t = String(title ?? '');
  t = t.replace(/^\(optional\)\s*/i, '');
  t = t.replace(/\s*\([^)]*\)\s*$/, '');
  t = t.split(/\s[–—-]\s/)[0];
  t = t.replace(/[?:]\s*$/, '').trim();
  if (/\battend\b|\brsvp\b|will you be able/i.test(t)) return 'Attending';
  return t;
}

// Map a CCB form submission to { question label -> answer(s) } so each question
// can become a filter. Answers come from `choice` (or free-text `answer_value`).
function formAnswersOf(formData: Record<string, unknown> | null): Record<string, string | string[]> {
  if (!formData) return {};
  const answers = (formData as { answers?: { title?: unknown; choice?: unknown; answer_value?: unknown } }).answers;
  if (!answers) return {};
  const arr = (x: unknown) => (Array.isArray(x) ? x : x != null ? [x] : []);
  const titles = arr(answers.title);
  const choices = arr(answers.choice);
  const values = arr(answers.answer_value);
  const out: Record<string, string | string[]> = {};
  for (let i = 0; i < titles.length; i++) {
    const label = cleanQuestionLabel(titles[i]);
    if (!label) continue;
    const ch = choices[i] as { '#text'?: unknown } | string | undefined;
    const choiceText = ch && typeof ch === 'object' ? ch['#text'] : ch;
    const val = String(choiceText ?? values[i] ?? '').trim();
    if (!val) continue;
    const existing = out[label];
    if (existing == null) out[label] = val;
    else {
      const list = Array.isArray(existing) ? existing : [existing];
      if (!list.includes(val)) list.push(val);
      out[label] = list;
    }
  }
  return out;
}

type SummaryCell = { invited: number; responded: number; yes: number; no: number };

// Roll up invited people by one column's values (a multi-value person counts under
// each of their values; the total row counts each person once).
function summaryRows(people: CampaignPerson[], dimKey: string): { total: SummaryCell; rows: ({ value: string } & SummaryCell)[] } {
  const invited = people.filter(p => p.in_group);
  const total: SummaryCell = { invited: 0, responded: 0, yes: 0, no: 0 };
  const byVal = new Map<string, SummaryCell>();
  for (const p of invited) {
    const responded = p.in_form;
    const rsvp = responded ? rsvpAnswer(p.form_response_data) : null;
    total.invited++;
    if (responded) { total.responded++; if (rsvp === 'yes') total.yes++; else if (rsvp === 'no') total.no++; }
    for (const v of groupValuesOf(p, dimKey)) {
      let row = byVal.get(v);
      if (!row) { row = { invited: 0, responded: 0, yes: 0, no: 0 }; byVal.set(v, row); }
      row.invited++;
      if (responded) { row.responded++; if (rsvp === 'yes') row.yes++; else if (rsvp === 'no') row.no++; }
    }
  }
  const rows = Array.from(byVal.entries())
    .map(([value, s]) => ({ value, ...s }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return { total, rows };
}

function CampaignSummary({ people, facets }: { people: CampaignPerson[]; facets: { key: string; label: string }[] }) {
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  if (facets.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center">
        <p className="text-slate-400 text-sm">Nothing to summarize yet.</p>
        <p className="text-slate-500 text-xs mt-1">Add columns like Campus or Team to your invite list to see breakdowns.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {facets.map(f => {
        const { total, rows } = summaryRows(people, f.key);
        const renderRow = (label: string, s: SummaryCell, head = false) => (
          <tr className={head ? 'font-semibold text-slate-100 bg-zinc-800/40' : 'text-slate-200'}>
            <td className="px-4 py-2 whitespace-nowrap">{label}</td>
            <td className="px-4 py-2 text-right tabular-nums">{s.invited}</td>
            <td className="px-4 py-2 text-right tabular-nums">{s.responded}</td>
            <td className="px-4 py-2 text-right tabular-nums">{pct(s.responded, s.invited)}</td>
            <td className="px-4 py-2 text-right tabular-nums text-green-400/90">{s.yes}</td>
            <td className="px-4 py-2 text-right tabular-nums text-amber-400/90">{s.no}</td>
            <td className="px-4 py-2 text-right tabular-nums text-red-400/80">{s.invited - s.responded}</td>
          </tr>
        );
        return (
          <div key={f.key} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-white">By {f.label}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">{f.label}</th>
                    <th className="px-4 py-2 font-medium text-right">Invited</th>
                    <th className="px-4 py-2 font-medium text-right">Responded</th>
                    <th className="px-4 py-2 font-medium text-right">Resp %</th>
                    <th className="px-4 py-2 font-medium text-right">RSVP Yes</th>
                    <th className="px-4 py-2 font-medium text-right">RSVP No</th>
                    <th className="px-4 py-2 font-medium text-right">No Response</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {renderRow('All VCC', total, true)}
                  {rows.map(r => <React.Fragment key={r.value}>{renderRow(r.value, r)}</React.Fragment>)}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

function SortTh({ col, label, sortCol, sortDir, onSort, className = '' }: {
  col: string; label: React.ReactNode; sortCol: string | null; sortDir: 'asc' | 'desc';
  onSort: (col: string) => void; className?: string;
}) {
  const active = sortCol === col;
  return (
    <th
      className={`text-left text-xs font-medium uppercase tracking-wide px-4 py-3 cursor-pointer select-none group ${className}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-indigo-300' : 'text-slate-400 group-hover:text-slate-200'}`}>
        {label}
        <span className={`transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
          {active && sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </span>
    </th>
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
  const [editDrafts, setEditDrafts] = useState<Record<string, PersonDraft>>({});
  const [noteSaved, setNoteSaved] = useState<Record<string, boolean>>({});
  const [savingPerson, setSavingPerson] = useState<Record<string, boolean>>({});
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [msgTemplate, setMsgTemplate] = useState('');
  const [contactNote, setContactNote] = useState('');
  const [contacting, setContacting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  // Active column filters: { columnKey: selectedValue }. Multiple columns AND together.
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [globalSearch, setGlobalSearch] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Delete campaign confirmation
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolvingMatch, setResolvingMatch] = useState(false);

  // Edit campaign modal
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>(['']);
  const [editFormId, setEditFormId] = useState('');
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

  // Global people search across all tabs
  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return allPeople
      .filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [globalSearch, allPeople]);

  function tabForPerson(p: CampaignPerson): TabKey {
    if (p.reconcile_status === 'submitted') return 'submitted';
    if (p.reconcile_status === 'submitted_not_in_group') return 'not_in_group';
    if (p.reconcile_status === 'needs_review') return 'needs_review';
    return 'missing';
  }

  function jumpToPerson(p: CampaignPerson) {
    const tab = tabForPerson(p);
    setActiveTab(tab);
    setGlobalSearch('');
    setFilters({});
    setHighlightedId(p.id);
    setTimeout(() => {
      document.getElementById(`campaign-row-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    setTimeout(() => setHighlightedId(null), 2000);
  }

  // Close global search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target as Node)) {
        setGlobalSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  // Reset selection + sort when switching tabs, but keep column filters so they
  // carry from tab to tab (e.g. Campus = Lewisville stays applied as you move
  // between Unsubmitted / Submitted / Not in Group).
  useEffect(() => {
    setSelected(new Set());
    setSortCol(null);
    setSortDir('asc');
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

  // Every pasted-roster column across the campaign, first-seen order — the set of
  // attributes the inline editor offers so you can fill in a missing value too.
  const allAttrKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const p of allPeople) {
      if (!p.attributes) continue;
      for (const k of Object.keys(p.attributes)) {
        if (!seen.has(k)) { seen.add(k); keys.push(k); }
      }
    }
    return keys;
  }, [allPeople]);

  // Filterable columns ("facets"): the CCB source group plus any pasted-roster
  // column with a manageable set of distinct values, so Age/Birthdate (hundreds of
  // values) don't become giant dropdowns. Each facet filters independently and they
  // AND together — e.g. Campus = Lewisville AND Team = Kids AND Role = Leaders.
  const MAX_FACET_VALUES = 60;
  const facets = useMemo(() => {
    const valuesByKey = new Map<string, Set<string>>();
    const add = (key: string, val: string) => {
      let s = valuesByKey.get(key);
      if (!s) { s = new Set(); valuesByKey.set(key, s); }
      s.add(val);
    };
    for (const p of allPeople) {
      if (p.source_group_name) add(SOURCE_DIM, p.source_group_name);
      if (p.attributes) {
        for (const [k, v] of Object.entries(p.attributes)) {
          for (const val of attrValues(v)) add(k, val);
        }
      }
    }
    const out: { key: string; label: string; values: string[] }[] = [];
    const pushIf = (key: string, label: string) => {
      const set = valuesByKey.get(key);
      if (set && set.size >= 2 && set.size <= MAX_FACET_VALUES) {
        out.push({ key, label, values: Array.from(set).sort((a, b) => a.localeCompare(b)) });
      }
    };
    pushIf(SOURCE_DIM, 'Source group');
    for (const key of Array.from(valuesByKey.keys())) {
      if (key !== SOURCE_DIM) pushIf(key, key);
    }
    return out;
  }, [allPeople]);

  // Each responder's form answers, parsed once: { person id -> { question -> answer(s) } }.
  const formAnswersById = useMemo(() => {
    const m = new Map<string, Record<string, string | string[]>>();
    for (const p of allPeople) {
      if (p.in_form && p.form_response_data) m.set(p.id, formAnswersOf(p.form_response_data));
    }
    return m;
  }, [allPeople]);

  // Form-answer facets (Shirt Size, Area of Life, Attending, …) — filterable just
  // like the invite columns. Keyed with a "form:" prefix to keep them distinct.
  const formFacets = useMemo(() => {
    const valuesByLabel = new Map<string, Set<string>>();
    for (const answers of Array.from(formAnswersById.values())) {
      for (const [label, v] of Object.entries(answers)) {
        for (const val of attrValues(v)) {
          let s = valuesByLabel.get(label);
          if (!s) { s = new Set(); valuesByLabel.set(label, s); }
          s.add(val);
        }
      }
    }
    const out: { key: string; label: string; values: string[] }[] = [];
    for (const [label, set] of Array.from(valuesByLabel.entries())) {
      if (set.size >= 2 && set.size <= MAX_FACET_VALUES) {
        out.push({ key: `form:${label}`, label, values: Array.from(set).sort((a, b) => a.localeCompare(b)) });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [formAnswersById]);

  // Invite-column facets + form-answer facets. Summary uses `facets` only.
  const filterFacets = useMemo(() => [...facets, ...formFacets], [facets, formFacets]);

  const activeFilters = useMemo(() => Object.entries(filters).filter(([, v]) => v), [filters]);

  const matchesFilters = useCallback(
    (p: CampaignPerson) => activeFilters.every(([k, v]) => {
      if (k.startsWith('form:')) {
        return attrValues(formAnswersById.get(p.id)?.[k.slice(5)]).includes(v);
      }
      return groupValuesOf(p, k).includes(v);
    }),
    [activeFilters, formAnswersById],
  );

  // Drop any filter whose column or value disappeared after the data changed.
  useEffect(() => {
    setFilters(prev => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const f = filterFacets.find(ff => ff.key === k);
        if (f && f.values.includes(v)) next[k] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filterFacets]);

  // A person's value across all facets, for the table's context column.
  const facetSummary = useCallback(
    (p: CampaignPerson) =>
      facets
        .map(f => groupValuesOf(p, f.key).join('/'))
        .filter(Boolean)
        .join(' · '),
    [facets],
  );

  const filteredPeople = useMemo(() => tabPeople.filter(matchesFilters), [tabPeople, matchesFilters]);

  function onSort(col: string) {
    setSortCol(prev => {
      if (prev === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir('asc'); return col;
    });
  }

  function submittedAt(p: CampaignPerson): string {
    return String((p.form_response_data as Record<string, unknown> | null)?.created ?? '');
  }

  const sortedPeople = useMemo(() => {
    if (!sortCol) return filteredPeople;
    return [...filteredPeople].sort((a, b) => {
      let av = '', bv = '';
      if (sortCol === 'name')      { av = `${a.last_name} ${a.first_name}`.toLowerCase(); bv = `${b.last_name} ${b.first_name}`.toLowerCase(); }
      else if (sortCol === 'email')    { av = (a.email || '').toLowerCase(); bv = (b.email || '').toLowerCase(); }
      else if (sortCol === 'phone')    { av = bestPhone(a); bv = bestPhone(b); }
      else if (sortCol === 'group')    { av = facetSummary(a).toLowerCase(); bv = facetSummary(b).toLowerCase(); }
      else if (sortCol === 'submitted') { av = submittedAt(a); bv = submittedAt(b); }
      else if (sortCol === 'match')    { av = (a.match_method || '').toLowerCase(); bv = (b.match_method || '').toLowerCase(); }
      else if (sortCol === 'last_contacted') { av = a.contacted_at || '0000'; bv = b.contacted_at || '0000'; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredPeople, sortCol, sortDir, facetSummary]);

  const filteredStats = useMemo(() => {
    // Summary always shows the whole campaign — ignore (but don't clear) active filters there.
    if (activeFilters.length === 0 || activeTab === 'summary') return null;
    const base = allPeople.filter(matchesFilters);
    const submitted = base.filter(p => p.reconcile_status === 'submitted').length;
    const missing = base.filter(p => p.reconcile_status === 'missing').length;
    const needsReview = base.filter(p => p.reconcile_status === 'needs_review').length;
    const contacted = base.filter(p => p.contacted_at !== null).length;
    const expected = submitted + missing + needsReview;
    return {
      submitted,
      missing,
      needs_review: needsReview,
      contacted,
      expected,
      completion_pct: expected > 0 ? Math.round((submitted / expected) * 100) : 0,
    };
  }, [allPeople, activeFilters, matchesFilters, activeTab]);

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

  // Build an editable draft for a person, pre-filling every campaign attribute key
  // (blank when this person doesn't have it yet) so missing data can be added.
  function seedDraft(p: CampaignPerson): PersonDraft {
    return {
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      email: p.email || '',
      phone: bestPhone(p) || '',
      note: p.note || '',
      attributes: Object.fromEntries(allAttrKeys.map(k => [k, attrValues(p.attributes?.[k]).join('; ')])),
    };
  }

  function updateDraft(personId: string, patch: Partial<PersonDraft>) {
    setEditDrafts(prev => ({ ...prev, [personId]: { ...prev[personId], ...patch } }));
  }

  function updateDraftAttr(personId: string, key: string, value: string) {
    setEditDrafts(prev => ({
      ...prev,
      [personId]: { ...prev[personId], attributes: { ...prev[personId].attributes, [key]: value } },
    }));
  }

  async function savePerson(personId: string) {
    const draft = editDrafts[personId];
    if (!draft) return;
    setSavingPerson(prev => ({ ...prev, [personId]: true }));

    // Rebuild attributes: split each field on ";" → one value, an array, or drop it.
    const attributes: Record<string, string | string[]> = {};
    for (const [k, raw] of Object.entries(draft.attributes)) {
      const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
      if (parts.length === 1) attributes[k] = parts[0];
      else if (parts.length > 1) attributes[k] = parts;
    }

    const payload = {
      first_name: draft.first_name,
      last_name: draft.last_name,
      email: draft.email,
      phone: draft.phone,
      note: draft.note,
      attributes,
    };

    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/people/${personId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      setAllPeople(prev => prev.map(p => p.id === personId ? {
        ...p,
        first_name: payload.first_name.trim(),
        last_name: payload.last_name.trim(),
        email: payload.email.trim() || null,
        phone: normalizePhone(payload.phone) || null,
        note: payload.note.trim() || null,
        attributes: Object.keys(attributes).length ? attributes : null,
      } : p));
      setNoteSaved(prev => ({ ...prev, [personId]: true }));
      setTimeout(() => setNoteSaved(prev => { const n = { ...prev }; delete n[personId]; return n; }), 2000);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingPerson(prev => { const n = { ...prev }; delete n[personId]; return n; });
    }
  }

  // Note tabs: rows that show the inline note editor on expand
  const noteTabKeys: TabKey[] = ['missing', 'not_in_group', 'needs_review'];
  const isNoteTab = noteTabKeys.includes(activeTab);

  function toggleExpand(personId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  // Clicking a row toggles its expanded area (note editor on note tabs, submission
  // detail on the submitted tab). Seeds the note draft when opening on a note tab.
  function handleRowExpand(p: CampaignPerson) {
    const willOpen = !expandedRows.has(p.id);
    toggleExpand(p.id);
    if (willOpen && isNoteTab) {
      setEditDrafts(prev => ({ ...prev, [p.id]: seedDraft(p) }));
    }
  }

  // Export the whole campaign to CSV (every status), narrowed by any active column
  // filters. Includes all pasted columns and each person's note.
  function handleExport() {
    // Export exactly what's on screen: the current tab + active filters, in sort order.
    // The Summary tab always represents the whole campaign, so it exports everyone.
    const exportPeople = activeTab === 'summary' ? allPeople : sortedPeople;

    // Union of every pasted-roster column, in first-seen order.
    const attrKeys: string[] = [];
    const seenKeys = new Set<string>();
    for (const p of exportPeople) {
      if (!p.attributes) continue;
      for (const k of Object.keys(p.attributes)) {
        if (!seenKeys.has(k)) { seenKeys.add(k); attrKeys.push(k); }
      }
    }

    // Union of form-answer columns across the exported people (Shirt Size, Area of Life, …).
    const formKeys: string[] = [];
    const seenForm = new Set<string>();
    for (const p of exportPeople) {
      const ans = formAnswersById.get(p.id);
      if (!ans) continue;
      for (const k of Object.keys(ans)) {
        if (!seenForm.has(k)) { seenForm.add(k); formKeys.push(k); }
      }
    }

    const header = ['First Name', 'Last Name', 'CCB ID', 'Email', 'Phone', 'Status', 'Contacted At', ...attrKeys, ...formKeys, 'Note'];
    const rows = exportPeople.map(p => [
      p.first_name || '',
      p.last_name || '',
      p.ccb_individual_id || '',
      p.email || '',
      bestPhone(p) || '',
      STATUS_LABELS[p.reconcile_status] || p.reconcile_status,
      p.contacted_at ? DateTime.fromISO(p.contacted_at).toFormat('yyyy-MM-dd HH:mm') : '',
      ...attrKeys.map(k => attrValues(p.attributes?.[k]).join('; ')),
      ...formKeys.map(k => attrValues(formAnswersById.get(p.id)?.[k]).join('; ')),
      p.note || '',
    ]);

    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    // Prepend a BOM so Excel reads UTF-8 (accents, etc.) correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const safeName = (campaign?.name || 'campaign').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'campaign';
    const tabLabel = activeTab === 'summary' ? 'all' : (TABS.find(t => t.key === activeTab)?.label ?? activeTab);
    const tabSlug = tabLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-${tabSlug}-${DateTime.now().toFormat('yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete campaign');
      router.push('/campaigns');
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Failed to delete campaign');
      setDeleting(false);
      setShowDelete(false);
    }
  }

  // Resolve fuzzy "needs_review" matches: confirm (-> submitted) or reject (-> unsubmitted).
  async function resolveMatches(personIds: string[], resolution: 'confirmed' | 'rejected') {
    if (personIds.length === 0) return;
    setResolvingMatch(true);
    setReconcileError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/resolve-matches`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds, resolution }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to resolve match');
      setSelected(new Set());
      await Promise.all([loadCampaign(), loadPeople()]);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Failed to resolve match');
    } finally {
      setResolvingMatch(false);
    }
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
    setSentIds(prev => new Set(prev).add(person.id));
    const phone = normalizePhone(bestPhone(person));
    if (phone) window.location.href = `sms:${phone}&body=${encodeURIComponent(msg)}`;
  }

  function openEdit() {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditGroupIds(campaign.ccb_group_ids?.length ? [...campaign.ccb_group_ids] : ['']);
    setEditFormId(campaign.ccb_form_id ?? '');
    setEditDueDate(campaign.due_date ?? '');
    setEditTemplate(campaign.message_template ?? '');
    setSaveError(null);
    setShowEdit(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    const cleanGroupIds = editGroupIds.map(gid => gid.trim()).filter(Boolean);
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

  const expectedCount = (campaign.submitted_count ?? 0) + (campaign.missing_count ?? 0) + (campaign.needs_review_count ?? 0);

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

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-600">
              {campaign.last_reconciled_at
                ? `Last reconciled ${formatDate(campaign.last_reconciled_at)}`
                : 'Not yet reconciled'}
            </span>
            <button
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40"
              onClick={handleExport}
              disabled={allPeople.length === 0}
              title="Export the current view to CSV — the active tab + filters, with notes and form answers"
            >
              <Download className="w-4 h-4" strokeWidth={1.8} /> Export CSV
            </button>
            {admin && (
              <>
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
                <button
                  className="bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center"
                  onClick={() => setShowDelete(true)}
                  title="Delete campaign"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </>
            )}
          </div>
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

        {/* Stats */}
        {campaign.last_reconciled_at && (
          <div className="space-y-3 mb-6">
            {activeTab !== 'summary' && activeFilters.length > 0 && (
              <p className="text-xs text-indigo-400/70 font-medium uppercase tracking-wide">
                Showing stats for: {activeFilters.map(([, v]) => v).join(' · ')}
              </p>
            )}
            {/* Row 1 — primary headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Invited" value={(filteredStats?.expected ?? expectedCount) || null} />
              <StatCard
                label="Total Submitted"
                value={
                  filteredStats
                    ? filteredStats.submitted
                    : ((campaign.submitted_count ?? 0) + (campaign.not_in_group_count ?? 0)) || null
                }
                accent="text-green-400"
              />
              <StatCard label="Unsubmitted" value={filteredStats?.missing ?? campaign.missing_count} accent="text-red-400" />
              <StatCard
                label="Completion"
                value={(filteredStats?.completion_pct ?? campaign.completion_pct) !== null
                  ? `${(filteredStats?.completion_pct ?? campaign.completion_pct)?.toFixed(0)}%`
                  : null}
                accent={pctColor(filteredStats?.completion_pct ?? campaign.completion_pct)}
              />
            </div>
            {/* Row 2 — detail breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Submitted in Group" value={filteredStats?.submitted ?? campaign.submitted_count} accent="text-green-400/70" />
              <StatCard label="Contacted" value={filteredStats?.contacted ?? campaign.contacted_count} accent="text-indigo-400" />
              <StatCard label="Not in Group" value={filteredStats ? null : campaign.not_in_group_count} />
              <StatCard label="Review Matches" value={filteredStats?.needs_review ?? campaign.needs_review_count} accent="text-amber-400" />
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
            {/* Tabs row + global search */}
            <div className="flex items-end gap-3 mb-4">
            {/* Underline tabs */}
            <div className="border-b border-zinc-800 flex gap-1 overflow-x-auto flex-1">
              <button
                className={`px-3 pb-2.5 pt-1 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'summary'
                    ? 'border-b-2 border-indigo-400 text-indigo-300 -mb-px'
                    : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent -mb-px'
                }`}
                onClick={() => setActiveTab('summary')}
              >
                Summary
              </button>
              {TABS.map(t => {
                const pool = activeFilters.length
                  ? allPeople.filter(matchesFilters)
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

              {/* Global people search */}
              {allPeople.length > 0 && (
                <div ref={globalSearchRef} className="relative flex-shrink-0 pb-0.5">
                  <input
                    type="text"
                    placeholder="Find person…"
                    value={globalSearch}
                    onChange={e => setGlobalSearch(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 rounded-lg pl-8 pr-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  />
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  {globalSearchResults.length > 0 && (
                    <div className="absolute right-0 top-full mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                      {globalSearchResults.map(p => {
                        const tab = TABS.find(t => t.key === tabForPerson(p));
                        const badgeColor = {
                          missing: 'bg-red-500/15 text-red-400',
                          submitted: 'bg-green-500/15 text-green-400',
                          not_in_group: 'bg-slate-500/20 text-slate-400',
                          needs_review: 'bg-amber-500/15 text-amber-400',
                          contacted: 'bg-indigo-500/15 text-indigo-400',
                        }[tabForPerson(p)];
                        return (
                          <button
                            key={p.id}
                            className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors"
                            onClick={() => jumpToPerson(p)}
                          >
                            <span className="text-sm text-slate-200 truncate">
                              {p.first_name} {p.last_name}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badgeColor}`}>
                              {tab?.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {globalSearch.trim().length >= 2 && globalSearchResults.length === 0 && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-30 px-3 py-3">
                      <p className="text-xs text-slate-500">No matches found</p>
                    </div>
                  )}
                </div>
              )}
            </div>{/* end tabs row */}

            {/* Campaign summary (exec view) */}
            {activeTab === 'summary' && (
              <CampaignSummary people={allPeople} facets={facets} />
            )}

            {/* Column filter bar — one dropdown per filterable column; selections AND together */}
            {activeTab !== 'summary' && filterFacets.length >= 1 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {filterFacets.map(f => (
                  <div key={f.key} className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">{f.label}</span>
                    <select
                      value={filters[f.key] ?? ''}
                      onChange={e => {
                        const v = e.target.value;
                        setFilters(prev => {
                          const next = { ...prev };
                          if (v) next[f.key] = v; else delete next[f.key];
                          return next;
                        });
                      }}
                      className={`bg-zinc-800 border rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${
                        filters[f.key] ? 'border-indigo-500/50 text-indigo-200' : 'border-zinc-700 text-slate-300'
                      }`}
                    >
                      <option value="">All</option>
                      {f.values.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {activeFilters.length > 0 && (
                  <button
                    onClick={() => setFilters({})}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {/* People table */}
            {activeTab !== 'summary' && (
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
                        <SortTh col="name"  label="Name"  sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        <SortTh col="email" label="Email" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        <SortTh col="phone" label={
                          <span className="inline-flex items-center gap-1.5">
                            Phone
                            {enrichingPhones && <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">updating…</span>}
                          </span>
                        } sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        {facets.length >= 1 && (
                          <SortTh col="group" label="Groups" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        )}
                        {activeTab === 'missing' && (
                          <SortTh col="last_contacted" label="Last Contacted" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        )}
                        {activeTab === 'needs_review' && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Form Name</th>
                        )}
                        {/* Expand toggle for note tabs */}
                        {isNoteTab && <th className="w-10 px-4 py-3" />}
                        {activeTab === 'submitted' && (
                          <SortTh col="submitted" label="Submitted" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        )}
                        {activeTab === 'submitted' && (
                          <SortTh col="match" label="Match" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        )}
                        {activeTab === 'submitted' && <th className="w-10 px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {sortedPeople.map(p => (
                        <React.Fragment key={p.id}>
                          <tr
                            className={`hover:bg-zinc-800/40 transition-colors align-top ${(isNoteTab || activeTab === 'submitted') ? 'cursor-pointer' : ''}`}
                            onClick={(isNoteTab || activeTab === 'submitted') ? () => handleRowExpand(p) : undefined}
                          >
                            {showCheckboxes && (
                              <td className="px-4 pt-3.5">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                                  checked={selected.has(p.id)}
                                  onClick={e => e.stopPropagation()}
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
                                      onClick={e => { e.stopPropagation(); handleRemoveManual(p.id); }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td id={`campaign-row-${p.id}`} className={`px-4 py-3 text-slate-400 transition-colors duration-500 ${highlightedId === p.id ? 'bg-indigo-500/10' : ''}`}>{p.email || '—'}</td>
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{bestPhone(p) || '—'}</td>
                            {facets.length >= 1 && (
                              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                {facetSummary(p) || '—'}
                              </td>
                            )}
                            {activeTab === 'missing' && (
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                {p.contacted_at
                                  ? <span className="text-indigo-400">{DateTime.fromISO(p.contacted_at).toFormat('MMM d · h:mm a')}</span>
                                  : <span className="text-slate-600">—</span>}
                              </td>
                            )}
                            {activeTab === 'needs_review' && (
                              <td className="px-4 py-3 text-xs">
                                <div className="text-amber-400 mb-1.5">
                                  {p.form_first_name || p.form_last_name
                                    ? `${p.form_first_name || ''} ${p.form_last_name || ''}`.trim()
                                    : '—'}
                                </div>
                                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                                  <button
                                    className="inline-flex items-center gap-1 bg-green-600/90 hover:bg-green-600 text-white px-2 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50"
                                    onClick={() => resolveMatches([p.id], 'confirmed')}
                                    disabled={resolvingMatch}
                                    title="Same person — count as submitted"
                                  >
                                    <Check className="w-3.5 h-3.5" strokeWidth={2} /> Confirm
                                  </button>
                                  <button
                                    className="inline-flex items-center gap-1 bg-zinc-700 hover:bg-red-600 text-slate-200 hover:text-white px-2 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50"
                                    onClick={() => resolveMatches([p.id], 'rejected')}
                                    disabled={resolvingMatch}
                                    title="Not the same person — keep unsubmitted"
                                  >
                                    <X className="w-3.5 h-3.5" strokeWidth={2} /> Not a match
                                  </button>
                                </div>
                              </td>
                            )}
                            {activeTab === 'submitted' && (
                              <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                                {submittedAt(p)
                                  ? DateTime.fromSQL(submittedAt(p)).toFormat('MMM d · h:mm a')
                                  : '—'}
                              </td>
                            )}
                            {activeTab === 'submitted' && (
                              <td className="px-4 py-3 text-xs text-slate-500">{p.match_method || '—'}</td>
                            )}
                            {isNoteTab && (
                              <td className="px-4 py-3">
                                <button
                                  className={`transition-colors ${
                                    expandedRows.has(p.id) || p.note
                                      ? 'text-indigo-400'
                                      : 'text-slate-600 hover:text-slate-300'
                                  }`}
                                  title={expandedRows.has(p.id) ? 'Hide note' : (p.note ? 'Edit note' : 'Add note')}
                                  onClick={e => { e.stopPropagation(); handleRowExpand(p); }}
                                >
                                  <StickyNote className="w-4 h-4" strokeWidth={1.8} />
                                </button>
                              </td>
                            )}
                            {activeTab === 'submitted' && (
                              <td className="px-4 py-3">
                                <button
                                  className="text-slate-600 hover:text-slate-300 transition-colors"
                                  title="View submission"
                                  onClick={e => { e.stopPropagation(); toggleExpand(p.id); }}
                                >
                                  {expandedRows.has(p.id)
                                    ? <ChevronUp className="w-4 h-4" strokeWidth={1.8} />
                                    : <ChevronDown className="w-4 h-4" strokeWidth={1.8} />}
                                </button>
                              </td>
                            )}
                          </tr>
                          {isNoteTab && expandedRows.has(p.id) && editDrafts[p.id] && (
                            <tr key={`${p.id}-edit`} className="bg-zinc-900/60">
                              <td colSpan={99} className="px-6 py-4">
                                <div className="space-y-3 max-w-3xl" onClick={e => e.stopPropagation()}>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {([
                                      { key: 'first_name', label: 'First name', type: 'text' },
                                      { key: 'last_name', label: 'Last name', type: 'text' },
                                      { key: 'email', label: 'Email', type: 'email' },
                                      { key: 'phone', label: 'Phone', type: 'tel' },
                                    ] as const).map(field => (
                                      <div key={field.key}>
                                        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">{field.label}</label>
                                        <input
                                          type={field.type}
                                          className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                          placeholder="—"
                                          value={editDrafts[p.id][field.key]}
                                          onChange={e => updateDraft(p.id, { [field.key]: e.target.value } as Partial<PersonDraft>)}
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {allAttrKeys.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {allAttrKeys.map(k => (
                                        <div key={k}>
                                          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">{k}</label>
                                          <input
                                            type="text"
                                            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                            placeholder="—"
                                            value={editDrafts[p.id].attributes[k] ?? ''}
                                            onChange={e => updateDraftAttr(p.id, k, e.target.value)}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Note</label>
                                    <textarea
                                      className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                      placeholder="Add a note about this person…"
                                      value={editDrafts[p.id].note}
                                      onChange={e => updateDraft(p.id, { note: e.target.value })}
                                    />
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <button
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                      onClick={() => savePerson(p.id)}
                                      disabled={!!savingPerson[p.id]}
                                    >
                                      {savingPerson[p.id] ? <><Spinner size="sm" /> Saving…</> : (noteSaved[p.id] ? 'Saved ✓' : 'Save')}
                                    </button>
                                    {allAttrKeys.length > 0 && (
                                      <span className="text-[11px] text-slate-500">Separate multiple values with a semicolon (;)</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {activeTab === 'submitted' && expandedRows.has(p.id) && (
                            <tr key={`${p.id}-detail`} className="bg-zinc-900/60">
                              <td colSpan={facets.length >= 1 ? 6 : 5} className="px-6 py-4">
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
            )}
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {showCheckboxes && selected.size > 0 && !showFollowUp && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 shadow-xl z-40">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-medium text-white">{selected.size} selected</span>
            {activeTab === 'needs_review' ? (
              <>
                <button
                  className="bg-btn-success text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                  onClick={() => resolveMatches(Array.from(selected), 'confirmed')}
                  disabled={resolvingMatch}
                >
                  <Check className="w-4 h-4" strokeWidth={2} /> Confirm matches
                </button>
                <button
                  className="bg-zinc-700 hover:bg-red-600 text-slate-200 hover:text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  onClick={() => resolveMatches(Array.from(selected), 'rejected')}
                  disabled={resolvingMatch}
                >
                  <X className="w-4 h-4" strokeWidth={2} /> Not a match
                </button>
              </>
            ) : (
              <button
                className="bg-btn-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                onClick={() => setShowFollowUp(true)}
              >
                Follow Up
              </button>
            )}
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
      {/* Delete campaign confirmation */}
      <Modal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete campaign?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            This permanently deletes <span className="font-medium text-white">{campaign.name}</span> and all{' '}
            {allPeople.length} {allPeople.length === 1 ? 'person' : 'people'} in it, including their notes and contact
            history. This can&apos;t be undone.
          </p>
          <p className="text-xs text-slate-500">
            To keep the data but hide the campaign, use Archive from the Campaigns list instead.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800"
              onClick={() => setShowDelete(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              className="bg-btn-danger text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <><Spinner size="sm" /> Deleting…</> : 'Delete campaign'}
            </button>
          </div>
        </div>
      </Modal>

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
              <div className="pt-1 flex items-center gap-2">
                {sentIds.has(previewPerson.id) ? (
                  <>
                    <span className="text-xs text-green-400 font-medium">Sent</span>
                    <button
                      className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!bestPhone(previewPerson) ? 'No phone number on file' : undefined}
                      onClick={() => sendMessage(previewPerson)}
                    >
                      Send Again
                    </button>
                  </>
                ) : (
                  <button
                    className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!bestPhone(previewPerson) ? 'No phone number on file' : undefined}
                    onClick={() => sendMessage(previewPerson)}
                  >
                    Send iMessage
                  </button>
                )}
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
                    {sentIds.has(p.id) ? (
                      <>
                        <span className="text-xs text-green-400 font-medium">Sent</span>
                        <button
                          className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={!bestPhone(p) ? 'No phone number on file' : undefined}
                          onClick={() => sendMessage(p)}
                        >
                          Send Again
                        </button>
                      </>
                    ) : (
                      <button
                        className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={!bestPhone(p) ? 'No phone number on file' : undefined}
                        onClick={() => sendMessage(p)}
                      >
                        Send iMessage
                      </button>
                    )}
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
