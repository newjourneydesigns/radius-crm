'use client';

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../../contexts/AuthContext";
import { useSearchParams, usePathname } from "next/navigation";
import { Suspense } from "react";
import GlobalSearch from './GlobalSearch';

// Component that uses useSearchParams wrapped in Suspense
function EventSummariesLink() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Build Event Summaries URL with current filters if we're on dashboard
  const buildEventSummariesUrl = () => {
    const baseUrl = '/dashboard/event-summaries';
    
    // Only preserve filters if we're currently on the dashboard page
    if (!pathname || pathname !== '/dashboard') {
      return baseUrl;
    }

    const currentFilters = new URLSearchParams();
    
    // Preserve relevant dashboard filters for event summaries
    const relevantParams = ['campus', 'acpd', 'status', 'circleType', 'meetingDay', 'eventSummary', 'connected', 'timeOfDay'];
    
    relevantParams.forEach(param => {
      const value = searchParams?.get(param);
      if (value && value !== 'all' && value !== '') {
        currentFilters.set(param, value);
      }
    });

    const queryString = currentFilters.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  return (
    <Link 
      href={buildEventSummariesUrl()}
      className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
    >
      Event Summaries
    </Link>
  );
}

export default function AuthenticatedNavigation() {
  const { user, signOut, isAuthenticated } = useAuth();

  // Don't render navigation if user is not authenticated
  if (!isAuthenticated()) {
    return null;
  }

  return (
    <nav className="hidden md:block bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-3">
              <Image
                src="/icon-32x32.png"
                alt="RADIUS Logo"
                width={32}
                height={32}
                className="rounded"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                RADIUS
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <GlobalSearch />
            <Link 
              href="/dashboard" 
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Dashboard
            </Link>
            <Suspense fallback={
              <Link 
                href="/dashboard/event-summaries"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Event Summaries
              </Link>
            }>
              <EventSummariesLink />
            </Suspense>
            <Link 
              href="/settings" 
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Settings
            </Link>
            <Link 
              href="/help" 
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Help
            </Link>
            <button
              onClick={signOut}
              className="text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
