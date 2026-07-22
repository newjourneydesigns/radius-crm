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
import { useMacCompanion } from '../../../hooks/useMacCompanion';
import CompanionGuideModal from '../../../components/companion/CompanionGuideModal';
import EventSearchPicker from '../../../components/campaigns/EventSearchPicker';
import { isEventAttendanceEnabled } from '../../../lib/campaigns/event-attendance-flag';
import { attrValues } from '../../../lib/campaigns/parseRoster';
import { guessCampusFromGroupName } from '../../../lib/campaigns/campus';
import { StickyNote, ChevronDown, ChevronUp, Download, Trash2, Check, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'summary' | 'missing' | 'submitted' | 'not_in_group' | 'needs_review' | 'excluded';

const TABS: { key: TabKey; label: string; statusKey: string }[] = [
  { key: 'missing',       label: 'Unsubmitted',    statusKey: 'missing' },
  { key: 'submitted',     label: 'Submitted',      statusKey: 'submitted' },
  { key: 'not_in_group',  label: 'Not in Group',   statusKey: 'submitted_not_in_group' },
  { key: 'needs_review',  label: 'Review Matches', statusKey: 'needs_review' },
  { key: 'excluded',      label: 'Off-boarded',    statusKey: 'excluded' },
];

const VARIABLES = ['{{first_name}}', '{{form_link}}', '{{campaign_name}}', '{{due_date}}'];

const inputCls = 'w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

// Sentinel dimension for the CCB source-group name (CCB-group campaigns).
// Pasted rosters expose their own free-form columns (attributes) as dimensions.
const SOURCE_DIM = '__source_group__';
// Sentinel dimension for event check-in status (campaigns with CCB events).
const ATTENDED_DIM = '__attended__';

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
  // The date the person was contacted, as 'yyyy-MM-dd' ('' = not contacted).
  contacted_at: string;
  attributes: Record<string, string>;
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  missing: 'Unsubmitted',
  submitted_not_in_group: 'Not in Group',
  needs_review: 'Needs Review',
  contacted: 'Contacted',
  expected: 'Expected',
  excluded: 'Off-boarded',
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

type SummaryCell = { invited: number; responded: number; yes: number; no: number; attended: number };

// Roll up invited people by one column's values (a multi-value person counts under
// each of their values; the total row counts each person once).
function summaryRows(people: CampaignPerson[], dimKey: string): { total: SummaryCell; rows: ({ value: string } & SummaryCell)[] } {
  const invited = people.filter(p => p.in_group);
  const total: SummaryCell = { invited: 0, responded: 0, yes: 0, no: 0, attended: 0 };
  const byVal = new Map<string, SummaryCell>();
  for (const p of invited) {
    const responded = p.in_form;
    const rsvp = responded ? rsvpAnswer(p.form_response_data) : null;
    total.invited++;
    if (responded) { total.responded++; if (rsvp === 'yes') total.yes++; else if (rsvp === 'no') total.no++; }
    if (p.attended) total.attended++;
    for (const v of groupValuesOf(p, dimKey)) {
      let row = byVal.get(v);
      if (!row) { row = { invited: 0, responded: 0, yes: 0, no: 0, attended: 0 }; byVal.set(v, row); }
      row.invited++;
      if (responded) { row.responded++; if (rsvp === 'yes') row.yes++; else if (rsvp === 'no') row.no++; }
      if (p.attended) row.attended++;
    }
  }
  const rows = Array.from(byVal.entries())
    .map(([value, s]) => ({ value, ...s }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return { total, rows };
}

function CampaignSummary({ people, facets, showAttendance }: {
  people: CampaignPerson[];
  facets: { key: string; label: string }[];
  showAttendance: boolean;
}) {
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
            {showAttendance && (
              <>
                <td className="px-4 py-2 text-right tabular-nums text-teal-400/90">{s.attended}</td>
                <td className="px-4 py-2 text-right tabular-nums text-teal-400/70">{pct(s.attended, s.invited)}</td>
              </>
            )}
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
                    {showAttendance && (
                      <>
                        <th className="px-4 py-2 font-medium text-right">Attended</th>
                        <th className="px-4 py-2 font-medium text-right">Att %</th>
                      </>
                    )}
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
  onClick,
  active = false,
}: {
  label: string;
  value: string | number | null;
  accent?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold mt-1 ${accent}`}>{value ?? '—'}</p>
    </>
  );
  const base = 'rounded-xl border bg-zinc-900/40 px-4 py-3 sm:px-5 sm:py-4 transition-colors';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${base} w-full text-left cursor-pointer hover:bg-zinc-800/50 focus:outline-none focus:ring-1 focus:ring-indigo-500 active:scale-[0.99] ${
          active ? 'border-indigo-500/60 ring-1 ring-indigo-500/40' : 'border-zinc-800 hover:border-zinc-600'
        }`}
      >
        {body}
      </button>
    );
  }
  return <div className={`${base} border-zinc-800`}>{body}</div>;
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

// Multi-select dropdown for one filter column. Checked values OR together
// within the column; different columns still AND together.
function FacetMultiSelect({ values, selected, onChange }: {
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }

  const summary =
    selected.length === 0 ? 'All'
    : selected.length === 1 ? selected[0]
    : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-1.5 bg-zinc-800 border rounded-lg px-2.5 py-1.5 text-xs text-left focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${
          selected.length > 0 ? 'border-indigo-500/50 text-indigo-200' : 'border-zinc-700 text-slate-300'
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 min-w-[11rem] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-30 overflow-hidden">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-zinc-800 transition-colors border-b border-zinc-800 disabled:opacity-40"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            All (clear selection)
          </button>
          <div className="max-h-52 overflow-y-auto py-1">
            {values.map(v => (
              <label
                key={v}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-zinc-800 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer flex-shrink-0"
                  checked={selected.includes(v)}
                  onChange={() => toggle(v)}
                />
                <span className="truncate">{v}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
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
  const [checkingAttendance, setCheckingAttendance] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState<string | null>(null);
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
  const companion = useMacCompanion();
  const [isAutoSending, setIsAutoSending] = useState(false);
  const [autoProgress, setAutoProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoSendError, setAutoSendError] = useState<string | null>(null);
  const [showCompanionGuide, setShowCompanionGuide] = useState(false);
  // Delivery verification (Auto Send only): personId -> outcome. Populated in
  // the background after a batch by reading Apple's delivery receipts, so a
  // green-bubble number that silently failed gets flagged instead of counted
  // as sent.
  const [deliveryStatus, setDeliveryStatus] = useState<Record<string, 'delivered' | 'failed' | 'pending' | 'unconfirmed'>>({});
  const [verifying, setVerifying] = useState(false);
  // True when the companion can't read chat.db (Full Disk Access not granted),
  // so we couldn't verify delivery for the last batch.
  const [verifyUnavailable, setVerifyUnavailable] = useState(false);
  // Delivery-tracking capability + the python binary to grant Full Disk Access,
  // fetched from the companion when the setup guide is open.
  const [fdaInfo, setFdaInfo] = useState<{ capable: boolean; pythonPath?: string } | null>(null);
  // True when Text Message Forwarding is off — the Mac can't reach non-iPhone
  // (Android) numbers, so smart routing can't fall back to green SMS.
  const [smsRelayOff, setSmsRelayOff] = useState(false);
  // Active column filters: { columnKey: selectedValues }. Values within one
  // column OR together (Team = Kids or Host); multiple columns AND together.
  const [filters, setFilters] = useState<Record<string, string[]>>({});
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
  const [excluding, setExcluding] = useState(false);

  // "Count as invited" (Not in Group tab): restore submitters who were removed
  // from the CCB group after being invited, optionally re-picking their group.
  const [showMarkInvited, setShowMarkInvited] = useState(false);
  const [markInvitedGroup, setMarkInvitedGroup] = useState('');
  const [markingInvited, setMarkingInvited] = useState(false);

  // Edit campaign modal
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>(['']);
  const [editEventIds, setEditEventIds] = useState<string[]>(['']);
  // Per-group campus overrides ({ group_id: campus }); blank = auto-detect
  const [editCampusMap, setEditCampusMap] = useState<Record<string, string>>({});
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
    if (p.reconcile_status === 'excluded') return 'excluded';
    return 'missing';
  }

  function jumpToPerson(p: CampaignPerson) {
    const tab = tabForPerson(p);
    setActiveTab(tab);
    setGlobalSearch('');
    setFilters({});
    setHighlightedId(p.id);
    setTimeout(() => {
      // Both the desktop row and the mobile card exist in the DOM; scroll the
      // one that's actually visible (the other is hidden via responsive classes).
      const targets = [
        document.getElementById(`campaign-row-${p.id}`),
        document.getElementById(`campaign-card-${p.id}`),
      ];
      const visible = targets.find(el => el && el.offsetParent !== null) ?? targets.find(Boolean);
      visible?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Pull day-of check-ins from the campaign's events. Separate from Reconcile
  // because with many events the sweep is slow — run it on demand instead.
  const handleCheckAttendance = useCallback(async () => {
    setCheckingAttendance(true);
    setReconcileError(null);
    setAttendanceMsg(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/attendance`, { method: 'POST', headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Attendance check failed');
      await Promise.all([loadCampaign(), loadPeople()]);
      const failNote = json.events_failed?.length
        ? ` (${json.events_failed.length} event${json.events_failed.length === 1 ? '' : 's'} couldn't be read)`
        : '';
      setAttendanceMsg(
        `Attendance updated — ${json.counts?.attended ?? 0} checked in, ${json.newly_attended} new${failNote}.`,
      );
      setTimeout(() => setAttendanceMsg(null), 6000);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Attendance check failed');
    } finally {
      setCheckingAttendance(false);
    }
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
    // Lead with the dimensions execs care about most (Campus first), then the rest.
    const rank = (label: string) => {
      const l = label.toLowerCase();
      if (l === 'source group') return 0;
      if (l === 'campus') return 1;
      if (l === 'team') return 2;
      if (l.includes('leader') || l.includes('stm')) return 3;
      return 9;
    };
    out.sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
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

  // Event attendance (Check Attendance button, Checked In / Attendance % cards,
  // Checked In filter/columns, Event IDs field) is behind a feature flag,
  // default off — hidden everywhere until NEXT_PUBLIC_EVENT_ATTENDANCE_ENABLED
  // is "true", regardless of whether a campaign has CCB event IDs.
  const eventAttendanceEnabled = isEventAttendanceEnabled();
  const hasEvents = eventAttendanceEnabled && (campaign?.ccb_event_ids?.length ?? 0) > 0;

  // Invite-column facets + check-in facet (event campaigns) + form-answer facets.
  // Summary uses `facets` only.
  const filterFacets = useMemo(
    () => [
      ...facets,
      ...(hasEvents ? [{ key: ATTENDED_DIM, label: 'Checked In', values: ['Yes', 'No'] }] : []),
      ...formFacets,
    ],
    [facets, formFacets, hasEvents],
  );

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, vals]) => vals.length > 0),
    [filters],
  );

  const matchesFilters = useCallback(
    (p: CampaignPerson) => activeFilters.every(([k, vals]) => {
      const personVals =
        k === ATTENDED_DIM ? [p.attended ? 'Yes' : 'No']
        : k.startsWith('form:') ? attrValues(formAnswersById.get(p.id)?.[k.slice(5)])
        : groupValuesOf(p, k);
      // OR within the column: any selected value counts as a match.
      return vals.some(v => personVals.includes(v));
    }),
    [activeFilters, formAnswersById],
  );

  // Drop any filter values whose column or value disappeared after the data changed.
  useEffect(() => {
    setFilters(prev => {
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [k, vals] of Object.entries(prev)) {
        const f = filterFacets.find(ff => ff.key === k);
        const kept = f ? vals.filter(v => f.values.includes(v)) : [];
        if (kept.length > 0) next[k] = kept;
        if (kept.length !== vals.length) changed = true;
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
      else if (sortCol === 'attended')  { av = a.attended ? '1' : '0'; bv = b.attended ? '1' : '0'; }
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
    const attended = base.filter(p => p.attended).length;
    const expected = submitted + missing + needsReview;
    return {
      submitted,
      missing,
      needs_review: needsReview,
      contacted,
      attended,
      expected,
      completion_pct: expected > 0 ? Math.round((submitted / expected) * 100) : 0,
      attendance_pct: expected > 0 ? Math.round((attended / expected) * 100) : 0,
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
      contacted_at: p.contacted_at ? DateTime.fromISO(p.contacted_at).toFormat('yyyy-MM-dd') : '',
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

    // Only send the contact date when it actually changed, so plain note edits
    // don't trigger a needless count recompute on the server.
    const person = allPeople.find(p => p.id === personId);
    const origContacted = person?.contacted_at ? DateTime.fromISO(person.contacted_at).toFormat('yyyy-MM-dd') : '';
    const contactedChanged = draft.contacted_at !== origContacted;

    const payload: Record<string, unknown> = {
      first_name: draft.first_name,
      last_name: draft.last_name,
      email: draft.email,
      phone: draft.phone,
      note: draft.note,
      attributes,
    };
    if (contactedChanged) payload.contacted_at = draft.contacted_at || null;

    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/people/${personId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      const { person: saved } = await res.json();
      setAllPeople(prev => prev.map(p => p.id === personId ? {
        ...p,
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim() || null,
        phone: normalizePhone(draft.phone) || null,
        note: draft.note.trim() || null,
        attributes: Object.keys(attributes).length ? attributes : null,
        ...(contactedChanged ? { contacted_at: saved?.contacted_at ?? null, contacted_by: saved?.contacted_by ?? null } : {}),
      } : p));
      // The contact date shifts the cached "Contacted" stat card — refresh it.
      if (contactedChanged) loadCampaign();
      setNoteSaved(prev => ({ ...prev, [personId]: true }));
      setTimeout(() => setNoteSaved(prev => { const n = { ...prev }; delete n[personId]; return n; }), 2000);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingPerson(prev => { const n = { ...prev }; delete n[personId]; return n; });
    }
  }

  // Off-board people (remove from the unsubmitted pool) or restore them back to it.
  async function setExcluded(personIds: string[], excluded: boolean) {
    if (personIds.length === 0) return;
    setExcluding(true);
    setReconcileError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/exclude`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_ids: personIds, excluded }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      setSelected(new Set());
      setExpandedRows(prev => { const n = new Set(prev); personIds.forEach(pid => n.delete(pid)); return n; });
      await Promise.all([loadCampaign(), loadPeople()]);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Failed to off-board');
    } finally {
      setExcluding(false);
    }
  }

  // Known group names, keyed by group id — lets the campus-mapping editor show
  // "LVT | Circles | Leader" instead of a bare id (names arrive via reconcile).
  const groupNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPeople) {
      if (p.source_group_id && p.source_group_name) m.set(p.source_group_id, p.source_group_name);
    }
    return m;
  }, [allPeople]);

  // Every source group seen across the campaign — offered when re-attributing a
  // "Count as invited" person to the group they were originally invited through.
  const sourceGroupOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPeople) if (p.source_group_name) s.add(p.source_group_name);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allPeople]);

  function openMarkInvited() {
    // Single-group campaigns get the group preselected; multi-group ones choose.
    setMarkInvitedGroup(sourceGroupOptions.length === 1 ? sourceGroupOptions[0] : '');
    setShowMarkInvited(true);
  }

  async function handleMarkInvited() {
    if (selected.size === 0) return;
    setMarkingInvited(true);
    setReconcileError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/mark-invited`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_ids: Array.from(selected),
          source_group_name: markInvitedGroup || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to count as invited');
      setSelected(new Set());
      setShowMarkInvited(false);
      await Promise.all([loadCampaign(), loadPeople()]);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Failed to count as invited');
    } finally {
      setMarkingInvited(false);
    }
  }

  // Note tabs: rows that show the inline editor (note, contact date, off-board) on expand
  const noteTabKeys: TabKey[] = ['missing', 'not_in_group', 'needs_review', 'excluded'];
  const isNoteTab = noteTabKeys.includes(activeTab);

  function toggleExpand(personId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  // Jump to a people tab from a top stat card. On mobile (where the tabs are a
  // dropdown and the stats fill the screen) scroll down to the list so the
  // switch is visible; on larger screens the tabs are already in view.
  function goToTab(tab: TabKey) {
    setActiveTab(tab);
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setTimeout(() => {
        document.getElementById('campaign-people-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
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

    const header = [
      'First Name', 'Last Name', 'CCB ID', 'Email', 'Phone', 'Status', 'Contacted At',
      ...(hasEvents ? ['Checked In'] : []),
      ...attrKeys, ...formKeys, 'Note',
    ];
    const rows = exportPeople.map(p => [
      p.first_name || '',
      p.last_name || '',
      p.ccb_individual_id || '',
      p.email || '',
      bestPhone(p) || '',
      STATUS_LABELS[p.reconcile_status] || p.reconcile_status,
      p.contacted_at ? DateTime.fromISO(p.contacted_at).toFormat('yyyy-MM-dd HH:mm') : '',
      ...(hasEvents ? [p.attended ? 'Yes' : ''] : []),
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

  // Delivery-verification rollups for the Auto Send summary + guidance.
  const failedPeople = selectedPeople.filter(p => deliveryStatus[p.id] === 'failed');
  const unconfirmedPeople = selectedPeople.filter(p => deliveryStatus[p.id] === 'unconfirmed');
  const deliveredCount = selectedPeople.filter(p => deliveryStatus[p.id] === 'delivered').length;
  // Surface the ones needing attention (not delivered / unconfirmed) at the top
  // so they're easy to tap through on a phone.
  const deliveryRank: Record<string, number> = { failed: 0, unconfirmed: 1, pending: 2 };
  const orderedSelected = [...selectedPeople].sort(
    (a, b) => (deliveryRank[deliveryStatus[a.id] ?? ''] ?? 3) - (deliveryRank[deliveryStatus[b.id] ?? ''] ?? 3),
  );

  // When the setup guide opens with a running companion, ask it whether
  // delivery tracking is on and which python binary needs Full Disk Access.
  useEffect(() => {
    if (showCompanionGuide && companion.available) {
      companion.verifyCapable().then(setFdaInfo);
    }
  }, [showCompanionGuide, companion.available, companion.verifyCapable]);

  async function handleMarkContacted() {
    if (!selectedPeople.length) return;
    // Don't mark a message that never delivered as "contacted" — leave those
    // people uncontacted so they resurface for a follow-up on another device.
    const contactablePeople = selectedPeople.filter(p => deliveryStatus[p.id] !== 'failed');
    if (!contactablePeople.length) return;
    setContacting(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/campaigns/${id}/contact`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_ids: contactablePeople.map(p => p.id),
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

  async function sendMessage(person: CampaignPerson) {
    if (!campaign) return;
    const msg = resolveMessage(msgTemplate, person, campaign);
    // The copy must finish before the sms: launch — Messages steals document
    // focus, which rejects a still-pending writeText and leaves the previous
    // recipient's personalized message on the clipboard.
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      // Fall through — the sms: body still carries the message on platforms
      // that honor it.
    }
    setSentIds(prev => new Set(prev).add(person.id));
    const phone = normalizePhone(bestPhone(person));
    if (phone) window.location.href = `sms:${phone}&body=${encodeURIComponent(msg)}`;
  }

  async function handleAutoSendAll() {
    if (!selectedPeople.length || !msgTemplate.trim() || !companion.available || !campaign) return;
    // An out-of-date companion is the one that can silently fake "sent" — force
    // the update rather than trusting it.
    if (companion.needsUpdate) {
      setShowCompanionGuide(true);
      return;
    }
    setAutoSendError(null);
    const pre = await companion.preflight();
    if (!pre.ok) {
      setAutoSendError(pre.error || 'Messages is not ready to send.');
      return;
    }
    // sms_available === false means Text Message Forwarding is off, so
    // non-iPhone numbers can't be reached. Warn but don't block — iMessage
    // users still go through.
    setSmsRelayOff(pre.sms_available === false);
    // Reset any verification state from a previous batch.
    setDeliveryStatus({});
    setVerifyUnavailable(false);
    setVerifying(false);
    setIsAutoSending(true);
    setAutoProgress({ done: 0, total: selectedPeople.length });
    const delayMs = selectedPeople.length < 25 ? 0 : selectedPeople.length < 100 ? 1000 : 2000;
    // Batch start — anything sent after this is what delivery verification looks at.
    const sinceMs = Date.now();
    const attempted: { personId: string; phone: string }[] = [];
    let sent = 0, failed = 0;
    for (let i = 0; i < selectedPeople.length; i++) {
      const p = selectedPeople[i];
      const phone = normalizePhone(bestPhone(p));
      if (phone) {
        const result = await companion.send(phone, resolveMessage(msgTemplate, p, campaign), delayMs);
        if (result.success) {
          sent++;
          setSentIds(prev => new Set(prev).add(p.id));
          // "Success" here only means queued — verification decides delivery.
          attempted.push({ personId: p.id, phone });
        } else {
          failed++;
        }
      } else {
        failed++;
      }
      setAutoProgress({ done: i + 1, total: selectedPeople.length });
    }
    await companion.notify(sent, failed);
    setIsAutoSending(false);
    setAutoProgress(null);
    // Kick off background delivery verification — doesn't block the modal.
    verifyDelivery(attempted, sinceMs);
  }

  // Poll Apple's delivery receipts (via the companion) until every attempted
  // message resolves to delivered/failed or we hit the timeout. Failures are
  // the slow case — iMessage keeps retrying a green-bubble number for up to a
  // couple of minutes before it gives up, so we keep checking in the background.
  async function verifyDelivery(attempted: { personId: string; phone: string }[], sinceMs: number) {
    if (!attempted.length) return;
    const phones = attempted.map(a => a.phone);
    const phoneToPerson = new Map(attempted.map(a => [a.phone, a.personId]));
    setVerifying(true);
    const deadline = Date.now() + 3 * 60 * 1000;

    const poll = async () => {
      const res = await companion.verify(phones, sinceMs);
      if (!res.ok || !res.results) {
        // Can't read delivery receipts (usually Full Disk Access not granted).
        if (res.error === 'no_access') setVerifyUnavailable(true);
        setVerifying(false);
        return;
      }
      const results = res.results;
      let anyPending = false;
      const next: Record<string, 'delivered' | 'failed' | 'pending'> = {};
      for (const [phone, personId] of phoneToPerson) {
        const status = results[phone]?.status ?? 'unknown';
        if (status === 'failed') next[personId] = 'failed';
        else if (status === 'delivered') next[personId] = 'delivered';
        else { anyPending = true; next[personId] = 'pending'; }
      }
      setDeliveryStatus(prev => ({ ...prev, ...next }));

      if (anyPending && Date.now() < deadline) {
        setTimeout(poll, 10000);
      } else {
        // Anything still pending at the deadline is unconfirmed — surface it
        // softly rather than claiming it delivered.
        setDeliveryStatus(prev => {
          const finalized = { ...prev };
          for (const personId of phoneToPerson.values()) {
            if (finalized[personId] === 'pending') finalized[personId] = 'unconfirmed';
          }
          return finalized;
        });
        setVerifying(false);
      }
    };
    poll();
  }

  // Add an event id from the picker: fill the first blank slot, else append.
  function addEditEventId(evId: string) {
    setEditEventIds(prev => {
      if (prev.map(x => x.trim()).includes(evId)) return prev;
      const blank = prev.findIndex(x => !x.trim());
      if (blank >= 0) return prev.map((x, i) => (i === blank ? evId : x));
      return [...prev, evId];
    });
  }

  function openEdit() {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditGroupIds(campaign.ccb_group_ids?.length ? [...campaign.ccb_group_ids] : ['']);
    setEditEventIds(campaign.ccb_event_ids?.length ? [...campaign.ccb_event_ids] : ['']);
    setEditCampusMap({ ...(campaign.group_campus_map ?? {}) });
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
    const cleanEventIds = editEventIds.map(eid => eid.trim()).filter(Boolean);
    // Only keep overrides for groups still on the campaign; blank = auto-detect.
    const cleanCampusMap: Record<string, string> = {};
    for (const gid of cleanGroupIds) {
      const v = (editCampusMap[gid] ?? '').trim();
      if (v) cleanCampusMap[gid] = v;
    }
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
          ccb_event_ids: cleanEventIds,
          group_campus_map: cleanCampusMap,
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

  // Every people tab has row selection + bulk actions (Follow Up texting works
  // anywhere; each tab adds its own specific actions).
  const showCheckboxes = activeTab !== 'summary';

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

  // Day-of check-ins (only meaningful when the campaign tracks CCB events).
  // Attendance % is attended / invited, mirroring the completion math.
  const attendedCount = filteredStats?.attended ?? campaign.attended_count;
  const attendanceExpected = filteredStats?.expected ?? expectedCount;
  const attendancePct =
    attendedCount !== null && attendanceExpected > 0
      ? Math.round((attendedCount / attendanceExpected) * 100)
      : null;

  // Inline editor for a person (name/contact/attributes/note). Shared by the
  // desktop table's expanded row and the mobile card so behavior stays identical.
  const renderEditPanel = (p: CampaignPerson) => {
    if (!editDrafts[p.id]) return null;
    return (
      <div className="space-y-3" onClick={e => e.stopPropagation()}>
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

        {/* Contact date — set it here or with the quick button, then Save */}
        <div className="border-t border-zinc-800 pt-3">
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Contacted</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors [color-scheme:dark]"
              value={editDrafts[p.id].contacted_at}
              onChange={e => updateDraft(p.id, { contacted_at: e.target.value })}
            />
            {editDrafts[p.id].contacted_at ? (
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1"
                onClick={() => updateDraft(p.id, { contacted_at: '' })}
              >
                Clear
              </button>
            ) : (
              <button
                type="button"
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1"
                onClick={() => updateDraft(p.id, { contacted_at: DateTime.now().toFormat('yyyy-MM-dd') })}
              >
                Mark contacted today
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">The date you reached out. Save to apply.</p>
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
          {activeTab === 'excluded' ? (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-slate-200 bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              onClick={() => setExcluded([p.id], false)}
              disabled={excluding}
              title="Move back into the unsubmitted pool"
            >
              Restore to Unsubmitted
            </button>
          ) : activeTab === 'missing' ? (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-slate-200 bg-zinc-700 hover:bg-amber-600 hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              onClick={() => setExcluded([p.id], true)}
              disabled={excluding}
              title="Remove from the unsubmitted pool so they don't count against completion"
            >
              Off-board
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  // Read-only form submission detail. Shared by table + card on the Submitted tab.
  const renderSubmissionPanel = (p: CampaignPerson) => (
    <>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Form Submission</p>
      <SubmissionDetail data={p.form_response_data} />
    </>
  );

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 lg:p-8 max-w-screen-xl mx-auto pb-32">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
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

          {/* Actions — Reconcile leads (full width on mobile), the rest sit below it */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3 lg:flex-wrap">
            {admin && (
              <button
                className="order-1 bg-btn-success text-white px-3 py-2.5 lg:py-1.5 rounded-lg text-sm font-semibold lg:font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={handleReconcile}
                disabled={reconciling}
              >
                {reconciling ? <><Spinner size="sm" /> Reconciling…</> : 'Reconcile Now'}
              </button>
            )}
            {admin && hasEvents && campaign.last_reconciled_at && (
              <button
                className="order-1 bg-btn-success text-white px-3 py-2.5 lg:py-1.5 rounded-lg text-sm font-semibold lg:font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={handleCheckAttendance}
                disabled={checkingAttendance || reconciling}
                title="Pull day-of check-ins from the campaign's CCB events"
              >
                {checkingAttendance ? <><Spinner size="sm" /> Checking…</> : 'Check Attendance'}
              </button>
            )}
            <div className="order-2 grid grid-cols-2 gap-2 lg:flex lg:items-center lg:gap-3">
              <button
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 lg:py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                onClick={handleExport}
                disabled={allPeople.length === 0}
                title="Export the current view to CSV — the active tab + filters, with notes and form answers"
              >
                <Download className="w-4 h-4" strokeWidth={1.8} /> Export CSV
              </button>
              {admin && (
                <>
                  <button
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 lg:py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
                    onClick={openEdit}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 lg:py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
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
                    className="bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white px-3 py-2 lg:py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                    onClick={() => setShowDelete(true)}
                    title="Delete campaign"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                    <span className="lg:hidden">Delete</span>
                  </button>
                </>
              )}
            </div>
            <span className="order-3 text-xs text-slate-600 lg:order-first">
              {campaign.last_reconciled_at
                ? `Last reconciled ${formatDate(campaign.last_reconciled_at)}`
                : 'Not yet reconciled'}
            </span>
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

        {/* Attendance sweep result */}
        {attendanceMsg && (
          <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-300">
            {attendanceMsg}
          </div>
        )}

        {/* Stats */}
        {campaign.last_reconciled_at && (
          <div className="space-y-3 mb-6">
            {activeTab !== 'summary' && activeFilters.length > 0 && (
              <p className="text-xs text-indigo-400/70 font-medium uppercase tracking-wide">
                Showing stats for: {activeFilters.map(([, vals]) => vals.join(' / ')).join(' · ')}
              </p>
            )}
            {/* Row 1 — primary headline numbers, in follow-up priority order */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Unsubmitted"
                value={filteredStats?.missing ?? campaign.missing_count}
                accent="text-red-400"
                onClick={() => goToTab('missing')}
                active={activeTab === 'missing'}
              />
              <StatCard
                label="Total Submitted"
                value={
                  filteredStats
                    ? filteredStats.submitted
                    : ((campaign.submitted_count ?? 0) + (campaign.not_in_group_count ?? 0)) || null
                }
                accent="text-green-400"
                onClick={() => goToTab('submitted')}
                active={activeTab === 'submitted'}
              />
              <StatCard label="Invited" value={(filteredStats?.expected ?? expectedCount) || null} />
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
              <StatCard
                label="Submitted in Group"
                value={filteredStats?.submitted ?? campaign.submitted_count}
                accent="text-green-400/70"
                onClick={() => goToTab('submitted')}
                active={activeTab === 'submitted'}
              />
              <StatCard label="Contacted" value={filteredStats?.contacted ?? campaign.contacted_count} accent="text-indigo-400" />
              <StatCard
                label="Not in Group"
                value={filteredStats ? null : campaign.not_in_group_count}
                onClick={() => goToTab('not_in_group')}
                active={activeTab === 'not_in_group'}
              />
              <StatCard
                label="Review Matches"
                value={filteredStats?.needs_review ?? campaign.needs_review_count}
                accent="text-amber-400"
                onClick={() => goToTab('needs_review')}
                active={activeTab === 'needs_review'}
              />
            </div>
            {/* Row 3 — day-of check-ins, only when the campaign tracks CCB events */}
            {hasEvents && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Checked In" value={attendedCount} accent="text-teal-400" />
                <StatCard
                  label="Attendance"
                  value={attendancePct !== null ? `${attendancePct}%` : null}
                  accent={pctColor(attendancePct)}
                />
              </div>
            )}
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
            {/* Anchor for stat-card → tab navigation scroll on mobile */}
            <div id="campaign-people-anchor" className="scroll-mt-4" />
            {/* Tabs / view picker + global search */}
            <div className="mb-4 space-y-3">
              {/* Find person — own full-width line on mobile, inline on desktop */}
              {allPeople.length > 0 && (
                <div ref={globalSearchRef} className="relative w-full sm:hidden">
                  <input
                    type="text"
                    placeholder="Find person…"
                    value={globalSearch}
                    onChange={e => setGlobalSearch(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  {globalSearchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-30 overflow-hidden">
                      {globalSearchResults.map(p => {
                        const tab = TABS.find(t => t.key === tabForPerson(p));
                        const badgeColor = {
                          missing: 'bg-red-500/15 text-red-400',
                          submitted: 'bg-green-500/15 text-green-400',
                          not_in_group: 'bg-slate-500/20 text-slate-400',
                          needs_review: 'bg-amber-500/15 text-amber-400',
                          contacted: 'bg-indigo-500/15 text-indigo-400',
                          excluded: 'bg-zinc-500/20 text-zinc-400',
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
                    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-30 px-3 py-3">
                      <p className="text-xs text-slate-500">No matches found</p>
                    </div>
                  )}
                </div>
              )}

              {/* View picker — dropdown on mobile, underline tabs on tablet+ */}
              <div className="sm:hidden">
                <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1.5">View</label>
                <select
                  value={activeTab}
                  onChange={e => setActiveTab(e.target.value as TabKey)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                >
                  <option value="summary">Summary</option>
                  {TABS.map(t => {
                    const pool = activeFilters.length ? allPeople.filter(matchesFilters) : allPeople;
                    const count = allPeople.length > 0
                      ? pool.filter(p => p.reconcile_status === t.statusKey).length
                      : null;
                    return (
                      <option key={t.key} value={t.key}>
                        {t.label}{count !== null ? ` (${count})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="hidden sm:flex items-end gap-3">
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
              </div>
            </div>{/* end tabs row */}

            {/* Campaign summary (exec view) */}
            {activeTab === 'summary' && (
              <CampaignSummary people={allPeople} facets={facets} showAttendance={hasEvents} />
            )}

            {/* Column filter bar — one dropdown per filterable column; selections AND together */}
            {activeTab !== 'summary' && filterFacets.length >= 1 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5 mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filterFacets.map(f => (
                    <div key={f.key}>
                      <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                        {f.label}
                      </label>
                      <FacetMultiSelect
                        values={f.values}
                        selected={filters[f.key] ?? []}
                        onChange={vals => {
                          setFilters(prev => {
                            const next = { ...prev };
                            if (vals.length) next[f.key] = vals; else delete next[f.key];
                            return next;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
                {activeFilters.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-zinc-800 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">Active:</span>
                    {activeFilters.flatMap(([k, vals]) => {
                      const facetLabel = filterFacets.find(f => f.key === k)?.label ?? k;
                      // One chip per selected value so a single value can be removed
                      // without clearing the rest of that column's selection.
                      return vals.map(v => (
                        <button
                          key={`${k}|${v}`}
                          onClick={() => setFilters(prev => {
                            const kept = (prev[k] ?? []).filter(x => x !== v);
                            const n = { ...prev };
                            if (kept.length) n[k] = kept; else delete n[k];
                            return n;
                          })}
                          className="inline-flex items-center gap-1 text-xs bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded-full hover:bg-indigo-500/25 transition-colors"
                        >
                          {facetLabel}: {v} <X className="w-3 h-3" />
                        </button>
                      ));
                    })}
                    <button
                      onClick={() => setFilters({})}
                      className="text-xs text-slate-500 hover:text-white transition-colors ml-1"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* People list */}
            {activeTab !== 'summary' && loadingPeople && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex justify-center items-center py-12">
                <Spinner />
              </div>
            )}
            {activeTab !== 'summary' && !loadingPeople && filteredPeople.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-14 text-center">
                <p className="text-slate-500 text-sm">No people in this bucket.</p>
              </div>
            )}

            {/* Mobile cards */}
            {activeTab !== 'summary' && !loadingPeople && filteredPeople.length > 0 && (
              <div className="sm:hidden space-y-3">
                {showCheckboxes && (
                  <label className="flex items-center gap-2.5 px-1 text-sm text-slate-400 select-none">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                    Select all ({sortedPeople.length})
                  </label>
                )}
                {sortedPeople.map(p => {
                  const expandable = isNoteTab || activeTab === 'submitted';
                  const isOpen = expandedRows.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border bg-zinc-900/40 transition-colors ${
                        highlightedId === p.id ? 'border-indigo-500/60' : 'border-zinc-800'
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {showCheckboxes && (
                            <input
                              type="checkbox"
                              className="mt-1 w-5 h-5 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer flex-shrink-0"
                              checked={selected.has(p.id)}
                              onChange={() => toggleRow(p.id)}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-100">{p.first_name} {p.last_name}</span>
                              {p.manually_added && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-xs text-slate-500 border border-zinc-700 rounded px-1 py-0.5 leading-none">manual</span>
                                  {(activeTab === 'missing' || activeTab === 'needs_review') && (
                                    <button
                                      className="text-slate-600 hover:text-red-400 transition-colors leading-none"
                                      title="Remove from campaign"
                                      onClick={() => handleRemoveManual(p.id)}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              )}
                              {p.left_group && (
                                <span
                                  className="text-xs text-amber-400/80 border border-amber-500/30 rounded px-1 py-0.5 leading-none"
                                  title="No longer in the CCB group — kept on the invite list because they were invited"
                                >
                                  left group
                                </span>
                              )}
                            </div>

                            {/* Contact */}
                            <div id={`campaign-card-${p.id}`} className="mt-1.5 space-y-0.5 text-sm text-slate-400">
                              {p.email
                                ? <div className="break-all">{p.email}</div>
                                : <div className="text-slate-600">No email</div>}
                              {bestPhone(p) && <div>{bestPhone(p)}</div>}
                            </div>

                            {/* Groups */}
                            {facets.length >= 1 && facetSummary(p) && (
                              <div className="mt-1.5 text-xs text-slate-500">{facetSummary(p)}</div>
                            )}

                            {/* Last contacted — shown on every tab so outreach history follows the person */}
                            {p.contacted_at && (
                              <div className="mt-1.5 text-xs text-indigo-400">
                                Contacted {DateTime.fromISO(p.contacted_at).toFormat('MMM d · h:mm a')}
                              </div>
                            )}

                            {/* Day-of check-in (event campaigns) */}
                            {hasEvents && p.attended && (
                              <div className="mt-1.5 text-xs text-teal-400">Checked in ✓</div>
                            )}

                            {/* Submitted meta */}
                            {activeTab === 'submitted' && (
                              <div className="mt-1.5 text-xs text-slate-500 space-y-0.5">
                                {submittedAt(p) && <div>Submitted {DateTime.fromSQL(submittedAt(p)).toFormat('MMM d · h:mm a')}</div>}
                                {p.match_method && <div>Match: {p.match_method}</div>}
                              </div>
                            )}

                            {/* Needs review: candidate form name */}
                            {activeTab === 'needs_review' && (
                              <div className="mt-1.5 text-xs text-amber-400">
                                Form: {p.form_first_name || p.form_last_name
                                  ? `${p.form_first_name || ''} ${p.form_last_name || ''}`.trim()
                                  : '—'}
                              </div>
                            )}
                          </div>

                          {/* Right-side affordance */}
                          {isNoteTab && activeTab !== 'needs_review' && (
                            <button
                              className={`flex-shrink-0 transition-colors ${isOpen || p.note ? 'text-indigo-400' : 'text-slate-600'}`}
                              title={isOpen ? 'Hide note' : (p.note ? 'Edit note' : 'Add note')}
                              onClick={() => handleRowExpand(p)}
                            >
                              <StickyNote className="w-5 h-5" strokeWidth={1.8} />
                            </button>
                          )}
                          {activeTab === 'submitted' && (
                            <button
                              className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                              title="View submission"
                              onClick={() => toggleExpand(p.id)}
                            >
                              {isOpen ? <ChevronUp className="w-5 h-5" strokeWidth={1.8} /> : <ChevronDown className="w-5 h-5" strokeWidth={1.8} />}
                            </button>
                          )}
                        </div>

                        {/* Needs-review actions */}
                        {activeTab === 'needs_review' && (
                          <div className="flex gap-2 mt-3">
                            <button
                              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-600/90 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                              onClick={() => resolveMatches([p.id], 'confirmed')}
                              disabled={resolvingMatch}
                            >
                              <Check className="w-4 h-4" strokeWidth={2} /> Confirm
                            </button>
                            <button
                              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-red-600 text-slate-200 hover:text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                              onClick={() => resolveMatches([p.id], 'rejected')}
                              disabled={resolvingMatch}
                            >
                              <X className="w-4 h-4" strokeWidth={2} /> Not a match
                            </button>
                            <button
                              className="flex-shrink-0 inline-flex items-center justify-center text-slate-500 hover:text-indigo-400 px-2 transition-colors"
                              title={isOpen ? 'Hide note' : (p.note ? 'Edit note' : 'Add note')}
                              onClick={() => handleRowExpand(p)}
                            >
                              <StickyNote className="w-5 h-5" strokeWidth={1.8} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Expanded: note editor */}
                      {isNoteTab && isOpen && editDrafts[p.id] && (
                        <div className="border-t border-zinc-800 bg-zinc-900/60 p-4">
                          {renderEditPanel(p)}
                        </div>
                      )}
                      {/* Expanded: submission detail */}
                      {activeTab === 'submitted' && isOpen && (
                        <div className="border-t border-zinc-800 bg-zinc-900/60 p-4 overflow-x-auto">
                          {renderSubmissionPanel(p)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Desktop table */}
            {activeTab !== 'summary' && !loadingPeople && filteredPeople.length > 0 && (
              <div className="hidden sm:block rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
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
                        <SortTh col="last_contacted" label="Last Contacted" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        {activeTab === 'needs_review' && (
                          <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Form Name</th>
                        )}
                        {/* Expand toggle for note tabs */}
                        {isNoteTab && <th className="w-10 px-4 py-3" />}
                        {activeTab === 'submitted' && (
                          <SortTh col="submitted" label="Submitted" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        )}
                        {activeTab === 'submitted' && hasEvents && (
                          <SortTh col="attended" label="Checked In" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
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
                              {p.left_group && (
                                <span
                                  className="ml-2 text-xs text-amber-400/80 border border-amber-500/30 rounded px-1 py-0.5 leading-none"
                                  title="No longer in the CCB group — kept on the invite list because they were invited"
                                >
                                  left group
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
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {p.contacted_at
                                ? <span className="text-indigo-400">{DateTime.fromISO(p.contacted_at).toFormat('MMM d · h:mm a')}</span>
                                : <span className="text-slate-600">—</span>}
                            </td>
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
                            {activeTab === 'submitted' && hasEvents && (
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                {p.attended
                                  ? <span className="inline-flex items-center gap-1 text-teal-400"><Check className="w-3.5 h-3.5" strokeWidth={2.5} /> Yes</span>
                                  : <span className="text-slate-600">—</span>}
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
                                <div className="max-w-3xl">
                                  {renderEditPanel(p)}
                                </div>
                              </td>
                            </tr>
                          )}
                          {activeTab === 'submitted' && expandedRows.has(p.id) && (
                            <tr key={`${p.id}-detail`} className="bg-zinc-900/60">
                              <td colSpan={99} className="px-6 py-4">
                                {renderSubmissionPanel(p)}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
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
            ) : activeTab === 'excluded' ? (
              <button
                className="bg-btn-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                onClick={() => setExcluded(Array.from(selected), false)}
                disabled={excluding}
              >
                Restore to Unsubmitted
              </button>
            ) : (
              <>
                <button
                  className="bg-btn-primary text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  onClick={() => setShowFollowUp(true)}
                >
                  Follow Up
                </button>
                {/* Off-boarding only applies to the unsubmitted pool */}
                {activeTab === 'missing' && (
                  <button
                    className="bg-zinc-700 hover:bg-amber-600 text-slate-200 hover:text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    onClick={() => setExcluded(Array.from(selected), true)}
                    disabled={excluding}
                    title="Remove from the unsubmitted pool so they don't count against completion"
                  >
                    Off-board
                  </button>
                )}
                {activeTab === 'not_in_group' && (
                  <button
                    className="bg-btn-success text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                    onClick={openMarkInvited}
                    disabled={markingInvited}
                    title="They were invited (e.g. removed from the CCB group after submitting) — count them as invited and submitted"
                  >
                    <Check className="w-4 h-4" strokeWidth={2} /> Count as invited
                  </button>
                )}
              </>
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

      {/* Count as invited (Not in Group -> Submitted) */}
      <Modal
        isOpen={showMarkInvited}
        onClose={() => setShowMarkInvited(false)}
        title={`Count as invited — ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Moves them to <span className="text-white font-medium">Submitted</span> and adds them to the
            invited count — for people who were invited but later removed from the CCB group, or edge
            cases you want counted. Reconcile keeps this decision.
          </p>
          {sourceGroupOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Source group <span className="text-slate-600 normal-case">(optional — for filters and the summary)</span>
              </label>
              <select
                className={inputCls}
                value={markInvitedGroup}
                onChange={e => setMarkInvitedGroup(e.target.value)}
              >
                <option value="">No group</option>
                {sourceGroupOptions.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              className="text-slate-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800"
              onClick={() => setShowMarkInvited(false)}
              disabled={markingInvited}
            >
              Cancel
            </button>
            <button
              className="bg-btn-success text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              onClick={handleMarkInvited}
              disabled={markingInvited}
            >
              {markingInvited ? <><Spinner size="sm" /> Saving…</> : 'Count as invited'}
            </button>
          </div>
        </div>
      </Modal>

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

          {/* Group → campus mapping. Blank falls back to auto-detection from the
              group name, so most VCC groups need nothing here. */}
          {editGroupIds.some(g => g.trim()) && (
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Campus per group <span className="text-slate-600 normal-case">(blank = auto-detect from group name)</span>
              </label>
              <div className="space-y-2">
                {editGroupIds.map(g => g.trim()).filter(Boolean).map(gid => {
                  const groupName = groupNamesById.get(gid);
                  const guess = guessCampusFromGroupName(groupName);
                  return (
                    <div key={gid} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm text-slate-300 truncate" title={groupName ?? `Group ${gid}`}>
                        {groupName ?? `Group ${gid}`}
                      </span>
                      <input
                        type="text"
                        className="w-40 bg-zinc-700 border border-zinc-600 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                        placeholder={guess ? `${guess} (auto)` : 'Campus'}
                        value={editCampusMap[gid] ?? ''}
                        onChange={e => setEditCampusMap(prev => ({ ...prev, [gid]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-600 mt-1.5">
                Auto-detect knows LVT → Lewisville, GVT → Gainesville, FMT → Flower Mound, DNT → Denton, ONL → Online. Type a campus to override. Run Reconcile after saving to apply.
              </p>
            </div>
          )}

          {eventAttendanceEnabled && (
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">CCB Event IDs <span className="text-slate-600 normal-case">(optional — tracks day-of check-ins)</span></label>
            <div className="mb-3">
              <EventSearchPicker selectedIds={editEventIds} onAdd={addEditEventId} />
            </div>
            <div className="space-y-2">
              {editEventIds.map((eid, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputCls}
                    placeholder={i === 0 ? 'e.g. 9876' : 'e.g. 5432'}
                    value={eid}
                    onChange={e => setEditEventIds(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  />
                  {editEventIds.length > 1 && (
                    <button
                      type="button"
                      className="text-slate-500 hover:text-red-400 transition-colors px-2"
                      onClick={() => setEditEventIds(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-600">Check Attendance pulls who checked in to these events</span>
              <button
                type="button"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                onClick={() => setEditEventIds(prev => [...prev, ''])}
              >
                + Add another event
              </button>
            </div>
          </div>
          )}

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
              {/* Single-person send lives here (no list below in that case).
                  With multiple selected, the per-person buttons + Auto Send in
                  the list below are the send controls — a button on the preview
                  reads as "send to just this one" and is confusing. */}
              {selectedPeople.length === 1 && (
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
                      Send Message
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Multi-person list */}
          {selectedPeople.length > 1 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">All selected</p>
                {companion.available === true && !companion.needsUpdate && (
                  <button
                    onClick={handleAutoSendAll}
                    disabled={isAutoSending || !msgTemplate.trim()}
                    className="bg-btn-success text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isAutoSending
                      ? `Sending ${autoProgress?.done ?? 0} / ${autoProgress?.total ?? selectedPeople.length}…`
                      : `Auto Send All (${selectedPeople.length})`}
                  </button>
                )}
              </div>
              {/* An out-of-date companion could report messages as sent when
                  nothing went out — block Auto Send until it's updated. */}
              {companion.available === true && companion.needsUpdate && (
                <div className="mb-3 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-rose-300">Update required before you can Auto Send</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        The companion on your Mac is out of date. Older versions could report messages as
                        sent when they never went out.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCompanionGuide(true)}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Show me how to update
                  </button>
                </div>
              )}
              {companion.available === false && (
                <div className="mb-3 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-3 space-y-2">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Set up the Mac Companion once to auto-send to everyone at once. We’ll walk you
                    through it step by step.
                  </p>
                  <button
                    onClick={() => setShowCompanionGuide(true)}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Show me how to set it up
                  </button>
                  <button onClick={companion.recheck} className="text-[10px] text-slate-500 hover:text-slate-300 underline transition-colors">
                    I’ve installed it — check again
                  </button>
                </div>
              )}
              {autoSendError && (
                <div className="mb-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-rose-300 leading-relaxed">{autoSendError}</p>
                </div>
              )}

              {/* Text Message Forwarding is off — non-iPhone numbers can't be
                  reached from this Mac. Warn but let iMessage sends proceed. */}
              {smsRelayOff && (
                <div className="mb-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    <span className="font-semibold">Non-iPhone numbers can’t be reached yet.</span> Text
                    Message Forwarding is off, so your Mac can only send to iMessage users. Turn it on
                    (iPhone → <span className="text-amber-200">Settings → Messages → Text Message
                    Forwarding</span> → enable this Mac) to text Android numbers too.
                  </p>
                </div>
              )}

              {/* Delivery verification summary — shows while checking and once
                  the results settle. */}
              {(verifying || deliveredCount > 0 || failedPeople.length > 0 || unconfirmedPeople.length > 0) && (
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  {verifying && (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <Spinner size="sm" /> Verifying delivery…
                    </span>
                  )}
                  {deliveredCount > 0 && (
                    <span className="text-emerald-400 font-medium">{deliveredCount} delivered</span>
                  )}
                  {failedPeople.length > 0 && (
                    <span className="text-rose-400 font-medium">{failedPeople.length} not delivered</span>
                  )}
                  {unconfirmedPeople.length > 0 && (
                    <span className="text-amber-400 font-medium">{unconfirmedPeople.length} unconfirmed</span>
                  )}
                </div>
              )}

              {/* What to do about the ones that didn't send. Retrying from this
                  Mac fails identically — the fix is a device with cellular SMS. */}
              {failedPeople.length > 0 && (
                <div className="mb-3 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-3 space-y-1.5">
                  <p className="text-xs font-bold text-rose-300">
                    {failedPeople.length} {failedPeople.length === 1 ? "message wasn't" : "messages weren't"} delivered
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    These numbers aren’t on iMessage, and your Mac couldn’t send them a text message —
                    usually because <span className="text-slate-300 font-medium">Text Message Forwarding</span> is
                    off. Turn it on (iPhone → <span className="text-slate-300">Settings → Messages → Text
                    Message Forwarding</span> → enable this Mac), then re-run Auto Send and they’ll go through
                    automatically as green texts.
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    To send them right now, tap each person’s <span className="text-slate-400 font-medium">Send</span>{' '}
                    below on your iPhone.
                  </p>
                </div>
              )}

              {/* Verification couldn't run — Full Disk Access not granted. */}
              {verifyUnavailable && (
                <div className="mb-3 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-3 space-y-2">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-slate-300 font-medium">Delivery tracking is off.</span> RADIUS
                    couldn’t confirm which messages actually went through. Grant the companion Full Disk
                    Access so it can read your Mac’s delivery receipts — it only ever reports “delivered” or
                    “not delivered” per number, never your message contents.
                  </p>
                  <button
                    onClick={() => setShowCompanionGuide(true)}
                    className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Show me how to turn it on
                  </button>
                </div>
              )}

              <div className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-700 overflow-hidden">
                {orderedSelected.map(p => {
                  const ds = deliveryStatus[p.id];
                  const sendBtn = (label: string) => (
                    <button
                      className="bg-slate-700 hover:bg-slate-600 border border-zinc-600 text-slate-300 px-3 py-1 rounded-lg text-xs transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!bestPhone(p) ? 'No phone number on file' : undefined}
                      onClick={() => sendMessage(p)}
                    >
                      {label}
                    </button>
                  );
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-800/40">
                      <span className="text-sm text-slate-200 flex-1">
                        {p.first_name} {p.last_name}
                        {bestPhone(p) && (
                          <span className="text-slate-500 ml-2 text-xs">{bestPhone(p)}</span>
                        )}
                      </span>
                      {ds === 'failed' ? (
                        <>
                          <span className="text-xs text-rose-400 font-semibold">Not delivered</span>
                          {sendBtn('Send')}
                        </>
                      ) : ds === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                          <Spinner size="sm" /> Verifying…
                        </span>
                      ) : ds === 'delivered' ? (
                        <span className="text-xs text-emerald-400 font-medium">Delivered</span>
                      ) : ds === 'unconfirmed' ? (
                        <>
                          <span className="text-xs text-amber-400 font-medium">Unconfirmed</span>
                          {sendBtn('Send Again')}
                        </>
                      ) : sentIds.has(p.id) ? (
                        <>
                          <span className="text-xs text-green-400 font-medium">Sent</span>
                          {sendBtn('Send Again')}
                        </>
                      ) : (
                        sendBtn('Send Message')
                      )}
                    </div>
                  );
                })}
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
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800">
            <p className="text-[11px] text-slate-500 leading-snug min-w-0">
              {failedPeople.length > 0
                ? `${failedPeople.length} not-delivered ${failedPeople.length === 1 ? 'person is' : 'people are'} left unmarked to follow up.`
                : ''}
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
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
        </div>
      </Modal>

      <CompanionGuideModal
        isOpen={showCompanionGuide}
        onClose={() => setShowCompanionGuide(false)}
        mode={companion.available === true && companion.needsUpdate ? 'update' : 'install'}
        statusLabel={
          companion.available === null ? 'Checking…'
            : companion.available ? (companion.needsUpdate ? 'Running — update required' : 'Running — up to date')
            : 'Not running'
        }
        onRecheck={companion.recheck}
        checking={companion.available === null}
        pythonPath={fdaInfo?.pythonPath}
        deliveryTrackingOn={fdaInfo?.capable}
      />
    </ProtectedRoute>
  );
}
