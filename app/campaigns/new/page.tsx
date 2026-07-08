'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { isEventAttendanceEnabled } from '../../../lib/campaigns/event-attendance-flag';
import { supabase } from '../../../lib/supabase';
import { useCampaigns } from '../../../hooks/useCampaigns';
import {
  parseTable,
  guessMapping,
  applyMapping,
  attributeKeys,
  dedupePeople,
  attrValues,
  ROSTER_FIELDS,
  EMPTY_MAPPING,
  type RosterMapping,
} from '../../../lib/campaigns/parseRoster';

const DEFAULT_TEMPLATE =
  'Hey {{first_name}}, just a reminder to complete {{campaign_name}} by {{due_date}}. Here\'s the link: {{form_link}}';

const VARIABLES = [
  { label: '{{first_name}}', desc: 'First name' },
  { label: '{{form_link}}', desc: 'Form URL' },
  { label: '{{campaign_name}}', desc: 'Campaign name' },
  { label: '{{due_date}}', desc: 'Due date (formatted)' },
];

const inputCls =
  'w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  setter: (val: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const current = textarea.value;
  const next = current.slice(0, start) + text + current.slice(end);
  setter(next);
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  });
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// A stored campaign person, as returned by GET /api/campaigns/[id]/people.
// Only the fields the duplicate flow needs.
type StoredPerson = {
  ccb_individual_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  in_group: boolean;
  reconcile_status: string;
  attributes: Record<string, string | string[]> | null;
};

// Rebuild a pasted-roster campaign's invite list as tab-separated text so the
// duplicate flow drops it straight into the paste box — fully editable, and it
// re-parses through the same column mapper as a fresh paste. A person with a
// CCB id and a multi-value attribute (e.g. two teams) becomes one row per value;
// dedupePeople merges them back into a single invite, exactly like the original.
function peopleToTsv(people: StoredPerson[]): string {
  const attrKeys: string[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    for (const k of Object.keys(p.attributes ?? {})) {
      if (!seen.has(k)) { seen.add(k); attrKeys.push(k); }
    }
  }
  // Cells can't carry the delimiters — collapse tabs/newlines inside values.
  const cell = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();
  const header = ['Individual ID', 'First Name', 'Last Name', 'Email', 'Phone', ...attrKeys];
  const lines = [header.join('\t')];
  for (const p of people) {
    const vals = attrKeys.map(k => attrValues(p.attributes?.[k]));
    // Without a CCB id, extra rows can't be re-merged — keep one row and join values.
    const rowCount = p.ccb_individual_id ? Math.max(1, ...vals.map(v => v.length)) : 1;
    for (let r = 0; r < rowCount; r++) {
      lines.push([
        p.ccb_individual_id || '',
        p.first_name,
        p.last_name,
        r === 0 ? (p.email || '') : '',
        r === 0 ? (p.mobile_phone || p.phone || '') : '',
        ...vals.map(v => (rowCount === 1 ? v.join('; ') : (v[r] ?? ''))),
      ].map(cell).join('\t'));
    }
  }
  return lines.join('\n');
}

// useSearchParams (for ?from=) requires a Suspense boundary in the App Router.
export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRoute>
          <div className="flex justify-center items-center py-24">
            <Spinner />
          </div>
        </ProtectedRoute>
      }
    >
      <NewCampaignForm />
    </Suspense>
  );
}

function NewCampaignForm() {
  const router = useRouter();
  const { createCampaign } = useCampaigns();

  const [name, setName] = useState('');
  const [sourceMode, setSourceMode] = useState<'groups' | 'paste'>('groups');
  const [groupIds, setGroupIds] = useState<string[]>(['']);
  const [pasteText, setPasteText] = useState('');
  const table = useMemo(() => parseTable(pasteText), [pasteText]);
  const [mapping, setMapping] = useState<RosterMapping>(EMPTY_MAPPING);

  // Re-guess the column mapping whenever a new paste changes the columns.
  const headerKey = table.headers.join('|');
  useEffect(() => {
    setMapping(table.columnCount > 0 ? guessMapping(table.headers) : EMPTY_MAPPING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerKey]);

  const parsedPeople = useMemo(() => applyMapping(table, mapping), [table, mapping]);
  // Collapse rows sharing a CCB id into one invite (merging their values), so the
  // preview, count, and what gets saved all reflect one row per person.
  const deduped = useMemo(() => dedupePeople(parsedPeople), [parsedPeople]);
  const people = deduped.people;
  const groupableKeys = useMemo(() => attributeKeys(people), [people]);
  const namesMapped = mapping.firstName !== null && mapping.lastName !== null;

  const [formId, setFormId] = useState('');
  const [eventIds, setEventIds] = useState<string[]>(['']);
  // Optional per-row label so the opaque event IDs are recognizable later.
  const [eventLabels, setEventLabels] = useState<string[]>(['']);
  const [dueDate, setDueDate] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = DateTime.now().toISODate()!;

  // Duplicate mode: /campaigns/new?from=<id> pre-fills this form from an existing
  // campaign so its settings can be reviewed and edited before anything is created.
  const searchParams = useSearchParams();
  const fromId = searchParams?.get('from') ?? null;
  const [dupeName, setDupeName] = useState<string | null>(null);
  const [dupeRoster, setDupeRoster] = useState(false);
  const [dupeLoading, setDupeLoading] = useState(!!fromId);
  // Carried invisibly from the source campaign: same groups -> same campuses.
  const [dupeCampusMap, setDupeCampusMap] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!fromId) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeader();
        const res = await fetch(`/api/campaigns/${fromId}`, { headers });
        if (!res.ok) throw new Error('Could not load the campaign to duplicate');
        const c = (await res.json()).campaign;
        if (!c) throw new Error('Campaign not found');
        if (cancelled) return;

        setDupeName(c.name);
        setName(`${c.name} (copy)`);
        setFormId(c.ccb_form_id ?? '');
        if (typeof c.message_template === 'string' && c.message_template.trim()) {
          setTemplate(c.message_template);
        }
        // Due date is intentionally left blank — a new campaign needs a new one.

        if (c.ccb_group_ids?.length) {
          setSourceMode('groups');
          setGroupIds([...c.ccb_group_ids]);
          if (c.group_campus_map && Object.keys(c.group_campus_map).length > 0) {
            setDupeCampusMap(c.group_campus_map);
          }
        } else {
          // Pasted-roster campaign: rebuild the invite list into the paste box.
          const pres = await fetch(`/api/campaigns/${fromId}/people`, { headers });
          if (pres.ok) {
            const rows: StoredPerson[] = (await pres.json()).people ?? [];
            // Only the invite list carries over — form-only responders don't
            // belong to it, and off-boarded people were removed on purpose.
            const invitees = rows.filter(p => p.in_group && p.reconcile_status !== 'excluded');
            if (!cancelled && invitees.length > 0) {
              setSourceMode('paste');
              setPasteText(peopleToTsv(invitees));
              setDupeRoster(true);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load the campaign to duplicate');
      } finally {
        if (!cancelled) setDupeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromId]);

  function updateGroupId(index: number, value: string) {
    setGroupIds(prev => prev.map((id, i) => (i === index ? value : id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanGroupIds = groupIds.map(id => id.trim()).filter(Boolean);

    if (sourceMode === 'groups' && cleanGroupIds.length === 0) {
      setErr('At least one CCB Group ID is required');
      return;
    }
    if (sourceMode === 'paste') {
      if (!namesMapped) {
        setErr('Map both First name and Last name to a column');
        return;
      }
      if (people.length === 0) {
        setErr('No people found — check your paste and column mapping');
        return;
      }
    }

    setSaving(true);
    setErr(null);
    try {
      // Map each non-blank event id to its note (last one wins on duplicate ids).
      const eventLabelMap: Record<string, string> = {};
      eventIds.forEach((id, i) => {
        const key = id.trim();
        const label = (eventLabels[i] ?? '').trim();
        if (key && label) eventLabelMap[key] = label;
      });

      const campaign = await createCampaign({
        name: name.trim(),
        ccb_group_ids: sourceMode === 'groups' ? cleanGroupIds : [],
        ccb_event_ids: eventIds.map(id => id.trim()).filter(Boolean),
        ccb_event_labels: eventLabelMap,
        group_campus_map: sourceMode === 'groups' && dupeCampusMap ? dupeCampusMap : undefined,
        ccb_form_id: formId.trim(),
        due_date: dueDate,
        message_template: template.trim(),
        people: sourceMode === 'paste' ? people : undefined,
      });
      if (campaign) router.push(`/campaigns/${campaign.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link
            href="/campaigns"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wide"
          >
            ← Campaigns
          </Link>
          <h1 className="text-xl font-semibold text-white tracking-tight mt-1">
            {fromId ? 'Duplicate Campaign' : 'New Campaign'}
          </h1>
        </div>

        {/* Duplicate banner — nothing is created until the form is submitted */}
        {dupeName && !dupeLoading && (
          <div className="mb-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
            Settings copied from <span className="font-medium text-white">{dupeName}</span>.
            Review them below, pick a new due date, then create.
            {dupeRoster && (
              <span className="block text-xs text-indigo-300/70 mt-1">
                The invite list was copied into the paste box — edit it there. Off-boarded people were not carried over.
              </span>
            )}
          </div>
        )}

        {dupeLoading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-center gap-3 py-16">
            <Spinner />
            <span className="text-sm text-slate-400">Loading campaign settings…</span>
          </div>
        )}

        <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6 ${dupeLoading ? 'hidden' : ''}`}>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Campaign name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Campaign name
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Fall Kickoff RSVP"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            {/* Invite-list source: CCB groups OR a pasted spreadsheet */}
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Invite list
              </label>

              {/* Source toggle */}
              <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-0.5 mb-3">
                {([
                  { key: 'groups', label: 'CCB Groups' },
                  { key: 'paste', label: 'Paste a list' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setSourceMode(opt.key); setErr(null); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      sourceMode === opt.key
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {sourceMode === 'groups' ? (
                <>
                  <div className="space-y-2">
                    {groupIds.map((gid, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          className={inputCls}
                          placeholder={i === 0 ? 'e.g. 1234' : 'e.g. 5678'}
                          value={gid}
                          onChange={e => updateGroupId(i, e.target.value)}
                        />
                        {groupIds.length > 1 && (
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-400 transition-colors px-2 flex-shrink-0"
                            onClick={() => setGroupIds(prev => prev.filter((_, idx) => idx !== i))}
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
                      onClick={() => setGroupIds(prev => [...prev, ''])}
                    >
                      + Add another group
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    className="w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed h-36 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                    placeholder={'Paste rows from a spreadsheet — include the header row.\n\nIndividual ID\tFirst Name\tLast Name\tCampus\tEmail\tPreferred Phone\t…'}
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                  />
                  <p className="text-xs text-slate-600 mt-1.5">
                    Paste straight from a spreadsheet — any column order works. Columns are matched to fields below; adjust any that look wrong.
                  </p>

                  {table.columnCount > 0 && (
                    <>
                      {/* Column mapper */}
                      <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
                        <p className="text-xs font-medium text-slate-300 mb-3">Match your columns</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                          {ROSTER_FIELDS.map(f => (
                            <div key={f.key} className="flex items-center gap-2">
                              <label className="text-xs text-slate-400 w-32 flex-shrink-0">
                                {f.label}
                                {f.required && <span className="text-indigo-400"> *</span>}
                              </label>
                              <select
                                className="flex-1 min-w-0 bg-zinc-700 border border-zinc-600 text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                                value={mapping[f.key] ?? -1}
                                onChange={e =>
                                  setMapping(m => ({
                                    ...m,
                                    [f.key]: e.target.value === '-1' ? null : Number(e.target.value),
                                  }))
                                }
                              >
                                <option value={-1}>— Don&apos;t import —</option>
                                {table.headers.map((h, i) => (
                                  <option key={i} value={i}>{h}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                        {!namesMapped && (
                          <p className="text-xs text-amber-400/80 mt-3">
                            Map both First name and Last name to continue.
                          </p>
                        )}
                      </div>

                      {/* Merged-duplicates notice */}
                      {deduped.duplicateCount > 0 && (
                        <p className="text-xs text-amber-300/90 mt-3">
                          {deduped.duplicateCount} duplicate {deduped.duplicateCount === 1 ? 'row' : 'rows'} merged
                          into existing people (same CCB ID){deduped.duplicateNames.length > 0 && ': '}
                          <span className="text-amber-300/70">
                            {deduped.duplicateNames.slice(0, 8).join(', ')}
                            {deduped.duplicateNames.length > 8 && `, +${deduped.duplicateNames.length - 8} more`}
                          </span>
                          . Each is one invite; their combined values stay group-able in the campaign.
                        </p>
                      )}

                      {/* Live preview */}
                      <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 text-xs">
                          <span className="text-slate-300 font-medium">
                            {people.length} {people.length === 1 ? 'person' : 'people'} ready
                          </span>
                          <span className="text-slate-500">
                            {table.hasHeader ? 'header row detected' : 'no header row'}
                          </span>
                        </div>
                        {people.length > 0 ? (
                          <>
                            {groupableKeys.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-zinc-700/50">
                                <span className="text-xs text-slate-500">Group-able columns kept:</span>
                                {groupableKeys.map(k => (
                                  <span key={k} className="text-xs bg-zinc-700/60 text-slate-300 px-1.5 py-0.5 rounded">
                                    {k}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="max-h-56 overflow-auto">
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-zinc-800">
                                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="px-3 py-1.5 font-medium">Name</th>
                                    <th className="px-3 py-1.5 font-medium">CCB ID</th>
                                    <th className="px-3 py-1.5 font-medium">Email</th>
                                    <th className="px-3 py-1.5 font-medium">Phone</th>
                                    {groupableKeys.slice(0, 2).map(k => (
                                      <th key={k} className="px-3 py-1.5 font-medium">{k}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-700/50">
                                  {people.slice(0, 200).map((p, i) => (
                                    <tr key={i} className="text-slate-200">
                                      <td className="px-3 py-1.5 whitespace-nowrap">{`${p.firstName} ${p.lastName}`.trim()}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.ccbId || '—'}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.email || '—'}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.phone || '—'}</td>
                                      {groupableKeys.slice(0, 2).map(k => (
                                        <td key={k} className="px-3 py-1.5 whitespace-nowrap text-slate-400">{attrValues(p.attributes[k]).join(', ') || '—'}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <p className="px-3 py-4 text-center text-sm text-amber-400/80">
                            No people yet — map First name and Last name above.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* CCB Form ID + Due date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                  CCB Form ID
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputCls}
                  placeholder="e.g. 56"
                  value={formId}
                  onChange={e => setFormId(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-600 mt-1.5">Found in the CCB form URL</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                  Due date
                </label>
                <input
                  type="date"
                  className={inputCls}
                  min={today}
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* CCB Event IDs — optional day-of attendance tracking (feature-flagged) */}
            {isEventAttendanceEnabled() && (
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                CCB Event IDs <span className="text-slate-600 normal-case">(optional — tracks day-of check-ins)</span>
              </label>
              <div className="space-y-2">
                {eventIds.map((eid, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${inputCls} w-28 flex-shrink-0`}
                      placeholder={i === 0 ? 'ID 9876' : 'ID 5432'}
                      value={eid}
                      onChange={e => setEventIds(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                    />
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="Note — e.g. LVT Fuel the Fire 7/12"
                      value={eventLabels[i] ?? ''}
                      onChange={e => setEventLabels(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                    />
                    {eventIds.length > 1 && (
                      <button
                        type="button"
                        className="text-slate-500 hover:text-red-400 transition-colors px-2"
                        onClick={() => {
                          setEventIds(prev => prev.filter((_, idx) => idx !== i));
                          setEventLabels(prev => prev.filter((_, idx) => idx !== i));
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-600">The Check Attendance button pulls who checked in to these events</span>
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  onClick={() => { setEventIds(prev => [...prev, '']); setEventLabels(prev => [...prev, '']); }}
                >
                  + Add another event
                </button>
              </div>
            </div>
            )}


            {/* Message template */}
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Message template
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {VARIABLES.map(v => (
                  <button
                    key={v.label}
                    type="button"
                    title={v.desc}
                    className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-slate-300 font-mono text-xs px-2 py-1 rounded transition-colors"
                    onClick={() => {
                      const ta = document.getElementById('msg-template') as HTMLTextAreaElement | null;
                      if (ta) insertAtCursor(ta, v.label, setTemplate);
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <textarea
                id="msg-template"
                className="w-full bg-zinc-700 border border-zinc-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed h-28 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                value={template}
                onChange={e => setTemplate(e.target.value)}
              />
              <p className="text-xs text-slate-600 mt-1.5">
                Click a variable above to insert it at the cursor. This message is shown in the follow-up panel — you copy it manually.
              </p>
            </div>

            {err && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {err}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
              <button
                type="submit"
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                disabled={saving}
              >
                {saving ? <><Spinner /> Creating…</> : 'Create Campaign'}
              </button>
              <Link
                href="/campaigns"
                className="text-slate-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800"
              >
                Cancel
              </Link>
            </div>

          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}
