'use client';

import { useState } from 'react';
import { supabase, type CircleLeader } from '../../lib/supabase';

type CadenceOption = 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'none';

const CADENCE_OPTIONS: { value: CadenceOption; label: string; days: number }[] = [
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'bi-weekly', label: 'Bi-Weekly', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
  { value: 'quarterly', label: 'Quarterly', days: 90 },
  { value: 'none', label: 'None', days: 0 },
];

function getCadenceDays(cadence: CadenceOption): number {
  return CADENCE_OPTIONS.find(o => o.value === cadence)?.days || 0;
}

function getDaysSince(dateString: string | undefined | null): number | null {
  if (!dateString) return null;
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    date.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function getCadenceStatus(cadence: CadenceOption, lastCheckIn: string | undefined | null): {
  status: 'on-track' | 'due-soon' | 'overdue' | 'no-contact' | 'none';
  label: string;
  daysRemaining: number | null;
  daysSince: number | null;
} {
  if (!cadence || cadence === 'none') {
    return { status: 'none', label: 'No cadence set', daysRemaining: null, daysSince: null };
  }

  const daysSince = getDaysSince(lastCheckIn);
  const targetDays = getCadenceDays(cadence);

  if (daysSince === null) {
    return { status: 'no-contact', label: 'No check-ins yet', daysRemaining: null, daysSince: null };
  }

  const daysRemaining = targetDays - daysSince;

  if (daysRemaining < 0) {
    return { status: 'overdue', label: `${Math.abs(daysRemaining)}d overdue`, daysRemaining, daysSince };
  }
  if (daysRemaining <= 2) {
    return { status: 'due-soon', label: daysRemaining === 0 ? 'Due today' : `Due in ${daysRemaining}d`, daysRemaining, daysSince };
  }
  return { status: 'on-track', label: `${daysRemaining}d remaining`, daysRemaining, daysSince };
}

const STATUS_STYLES = {
  'on-track': {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'stroke-emerald-500',
    track: 'stroke-emerald-500/20',
  },
  'due-soon': {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    ring: 'stroke-amber-500',
    track: 'stroke-amber-500/20',
  },
  'overdue': {
    bg: 'bg-red-500/10 dark:bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    ring: 'stroke-red-500',
    track: 'stroke-red-500/20',
  },
  'no-contact': {
    bg: 'bg-gray-500/10 dark:bg-gray-500/15',
    border: 'border-gray-500/30',
    text: 'text-gray-500 dark:text-gray-400',
    dot: 'bg-gray-400',
    ring: 'stroke-gray-400',
    track: 'stroke-gray-400/20',
  },
  'none': {
    bg: 'bg-gray-500/5 dark:bg-gray-500/10',
    border: 'border-gray-500/20',
    text: 'text-gray-400 dark:text-gray-500',
    dot: 'bg-gray-300',
    ring: 'stroke-gray-300',
    track: 'stroke-gray-300/20',
  },
};

function ProgressRing({ percentage, status, size = 36 }: { percentage: number; status: keyof typeof STATUS_STYLES; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;
  const styles = STATUS_STYLES[status];

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className={styles.track}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`${styles.ring} transition-all duration-500`}
      />
    </svg>
  );
}

interface CheckInCadenceProps {
  leader: CircleLeader;
  onUpdate: (updates: Partial<CircleLeader>) => void;
  isAdmin: boolean;
}

export default function CheckInCadence({ leader, onUpdate, isAdmin }: CheckInCadenceProps) {
  const [isChanging, setIsChanging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const cadence = (leader.check_in_cadence as CadenceOption) || 'none';
  const { status, label, daysRemaining, daysSince } = getCadenceStatus(cadence, leader.last_check_in_date);
  const styles = STATUS_STYLES[status];

  // Calculate ring percentage
  let ringPct = 0;
  if (cadence !== 'none' && daysSince !== null) {
    const targetDays = getCadenceDays(cadence);
    ringPct = Math.max(0, Math.min(100, ((targetDays - daysSince) / targetDays) * 100));
  }

  const handleCadenceChange = async (newCadence: CadenceOption) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ check_in_cadence: newCadence })
        .eq('id', leader.id);

      if (!error) {
        onUpdate({ check_in_cadence: newCadence });
      }
    } catch (e) {
      console.error('Error updating cadence:', e);
    } finally {
      setIsSaving(false);
      setIsChanging(false);
    }
  };

  // Compact display when cadence is 'none' and user isn't admin
  if (cadence === 'none' && !isAdmin) return null;

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} px-3 py-2.5`}>
      <div className="flex items-center gap-3">
        {/* Progress ring or dot */}
        {cadence !== 'none' && daysSince !== null ? (
          <ProgressRing percentage={ringPct} status={status} />
        ) : (
          <div className={`w-2.5 h-2.5 rounded-full ${styles.dot} shrink-0`} />
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${styles.text}`}>{label}</span>
          </div>
          {cadence !== 'none' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {daysSince !== null
                ? `Last check-in ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince}d ago`} · ${CADENCE_OPTIONS.find(o => o.value === cadence)?.label} target`
                : `${CADENCE_OPTIONS.find(o => o.value === cadence)?.label} target`
              }
            </p>
          )}
        </div>

        {/* Change cadence button (admin only) */}
        {isAdmin && (
          <div className="relative">
            <button
              onClick={() => setIsChanging(!isChanging)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {cadence === 'none' ? 'Set cadence' : 'Change'}
            </button>

            {isChanging && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px]">
                {CADENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleCadenceChange(opt.value)}
                    disabled={isSaving}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      opt.value === cadence
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    } ${isSaving ? 'opacity-50' : ''}`}
                  >
                    {opt.label}
                    {opt.value !== 'none' && <span className="text-xs text-gray-400 ml-1">({opt.days}d)</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { getCadenceStatus, getCadenceDays, type CadenceOption };
