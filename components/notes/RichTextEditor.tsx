'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import { useEffect, useState, useCallback, useRef } from 'react';

// Font colors offered by the toolbar swatch popover. Chosen to stay legible on
// the notebook's near-black surface (#0f1117). `null` clears the color back to
// the editor's default (white/theme) text.
const TEXT_COLORS: { name: string; value: string | null }[] = [
  { name: 'Default', value: null },
  { name: 'Red', value: '#F87171' },
  { name: 'Orange', value: '#FB923C' },
  { name: 'Gold', value: '#FBBF24' },
  { name: 'Green', value: '#4ADE80' },
  { name: 'Cyan', value: '#22D3EE' },
  { name: 'Blue', value: '#60A5FA' },
  { name: 'Purple', value: '#A78BFA' },
  { name: 'Pink', value: '#F472B6' },
];

// Converts bare URLs in HTML text nodes to <a> tags; idempotent (won't double-wrap).
function linkifyHtml(html: string): string {
  if (!html) return html;
  const parts = html.split(/(<\/?a[^>]*>)/i);
  let inAnchor = false;
  return parts
    .map((part) => {
      if (/^<a /i.test(part)) { inAnchor = true; return part; }
      if (/^<\/a>/i.test(part)) { inAnchor = false; return part; }
      if (inAnchor) return part;
      return part.replace(/(https?:\/\/[^\s<>"']+)/g, (url) => {
        const clean = url.replace(/[.,;:!?)>\]]+$/, '');
        return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>`;
      });
    })
    .join('');
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onSubmit?: () => void;  // Cmd/Ctrl + Enter
  onEscape?: () => void;  // Escape key
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  stickyToolbar?: boolean;
  borderless?: boolean;
  autoFocus?: boolean;
  /** Adds a "Button" toolbar action that inserts a styled anchor (`<a class="cs-button">`). */
  allowButton?: boolean;
  /** Adds a font-color swatch popover to the toolbar. */
  allowColors?: boolean;
  /**
   * Adds an image toolbar action. The callback uploads the picked file (e.g. to
   * /api/admin/resource-images) and resolves to the public URL to insert.
   */
  onUploadImage?: (file: File) => Promise<string>;
  /**
   * Renders the editor as a light, WYSIWYG surface that matches the Circle Leader
   * Toolkit (white card, Open Sans, ink text, green links/buttons via `.cs-canvas`
   * + `.cs-resources`). Use for the admin message/resource editors so what admins
   * type looks like what leaders see.
   */
  toolkitSurface?: boolean;
}

// Link extension that preserves a custom `class` attribute, so anchors styled
// with classes like `cs-button` round-trip cleanly through save/load.
const ClassyLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('class'),
        renderHTML: (attrs: { class?: string | null }) =>
          attrs.class ? { class: attrs.class } : {},
      },
    };
  },
});

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  light,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  light?: boolean;
  children: React.ReactNode;
}) {
  const stateClasses = light
    ? isActive
      ? 'bg-[#34B233]/15 text-[#2a9329]'
      : 'text-neutral-600 hover:bg-neutral-200'
    : isActive
      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors select-none
        ${stateClasses}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onSubmit,
  onEscape,
  placeholder = 'Write a note...',
  disabled = false,
  minHeight = '80px',
  stickyToolbar = false,
  borderless = false,
  autoFocus = false,
  allowButton = false,
  allowColors = false,
  onUploadImage,
  toolkitSurface = false,
}: RichTextEditorProps) {
  const [linkDialog, setLinkDialog] = useState({ visible: false, displayText: '', url: '', hasSelection: false });
  const [buttonDialog, setButtonDialog] = useState({ visible: false, label: '', url: '' });
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false,
        code: false,
        blockquote: false,
      }),
      Underline,
      // Registered unconditionally so existing <img> content round-trips even
      // in editors without an upload action.
      Image.configure({ inline: false }),
      // TextStyle + Color power the font-color swatches. Registered
      // unconditionally so any saved `<span style="color:…">` round-trips even
      // in editors that don't expose the color button.
      TextStyle,
      Color,
      ClassyLink.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: linkifyHtml(value || ''),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (onSubmit && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        if (onEscape && event.key === 'Escape') {
          onEscape();
          return true;
        }
        return false;
      },
    },
  });

  // Sync external value changes (e.g. from DictateAndSummarize) — also fires
  // once the editor finishes initializing so the loaded value paints in.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.getHTML();
    const normalizedCurrent = current === '<p></p>' ? '' : current;
    const processed = linkifyHtml(value || '');
    if (normalizedCurrent !== processed) {
      editor.commands.setContent(processed, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !autoFocus || disabled) return;
    editor.commands.focus('end');
  }, [autoFocus, disabled, editor]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    const existingHref = editor.getAttributes('link').href as string | undefined;
    setLinkDialog({
      visible: true,
      displayText: selectedText || '',
      url: existingHref || '',
      hasSelection: selectedText.length > 0,
    });
  }, [editor]);

  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const { url, displayText, hasSelection } = linkDialog;

    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = url.startsWith('http') ? url : `https://${url}`;
      if (hasSelection) {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
      } else {
        const label = displayText.trim() || href;
        editor.chain().focus().insertContent(
          `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>\u00A0`
        ).run();
      }
    }

    setLinkDialog({ visible: false, displayText: '', url: '', hasSelection: false });
  }, [editor, linkDialog]);

  const cancelLinkDialog = useCallback(() => {
    setLinkDialog({ visible: false, displayText: '', url: '', hasSelection: false });
    editor?.commands.focus();
  }, [editor]);

  const openButtonDialog = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    setButtonDialog({ visible: true, label: selectedText || '', url: '' });
  }, [editor]);

  const handleInsertButton = useCallback(() => {
    if (!editor) return;
    const url = buttonDialog.url.trim();
    const label = buttonDialog.label.trim();
    if (!url || !label) return;
    const href = url.startsWith('http') ? url : `https://${url}`;
    editor.chain().focus().insertContent(
      `<a href="${href}" class="cs-button" target="_blank" rel="noopener noreferrer">${label}</a> `
    ).run();
    setButtonDialog({ visible: false, label: '', url: '' });
  }, [editor, buttonDialog]);

  const cancelButtonDialog = useCallback(() => {
    setButtonDialog({ visible: false, label: '', url: '' });
    editor?.commands.focus();
  }, [editor]);

  const handleImagePicked = useCallback(
    async (file: File | null) => {
      if (!editor || !file || !onUploadImage) return;
      setImageError(null);
      setUploadingImage(true);
      try {
        const url = await onUploadImage(file);
        editor.chain().focus().setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
      } catch (e: any) {
        setImageError(e?.message || 'Image upload failed.');
      } finally {
        setUploadingImage(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
      }
    },
    [editor, onUploadImage]
  );

  if (!editor) return null;

  const currentColor = (editor.getAttributes('textStyle').color as string | undefined) || null;

  const containerClass = borderless
    ? toolkitSurface
      ? 'cs-canvas'
      : ''
    : toolkitSurface
      ? 'cs-canvas border border-neutral-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#34B233]/40 focus-within:border-[#34B233] bg-[#ffffff]'
      : 'border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white dark:bg-gray-700';

  const toolbarClass = stickyToolbar
    ? 'sticky top-0 z-20 px-0 py-1.5 bg-[#0f1117] border-b border-white/[0.06]'
    : toolkitSurface
      ? 'px-2 py-1.5 border-b border-neutral-200 bg-neutral-50'
      : 'px-2 py-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800';

  const dividerClass = toolkitSurface ? 'bg-neutral-300' : 'bg-gray-300 dark:bg-gray-600';

  const linkButtonStateClass = toolkitSurface
    ? editor.isActive('link')
      ? 'bg-[#34B233]/15 text-[#2a9329]'
      : 'text-neutral-600 hover:bg-neutral-200'
    : editor.isActive('link')
      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';

  // Inline insert dialogs sit inside the editor, so they need a light theme in
  // toolkit mode (the dark `.bg-white`/`dark:` defaults would render dark there).
  const dlgLabelClass = toolkitSurface
    ? 'text-xs font-medium text-neutral-600 w-20 shrink-0'
    : 'text-xs font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0';
  const dlgInputLinkClass = toolkitSurface
    ? 'rte-dialog-input flex-1 text-sm px-2 py-1 border border-neutral-300 rounded bg-[#ffffff] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#34B233]'
    : 'flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-vc-500';
  const dlgInputBtnClass = toolkitSurface
    ? 'rte-dialog-input flex-1 text-sm px-2 py-1 border border-neutral-300 rounded bg-[#ffffff] text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#34B233]'
    : 'flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const dlgCancelClass = toolkitSurface
    ? 'text-xs px-2 py-1 text-neutral-500 hover:text-neutral-700'
    : 'text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200';
  const linkDialogWrapClass = toolkitSurface
    ? 'px-3 py-2 bg-[#eff6ff] border-b border-[#bfdbfe] space-y-2'
    : 'px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 space-y-2';
  const buttonDialogWrapClass = toolkitSurface
    ? 'px-3 py-2 bg-[#ecfdf5] border-b border-[#a7f3d0] space-y-2'
    : 'px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 space-y-2';

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div
        className={`flex items-center gap-0.5 flex-wrap ${toolbarClass}`}
        onMouseDown={(e) => e.preventDefault()}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          disabled={disabled}
          light={toolkitSurface}
          title="Bold (⌘B)"
        >
          <span className="font-bold">B</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          disabled={disabled}
          light={toolkitSurface}
          title="Italic (⌘I)"
        >
          <span className="italic">I</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          disabled={disabled}
          light={toolkitSurface}
          title="Underline (⌘U)"
        >
          <span className="underline">U</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          disabled={disabled}
          light={toolkitSurface}
          title="Strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarButton>

        {allowColors && (
          <div className="relative">
            <button
              type="button"
              title="Font color"
              onMouseDown={(e) => {
                e.preventDefault();
                setColorMenuOpen((v) => !v);
              }}
              disabled={disabled}
              className={`flex flex-col items-center rounded px-2 py-1 leading-none transition-colors select-none
                ${
                  colorMenuOpen
                    ? toolkitSurface
                      ? 'bg-neutral-200 text-neutral-800'
                      : 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-white'
                    : toolkitSurface
                      ? 'text-neutral-600 hover:bg-neutral-200'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-sm font-semibold">A</span>
              <span
                className="mt-0.5 h-1 w-3.5 rounded-sm"
                style={{ backgroundColor: currentColor || (toolkitSurface ? '#111827' : '#e5e7eb') }}
              />
            </button>

            {colorMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setColorMenuOpen(false);
                  }}
                />
                <div
                  className={`absolute left-0 top-full z-40 mt-1 rounded-lg border p-2 shadow-xl ${
                    toolkitSurface ? 'border-neutral-200 bg-white' : 'border-white/[0.1] bg-[#1e2130]'
                  }`}
                >
                  <div className="grid grid-cols-[repeat(5,1.5rem)] gap-1.5">
                    {TEXT_COLORS.map((c) => {
                      const isActive = currentColor === c.value;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          title={c.name}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (c.value) {
                              editor.chain().focus().setColor(c.value).run();
                            } else {
                              editor.chain().focus().unsetColor().run();
                            }
                            setColorMenuOpen(false);
                          }}
                          className={`relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border transition-transform hover:scale-110 ${
                            isActive
                              ? toolkitSurface
                                ? 'border-neutral-800 ring-1 ring-neutral-800'
                                : 'border-white ring-1 ring-white'
                              : 'border-black/10 dark:border-white/15'
                          } ${c.value === null ? (toolkitSurface ? 'bg-neutral-100' : 'bg-gray-200') : ''}`}
                          style={c.value ? { backgroundColor: c.value } : undefined}
                        >
                          {c.value === null && (
                            <span className="absolute h-[1.5px] w-8 rotate-45 bg-red-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className={`w-px h-4 mx-1 ${dividerClass}`} />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          disabled={disabled}
          light={toolkitSurface}
          title="Heading"
        >
          H
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          disabled={disabled}
          light={toolkitSurface}
          title="Bullet list"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
            <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          disabled={disabled}
          light={toolkitSurface}
          title="Numbered list"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
            <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
            <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
            <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          disabled={disabled}
          light={toolkitSurface}
          title="Horizontal rule"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="12" x2="20" y2="12" />
          </svg>
        </ToolbarButton>

        <div className={`w-px h-4 mx-1 ${dividerClass}`} />

        <button
          type="button"
          title="Insert Link"
          onMouseDown={(e) => {
            e.preventDefault();
            openLinkDialog();
          }}
          disabled={disabled}
          className={`px-2 py-1 rounded text-sm font-medium transition-colors select-none flex items-center
            ${linkButtonStateClass}
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>

        {allowButton && (
          <ToolbarButton
            onClick={openButtonDialog}
            disabled={disabled}
            title="Insert button"
          >
            <span className="inline-flex items-center justify-center text-[10px] font-bold tracking-wide leading-none px-1.5 py-[3px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              BTN
            </span>
          </ToolbarButton>
        )}

        {onUploadImage && (
          <ToolbarButton
            onClick={() => imageInputRef.current?.click()}
            disabled={disabled || uploadingImage}
            light={toolkitSurface}
            title="Insert image"
          >
            {uploadingImage ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            )}
          </ToolbarButton>
        )}
      </div>

      {onUploadImage && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => handleImagePicked(e.target.files?.[0] || null)}
        />
      )}

      {imageError && (
        <div
          className={
            toolkitSurface
              ? 'px-3 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-200'
              : 'px-3 py-1.5 text-xs text-red-500 bg-red-500/10 border-b border-red-500/30'
          }
        >
          {imageError}
        </div>
      )}

      {/* Inline link dialog */}
      {linkDialog.visible && (
        <div className={linkDialogWrapClass}>
          {!linkDialog.hasSelection && (
            <div className="flex items-center gap-2">
              <label className={dlgLabelClass}>Display text</label>
              <input
                autoFocus
                type="text"
                value={linkDialog.displayText}
                onChange={(e) => setLinkDialog((p) => ({ ...p, displayText: e.target.value }))}
                placeholder="e.g. Google"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSetLink(); } if (e.key === 'Escape') cancelLinkDialog(); }}
                className={dlgInputLinkClass}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className={dlgLabelClass}>URL</label>
            <input
              autoFocus={linkDialog.hasSelection}
              type="url"
              value={linkDialog.url}
              onChange={(e) => setLinkDialog((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSetLink(); } if (e.key === 'Escape') cancelLinkDialog(); }}
              className={dlgInputLinkClass}
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={cancelLinkDialog} className={dlgCancelClass}>
              Cancel
            </button>
            <button type="button" onClick={handleSetLink} className="btn-primary px-3 py-1 rounded-lg text-xs">
              Insert
            </button>
          </div>
        </div>
      )}

      {/* Inline button dialog */}
      {buttonDialog.visible && (
        <div className={buttonDialogWrapClass}>
          <div className="flex items-center gap-2">
            <label className={dlgLabelClass}>Button label</label>
            <input
              autoFocus
              type="text"
              value={buttonDialog.label}
              onChange={(e) => setButtonDialog((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. What's Happening"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInsertButton(); } if (e.key === 'Escape') cancelButtonDialog(); }}
              className={dlgInputBtnClass}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className={dlgLabelClass}>URL</label>
            <input
              type="url"
              value={buttonDialog.url}
              onChange={(e) => setButtonDialog((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInsertButton(); } if (e.key === 'Escape') cancelButtonDialog(); }}
              className={dlgInputBtnClass}
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={cancelButtonDialog} className={dlgCancelClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInsertButton}
              disabled={!buttonDialog.label.trim() || !buttonDialog.url.trim()}
              className="btn-primary px-3 py-1 rounded-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Insert button
            </button>
          </div>
        </div>
      )}

      {/* Editor area. In toolkit mode the content carries `cs-resources` so it
          renders with the same typography/links/buttons leaders see. */}
      <div
        style={{ minHeight }}
        className={
          toolkitSurface
            ? 'min-w-0 max-w-full overflow-x-hidden px-4 py-3 cursor-text rte-editor cs-resources'
            : 'min-w-0 max-w-full overflow-x-hidden px-3 py-2 text-sm text-gray-900 dark:text-white cursor-text rte-editor'
        }
        onClick={() => editor.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
