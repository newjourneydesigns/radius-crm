'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useCampaigns } from '../../../hooks/useCampaigns';

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
  const [groupIds, setGroupIds] = useState<string[]>(['']);
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
    if (cleanGroupIds.length === 0) {
      setErr('At least one CCB Group ID is required');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const campaign = await createCampaign({
        name: name.trim(),
        ccb_group_ids: cleanGroupIds,
        ccb_form_id: formId.trim(),
        form_link: formLink.trim(),
        due_date: dueDate,
        message_template: template.trim(),
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

            {/* CCB Group IDs */}
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                CCB Group IDs
              </label>
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
                      required={i === 0}
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
