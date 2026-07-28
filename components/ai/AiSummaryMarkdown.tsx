'use client';

import React from 'react';

/**
 * Markdown-lite renderer for AI summary output: numbered section headers,
 * ▸ bullets, **bold** inline, and "quote" — attribution blockquotes.
 * Extracted from the Event Summary Tracker so all AI summaries render the same.
 */
export default function AiSummaryMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  const renderInline = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>
        : part
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const isMarkdownHeader = /^#{1,3}\s+/.test(line);
    const cleanHeader = isMarkdownHeader
      ? line.replace(/^#{1,3}\s+/, '')
      : line.replace(/^\*\*/, '').replace(/\*\*$/, '');
    const isStyledHeader =
      (line.startsWith('**') && line.endsWith('**') && /\d+\./.test(line)) ||
      /^\d+\.\s+\*\*/.test(line);
    const isPlainHeader =
      /^\d+\.\s+[A-Za-z]/.test(line) &&
      !line.slice(line.indexOf('.') + 1).trim().startsWith('**') &&
      line.length < 80 &&
      !/:\s/.test(line.slice(line.indexOf('.') + 1));

    if (isMarkdownHeader || isStyledHeader || isPlainHeader) {
      const label = cleanHeader.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '');
      const sectionNumber = cleanHeader.match(/^(\d+)/)?.[1];
      elements.push(
        <div key={key++} className="mt-5 flex items-baseline gap-2 border-b border-vc-500/15 pb-1.5 first:mt-1">
          {sectionNumber && <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-vc-300/60">{sectionNumber}</span>}
          <h3 className="text-sm font-semibold uppercase text-vc-100">{label}</h3>
        </div>
      );
      continue;
    }

    if (/^[\*\-•]\s+/.test(line)) {
      const content = line.replace(/^[\*\-•]\s+/, '');
      elements.push(
        <div key={key++} className="flex gap-2 py-0.5">
          <span className="mt-0.5 shrink-0 text-xs text-vc-300/60">▸</span>
          <p className="text-sm leading-relaxed text-slate-200">{renderInline(content)}</p>
        </div>
      );
      continue;
    }

    if (line.startsWith('"') && /[–—]/.test(line)) {
      const [quote, ...attribution] = line.split(/[–—]/);
      elements.push(
        <blockquote key={key++} className="my-1 border-l-2 border-vc-400/35 py-1 pl-3">
          <p className="text-sm italic leading-relaxed text-slate-300">{quote.trim()}</p>
          {attribution.length > 0 && <p className="mt-0.5 text-xs text-slate-500">— {attribution.join('—').trim()}</p>}
        </blockquote>
      );
      continue;
    }

    elements.push(
      <p key={key++} className="py-0.5 text-sm leading-relaxed text-slate-200">
        {renderInline(line)}
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}
