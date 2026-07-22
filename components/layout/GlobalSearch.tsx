'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import Image from 'next/image';
import { DateTime } from 'luxon';
import { supabase, CircleLeader } from '../../lib/supabase';

// Static Fuse tuning — hoisted so the memoized indexes below don't rebuild just
// because the component re-rendered.
const FUSE_OPTIONS = {
  includeScore: true,
  includeMatches: true,
  threshold: 0.3,
  minMatchCharLength: 2,
  location: 0,
  distance: 1000,
  findAllMatches: true,
  ignoreLocation: true,
};

interface BoardResult {
  id: string;
  title: string;
  description?: string;
}

interface CardResult {
  id: string;
  title: string;
  description?: string;
  board_id: string;
  board_title: string;
}

interface CampaignResult {
  id: string;
  name: string;
  due_date: string | null;
}

interface SearchResult {
  type: 'leader' | 'board' | 'card' | 'campaign';
  item: CircleLeader | BoardResult | CardResult | CampaignResult;
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
    campaigns: CampaignResult[];
  }>({ leaders: [], boards: [], cards: [], campaigns: [] });

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const isEditableTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }, []);

  // Auto-focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      // Refresh the cached dataset on open so newly imported circles/leaders
      // (from /import-circles, etc.) appear without a full reload.
      loadSearchData();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Build each Fuse index once per dataset change — NOT on every keystroke.
  const leadersFuse = useMemo(
    () =>
      new Fuse(searchData.leaders, {
        ...FUSE_OPTIONS,
        keys: [
          { name: 'circle_name', weight: 3 },
          { name: 'team_name', weight: 3 },
          { name: 'name', weight: 2 },
          { name: 'additional_leader_name', weight: 2 },
          { name: 'email', weight: 1 },
          { name: 'campus', weight: 1 },
          { name: 'acpd', weight: 1 },
        ],
      }),
    [searchData.leaders]
  );
  const boardsFuse = useMemo(
    () => new Fuse(searchData.boards, { ...FUSE_OPTIONS, keys: ['title', 'description'] }),
    [searchData.boards]
  );
  const cardsFuse = useMemo(
    () => new Fuse(searchData.cards, { ...FUSE_OPTIONS, keys: ['title', 'description', 'board_title'] }),
    [searchData.cards]
  );
  const campaignsFuse = useMemo(
    () => new Fuse(searchData.campaigns, { ...FUSE_OPTIONS, keys: ['name'] }),
    [searchData.campaigns]
  );

  // Load search data
  const loadSearchData = useCallback(async () => {
    try {
      const [
        { data: leaders, error: leadersError },
        { data: boardRows },
        { data: cardRows },
        { data: campaignRows },
      ] = await Promise.all([
        supabase.from('circle_leaders').select('id, name, circle_name, team_name, leader_type, email, phone, campus, acpd, status, additional_leader_name'),
        supabase.from('project_boards').select('id, title, description').eq('is_archived', false),
        supabase.from('board_cards').select('id, title, description, board_id').eq('is_archived', false),
        supabase.from('follow_up_campaigns').select('id, name, due_date').is('archived_at', null),
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
        description: c.description,
        board_id: c.board_id,
        board_title: boardMap.get(c.board_id) || '',
      }));

      const campaigns: CampaignResult[] = (campaignRows || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        due_date: c.due_date ?? null,
      }));

      setSearchData({ leaders: leaders || [], boards, cards, campaigns });
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
        ...campaignsFuse.search(query).slice(0, 3).map(r => ({
          type: 'campaign' as const,
          item: r.item as CampaignResult,
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
        return;
      }

      if (isEditableTarget(e.target)) return;

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
  }, [isEditableTarget, isOpen, results, selectedIndex]);

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
    } else if (result.type === 'campaign') {
      router.push(`/campaigns/${(result.item as CampaignResult).id}`);
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
          fontWeight: '500',
          color: 'rgba(255, 255, 255, 0.7)',
          background: 'rgba(255, 255, 255, 0.10) !important',
          border: '1px solid rgba(255, 255, 255, 0.12) !important',
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
              padding: '28px 24px',
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
                placeholder="Search leaders, boards, cards, campaigns..."
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
                  padding: '4px 12px',
                  borderRadius: '10px',
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
                    const campaignItems = results.filter(r => r.type === 'campaign');

                    // Flat ordered list for keyboard index tracking — must match
                    // both the combined-results order and the section render order
                    const flatResults = [...leaderItems, ...boardItems, ...cardItems, ...campaignItems];

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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: isSelected ? '#eef4ed' : 'rgba(238, 244, 237, 0.85)', lineHeight: '1.3', transition: 'color 0.12s ease' }}>
                                  {leader.name}
                                </span>
                                {(leader as any).leader_type === 'host_team' && (
                                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: 'rgba(139, 92, 246, 0.2)', color: 'rgba(167, 139, 250, 0.9)', border: '1px solid rgba(139, 92, 246, 0.3)', lineHeight: '1.6', whiteSpace: 'nowrap' }}>
                                    Team
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: '1.3' }}>
                                <span>
                                  {(leader as any).leader_type === 'host_team'
                                    ? ((leader as any).team_name || 'Team')
                                    : `${(leader as any).circle_name || leader.name}${(leader as any).additional_leader_name ? ` · ${(leader as any).additional_leader_name}` : ''}`}
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

                      if (result.type === 'campaign') {
                        const campaign = result.item as CampaignResult;
                        return (
                          <button
                            key={`campaign-${campaign.id}`}
                            data-search-item
                            onClick={() => handleResultClick(result)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            style={btnStyle}
                          >
                            <div style={iconWrapStyle}>
                              <svg style={{ width: 18, height: 18, color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18a23.848 23.848 0 018.835 2.535m-8.835-2.535a23.74 23.74 0 00-.476-4.59m.476 4.59c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 5.395c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                              </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 500, color: isSelected ? '#eef4ed' : 'rgba(238, 244, 237, 0.85)', lineHeight: '1.3', transition: 'color 0.12s ease', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {campaign.name}
                              </div>
                              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '3px', lineHeight: '1.3' }}>
                                {campaign.due_date
                                  ? `Campaign · Due ${DateTime.fromISO(campaign.due_date).toFormat('MMM d, yyyy')}`
                                  : 'Campaign'}
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
                            <div style={sectionHeaderStyle}>Leaders · {leaderItems.length}</div>
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
                        {campaignItems.length > 0 && (
                          <>
                            <div style={{ ...sectionHeaderStyle, paddingTop: (leaderItems.length + boardItems.length + cardItems.length) > 0 ? '12px' : '4px' }}>Campaigns · {campaignItems.length}</div>
                            {campaignItems.map((r, i) => renderItem(r, leaderItems.length + boardItems.length + cardItems.length + i))}
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
                    Try a different name, campus, board, or campaign
                  </p>
                </div>
              ) : (
                <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
                  <Image
                    src="/icon-32x32.png"
                    alt="Radius"
                    width={28}
                    height={28}
                    style={{ opacity: 0.12 }}
                  />
                  <p style={{
                    fontSize: '15px',
                    color: 'rgba(255, 255, 255, 0.72)',
                    textAlign: 'center',
                    lineHeight: 1.7,
                    maxWidth: '420px',
                    fontStyle: 'italic',
                    letterSpacing: '0.01em',
                  }}>
                    "Care for the flock that God has entrusted to you. Watch over it willingly, not grudgingly—not for what you will get out of it, but because you are eager to serve God."
                    <span style={{ display: 'block', marginTop: '8px', fontStyle: 'normal', fontWeight: 500 }}>1 Peter 5:2</span>
                  </p>
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
            background: rgba(255, 255, 255, 0.10) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
          }
          .search-trigger-btn:hover {
            background: rgba(255, 255, 255, 0.15) !important;
            border-color: rgba(255, 255, 255, 0.18) !important;
          }
        `}</style>,
        document.head
      )}
    </>
  );
}
