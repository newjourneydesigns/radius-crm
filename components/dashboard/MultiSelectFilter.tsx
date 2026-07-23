'use client';

import { useEffect, useRef, useState } from 'react';

interface MultiSelectFilterProps {
  label: string;
  /** Shown in the field and as the reset row when nothing is selected, e.g. "All Statuses" */
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Display-only transform, e.g. capitalising raw status values */
  formatOption?: (option: string) => string;
}

const normalize = (value: string) => value.trim().toLowerCase();

export default function MultiSelectFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  formatOption = (option) => option,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isSelected = (option: string) => selected.some((value) => normalize(value) === normalize(option));

  const toggle = (option: string) => {
    onChange(
      isSelected(option)
        ? selected.filter((value) => normalize(value) !== normalize(option))
        : [...selected, option]
    );
  };

  return (
    <div ref={containerRef}>
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{label}</span>
      <div className="relative">
        <div
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className="w-full min-h-[38px] cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-3 pr-9 py-2 text-sm text-gray-900 dark:text-white shadow-sm"
        >
          {selected.length === 0 ? (
            <span className="text-gray-500 dark:text-gray-400">{allLabel}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selected.map((option) => (
                <span
                  key={option}
                  className="inline-flex items-center rounded-full bg-vc-100 dark:bg-vc-900/50 px-2 py-0.5 text-xs font-medium text-vc-800 dark:text-vc-200"
                >
                  {formatOption(option)}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(option);
                    }}
                    aria-label={`Remove ${formatOption(option)} filter`}
                    className="ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full text-vc-600 dark:text-vc-300 hover:text-vc-800 dark:hover:text-white"
                  >
                    <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                      <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Filter by ${label}`}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-500/40"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-[9999] mt-2 max-h-72 w-full min-w-[13rem] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#1a1c22] shadow-2xl shadow-black/50 ring-1 ring-black/20 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="py-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors ${
                  selected.length === 0
                    ? 'bg-vc-500/10 text-vc-300'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {allLabel}
              </button>
              <div className="my-1 border-t border-white/[0.06]" />
              {options.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <input
                    type="checkbox"
                    checked={isSelected(option)}
                    onChange={() => toggle(option)}
                    aria-label={formatOption(option)}
                    className="h-4 w-4 shrink-0 rounded border-white/20 accent-vc-500"
                  />
                  {formatOption(option)}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
