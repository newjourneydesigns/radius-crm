'use client';

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import GlobalSearch from './GlobalSearch';

// ----- Icon components (heroicons-style, 20 × 20) -----
const HomeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);
const ChartIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const CompassIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);
const UserPlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
);
const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const UsersIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const CogIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const QuestionIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const PrayerIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

// ----- Nav definitions -----
const primaryNavItems = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Prayer',    href: '/prayer',    icon: PrayerIcon },
  { name: 'Progress',  href: '/progress',  icon: ChartIcon },
  { name: 'Calendar',  href: '/calendar',  icon: CalendarIcon },
];
const MessageBulkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);
const ImportCirclesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.345A4.501 4.501 0 0118 19.5H6.75z" />
  </svg>
);

const adminNavItems = [
  { name: 'CCB Explorer', href: '/ccb-explorer', icon: CompassIcon },
  { name: 'Bulk Message', href: '/bulk-message', icon: MessageBulkIcon },
];

export default function AuthenticatedNavigation() {
  const { user, signOut, isAuthenticated, isAdmin } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isAuthenticated()) return null;

  const admin = isAdmin();
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="hidden md:block bg-gray-900 border-b border-gray-700/60 shadow-xl relative z-[10000]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Left: Brand ── */}
          <Link href="/dashboard" className="flex items-center space-x-2.5 shrink-0">
            <Image src="/icon-32x32.png" alt="RADIUS" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-white tracking-tight">RADIUS</span>
          </Link>

          {/* ── Center: Primary nav ── */}
          <div className="flex items-center space-x-1">
            {primaryNavItems.map(({ name, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive(href)
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                }`}
              >
                <Icon />
                {name}
              </Link>
            ))}

          </div>

          {/* ── Right: Search + User menu ── */}
          <div className="flex items-center gap-2">
            <GlobalSearch />

            {/* User dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700/60 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {/* Avatar */}
                <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-blue-500/30 shrink-0">
                  {initials}
                </span>
                <span className="max-w-[120px] truncate font-medium">{user?.name || user?.email}</span>
                <ChevronDownIcon />
              </button>

              {/* Dropdown panel */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-gray-800 border border-gray-700/60 shadow-2xl ring-1 ring-black/10 z-[99999] overflow-hidden">
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-gray-700/60">
                    <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    {admin && (
                      <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30">
                        Admin
                      </span>
                    )}
                  </div>

                  {/* Admin tools */}
                  {admin && (
                    <div className="py-1">
                      {[
                        { href: '/ccb-explorer',    label: 'CCB Explorer',    Icon: CompassIcon },
                        { href: '/bulk-message',    label: 'Bulk Message',    Icon: MessageBulkIcon },
                        { href: '/add-leader',      label: 'Add Leader',      Icon: UserPlusIcon },
                        { href: '/import-circles',  label: 'Import Circles',  Icon: ImportCirclesIcon },
                      ].map(({ href, label, Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setUserMenuOpen(false)}
                          className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                            isActive(href)
                              ? 'text-blue-400 bg-blue-600/10'
                              : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                          }`}
                        >
                          <Icon />
                          {label}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Manage Users & Settings */}
                  <div className="py-1 border-t border-gray-700/60">
                    {admin && (
                      <Link
                        href="/users"
                        onClick={() => setUserMenuOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                          isActive('/users')
                            ? 'text-blue-400 bg-blue-600/10'
                            : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                        }`}
                      >
                        <UsersIcon />
                        Manage Users
                      </Link>
                    )}
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                        isActive('/settings')
                          ? 'text-blue-400 bg-blue-600/10'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                      }`}
                    >
                      <CogIcon />
                      Settings
                    </Link>
                  </div>

                  {/* Profile */}
                  <div className="py-1 border-t border-gray-700/60">
                    <Link
                      href="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                        isActive('/profile')
                          ? 'text-blue-400 bg-blue-600/10'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                      }`}
                    >
                      <UserIcon />
                      Profile
                    </Link>
                  </div>

                  {/* Help */}
                  <div className="py-1 border-t border-gray-700/60">
                    <Link
                      href="/help"
                      onClick={() => setUserMenuOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                        isActive('/help')
                          ? 'text-blue-400 bg-blue-600/10'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                      }`}
                    >
                      <QuestionIcon />
                      Help
                    </Link>
                  </div>

                  {/* Sign out */}
                  <div className="border-t border-gray-700/60 py-1">
                    <button
                      onClick={() => { signOut(); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    >
                      <LogoutIcon />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </nav>
  );
}
