'use client';

import { ChevronDown } from 'lucide-react';

interface PrayerSectionHeaderProps {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

export default function PrayerSectionHeader({
  label,
  count,
  expanded,
  onToggle,
}: PrayerSectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full min-h-[44px] flex items-center gap-2 py-3 border-b border-white/[0.06] text-left"
    >
      <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
        {label}
      </span>
      <span className="text-[11px] text-slate-600">· {count}</span>
      <ChevronDown
        strokeWidth={1.5}
        className={`w-3.5 h-3.5 ml-auto text-slate-600 transition-transform ${
          expanded ? '' : '-rotate-90'
        }`}
      />
    </button>
  );
}
