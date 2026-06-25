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
  // Restore cursor position after React re-render
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  });
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { createCampaign } = useCampaigns();

  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [formId, setFormId] = useState('');
  const [formLink, setFormLink] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = DateTime.now().toISODate()!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const campaign = await createCampaign({
        name: name.trim(),
        ccb_group_id: groupId.trim(),
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
    <ProtectedRoute adminOnly>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/campaigns" className="text-sm text-base-content/40 hover:text-base-content/70 transition-colors">
            ← Campaigns
          </Link>
          <h1 className="text-2xl font-bold mt-2">New Campaign</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Campaign name */}
          <div className="form-control">
            <label className="label pb-1">
              <span className="label-text font-medium">Campaign name</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="e.g. Fall Kickoff RSVP"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          {/* CCB IDs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-medium">CCB Group ID</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="input input-bordered w-full"
                placeholder="e.g. 1234"
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                required
              />
              <label className="label pt-1">
                <span className="label-text-alt text-base-content/40">Found in the CCB group URL</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-medium">CCB Form ID</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="input input-bordered w-full"
                placeholder="e.g. 56"
                value={formId}
                onChange={e => setFormId(e.target.value)}
                required
              />
              <label className="label pt-1">
                <span className="label-text-alt text-base-content/40">Found in the CCB form URL</span>
              </label>
            </div>
          </div>

          {/* Form link */}
          <div className="form-control">
            <label className="label pb-1">
              <span className="label-text font-medium">Form link</span>
            </label>
            <input
              type="url"
              className="input input-bordered w-full"
              placeholder="https://yourchurch.ccbchurch.com/goto/forms/56/responses/new"
              value={formLink}
              onChange={e => setFormLink(e.target.value)}
            />
            <label className="label pt-1">
              <span className="label-text-alt text-base-content/40">
                Paste the direct URL to the form — this is substituted into <code className="text-xs">{'{{form_link}}'}</code> in your message
              </span>
            </label>
          </div>

          {/* Due date */}
          <div className="form-control">
            <label className="label pb-1">
              <span className="label-text font-medium">Due date</span>
            </label>
            <input
              type="date"
              className="input input-bordered w-full"
              min={today}
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              required
            />
          </div>

          {/* Message template */}
          <div className="form-control">
            <label className="label pb-1">
              <span className="label-text font-medium">Message template</span>
            </label>
            {/* Variable chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {VARIABLES.map(v => (
                <button
                  key={v.label}
                  type="button"
                  title={v.desc}
                  className="btn btn-xs btn-ghost border border-base-300 font-mono text-xs"
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
              className="textarea textarea-bordered w-full h-28 text-sm font-mono leading-relaxed"
              value={template}
              onChange={e => setTemplate(e.target.value)}
            />
            <label className="label pt-1">
              <span className="label-text-alt text-base-content/40">
                Click a variable above to insert it at the cursor. This message is shown in the follow-up panel — you copy it manually.
              </span>
            </label>
          </div>

          {err && <div className="alert alert-error text-sm">{err}</div>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? <span className="loading loading-spinner loading-sm" /> : 'Create Campaign'}
            </button>
            <Link href="/campaigns" className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
