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
      default: return 'rgba(141, 169, 196, 0.6)';
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
          color: 'rgba(141, 169, 196, 0.9)',
          background: 'rgba(11, 37, 69, 0.5) !important',
          border: '1px solid rgba(76, 103, 133, 0.3) !important',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <span className="hidden sm:inline" style={{ color: 'rgba(141, 169, 196, 0.9)' }}>Search</span>
        <kbd className="hidden sm:inline-flex" style={{
          alignItems: 'center',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: 'rgba(141, 169, 196, 0.6)',
          background: 'rgba(76, 103, 133, 0.15)',
          border: '1px solid rgba(76, 103, 133, 0.25)',
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
            paddingTop: 'min(18vh, 140px)',
            background: 'radial-gradient(ellipse at center top, rgba(9, 27, 52, 0.85) 0%, rgba(0, 0, 0, 0.7) 100%)',
            backdropFilter: 'blur(12px) saturate(150%)',
            WebkitBackdropFilter: 'blur(12px) saturate(150%)',
            animation: 'searchOverlayIn 0.2s ease-out',
          }}
        >
          <div
            ref={searchRef}
            style={{
              width: '100%',
              maxWidth: '560px',
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(14, 40, 72, 0.97) 0%, rgba(11, 37, 69, 0.98) 100%)',
              border: '1px solid rgba(141, 169, 196, 0.15)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 25px 60px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(141, 169, 196, 0.05)',
              animation: 'searchModalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Search Input Area */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 20px',
              borderBottom: '1px solid rgba(76, 103, 133, 0.2)',
            }}>
              {/* Search Icon */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {isLoading ? (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid rgba(141, 169, 196, 0.2)',
                    borderTopColor: 'rgba(141, 169, 196, 0.8)',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }} />
                ) : (
                  <svg style={{ width: 20, height: 20, color: 'rgba(141, 169, 196, 0.5)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  background: 'transparent !important',
                  border: 'none !important',
                  outline: 'none',
                  fontSize: '16px',
                  fontWeight: 400,
                  color: '#eef4ed',
                  letterSpacing: '0.01em',
                  caretColor: 'rgba(141, 169, 196, 0.8)',
                }}
              />

              {/* Clear query button */}
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    flexShrink: 0,
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(76, 103, 133, 0.25) !important',
                    border: 'none !important',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    padding: 0,
                  }}
                >
                  <svg style={{ width: 12, height: 12, color: 'rgba(141, 169, 196, 0.6)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Results Area */}
            <div ref={resultsRef} style={{ maxHeight: '380px', overflowY: 'auto' }}>
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
                      color: 'rgba(141, 169, 196, 0.45)',
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
                        background: isSelected ? 'rgba(141, 169, 196, 0.12) !important' : 'transparent !important',
                        border: isSelected ? '1px solid rgba(141, 169, 196, 0.15) !important' : '1px solid transparent !important',
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
                          ? 'linear-gradient(135deg, rgba(141, 169, 196, 0.3), rgba(76, 103, 133, 0.4))'
                          : 'rgba(76, 103, 133, 0.2)',
                        border: `1px solid ${isSelected ? 'rgba(141, 169, 196, 0.25)' : 'rgba(76, 103, 133, 0.15)'}`,
                        transition: 'all 0.15s ease',
                      };
                      const iconColor = isSelected ? 'rgba(141, 169, 196, 0.9)' : 'rgba(141, 169, 196, 0.5)';
                      const chevronStyle = {
                        width: 16,
                        height: 16,
                        color: isSelected ? 'rgba(141, 169, 196, 0.6)' : 'rgba(141, 169, 196, 0.2)',
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', fontSize: '12px', color: 'rgba(141, 169, 196, 0.6)', lineHeight: '1.3' }}>
                                <span>
                                  {leader.name}
                                  {(leader as any).additional_leader_name ? ` · ${(leader as any).additional_leader_name}` : ''}
                                </span>
                                {leader.campus && (
                                  <>
                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(141, 169, 196, 0.35)', flexShrink: 0 }} />
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
                              <div style={{ fontSize: '12px', color: 'rgba(141, 169, 196, 0.6)', marginTop: '3px', lineHeight: '1.3' }}>
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
                              <div style={{ fontSize: '12px', color: 'rgba(141, 169, 196, 0.6)', marginTop: '3px', lineHeight: '1.3' }}>
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
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    margin: '0 auto 14px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(76, 103, 133, 0.15)',
                    border: '1px solid rgba(76, 103, 133, 0.15)',
                  }}>
                    <svg style={{ width: 22, height: 22, color: 'rgba(141, 169, 196, 0.35)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(238, 244, 237, 0.6)', marginBottom: '4px' }}>
                    No results found
                  </p>
                  <p style={{ fontSize: '12px', color: 'rgba(141, 169, 196, 0.4)' }}>
                    Nothing matching &ldquo;{query}&rdquo;
                  </p>
                </div>
              ) : (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    margin: '0 auto 14px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(76, 103, 133, 0.15)',
                    border: '1px solid rgba(76, 103, 133, 0.15)',
                  }}>
                    <svg style={{ width: 22, height: 22, color: 'rgba(141, 169, 196, 0.35)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(238, 244, 237, 0.6)', marginBottom: '4px' }}>
                    Search leaders, boards & cards
                  </p>
                  <p style={{ fontSize: '12px', color: 'rgba(141, 169, 196, 0.4)' }}>
                    Type to find circle leaders, boards, or cards
                  </p>
                </div>
              )}
            </div>

            {/* Footer with keyboard hints */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              borderTop: '1px solid rgba(76, 103, 133, 0.15)',
              background: 'rgba(9, 27, 52, 0.4)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '11px',
                color: 'rgba(141, 169, 196, 0.35)',
              }}>
                {/* Navigate hint */}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <kbd style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    background: 'rgba(76, 103, 133, 0.2)',
                    border: '1px solid rgba(76, 103, 133, 0.2)',
                    fontSize: '10px',
                    lineHeight: 1,
                  }}>↑</kbd>
                  <kbd style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    background: 'rgba(76, 103, 133, 0.2)',
                    border: '1px solid rgba(76, 103, 133, 0.2)',
                    fontSize: '10px',
                    lineHeight: 1,
                  }}>↓</kbd>
                  <span style={{ marginLeft: '2px' }}>navigate</span>
                </span>
                {/* Enter hint */}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <kbd style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 5px',
                    borderRadius: '4px',
                    background: 'rgba(76, 103, 133, 0.2)',
                    border: '1px solid rgba(76, 103, 133, 0.2)',
                    fontSize: '10px',
                    lineHeight: 1,
                  }}>↵</kbd>
                  <span>open</span>
                </span>
              </div>
              {/* Powered by label */}
              <div style={{
                fontSize: '10px',
                color: 'rgba(141, 169, 196, 0.25)',
                letterSpacing: '0.04em',
              }}>
                RADIUS
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
            background: rgba(141, 169, 196, 0.12) !important;
            border-color: rgba(141, 169, 196, 0.15) !important;
          }
          /* Custom scrollbar for results */
          [data-search-results]::-webkit-scrollbar {
            width: 6px;
          }
          [data-search-results]::-webkit-scrollbar-track {
            background: transparent;
          }
          [data-search-results]::-webkit-scrollbar-thumb {
            background: rgba(76, 103, 133, 0.3);
            border-radius: 3px;
          }
          [data-search-results]::-webkit-scrollbar-thumb:hover {
            background: rgba(76, 103, 133, 0.5);
          }
          /* Override global link color inside search */
          .search-trigger-btn {
            background: rgba(11, 37, 69, 0.5) !important;
            border: 1px solid rgba(76, 103, 133, 0.3) !important;
          }
          .search-trigger-btn:hover {
            background: rgba(76, 103, 133, 0.3) !important;
            border-color: rgba(141, 169, 196, 0.3) !important;
          }
        `}</style>,
        document.head
      )}
    </>
  );
}
