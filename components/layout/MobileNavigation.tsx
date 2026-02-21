'use client';

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import GlobalSearch from './GlobalSearch';

// ── Icons ──────────────────────────────────────────────
const HomeIcon = ({ filled }: { filled?: boolean }) => filled ? (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-1.56-1.561V4.125a.75.75 0 00-.75-.75h-2.25a.75.75 0 00-.75.75v3.045L12 4.5 2.47 11.47a.75.75 0 001.06 1.06l1.47-1.469V19.5a.75.75 0 00.75.75h4.5a.75.75 0 00.75-.75V16.5a.75.75 0 011.5 0V19.5a.75.75 0 00.75.75h4.5a.75.75 0 00.75-.75v-8.44l1.47 1.47a.75.75 0 001.06-1.06l-8.69-8.69z" />
  </svg>
) : (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-14 0l2 2m0 0v7a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-7m-14 0h14" />
  </svg>
);
const ChartIcon = ({ filled }: { filled?: boolean }) => filled ? (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
  </svg>
) : (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const CalendarIcon = ({ filled }: { filled?: boolean }) => filled ? (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.75 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM7.5 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM8.25 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM9.75 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM10.5 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM16.5 15.75a.75.75 0 100-1.5.75.75 0 000 1.5zM15 17.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM16.5 17.25a.75.75 0 100-1.5.75.75 0 000 1.5z" />
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
  </svg>
) : (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);
const CompassIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);
const UserPlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
);
const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const CogIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const QuestionIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);
const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

// ── Component ──────────────────────────────────────────
export default function MobileNavigation() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const pathname = usePathname();
  const { user, signOut, isAuthenticated, isAdmin } = useAuth();

  const openSearch = () => {
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
    document.dispatchEvent(event);
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const admin = isAdmin();

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  // PWA Install
  useEffect(() => {
    const show = () => setShowInstallPrompt(true);
    const hide  = () => setShowInstallPrompt(false);
    window.addEventListener('pwaInstallAvailable', show);
    window.addEventListener('pwaInstalled', hide);
    return () => {
      window.removeEventListener('pwaInstallAvailable', show);
      window.removeEventListener('pwaInstalled', hide);
    };
  }, []);

  const handleInstallClick = () => {
    if (typeof window !== 'undefined' && (window as any).installPWA) {
      (window as any).installPWA();
    }
  };

  // Close drawer when route changes
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  if (!isAuthenticated()) return null;

  // Bottom tab bar items
  const tabs = [
    { name: 'Home',     href: '/dashboard', Icon: HomeIcon },
    { name: 'Progress', href: '/progress',  Icon: ChartIcon },
    { name: 'Calendar', href: '/calendar',  Icon: CalendarIcon },
  ];

  return (
    <>
      {/* Always mount GlobalSearch so its Cmd+K listener stays active */}
      <div className="sr-only" aria-hidden="true"><GlobalSearch /></div>

      {/* ── Bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[10000] bg-gray-900 border-t border-gray-700/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-16">
          {/* Primary tabs */}
          {tabs.map(({ name, href, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span className={`p-1 rounded-lg transition-colors ${active ? 'bg-blue-600/20' : ''}`}>
                  <Icon filled={active} />
                </span>
                {name}
              </Link>
            );
          })}

          {/* Search tab — fires Cmd+K to open GlobalSearch modal */}
          <button
            onClick={openSearch}
            className="flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className="p-1 rounded-lg">
              <SearchIcon />
            </span>
            Search
          </button>

          {/* More tab — opens drawer */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            className={`flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors ${
              drawerOpen ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className={`p-1 rounded-lg transition-colors ${drawerOpen ? 'bg-blue-600/20' : ''}`}>
              <MenuIcon />
            </span>
            More
          </button>
        </div>
      </nav>

      {/* ── Slide-up Drawer ── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-[9999] bg-gray-900 border border-gray-700/60 rounded-t-2xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-600" />
            </div>

            {/* User info */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-700/60">
              <span className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white ring-2 ring-blue-500/30 shrink-0">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
              {admin && (
                <span className="ml-auto shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30">
                  Admin
                </span>
              )}
            </div>

            {/* Admin section */}
            {admin && (
              <div className="px-3 pt-3 pb-1">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Admin</p>
                {[
                  { href: '/ccb-explorer', label: 'CCB Explorer', Icon: CompassIcon },
                  { href: '/add-leader',   label: 'Add Leader',   Icon: UserPlusIcon },
                  { href: '/users',        label: 'Manage Users', Icon: UsersIcon },
                ].map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive(href)
                        ? 'text-blue-400 bg-blue-600/10'
                        : 'text-gray-200 hover:text-white hover:bg-gray-700/60'
                    }`}
                  >
                    <Icon />
                    {label}
                  </Link>
                ))}
              </div>
            )}

            {/* General section */}
            <div className="px-3 pt-3 pb-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Account</p>
              {[
                { href: '/profile',  label: 'Profile',  Icon: UserIcon },
                { href: '/settings', label: 'Settings', Icon: CogIcon },
                { href: '/help',     label: 'Help',     Icon: QuestionIcon },
              ].map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive(href)
                      ? 'text-blue-400 bg-blue-600/10'
                      : 'text-gray-200 hover:text-white hover:bg-gray-700/60'
                  }`}
                >
                  <Icon />
                  {label}
                </Link>
              ))}
            </div>

            {/* PWA install */}
            {showInstallPrompt && (
              <div className="px-3 pb-1">
                <button
                  onClick={handleInstallClick}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-600/10 transition-colors"
                >
                  <DownloadIcon />
                  Install App
                </button>
              </div>
            )}

            {/* Sign out */}
            <div className="px-3 pb-4 pt-1 border-t border-gray-700/60 mt-2">
              <button
                onClick={() => { signOut(); setDrawerOpen(false); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <LogoutIcon />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}


