'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';

const TABS = [
  { label: 'Profile',       route: (id: string) => `/circle/${id}`,              exact: true },
  { label: 'Notes',         route: (id: string) => `/circle/${id}/notes` },
  { label: 'Care',          route: (id: string) => `/circle/${id}/care`,          adminOnly: true },
  { label: 'Circle Visits', route: (id: string) => `/circle/${id}/circle-visits`, mobileLabel: 'Visits', adminOnly: true },
  { label: 'Scorecard',     route: (id: string) => `/circle/${id}/scorecard` },
] as const;

type Tab = (typeof TABS)[number];

export default function CircleLeaderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const id = params.id;
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const filteredTabs = TABS.filter(t => !('adminOnly' in t) || isAdmin());

  const isActive = (tab: Tab) => {
    const href = tab.route(id);
    return 'exact' in tab && tab.exact ? pathname === href : pathname.startsWith(href);
  };

  const useOverflow = filteredTabs.length > 4;
  const mobileVisible = useOverflow ? filteredTabs.slice(0, 3) : filteredTabs;
  const overflowTabs = useOverflow ? filteredTabs.slice(3) : ([] as Tab[]);
  const activeInOverflow = overflowTabs.some(t => isActive(t));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tabClass = (active: boolean) =>
    `whitespace-nowrap flex-shrink-0 px-3 py-3 text-sm font-medium transition-colors border-b-2 ${
      active
        ? 'border-blue-500 text-white'
        : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
    }`;

  return (
    <>
      <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Mobile nav */}
          <nav className="flex md:hidden" aria-label="Section navigation">
            {mobileVisible.map(tab => {
              const href = tab.route(id);
              const label = 'mobileLabel' in tab ? (tab as any).mobileLabel : tab.label;
              return (
                <Link key={href} href={href} className={tabClass(isActive(tab))}>
                  {label}
                </Link>
              );
            })}
            {overflowTabs.length > 0 && (
              <div className="relative ml-auto flex-shrink-0" ref={moreMenuRef}>
                <button
                  onClick={() => setShowMoreMenu(v => !v)}
                  className={`flex items-center gap-1 px-3 py-3 text-sm font-medium transition-colors cursor-pointer border-b-2 ${
                    activeInOverflow
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  More
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${showMoreMenu ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMoreMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[160px]">
                    {overflowTabs.map(tab => {
                      const href = tab.route(id);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setShowMoreMenu(false)}
                          className={`block px-4 py-3 text-sm font-medium transition-colors first:rounded-t-lg last:rounded-b-lg ${
                            isActive(tab)
                              ? 'text-white bg-blue-600/25 border-l-2 border-blue-500 pl-3.5'
                              : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
                          }`}
                        >
                          {tab.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Desktop nav */}
          <nav className="hidden md:flex overflow-x-auto scrollbar-hide" aria-label="Section navigation">
            {filteredTabs.map(tab => {
              const href = tab.route(id);
              return (
                <Link key={href} href={href} className={tabClass(isActive(tab))}>
                  {tab.label}
                </Link>
              );
            })}
          </nav>

        </div>
      </div>
      {children}
    </>
  );
}
