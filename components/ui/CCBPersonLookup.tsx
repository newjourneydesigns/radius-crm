'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface CCBPerson {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  mobilePhone: string;
}

interface CCBPersonLookupProps {
  /** Called when user selects a person from CCB results */
  onSelect: (person: CCBPerson) => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Optional label override */
  label?: string;
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
  /** Additional CSS class for the container */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

export default function CCBPersonLookup({
  onSelect,
  placeholder = 'Search CCB by name or phone...',
  label = 'CCB Person Lookup',
  autoFocus = false,
  className = '',
  size = 'md',
}: CCBPersonLookupProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CCBPerson[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedFromCCB, setSelectedFromCCB] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setSearchError('');

    try {
      const res = await fetch('/api/ccb/person-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || 'Search failed');
      }

      const data = await res.json();
      setSearchResults(data.data || []);
      setShowResults(true);
    } catch (err: any) {
      setSearchError(err.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedFromCCB(false);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value);
      }, 400);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const handleSelectPerson = (person: CCBPerson) => {
    setSearchQuery(person.fullName);
    setSelectedFromCCB(true);
    setShowResults(false);
    setSearchResults([]);
    onSelect(person);
  };

  /** Reset the search state (e.g. after form submission) */
  const reset = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setShowResults(false);
    setSelectedFromCCB(false);
  };

  // Expose reset via ref-like pattern (attach to window for now isn't ideal,
  // but the parent can also just re-mount by toggling a key)
  // We keep it simple: parent can pass a new key to force reset.

  const inputPy = size === 'sm' ? 'py-1 text-sm' : 'py-2';

  return (
    <div ref={searchContainerRef} className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        <span className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          {label}
          <span className="text-gray-400 text-xs font-normal">(search by name or phone)</span>
        </span>
      </label>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowResults(true)}
          className={`w-full px-3 ${inputPy} pl-9 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500`}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {isSearching ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        {selectedFromCCB && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              CCB
            </span>
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && searchResults.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {searchResults.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => handleSelectPerson(person)}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
              style={{ backgroundColor: 'transparent' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {person.fullName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {(person.mobilePhone || person.phone) && (
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        {person.mobilePhone || person.phone}
                      </span>
                    )}
                    {person.email && (
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        {person.email}
                      </span>
                    )}
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showResults && searchResults.length === 0 && !isSearching && searchQuery.trim().length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg px-3 py-3">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">No results found in CCB</p>
        </div>
      )}

      {/* Search error */}
      {searchError && (
        <div className="mt-1 text-xs text-amber-500 dark:text-amber-400">
          {searchError}
        </div>
      )}
    </div>
  );
}
