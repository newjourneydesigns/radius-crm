'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase, CircleLeader } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';

interface SearchResult {
  type: 'leader';
  item: CircleLeader;
  score?: number;
  matches?: any[];
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchData, setSearchData] = useState<{
    leaders: CircleLeader[];
  }>({ leaders: [] });

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fuse.js configuration
  const fuseOptions = {
    includeScore: true,
    includeMatches: true,
    threshold: 0.3, // Lower = more strict matching
    minMatchCharLength: 2,
    location: 0, // Start searching from the beginning
    distance: 1000, // How far from location to search (higher = more flexible)
    findAllMatches: true, // Find all matches, not just the first one
    ignoreLocation: true, // Search anywhere in the text, not just at location
    keys: [
      // Circle Leader fields
      { name: 'name', weight: 2 }, // Higher weight for names
      { name: 'email', weight: 1 },
      { name: 'campus', weight: 1 },
      { name: 'acpd', weight: 1 },
    ]
  };

  // Load search data
  const loadSearchData = useCallback(async () => {
    try {
      // Load Circle Leaders
      const { data: leaders, error: leadersError } = await supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, status');

      if (leadersError) {
        console.error('Error loading leaders for search:', leadersError);
        return;
      }

      setSearchData({ leaders: leaders || [] });
    } catch (error) {
      console.error('Error loading search data:', error);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadSearchData();
  }, [loadSearchData]);

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
        keys: ['name', 'email', 'campus', 'acpd']
      });

      const leaderResults = leadersFuse.search(query).slice(0, 8);

      setResults(
        leaderResults.map(result => ({
          type: 'leader' as const,
          item: result.item,
          score: result.score,
          matches: result.matches ? [...result.matches] : undefined
        }))
      );
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, searchData]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open search on Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }

      // Close on Escape
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    const leader = result.item as CircleLeader;
    router.push(`/circle/${leader.id}`);
    setIsOpen(false);
    setQuery('');
  };

  // Highlight matching text
  const highlightMatch = (text: string, matches?: any[]) => {
    if (!matches || !matches.length) return text;

    let highlightedText = text;
    const matchedIndices = matches[0]?.indices || [];
    
    // Sort indices by start position (descending) to avoid offset issues
    const sortedIndices = [...matchedIndices].sort((a, b) => b[0] - a[0]);
    
    sortedIndices.forEach(([start, end]) => {
      const before = highlightedText.slice(0, start);
      const match = highlightedText.slice(start, end + 1);
      const after = highlightedText.slice(end + 1);
      highlightedText = `${before}<mark class="bg-yellow-200 dark:bg-yellow-600">${match}</mark>${after}`;
    });

    return highlightedText;
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-400 dark:text-gray-500">
          ⌘K
        </kbd>
      </button>

      {/* Search Modal */}
      {isOpen && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] animate-in fade-in duration-200"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div 
              ref={searchRef}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/20 dark:border-gray-700/50 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
              style={{
                position: 'relative',
                zIndex: 100000,
                margin: 'auto'
              }}
            >
              {/* Search Input */}
              <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
                <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search circle leaders..."
                  className="w-full px-4 py-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0"
                  autoFocus
                />
                {isLoading && (
                  <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                )}
              </div>

              {/* Search Results */}
              <div className="max-h-96 overflow-y-auto">
                {results.length > 0 ? (
                  <div className="py-2">
                    {results.map((result, index) => (
                      <button
                        key={`${result.type}-${result.item.id}-${index}`}
                        onClick={() => handleResultClick(result)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700"
                      >
                        <div className="flex items-start space-x-3">
                          {/* Icon */}
                          <div className="flex-shrink-0 mt-1">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                            </svg>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div>
                              <p 
                                className="text-sm font-medium text-gray-900 dark:text-white"
                                dangerouslySetInnerHTML={{
                                  __html: highlightMatch((result.item as CircleLeader).name, result.matches?.find(m => m.key === 'name'))
                                }}
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Circle Leader
                                {(result.item as CircleLeader).campus && ` • ${(result.item as CircleLeader).campus}`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : query.length >= 2 && !isLoading ? (
                  <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <p>No results found for "{query}"</p>
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <p>Start typing to search circle leaders...</p>
                    <p className="text-xs mt-1">Press ⌘K to open search anytime</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>, 
        document.body
      )}
    </>
  );
}
