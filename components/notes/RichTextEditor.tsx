'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface LinkDialogState {
  visible: boolean;
  displayText: string;
  url: string;
  hasSelection: boolean;
  savedRange: Range | null;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write a note...',
  disabled = false,
  minHeight = '80px',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const lastInternalValue = useRef(value);

  const [linkDialog, setLinkDialog] = useState<LinkDialogState>({
    visible: false,
    displayText: '',
    url: '',
    hasSelection: false,
    savedRange: null,
  });

  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });

  const refreshFormats = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Only update if the selection is inside this editor
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    if (!editor.contains(node)) return;
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  }, []);

  // Sync external value into the editor only when it changes from outside
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value !== lastInternalValue.current) {
      editor.innerHTML = value;
      lastInternalValue.current = value;
    }
  });

  // Initialize on mount + attach selectionchange listener
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.innerHTML = value;
      lastInternalValue.current = value;
    }
    document.addEventListener('selectionchange', refreshFormats);
    return () => document.removeEventListener('selectionchange', refreshFormats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(() => {
    if (isComposing.current) return;
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    // Treat empty editor as empty string
    const isEmpty = html === '<br>' || html === '';
    const next = isEmpty ? '' : html;
    lastInternalValue.current = next;
    onChange(next);
  }, [onChange]);

  const execFormat = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    refreshFormats();
    handleInput();
  };

  // Save the current selection range
  const saveRange = (): Range | null => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      return sel.getRangeAt(0).cloneRange();
    }
    return null;
  };

  // Restore a saved selection range
  const restoreRange = (range: Range | null) => {
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const openLinkDialog = () => {
    editorRef.current?.focus();
    const range = saveRange();
    const sel = window.getSelection();
    const selectedText = sel?.toString() ?? '';
    setLinkDialog({
      visible: true,
      displayText: selectedText,
      url: '',
      hasSelection: selectedText.length > 0,
      savedRange: range,
    });
  };

  const insertLink = () => {
    const { displayText, url, savedRange, hasSelection } = linkDialog;
    if (!url.trim()) {
      setLinkDialog((prev) => ({ ...prev, visible: false }));
      return;
    }

    const href = url.startsWith('http') ? url : `https://${url}`;
    const label = displayText.trim() || href;

    editorRef.current?.focus();
    restoreRange(savedRange);

    if (hasSelection) {
      // Wrap existing selected text in an anchor
      document.execCommand('createLink', false, href);
      // Set target="_blank" on the newly created link
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode;
        let anchor: HTMLAnchorElement | null = null;
        if (node?.nodeType === Node.TEXT_NODE && node.parentElement?.tagName === 'A') {
          anchor = node.parentElement as HTMLAnchorElement;
        } else if (node?.nodeName === 'A') {
          anchor = node as HTMLAnchorElement;
        }
        if (anchor) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.className = 'text-blue-600 dark:text-blue-400 hover:underline';
        }
      }
    } else {
      // Insert a new link with display text at cursor position
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">${label}</a>`
      );
    }

    setLinkDialog({ visible: false, displayText: '', url: '', hasSelection: false, savedRange: null });
    handleInput();
  };

  const cancelLinkDialog = () => {
    setLinkDialog({ visible: false, displayText: '', url: '', hasSelection: false, savedRange: null });
  };

  const ToolbarButton = ({
    command,
    title,
    children,
  }: {
    command?: string;
    title: string;
    children: React.ReactNode;
  }) => {
    const active = command
      ? activeFormats[command as keyof typeof activeFormats] ?? false
      : false;
    return (
      <button
        type="button"
        title={title}
        onMouseDown={(e) => {
          e.preventDefault(); // Prevent losing focus
          if (command) execFormat(command);
        }}
        disabled={disabled}
        className={`px-2 py-1 rounded text-sm font-medium transition-colors select-none
          ${
            active
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }
          disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white dark:bg-gray-700">
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
        onMouseDown={(e) => e.preventDefault()} // Keep editor focus
      >
        <ToolbarButton command="bold" title="Bold (⌘B)">
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton command="italic" title="Italic (⌘I)">
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton command="underline" title="Underline (⌘U)">
          <span className="underline">U</span>
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          type="button"
          title="Insert Link"
          onMouseDown={(e) => {
            e.preventDefault();
            openLinkDialog();
          }}
          disabled={disabled}
          className="px-2 py-1 rounded text-sm font-medium transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Link
        </button>
      </div>

      {/* Link dialog (inline) */}
      {linkDialog.visible && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 space-y-2">
          {!linkDialog.hasSelection && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Display text</label>
              <input
                autoFocus
                type="text"
                value={linkDialog.displayText}
                onChange={(e) => setLinkDialog((prev) => ({ ...prev, displayText: e.target.value }))}
                placeholder="e.g. Google"
                onKeyDown={(e) => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') cancelLinkDialog(); }}
                className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">URL</label>
            <input
              autoFocus={linkDialog.hasSelection}
              type="url"
              value={linkDialog.url}
              onChange={(e) => setLinkDialog((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') cancelLinkDialog(); }}
              className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={cancelLinkDialog}
              className="text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={insertLink}
              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
            >
              Insert
            </button>
          </div>
        </div>
      )}

      {/* Editable area */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
          className={`px-3 py-2 text-sm text-gray-900 dark:text-white outline-none break-words overflow-auto
            ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
            [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline`}
          style={{ minHeight }}
        />
        {/* Placeholder */}
        {(!value || value === '') && (
          <div
            className="absolute top-2 left-3 text-sm text-gray-400 dark:text-gray-500 pointer-events-none select-none"
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
