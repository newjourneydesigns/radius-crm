'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useCampaigns } from '../../../hooks/useCampaigns';
import {
  parseTable,
  guessMapping,
  applyMapping,
  attributeKeys,
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

export default function NewCampaignPage() {
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
  const groupableKeys = useMemo(() => attributeKeys(parsedPeople), [parsedPeople]);
  const namesMapped = mapping.firstName !== null && mapping.lastName !== null;

  const [formId, setFormId] = useState('');
  const [formLink, setFormLink] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = DateTime.now().toISODate()!;

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
      if (parsedPeople.length === 0) {
        setErr('No people found — check your paste and column mapping');
        return;
      }
    }

    setSaving(true);
    setErr(null);
    try {
      const campaign = await createCampaign({
        name: name.trim(),
        ccb_group_ids: sourceMode === 'groups' ? cleanGroupIds : [],
        ccb_form_id: formId.trim(),
        form_link: formLink.trim(),
        due_date: dueDate,
        message_template: template.trim(),
        people: sourceMode === 'paste' ? parsedPeople : undefined,
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
          <h1 className="text-xl font-semibold text-white tracking-tight mt-1">New Campaign</h1>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
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

                      {/* Live preview */}
                      <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 text-xs">
                          <span className="text-slate-300 font-medium">
                            {parsedPeople.length} {parsedPeople.length === 1 ? 'person' : 'people'} ready
                          </span>
                          <span className="text-slate-500">
                            {table.hasHeader ? 'header row detected' : 'no header row'}
                          </span>
                        </div>
                        {parsedPeople.length > 0 ? (
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
                                  {parsedPeople.slice(0, 200).map((p, i) => (
                                    <tr key={i} className="text-slate-200">
                                      <td className="px-3 py-1.5 whitespace-nowrap">{`${p.firstName} ${p.lastName}`.trim()}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.ccbId || '—'}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.email || '—'}</td>
                                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.phone || '—'}</td>
                                      {groupableKeys.slice(0, 2).map(k => (
                                        <td key={k} className="px-3 py-1.5 whitespace-nowrap text-slate-400">{p.attributes[k] || '—'}</td>
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

            {/* Form link */}
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Form link
              </label>
              <input
                type="url"
                className={inputCls}
                placeholder="https://yourchurch.ccbchurch.com/goto/forms/56/responses/new"
                value={formLink}
                onChange={e => setFormLink(e.target.value)}
              />
              <p className="text-xs text-slate-600 mt-1.5">
                Substituted into <code className="font-mono text-slate-500">{'{{form_link}}'}</code> in your message
              </p>
            </div>

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
