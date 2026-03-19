'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

interface CardResult {
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  columnTitle: string;
  isComplete: boolean;
  priority: string | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#f59e0b',
  low:    '#22c55e',
};

export default function BoardCardSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allCards, setAllCards] = useState<CardResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load all cards once on first open
  const loadCards = useCallback(async () => {
    if (loaded) return;
    const [boardsRes, columnsRes, cardsRes] = await Promise.all([
      supabase.from('project_boards').select('id, title'),
      supabase.from('board_columns').select('id, title'),
      supabase.from('board_cards').select('id, title, board_id, column_id, is_complete, priority').eq('is_archived', false),
    ]);

    const boardMap = new Map((boardsRes.data || []).map((b: any) => [b.id, b.title]));
    const colMap   = new Map((columnsRes.data || []).map((c: any) => [c.id, c.title]));

    const cards: CardResult[] = (cardsRes.data || []).map((c: any) => ({
      id:           c.id,
      title:        c.title,
      boardId:      c.board_id,
      boardTitle:   boardMap.get(c.board_id) || 'Unknown board',
      columnTitle:  colMap.get(c.column_id) || '',
      isComplete:   c.is_complete,
      priority:     c.priority || null,
    }));

    setAllCards(cards);
    setLoaded(true);
  }, [loaded]);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
    loadCards();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [loadCards]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  // Keyboard shortcut — Cmd/Ctrl+F on boards pages
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        isOpen ? close() : open();
      }
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && results.length > 0) { e.preventDefault(); navigate(results[selectedIndex]); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedIndex]);

  // Filter results
  const results = query.trim().length < 1
    ? allCards.slice(0, 8)
    : allCards.filter(c =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.boardTitle.toLowerCase().includes(query.toLowerCase()) ||
        c.columnTitle.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 12);

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const navigate = (card: CardResult) => {
    router.push(`/boards/${card.boardId}?card=${card.id}`);
    close();
  };

  const modal = isOpen ? (
    <div className="bcs-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="bcs-modal">
        <div className="bcs-search-row">
          <svg className="bcs-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="bcs-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search cards across all boards..."
          />
          <kbd className="bcs-esc" onClick={close}>esc</kbd>
        </div>

        {results.length > 0 ? (
          <div ref={listRef} className="bcs-results">
            {!query.trim() && <div className="bcs-section-label">Recent cards</div>}
            {results.map((card, idx) => (
              <div
                key={card.id}
                data-idx={idx}
                className={`bcs-item ${idx === selectedIndex ? 'selected' : ''} ${card.isComplete ? 'complete' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => navigate(card)}
              >
                <div className="bcs-item-check">
                  <div className={`bcs-check-circle ${card.isComplete ? 'done' : ''}`}>
                    {card.isComplete && (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2,6 5,9 10,3"/>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="bcs-item-body">
                  <span className="bcs-item-title">{card.title}</span>
                  <span className="bcs-item-meta">
                    <span className="bcs-item-board">{card.boardTitle}</span>
                    {card.columnTitle && <span className="bcs-item-col">{card.columnTitle}</span>}
                  </span>
                </div>
                {card.priority && (
                  <span className="bcs-item-priority" style={{ color: PRIORITY_COLOR[card.priority] }}>
                    {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : query.trim().length >= 1 ? (
          <div className="bcs-empty">No cards found for &ldquo;{query}&rdquo;</div>
        ) : null}

        <div className="bcs-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>

      <style>{`
        .bcs-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.6);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 80px;
        }
        .bcs-modal {
          width: 100%; max-width: 560px;
          background: #1a1d27;
          border: 1px solid #2a2d3a;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 24px 60px rgba(0,0,0,0.6);
        }
        .bcs-search-row {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid #22252f;
        }
        .bcs-search-icon { color: #6b7280; flex-shrink: 0; }
        .bcs-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 15px; color: #f9fafb;
          font-family: inherit;
        }
        .bcs-input::placeholder { color: #4b5563; }
        .bcs-esc {
          font-size: 11px; color: #6b7280;
          background: #0f1117; border: 1px solid #2a2d3a;
          border-radius: 5px; padding: 2px 6px;
          cursor: pointer; font-family: inherit;
        }
        .bcs-section-label {
          font-size: 11px; font-weight: 600; color: #4b5563;
          text-transform: uppercase; letter-spacing: 0.06em;
          padding: 10px 16px 4px;
        }
        .bcs-results { max-height: 360px; overflow-y: auto; padding: 4px 0; }
        .bcs-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px; cursor: pointer;
          transition: background 0.1s;
        }
        .bcs-item.selected { background: #22252f; }
        .bcs-item.complete { opacity: 0.55; }
        .bcs-item-check { display: flex; align-items: center; flex-shrink: 0; }
        .bcs-check-circle {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid #4b5563;
          display: flex; align-items: center; justify-content: center;
          color: transparent;
          transition: all 0.15s;
        }
        .bcs-check-circle.done {
          border-color: #22c55e; background: #22c55e; color: #fff;
        }
        .bcs-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .bcs-item-title {
          font-size: 14px; font-weight: 500; color: #f9fafb;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .bcs-item.complete .bcs-item-title { text-decoration: line-through; color: #6b7280; }
        .bcs-item-meta { display: flex; align-items: center; gap: 6px; }
        .bcs-item-board { font-size: 11px; color: #6366f1; }
        .bcs-item-col {
          font-size: 11px; color: #4b5563;
        }
        .bcs-item-col::before { content: '·'; margin-right: 6px; }
        .bcs-item-priority { font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .bcs-empty { padding: 24px 16px; text-align: center; font-size: 14px; color: #4b5563; }
        .bcs-footer {
          display: flex; gap: 16px; align-items: center;
          padding: 10px 16px;
          border-top: 1px solid #22252f;
          font-size: 11px; color: #4b5563;
        }
        .bcs-footer kbd {
          background: #22252f; border: 1px solid #2a2d3a;
          border-radius: 4px; padding: 1px 5px;
          font-family: inherit; font-size: 11px; color: #9ca3af;
          margin-right: 4px;
        }
      `}</style>
    </div>
  ) : null;

  return (
    <>
      <button className="bcs-trigger" onClick={open}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Search cards
        <kbd>⌘⇧F</kbd>
      </button>
      {typeof window !== 'undefined' && isOpen && createPortal(modal, document.body)}
      <style>{`
        .bcs-trigger {
          position: fixed; bottom: 24px; left: 24px; z-index: 1000;
          display: flex; align-items: center; gap: 8px;
          background: #1a1d27; border: 1px solid #2a2d3a;
          border-radius: 10px; padding: 8px 14px;
          font-size: 13px; color: #9ca3af;
          cursor: pointer; transition: all 0.15s;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          font-family: inherit;
        }
        .bcs-trigger:hover { border-color: #6366f1; color: #c7d2fe; }
        .bcs-trigger kbd {
          background: #22252f; border: 1px solid #2a2d3a;
          border-radius: 4px; padding: 1px 5px;
          font-size: 11px; color: #6b7280; font-family: inherit;
        }
      `}</style>
    </>
  );
}
