'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import dynamic from 'next/dynamic';
import { useNotebookContext } from '../../contexts/NotebookContext';
import RichTextEditor from '../notes/RichTextEditor';
import DictateAndSummarize from '../notes/DictateAndSummarize';
import NotebookEditorSkeleton from './NotebookEditorSkeleton';
import type { NotebookEditorMode, NotebookInk } from '../../lib/supabase';

const NotebookInkCanvas = dynamic(() => import('./NotebookInkCanvas'), {
  ssr: false,
  loading: () => <NotebookEditorSkeleton />,
});

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInkForPrint(ink?: NotebookInk | null): string {
  if (!ink?.strokes?.length) return '';
  const paths = ink.strokes.map(stroke => {
    const points = stroke.points.map(([x, y]) => `${x},${y}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${escapeHtml(stroke.color)}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join('');

  return `
    <section class="export-section">
      <h2>Ink Drawing</h2>
      <div class="ink-frame">
        <svg viewBox="0 0 ${ink.logicalWidth} ${ink.contentHeight}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${ink.logicalWidth}" height="${ink.contentHeight}" fill="#151821" />
          ${paths}
        </svg>
      </div>
    </section>
  `;
}

function renderLinkedItemsForPrint(page: NonNullable<ReturnType<typeof useNotebookContext>['activePage']>): string {
  const leaders = page.linked_leaders || [];
  const boards = page.linked_boards || [];
  const cards = page.linked_cards || [];
  const checklists = page.checklists || [];
  const hasLinkedItems = leaders.length || boards.length || cards.length || checklists.length;
  if (!hasLinkedItems) return '';

  const leadersHtml = leaders.length ? `
    <h3>Leaders</h3>
    <ul>${leaders.map(link => `<li>${escapeHtml(link.circle_leader?.name || 'Leader')}${link.circle_leader?.campus ? `, ${escapeHtml(link.circle_leader.campus)}` : ''}</li>`).join('')}</ul>
  ` : '';

  const boardsHtml = boards.length ? `
    <h3>Boards</h3>
    <ul>${boards.map(link => `<li>${escapeHtml(link.project_board?.title || 'Board')}</li>`).join('')}</ul>
  ` : '';

  const cardsHtml = cards.length ? `
    <h3>Cards</h3>
    <ul>${cards.map(link => {
      const card = link.board_card;
      if (!card) return '';
      const meta = [
        card.project_board?.title,
        card.priority,
        card.due_date ? `due ${card.due_date}` : '',
        card.is_complete ? 'complete' : '',
      ].filter(Boolean).join(' · ');
      return `<li>${escapeHtml(card.title)}${meta ? `<span class="muted"> (${escapeHtml(meta)})</span>` : ''}</li>`;
    }).join('')}</ul>
  ` : '';

  const checklistsHtml = checklists.length ? `
    <h3>Checklists</h3>
    ${checklists.map(checklist => `
      <div class="checklist">
        <strong>${escapeHtml(checklist.title || 'Checklist')}</strong>
        <ul>${checklist.items.map(item => `<li>${item.checked ? '☑' : '☐'} ${escapeHtml(item.text)}${item.description ? `<span class="muted"> — ${escapeHtml(item.description)}</span>` : ''}</li>`).join('')}</ul>
      </div>
    `).join('')}
  ` : '';

  return `
    <section class="export-section">
      <h2>Linked Items</h2>
      ${leadersHtml}
      ${boardsHtml}
      ${cardsHtml}
      ${checklistsHtml}
    </section>
  `;
}

function linkedItemsToPlainText(page: NonNullable<ReturnType<typeof useNotebookContext>['activePage']>): string {
  const sections: string[] = [];
  if (page.ink?.strokes?.length) sections.push(`Ink drawing: ${page.ink.strokes.length} stroke${page.ink.strokes.length === 1 ? '' : 's'} included in print/PDF export.`);

  const leaders = page.linked_leaders || [];
  if (leaders.length) {
    sections.push(`Leaders:\n${leaders.map(link => `- ${link.circle_leader?.name || 'Leader'}${link.circle_leader?.campus ? ` (${link.circle_leader.campus})` : ''}`).join('\n')}`);
  }

  const boards = page.linked_boards || [];
  if (boards.length) sections.push(`Boards:\n${boards.map(link => `- ${link.project_board?.title || 'Board'}`).join('\n')}`);

  const cards = page.linked_cards || [];
  if (cards.length) {
    sections.push(`Cards:\n${cards.map(link => {
      const card = link.board_card;
      if (!card) return '- Card';
      const meta = [card.project_board?.title, card.priority, card.due_date ? `due ${card.due_date}` : '', card.is_complete ? 'complete' : ''].filter(Boolean).join(' · ');
      return `- ${card.title}${meta ? ` (${meta})` : ''}`;
    }).join('\n')}`);
  }

  const checklists = page.checklists || [];
  if (checklists.length) {
    sections.push(`Checklists:\n${checklists.map(checklist => [
      `- ${checklist.title || 'Checklist'}`,
      ...checklist.items.map(item => `  ${item.checked ? '[x]' : '[ ]'} ${item.text}${item.description ? ` - ${item.description}` : ''}`),
    ].join('\n')).join('\n')}`);
  }

  return sections.length ? `\n\n---\n${sections.join('\n\n')}` : '';
}

export default function NotebookEditor() {
  const { activePage, updatePage, scheduleSave, saveStatus } = useNotebookContext();
  const [localTitle, setLocalTitle] = useState(activePage?.title ?? '');
  const [localContent, setLocalContent] = useState(activePage?.content ?? '');
  const [savedAt, setSavedAt] = useState<string>(activePage?.updated_at ?? new Date().toISOString());
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize title textarea to fit its content (no scrollbar, wraps naturally)
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [localTitle]);

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

  function handleModeChange(mode: NotebookEditorMode) {
    if (!activePage || (activePage.editor_mode ?? 'text') === mode) return;
    updatePage(activePage.id, { editor_mode: mode });
  }

  const handleInkChange = useCallback((nextInk: NotebookInk) => {
    if (activePage) scheduleSave(activePage.id, { ink: nextInk });
  }, [activePage, scheduleSave]);

  const handleDictateChange = useCallback((plain: string) => {
    const html = plainTextToHtml(plain);
    setLocalContent(html);
    if (activePage) scheduleSave(activePage.id, { title: localTitle, content: html });
  }, [activePage, localTitle, scheduleSave]);

  async function handleCopyText() {
    const plain = (localTitle ? localTitle + '\n\n' : '') + htmlToPlainText(localContent) + (activePage ? linkedItemsToPlainText(activePage) : '');
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setExportOpen(false);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePrint() {
    setExportOpen(false);
    const win = window.open('', '_blank');
    if (!win) return;
    const linkedItemsHtml = activePage ? renderLinkedItemsForPrint(activePage) : '';
    const inkHtml = activePage ? renderInkForPrint(activePage.ink) : '';
    win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(localTitle || 'Untitled')}</title><style>
      body { font-family: Georgia, serif; max-width: 760px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.7; }
      h1 { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
      h2 { font-size: 1.15rem; margin: 2rem 0 0.75rem; padding-top: 1rem; border-top: 1px solid #ddd; }
      h3 { font-size: 0.9rem; margin: 1rem 0 0.35rem; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
      p { margin: 0.75em 0; }
      ul, ol { padding-left: 1.5em; margin: 0.75em 0; }
      li { margin: 0.25em 0; }
      strong { font-weight: 700; }
      em { font-style: italic; }
      .muted { color: #666; }
      .export-section { break-inside: avoid; }
      .ink-frame { overflow: hidden; border: 1px solid #d8d8d8; border-radius: 8px; background: #151821; }
      .ink-frame svg { display: block; width: 100%; height: auto; max-height: 70vh; }
      .checklist + .checklist { margin-top: 0.75rem; }
      @media print { body { margin: 0; } }
    </style></head><body>
      ${localTitle ? `<h1>${escapeHtml(localTitle)}</h1>` : ''}
      ${localContent}
      ${inkHtml}
      ${linkedItemsHtml}
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  if (!activePage) return null;
  const editorMode = activePage.editor_mode ?? 'text';
  const hasSavedInk = Boolean(activePage.has_ink || activePage.ink_stroke_count > 0 || activePage.ink?.strokes?.length);

  const isInkMode = editorMode === 'ink';
  const inkSelectionGuardStyle = isInkMode
    ? {
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as CSSProperties
    : undefined;

  function preventInkModeTextSelection(event: PointerEvent<HTMLTextAreaElement>) {
    if (!isInkMode) return;
    if (event.pointerType === 'pen' || event.pointerType === 'touch') {
      event.preventDefault();
    }
  }

  return (
    <div className="flex-1 min-w-0 w-full flex flex-col overflow-hidden bg-[#0f1117]" style={inkSelectionGuardStyle}>
      <div className={`flex-1 min-w-0 ${isInkMode ? 'min-h-0 overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
        <div
          className={
            isInkMode
              ? 'mx-auto flex h-full min-h-0 w-full max-w-none flex-col px-3 pt-3 pb-3 sm:px-4 sm:pt-4 sm:pb-4'
              : 'mx-auto w-full max-w-[1120px] px-5 pt-6 pb-24 sm:px-8 sm:pt-10 sm:pb-20 md:px-10 lg:px-12'
          }
        >
          <div className={`${isInkMode ? 'mb-3' : 'mb-6'} flex flex-col gap-3 sm:flex-row sm:items-start`}>
            <textarea
              ref={titleRef}
              value={localTitle}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Untitled"
              rows={1}
              spellCheck={false}
              onPointerDown={preventInkModeTextSelection}
              className={`notebook-title-input block w-full min-w-0 resize-none overflow-hidden font-bold text-white leading-tight ${
                isInkMode ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl md:text-4xl'
              }`}
            />
            <div className="flex shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] p-0.5">
              <button
                type="button"
                onClick={() => handleModeChange('text')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${editorMode === 'text' ? 'bg-white text-[#111421]' : 'text-gray-400 hover:text-white'}`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('ink')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${editorMode === 'ink' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Ink
                {hasSavedInk && (
                  <span className={`h-1.5 w-1.5 rounded-full ${editorMode === 'ink' ? 'bg-white/80' : 'bg-sky-300/80'}`} title="Saved ink on this page" />
                )}
              </button>
            </div>
          </div>

          {isInkMode ? (
            <NotebookInkCanvas
              pageId={activePage.id}
              ink={activePage.ink ?? null}
              onChange={handleInkChange}
            />
          ) : (
            <>
              {/* Rich text body — toolbar sticks to top of scroll area */}
              <RichTextEditor
                value={localContent}
                onChange={handleContentChange}
                placeholder="Start writing…"
                minHeight="min(760px, calc(100vh - 360px))"
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
            </>
          )}
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
