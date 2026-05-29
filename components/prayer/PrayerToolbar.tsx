'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';

interface PrayerToolbarProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filterCampus: string;
  onFilterCampusChange: (v: string) => void;
  filterAcpd: string;
  onFilterAcpdChange: (v: string) => void;
  campusList: string[];
  acpdList: string[];
  sortDir: 'asc' | 'desc';
  onSortToggle: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export default function PrayerToolbar({
  searchQuery,
  onSearchChange,
  filterCampus,
  onFilterCampusChange,
  filterAcpd,
  onFilterAcpdChange,
  campusList,
  acpdList,
  sortDir,
  onSortToggle,
  onExpandAll,
  onCollapseAll,
}: PrayerToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="space-y-3 mb-5">
      <div className="relative">
        <Search
          strokeWidth={1.5}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search prayers or leaders"
          className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[15px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-vc-500/40 focus:border-transparent transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-0 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-300"
            aria-label="Clear search"
          >
            <X strokeWidth={1.5} className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={filterCampus}
          onChange={(e) => onFilterCampusChange(e.target.value)}
          className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-vc-500/40 focus:border-transparent transition-all"
        >
          <option value="" className="bg-[#111318]">All campuses</option>
          {campusList.map((c) => (
            <option key={c} value={c} className="bg-[#111318]">
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterAcpd}
          onChange={(e) => onFilterAcpdChange(e.target.value)}
          className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-vc-500/40 focus:border-transparent transition-all"
        >
          <option value="" className="bg-[#111318]">All ACPDs</option>
          {acpdList.map((a) => (
            <option key={a} value={a} className="bg-[#111318]">
              {a}
            </option>
          ))}
        </select>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-white/[0.07] transition-colors ${
              menuOpen
                ? 'text-white bg-white/[0.08]'
                : 'text-slate-400 bg-white/[0.04] hover:text-white'
            }`}
            aria-label="View options"
          >
            <SlidersHorizontal strokeWidth={1.5} className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 z-30 min-w-[200px] rounded-lg bg-[#1a1c22] border border-white/[0.1] shadow-xl py-1">
              <button
                onClick={() => {
                  onSortToggle();
                  setMenuOpen(false);
                }}
                className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
              >
                {sortDir === 'asc' ? (
                  <ArrowDownAZ strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                ) : (
                  <ArrowUpAZ strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                )}
                Sort {sortDir === 'asc' ? 'Z to A' : 'A to Z'}
              </button>
              <button
                onClick={() => {
                  onExpandAll();
                  setMenuOpen(false);
                }}
                className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
              >
                <ChevronsUpDown strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                Expand all
              </button>
              <button
                onClick={() => {
                  onCollapseAll();
                  setMenuOpen(false);
                }}
                className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
              >
                <ChevronsDownUp strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                Collapse all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
