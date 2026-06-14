'use client';

import type { CoachingConfig } from '../../lib/circle-leader-toolkit/coaching/config';

/**
 * Controlled editor for a CoachingConfig. Used by the admin global-defaults page
 * and (wrapped) by the per-leader override panel. Presentation only — the parent
 * owns the value and persistence.
 */

export interface AutomationMeta {
  key: keyof Omit<CoachingConfig, 'enabled'>;
  title: string;
  description: string;
  /** Optional numeric threshold field config. */
  field?: { prop: string; label: string; suffix: string; min: number; max: number };
}

export const AUTOMATION_META: AutomationMeta[] = [
  {
    key: 'multiplication',
    title: 'Multiplication nudge',
    description: 'Celebrate growth and prompt raising up a new leader once a Circle reaches a healthy size.',
    field: { prop: 'rosterThreshold', label: 'Roster size', suffix: 'people', min: 2, max: 100 },
  },
  {
    key: 'newMember',
    title: 'New member follow-up',
    description: 'Encourage a personal hello shortly after someone new joins the roster.',
    field: { prop: 'followUpHours', label: 'Follow up after', suffix: 'hours', min: 1, max: 168 },
  },
  {
    key: 'inactivity',
    title: 'Loving check-in',
    description: 'Suggest a warm follow-up when a member hasn’t attended for a while.',
    field: { prop: 'weeks', label: 'After', suffix: 'weeks away', min: 1, max: 52 },
  },
  {
    key: 'birthday',
    title: 'Birthday celebration',
    description: 'Remind the leader to celebrate a member with a birthday that week.',
  },
  {
    key: 'didNotMeet',
    title: 'Did-not-meet check-in',
    description: 'Gently check in when a Circle hasn’t met for a stretch of weeks.',
    field: { prop: 'weeks', label: 'After', suffix: 'weeks not meeting', min: 1, max: 52 },
  },
  {
    key: 'firstTimeAttendee',
    title: 'First-time welcome',
    description: 'Prompt a personal welcome after someone attends for the very first time.',
  },
];

interface Props {
  value: CoachingConfig;
  onChange: (next: CoachingConfig) => void;
  disabled?: boolean;
}

function Toggle({
  on,
  onClick,
  disabled,
  labelOn = 'On',
  labelOff = 'Off',
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`shrink-0 min-w-[64px] text-xs px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
        on
          ? 'text-emerald-300 hover:text-emerald-200 bg-emerald-900/30 hover:bg-emerald-900/45 border-emerald-800/40'
          : 'text-slate-300 hover:text-white bg-zinc-700/30 hover:bg-zinc-700/60 border-zinc-700'
      }`}
    >
      {on ? labelOn : labelOff}
    </button>
  );
}

export default function CoachingAutomationForm({ value, onChange, disabled }: Props) {
  const setAutomation = (key: AutomationMeta['key'], patch: Record<string, unknown>) => {
    onChange({ ...value, [key]: { ...(value[key] as object), ...patch } });
  };

  return (
    <div className="space-y-3">
      {AUTOMATION_META.map((meta) => {
        const section = value[meta.key] as { enabled: boolean } & Record<string, number>;
        return (
          <div
            key={meta.key}
            className={`rounded-lg border px-4 py-3 transition-colors ${
              section.enabled ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-zinc-700 bg-zinc-900/30'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{meta.title}</p>
                <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{meta.description}</p>
              </div>
              <Toggle
                on={section.enabled}
                disabled={disabled}
                onClick={() => setAutomation(meta.key, { enabled: !section.enabled })}
              />
            </div>

            {meta.field && section.enabled && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-slate-400">{meta.field.label}</span>
                <input
                  type="number"
                  min={meta.field.min}
                  max={meta.field.max}
                  disabled={disabled}
                  value={Number(section[meta.field.prop] ?? '')}
                  onChange={(e) =>
                    setAutomation(meta.key, { [meta.field!.prop]: Number(e.target.value) })
                  }
                  className="w-20 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
                <span className="text-slate-400">{meta.field.suffix}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
