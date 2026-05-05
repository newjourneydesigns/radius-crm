'use client';

import { useState, useCallback } from 'react';

// Strip HTML tags to plain text for the AI — preserves newlines between block elements
function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Convert AI summary text → Tiptap-compatible HTML, preserving headers and bullet lists
function summaryToHtml(text: string): string {
  const lines = text.split('\n');
  const html: string[] = [];
  let inList = false;
  let prevWasEmpty = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (inList) { html.push('</ul>'); inList = false; }
      prevWasEmpty = true;
      continue;
    }

    if (line.startsWith('•') || line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${line.replace(/^[•\-\*]\s*/, '')}</li>`);
      prevWasEmpty = false;
    } else {
      if (inList) { html.push('</ul>'); inList = false; }
      // Short line preceded by blank (or start) with no trailing period = section header
      const isHeader = prevWasEmpty && line.length < 50 && !line.endsWith('.') && !line.endsWith(',');
      html.push(isHeader ? `<p><strong>${line.toUpperCase()}</strong></p>` : `<p>${line}</p>`);
      prevWasEmpty = false;
    }
  }

  if (inList) html.push('</ul>');
  return html.join('');
}

interface NotebookAISummaryProps {
  htmlContent: string;
  onReplaceContent: (html: string) => void;
  onAppendContent: (html: string) => void;
}

export default function NotebookAISummary({
  htmlContent,
  onReplaceContent,
  onAppendContent,
}: NotebookAISummaryProps) {
  const [summarizing, setSummarizing] = useState(false);
  const [pendingSummary, setPendingSummary] = useState('');
  const [rawHtmlBeforeSummary, setRawHtmlBeforeSummary] = useState('');
  const [error, setError] = useState('');

  const plainText = htmlToPlainText(htmlContent);
  const hasContent = plainText.trim().length > 0;

  const handleSummarize = useCallback(async () => {
    if (!hasContent || summarizing) return;
    setSummarizing(true);
    setError('');

    try {
      const res = await fetch('/api/ai-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plainText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to summarize. Please try again.');
        return;
      }
      if (data.summary) {
        setRawHtmlBeforeSummary(htmlContent);
        setPendingSummary(data.summary);
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSummarizing(false);
    }
  }, [hasContent, summarizing, plainText, htmlContent]);

  function handleUseSummary() {
    onReplaceContent(summaryToHtml(pendingSummary));
    setPendingSummary('');
    setRawHtmlBeforeSummary('');
  }

  function handleKeepBoth() {
    onAppendContent(`<hr>${summaryToHtml(pendingSummary)}`);
    setPendingSummary('');
    setRawHtmlBeforeSummary('');
  }

  function handleDiscard() {
    setPendingSummary('');
    setRawHtmlBeforeSummary('');
  }

  return (
    <div className="space-y-2">
      {/* Summarize button */}
      <button
        type="button"
        onClick={handleSummarize}
        disabled={!hasContent || summarizing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all
          bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-violet-300
          border border-violet-500/20 hover:border-violet-500/40
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {summarizing ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            Summarizing…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI Summary
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 px-1">{error}</p>
      )}

      {/* Summary preview card */}
      {pendingSummary && (
        <div className="border border-violet-500/30 rounded-lg overflow-hidden bg-violet-500/5">
          <div className="flex items-center justify-between px-3 py-2 bg-violet-500/10 border-b border-violet-500/20">
            <div className="flex items-center gap-1.5 text-sm font-medium text-violet-300">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Summary Preview
            </div>
            <button
              type="button"
              onClick={handleDiscard}
              className="text-violet-500 hover:text-violet-300 transition-colors"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-3 py-3 text-sm text-gray-300 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
            {pendingSummary}
          </div>

          <div className="flex flex-wrap gap-2 px-3 py-2.5 border-t border-violet-500/20">
            <button
              type="button"
              onClick={handleUseSummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md
                bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Use Summary
            </button>
            <button
              type="button"
              onClick={handleKeepBoth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md
                bg-white/[0.08] hover:bg-white/[0.12] text-gray-300 transition-colors"
            >
              Keep Both
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-300 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
