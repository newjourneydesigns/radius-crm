'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Modal from '../ui/Modal';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CircleSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string | null;
  isLoading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  groupName: string;
  eventCount: number;
}

/** Formats inline markdown: **bold** and *italic* */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Handle **bold** and *italic* inline
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[0].startsWith('**')) {
      parts.push(<strong key={match.index} className="font-semibold text-gray-900 dark:text-white">{match[2]}</strong>);
    } else {
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/** Lightweight markdown renderer — no external dependencies */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    if (listType === 'ol') {
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-1 my-2 pl-4 text-gray-700 dark:text-gray-300 text-sm">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={key++} className="space-y-1 my-2 pl-4 text-gray-700 dark:text-gray-300 text-sm">
          {listBuffer.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-blue-500 mt-0.5 shrink-0">•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    listBuffer = [];
    listType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      flushList();
      continue;
    }

    // Heading: ## or ### or ####
    const h2Match = trimmed.match(/^#{2,3}\s+(.+)$/);
    if (h2Match) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-base font-bold text-gray-900 dark:text-white mt-5 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">
          {renderInline(h2Match[1])}
        </h2>
      );
      continue;
    }

    // Heading: # (h1)
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-2">
          {renderInline(h1Match[1])}
        </h1>
      );
      continue;
    }

    // Numbered section header like "1. Snapshot" or "10. Two-Sentence Executive Summary"
    // Must be short (≤ 50 chars) and contain no parentheses — avoids matching list items
    const numberedHeaderMatch = trimmed.match(/^\*?\*?(\d{1,2})\.\s+\*?\*?([A-Z][^*()\n]+)\*?\*?$/);
    if (numberedHeaderMatch && trimmed.length <= 50 && !trimmed.includes('(')) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-base font-bold text-gray-900 dark:text-white mt-5 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">
          {numberedHeaderMatch[1]}. {renderInline(numberedHeaderMatch[2].replace(/\*\*/g, ''))}
        </h2>
      );
      continue;
    }

    // Quote line — starts with ", “, or > (blockquote syntax)
    const isQuote =
      trimmed.startsWith('"') ||
      trimmed.startsWith('“') ||
      trimmed.startsWith("'") ||
      trimmed.startsWith('> ');
    if (isQuote) {
      flushList();
      const quoteText = trimmed.startsWith('> ') ? trimmed.slice(2) : trimmed;
      elements.push(
        <blockquote key={key++} className="border-l-2 border-blue-400 dark:border-blue-500 pl-3 my-3 mb-4 italic text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {renderInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // Bullet: - or • or *
    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/);
    if (bulletMatch) {
      const bulletContent = bulletMatch[1];
      // Any bullet whose content starts with a quote char or is prefixed with "Example:"
      // gets the blue-bar blockquote treatment
      const startsWithQuote = /^["""''']/.test(bulletContent);
      const isExample = /^Example:\s+["""'']/.test(bulletContent);
      if (startsWithQuote || isExample) {
        flushList();
        const exampleText = isExample ? bulletContent.replace(/^Example:\s+/, '') : bulletContent;
        elements.push(
          <blockquote key={key++} className="border-l-2 border-blue-400 dark:border-blue-500 pl-3 my-3 mb-4 italic text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {renderInline(exampleText)}
          </blockquote>
        );
        continue;
      }
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listBuffer.push(bulletContent);
      continue;
    }

    // Ordered: 1. item (short enough to be a list item)
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch && trimmed.length > 60) {
      // Long numbered lines are likely section content, not list items
      flushList();
      elements.push(
        <p key={key++} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-1">
          {renderInline(trimmed)}
        </p>
      );
      continue;
    }
    if (orderedMatch) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listBuffer.push(orderedMatch[2]);
      continue;
    }

    // "**Label:** content" — bold label line
    const boldLabelMatch = trimmed.match(/^\*\*([^*]+)\*\*[:\s](.*)$/);
    if (boldLabelMatch) {
      flushList();
      elements.push(
        <p key={key++} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-1">
          <strong className="font-semibold text-gray-900 dark:text-white">{boldLabelMatch[1]}: </strong>
          {renderInline(boldLabelMatch[2])}
        </p>
      );
      continue;
    }

    // Horizontal rule ---
    if (/^[-_]{3,}$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={key++} className="border-gray-200 dark:border-gray-700 my-3" />);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={key++} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-1">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <>{elements}</>;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function CircleSummaryModal({
  isOpen,
  onClose,
  summary,
  isLoading,
  error,
  startDate,
  endDate,
  groupName,
  eventCount,
}: CircleSummaryModalProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatCopied, setChatCopied] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset all state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setChatMessages([]);
      setChatInput('');
      setChatError(null);
      setChatCopied(false);
    }
  }, [isOpen]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading]);

  const handleSendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isChatLoading || !summary) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput('');
    setChatError(null);
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/ccb/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, summary }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setChatError(result.error || 'Failed to get a response.');
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
      }
    } catch (err: any) {
      setChatError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, chatMessages, isChatLoading, summary]);

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyChat = async () => {
    if (!chatMessages.length) return;
    const text = chatMessages
      .map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setChatCopied(true);
    setTimeout(() => setChatCopied(false), 2000);
  };

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = summary;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!mounted) return null;

  const dateLabel =
    !endDate || startDate === endDate
      ? formatDate(startDate)
      : `${formatDate(startDate)} – ${formatDate(endDate)}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Event Summary Analysis"
      size="xl"
    >
      <div className="space-y-4">
        {/* Meta info bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium border border-blue-200/30 dark:border-blue-700/30">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {dateLabel}
            </span>
            {groupName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium">
                {groupName}
              </span>
            )}
            <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 rounded-full text-xs">
              {eventCount} event{eventCount !== 1 ? 's' : ''}
            </span>
          </div>

          {summary && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              {copied ? (
                <>
                  <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Summary
                </>
              )}
            </button>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-blue-100 dark:border-blue-900/30" />
              <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Analyzing circle reports…</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This may take 15–30 seconds</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400 font-medium">Failed to generate summary</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* Summary content */}
        {!isLoading && summary && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-5 max-h-[45vh] overflow-y-auto">
            <MarkdownContent content={summary} />
          </div>
        )}

        {/* Chat panel — only shown once analysis is ready */}
        {!isLoading && summary && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* Chat header */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <svg className="h-3.5 w-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ask a follow-up question</span>
              {chatMessages.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={handleCopyChat}
                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {chatCopied ? (
                      <>
                        <svg className="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setChatMessages([]); setChatError(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Message history */}
            {chatMessages.length > 0 && (
              <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3 bg-white dark:bg-gray-900">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                      }`}
                    >
                      {msg.role === 'assistant' ? <MarkdownContent content={msg.content} /> : msg.content}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]"></span>
                    </div>
                  </div>
                )}
                {chatError && (
                  <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                    {chatError}
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 px-3 py-2.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="e.g. Which circles showed the most spiritual depth?"
                rows={1}
                className="flex-1 resize-none text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-colors"
                style={{ maxHeight: '96px' }}
                disabled={isChatLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
