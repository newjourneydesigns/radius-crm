'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase, CircleLeader } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';

interface BoardResult {
  id: string;
  title: string;
  description?: string;
}

interface CardResult {
  id: string;
  title: string;
  board_id: string;
  board_title: string;
}

interface SearchResult {
  type: 'leader' | 'board' | 'card';
  item: CircleLeader | BoardResult | CardResult;
  score?: number;
  matches?: any[];
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchData, setSearchData] = useState<{
    leaders: CircleLeader[];
    boards: BoardResult[];
    cards: CardResult[];
  }>({ leaders: [], boards: [], cards: [] });

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fuse.js configuration
  const fuseOptions = {
    includeScore: true,
    includeMatches: true,
    threshold: 0.3,
    minMatchCharLength: 2,
    location: 0,
    distance: 1000,
    findAllMatches: true,
    ignoreLocation: true,
    keys: [
      { name: 'name', weight: 2 },
      { name: 'email', weight: 1 },
      { name: 'campus', weight: 1 },
      { name: 'acpd', weight: 1 },
    ]
  };

  // Load search data
  const loadSearchData = useCallback(async () => {
    try {
      const [
        { data: leaders, error: leadersError },
        { data: boardRows },
        { data: cardRows },
      ] = await Promise.all([
        supabase.from('circle_leaders').select('id, name, circle_name, email, phone, campus, acpd, status, additional_leader_name'),
        supabase.from('project_boards').select('id, title, description').eq('is_archived', false),
        supabase.from('board_cards').select('id, title, board_id').eq('is_archived', false),
      ]);

      if (leadersError) {
        console.error('Error loading leaders for search:', leadersError);
      }

      const boards: BoardResult[] = (boardRows || []).map((b: any) => ({
        id: b.id,
        title: b.title,
        description: b.description,
      }));

      const boardMap = new Map(boards.map(b => [b.id, b.title]));
      const cards: CardResult[] = (cardRows || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        board_id: c.board_id,
        board_title: boardMap.get(c.board_id) || '',
      }));

      setSearchData({ leaders: leaders || [], boards, cards });
    } catch (error) {
      console.error('Error loading search data:', error);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadSearchData();
  }, [loadSearchData]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Perform search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);

    try {
      const leadersFuse = new Fuse(searchData.leaders, {
        ...fuseOptions,
        keys: [
          { name: 'circle_name', weight: 3 },
          { name: 'name', weight: 2 },
          { name: 'additional_leader_name', weight: 2 },
          { name: 'email', weight: 1 },
          { name: 'campus', weight: 1 },
          { name: 'acpd', weight: 1 },
        ]
      });

      const boardsFuse = new Fuse(searchData.boards, {
        ...fuseOptions,
        keys: ['title', 'description'],
      });

      const cardsFuse = new Fuse(searchData.cards, {
        ...fuseOptions,
        keys: ['title', 'board_title'],
      });

      const combined: SearchResult[] = [
        ...leadersFuse.search(query).slice(0, 5).map(r => ({
          type: 'leader' as const,
          item: r.item,
          score: r.score,
          matches: r.matches ? [...r.matches] : undefined,
        })),
        ...boardsFuse.search(query).slice(0, 3).map(r => ({
          type: 'board' as const,
          item: r.item as BoardResult,
          score: r.score,
          matches: r.matches ? [...r.matches] : undefined,
        })),
        ...cardsFuse.search(query).slice(0, 5).map(r => ({
          type: 'card' as const,
          item: r.item as CardResult,
          score: r.score,
          matches: r.matches ? [...r.matches] : undefined,
        })),
      ];

      setResults(combined);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, searchData]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const items = resultsRef.current.querySelectorAll('[data-search-item]');
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open search on Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }

      if (!isOpen) return;

      // Close on Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
      }

      // Arrow key navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
      }

      // Enter to select
      if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        handleResultClick(results[selectedIndex]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'leader') {
      router.push(`/circle/${(result.item as CircleLeader).id}`);
    } else if (result.type === 'board') {
      router.push(`/boards/${(result.item as BoardResult).id}`);
    } else if (result.type === 'card') {
      const card = result.item as CardResult;
      router.push(`/boards/${card.board_id}?card=${card.id}`);
    }
    setIsOpen(false);
    setQuery('');
  };

  // Get status color
  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'rgba(74, 222, 128, 0.8)';
      case 'inactive': return 'rgba(248, 113, 113, 0.8)';
      case 'on hold': return 'rgba(250, 204, 21, 0.8)';
      default: return 'rgba(148, 163, 184, 0.6)';
    }
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="search-trigger-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.7)',
          background: 'rgba(255, 255, 255, 0.04) !important',
          border: '1px solid rgba(255, 255, 255, 0.1) !important',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <span className="hidden sm:inline" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Search</span>
        <kbd className="hidden sm:inline-flex" style={{
          alignItems: 'center',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: 'rgba(255, 255, 255, 0.45)',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          ⌘K
        </kbd>
      </button>

      {/* Search Modal */}
      {isOpen && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setIsOpen(false); setQuery(''); } }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '1rem',
            paddingTop: 'min(16vh, 120px)',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            animation: 'searchOverlayIn 0.18s ease-out',
          }}
        >
          <div
            ref={searchRef}
            style={{
              width: '100%',
              maxWidth: '620px',
              borderRadius: '18px',
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #16191f 0%, #111318 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 32px 80px -12px rgba(0, 0, 0, 0.8), 0 0 60px rgba(99, 102, 241, 0.06)',
              animation: 'searchModalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Search Input Area */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '20px 22px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
            }}>
              {/* Search Icon */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {isLoading ? (
                  <div style={{
                    width: '22px',
                    height: '22px',
                    border: '2px solid rgba(255, 255, 255, 0.1)',
                    borderTopColor: 'rgba(99, 102, 241, 0.8)',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }} />
                ) : (
                  <svg style={{ width: 22, height: 22, color: 'rgba(255, 255, 255, 0.3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                )}
              </div>

              {/* Input */}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leaders, boards, cards..."
                autoFocus
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '18px',
                  fontWeight: 400,
                  color: '#eef4ed',
                  letterSpacing: '0.01em',
                  caretColor: 'rgba(99, 102, 241, 0.9)',
                  lineHeight: 1.4,
                }}
              />

              {/* Clear query button or ESC hint */}
              {query ? (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    flexShrink: 0,
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    padding: 0,
                  }}
                >
                  <svg style={{ width: 12, height: 12, color: 'rgba(255, 255, 255, 0.5)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <kbd style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  letterSpacing: '0.02em',
                }}>
                  esc
                </kbd>
              )}
            </div>

            {/* Results Area */}
            <div ref={resultsRef} style={{ maxHeight: 'min(380px, calc(100dvh - 260px))', overflowY: 'auto' }}>
              {results.length > 0 ? (
                <div style={{ padding: '8px' }}>
                  {(() => {
                    const leaderItems = results.filter(r => r.type === 'leader');
                    const boardItems = results.filter(r => r.type === 'board');
                    const cardItems = results.filter(r => r.type === 'card');

                    // Flat ordered list for keyboard index tracking
                    const flatResults = [...leaderItems, ...boardItems, ...cardItems];

                    const sectionHeaderStyle = {
                      padding: '4px 12px 8px',
                      fontSize: '11px',
                      fontWeight: 600 as const,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.06em',
                      color: 'rgba(255, 255, 255, 0.3)',
                    };

                    const renderItem = (result: SearchResult, flatIndex: number) => {
                      const isSelected = flatIndex === selectedIndex;
                      const btnStyle = {
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        textAlign: 'left' as const,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                        background: isSelected ? 'rgba(255, 255, 255, 0.07) !important' : 'transparent !important',
                        border: isSelected ? '1px solid rgba(255, 255, 255, 0.08) !important' : '1px solid transparent !important',
                      };
                      const iconWrapStyle = {
                        flexShrink: 0,
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isSelected
                          ? 'rgba(255, 255, 255, 0.1)'
                          : 'rgba(255, 255, 255, 0.06)',
                        border: `1px solid ${isSelected ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)'}`,
                        transition: 'all 0.15s ease',
                      };
                      const iconColor = isSelected ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.35)';
                      const chevronStyle = {
                        width: 16,
                        height: 16,
                        color: isSelected ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.12)',
                        transition: 'all 0.12s ease',
                        transform: isSelected ? 'translateX(2px)' : 'none',
                      };

                      if (result.type === 'leader') {
                        const leader = result.item as CircleLeader;
                        return (
                          <button
                            key={`leader-${leader.id}`}
                            data-search-item
                            onClick={() => handleResultClick(result)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            style={btnStyle}
                          >
                            <div style={iconWrapStyle}>
                              <svg style={{ width: 18, height: 18, color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                              </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 500, color: isSelected ? '#eef4ed' : 'rgba(238, 244, 237, 0.85)', lineHeight: '1.3', transition: 'color 0.12s ease' }}>
                                {(leader as any).circle_name || leader.name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: '1.3' }}>
                                <span>
                                  {leader.name}
                                  {(leader as any).additional_leader_name ? ` · ${(leader as any).additional_leader_name}` : ''}
                                </span>
                                {leader.campus && (
                                  <>
                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.25)', flexShrink: 0 }} />
                                    <span>{leader.campus}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                              {leader.status && (
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: getStatusColor(leader.status), boxShadow: `0 0 6px ${getStatusColor(leader.status)}` }} />
                              )}
                              <svg style={chevronStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </button>
                        );
                      }

                      if (result.type === 'board') {
                        const board = result.item as BoardResult;
                        return (
                          <button
                            key={`board-${board.id}`}
                            data-search-item
                            onClick={() => handleResultClick(result)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            style={btnStyle}
                          >
                            <div style={iconWrapStyle}>
                              <svg style={{ width: 18, height: 18, color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                              </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 500, color: isSelected ? '#eef4ed' : 'rgba(238, 244, 237, 0.85)', lineHeight: '1.3', transition: 'color 0.12s ease' }}>
                                {board.title}
                              </div>
                              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '3px', lineHeight: '1.3' }}>
                                Board
                              </div>
                            </div>
                            <svg style={chevronStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        );
                      }

                      if (result.type === 'card') {
                        const card = result.item as CardResult;
                        return (
                          <button
                            key={`card-${card.id}`}
                            data-search-item
                            onClick={() => handleResultClick(result)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            style={btnStyle}
                          >
                            <div style={iconWrapStyle}>
                              <svg style={{ width: 18, height: 18, color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 500, color: isSelected ? '#eef4ed' : 'rgba(238, 244, 237, 0.85)', lineHeight: '1.3', transition: 'color 0.12s ease', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {card.title}
                              </div>
                              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '3px', lineHeight: '1.3' }}>
                                {card.board_title || 'Board Card'}
                              </div>
                            </div>
                            <svg style={chevronStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        );
                      }

                      return null;
                    };

                    return (
                      <>
                        {leaderItems.length > 0 && (
                          <>
                            <div style={sectionHeaderStyle}>Circle Leaders · {leaderItems.length}</div>
                            {leaderItems.map((r, i) => renderItem(r, i))}
                          </>
                        )}
                        {boardItems.length > 0 && (
                          <>
                            <div style={{ ...sectionHeaderStyle, paddingTop: leaderItems.length > 0 ? '12px' : '4px' }}>Boards · {boardItems.length}</div>
                            {boardItems.map((r, i) => renderItem(r, leaderItems.length + i))}
                          </>
                        )}
                        {cardItems.length > 0 && (
                          <>
                            <div style={{ ...sectionHeaderStyle, paddingTop: (leaderItems.length + boardItems.length) > 0 ? '12px' : '4px' }}>Cards · {cardItems.length}</div>
                            {cardItems.map((r, i) => renderItem(r, leaderItems.length + boardItems.length + i))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : query.length >= 2 && !isLoading ? (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    margin: '0 auto 16px',
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                  }}>
                    <svg style={{ width: 24, height: 24, color: 'rgba(255, 255, 255, 0.2)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: 'rgba(238, 244, 237, 0.55)', marginBottom: '6px' }}>
                    No results for &ldquo;{query}&rdquo;
                  </p>
                  <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.22)' }}>
                    Try a different name, campus, or board title
                  </p>
                </div>
              ) : (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  {/* Stacked icons for visual interest */}
                  <div style={{ position: 'relative', width: '56px', height: '56px', margin: '0 auto 20px' }}>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '16px',
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid rgba(99, 102, 241, 0.15)',
                    }} />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg style={{ width: 24, height: 24, color: 'rgba(99, 102, 241, 0.5)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: 'rgba(238, 244, 237, 0.5)', marginBottom: '6px' }}>
                    Search anything
                  </p>
                  <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.22)', lineHeight: 1.6 }}>
                    Circle leaders, boards, and cards
                  </p>
                  {/* Quick hints row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                    {['Leaders', 'Boards', 'Cards'].map((label) => (
                      <span key={label} style={{
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.22)',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        letterSpacing: '0.02em',
                      }}>{label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer with keyboard hints */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 18px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(0, 0, 0, 0.25)',
            }}>
              <div className="hidden sm:flex" style={{
                alignItems: 'center',
                gap: '14px',
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.22)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <kbd style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '20px', height: '20px', borderRadius: '5px',
                    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: '11px', lineHeight: 1,
                  }}>↑</kbd>
                  <kbd style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '20px', height: '20px', borderRadius: '5px',
                    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: '11px', lineHeight: 1,
                  }}>↓</kbd>
                  <span>navigate</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <kbd style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: '20px', height: '20px', padding: '0 5px', borderRadius: '5px',
                    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: '11px', lineHeight: 1,
                  }}>↵</kbd>
                  <span>open</span>
                </span>
              </div>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.12)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginLeft: 'auto',
              }}>
                Radius
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Keyframe animations */}
      {isOpen && createPortal(
        <style>{`
          @keyframes searchOverlayIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes searchModalIn {
            from { opacity: 0; transform: scale(0.96) translateY(-8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          /* Override global button styles for search modal */
          [data-search-item] {
            background: transparent !important;
            border-color: transparent !important;
          }
          [data-search-item]:hover {
            background: rgba(255, 255, 255, 0.07) !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
          }
          /* Custom scrollbar for results */
          [data-search-results]::-webkit-scrollbar {
            width: 6px;
          }
          [data-search-results]::-webkit-scrollbar-track {
            background: transparent;
          }
          [data-search-results]::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
          }
          [data-search-results]::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.18);
          }
          /* Override global link color inside search */
          .search-trigger-btn {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
          }
          .search-trigger-btn:hover {
            background: rgba(255, 255, 255, 0.08) !important;
            border-color: rgba(255, 255, 255, 0.15) !important;
          }
        `}</style>,
        document.head
      )}
    </>
  );
}
