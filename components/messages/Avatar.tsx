'use client';

import { initialsOf } from '../../lib/acpdMessagingClient';

// Deterministic accent so each teammate keeps a consistent avatar color.
const PALETTE = [
  'bg-rose-500/20 text-rose-300 ring-rose-400/30',
  'bg-amber-500/20 text-amber-300 ring-amber-400/30',
  'bg-sky-500/20 text-sky-300 ring-sky-400/30',
  'bg-violet-500/20 text-violet-300 ring-violet-400/30',
  'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30',
  'bg-orange-500/20 text-orange-300 ring-orange-400/30',
  'bg-cyan-500/20 text-cyan-300 ring-cyan-400/30',
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

interface AvatarProps {
  name: string;
  seed?: string;
  channel?: boolean;
  group?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-11 h-11 text-sm',
};

export default function Avatar({ name, seed, channel, group, size = 'md' }: AvatarProps) {
  if (channel) {
    return (
      <div className={`${SIZES[size]} shrink-0 grid place-items-center rounded-2xl bg-vc-fab text-white font-semibold ring-1 ring-vc-400/30`}>
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      </div>
    );
  }
  if (group) {
    return (
      <div className={`${SIZES[size]} shrink-0 grid place-items-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30`}>
        <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`${SIZES[size]} shrink-0 grid place-items-center rounded-2xl font-semibold ring-1 ${colorFor(seed || name)}`}>
      {initialsOf(name)}
    </div>
  );
}
