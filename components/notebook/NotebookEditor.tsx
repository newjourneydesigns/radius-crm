'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotebookContext } from '../../contexts/NotebookContext';
import RichTextEditor from '../notes/RichTextEditor';
import DictateAndSummarize from '../notes/DictateAndSummarize';

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plainTextToHtml(plain: string): string {
  if (!plain.trim()) return '';
  return '<p>' + plain
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>') + '</p>';
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotebookEditor() {
  const { activePage, scheduleSave, saveStatus } = useNotebookContext();
  const [localTitle, setLocalTitle] = useState(activePage?.title ?? '');
  const [localContent, setLocalContent] = useState(activePage?.content ?? '');
  const [savedAt, setSavedAt] = useState<string>(activePage?.updated_at ?? new Date().toISOString());
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Sync local state when active page changes
  useEffect(() => {
    if (!activePage) return;
    setLocalTitle(activePage.title);
    setLocalContent(activePage.content);
    setSavedAt(activePage.updated_at);
  }, [activePage?.id]);

  // Update savedAt timestamp when a save completes
  useEffect(() => {
    if (saveStatus === 'saved') {
      setSavedAt(new Date().toISOString());
    }
  }, [saveStatus]);

  function handleTitleChange(value: string) {
    setLocalTitle(value);
    if (activePage) scheduleSave(activePage.id, { title: value, content: localContent });
  }

  function handleContentChange(html: string) {
    setLocalContent(html);
    if (activePage) scheduleSave(activePage.id, { title: localTitle, content: html });
  }

  const handleDictateChange = useCallback((plain: string) => {
    const html = plainTextToHtml(plain);
    setLocalContent(html);
    if (activePage) scheduleSave(activePage.id, { title: localTitle, content: html });
  }, [activePage, localTitle, scheduleSave]);

  async function handleCopyText() {
    const plain = (localTitle ? localTitle + '\n\n' : '') + htmlToPlainText(localContent);
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setExportOpen(false);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePrint() {
    setExportOpen(false);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${localTitle || 'Untitled'}</title><style>
      body { font-family: Georgia, serif; max-width: 680px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.7; }
      h1 { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
      p { margin: 0.75em 0; }
      ul, ol { padding-left: 1.5em; margin: 0.75em 0; }
      li { margin: 0.25em 0; }
      strong { font-weight: 700; }
      em { font-style: italic; }
      @media print { body { margin: 0; } }
    </style></head><body>
      ${localTitle ? `<h1>${localTitle}</h1>` : ''}
      ${localContent}
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  if (!activePage) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0f1117]">
      {/* Sticky title bar — always visible above the scroll area */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-5 sm:pt-8 pb-4 bg-[#0f1117]">
        <div className="max-w-[680px] mx-auto">
          <input
            ref={titleRef}
            type="text"
            value={localTitle}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="w-full bg-transparent pl-1 text-2xl sm:text-3xl font-bold text-white placeholder-white/20 border-none outline-none leading-tight"
          />
        </div>
      </div>

      {/* Scrollable editor area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-4 sm:px-6 pb-24 sm:pb-20">
          {/* Rich text body — toolbar sticks to top of scroll area */}
          <RichTextEditor
            value={localContent}
            onChange={handleContentChange}
            placeholder="Start writing…"
            minHeight="400px"
            stickyToolbar
            borderless
          />

          {/* Dictate & AI Summarize */}
          <div className="mt-6 pt-5 border-t border-white/[0.06]">
            <DictateAndSummarize
              text={htmlToPlainText(localContent)}
              onTextChange={handleDictateChange}
            />
          </div>
        </div>
      </div>

      {/* Save status bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-t border-white/[0.04] bg-[#0f1117]">
        {/* Export button */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {copied ? 'Copied!' : 'Export'}
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute bottom-full mb-1 left-0 z-50 w-44 bg-[#1e2130] border border-white/[0.1] rounded-lg shadow-xl py-1">
                <button
                  onClick={handleCopyText}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  Copy as plain text
                </button>
                <button
                  onClick={handlePrint}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                  </svg>
                  Print / Save as PDF
                </button>
              </div>
            </>
          )}
        </div>

        {/* Save status */}
        <div>
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
              Saving…
            </span>
          )}
          {saveStatus !== 'saving' && (
            <span className="text-xs text-gray-600">
              Saved {relativeTime(savedAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
