'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Inline click-to-copy text. Clicking writes `copyValue` (defaults to the
 * visible value) to the clipboard and flashes a checkmark in place of the
 * clipboard icon. Built for contact details staff paste into CCB by hand,
 * where a tel:/mailto: link would just get in the way.
 */
export default function CopyTextButton({
  value,
  copyValue,
  className = '',
  label,
}: {
  /** Text shown to the user. */
  value: string;
  /** Text written to the clipboard — pass e.g. a digits-only phone. Defaults to `value`. */
  copyValue?: string;
  className?: string;
  /** Accessible label; defaults to "Copy {value}". */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue ?? value);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the text stays readable.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Click to copy'}
      aria-label={label ?? `Copy ${value}`}
      className={`group inline-flex max-w-full items-center gap-1 text-left align-baseline ${className}`}
    >
      <span className="min-w-0 break-all">{value}</span>
      {copied ? (
        <svg className="w-3.5 h-3.5 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}
