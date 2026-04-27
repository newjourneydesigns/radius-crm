'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';

const TABS = [
  { label: 'Profile',   route: (id: string) => `/circle/${id}` },
  { label: 'Notes',     route: (id: string) => `/circle/${id}/notes` },
  { label: 'Scorecard', route: (id: string) => `/circle/${id}/scorecard` },
  { label: 'Care',      route: (id: string) => `/circle/${id}/care`,          adminOnly: true },
  { label: 'Visits',    route: (id: string) => `/circle/${id}/circle-visits`, adminOnly: true },
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
  const pathname = usePathname().replace(/\/$/, '');
  const id = params.id;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const filteredTabs = TABS.filter(t => !('adminOnly' in t) || isAdmin());

  const profileHref = `/circle/${id}`;

  const isActive = (tab: Tab) => {
    const href = tab.route(id);
    // Profile route is a prefix of all sub-routes, so require exact match
    if (href === profileHref) return pathname === profileHref;
    return pathname.startsWith(href);
  };

  const tabClass = (active: boolean) =>
    `flex-1 text-center whitespace-nowrap py-3 text-sm font-medium transition-colors border-b-2 ${
      active
        ? 'border-blue-500 text-white'
        : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
    }`;

  return (
    <>
      <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex" aria-label="Section navigation">
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
