'use client';

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { DateTime } from "luxon";
import { useAuth } from "../../contexts/AuthContext";
import GlobalSearch from './GlobalSearch';

/* ─────────────────────────────────────────────────────────
   SF-Symbols-inspired icons — clean, refined strokes
   ───────────────────────────────────────────────────────── */
const HomeIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12l9-9 9 9" />
    <path d="M9 21V12h6v9" />
    <path d="M5 10v11h14V10" />
  </svg>
);

const BoardTabIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
) : (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

const ChartIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
  </svg>
) : (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V11m4 10V7m4 14v-8m4 8V3" />
  </svg>
);

const CalendarIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
  </svg>
) : (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const SearchIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const FindCircleIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
    <path d="M8 11h6M11 8v6" />
  </svg>
);

const PrayerIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
  </svg>
) : (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

const EllipsisIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="5" r={active ? 1.8 : 1.3} />
    <circle cx="12" cy="12" r={active ? 1.8 : 1.3} />
    <circle cx="12" cy="19" r={active ? 1.8 : 1.3} />
  </svg>
);

/* ── Drawer icons ───────────────────────────────────── */
const CompassIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const CogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const QuestionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const UpdateLogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const MessageBulkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CloudImportIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.345A4.501 4.501 0 0118 19.5H6.75z" />
  </svg>
);

const NotebookNavIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const NotebookTabIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.875V4.533zM12.75 20.625A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.092z" />
  </svg>
) : (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const BoardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const BirthdayCakeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v-2m0 0V4m0 2h.01M21 16.05V19a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.95M21 16.05c-1.5.5-3 .75-4.5.45-1.5-.3-3-.3-4.5 0s-3 .3-4.5-.45M21 16.05V13a2 2 0 00-2-2H5a2 2 0 00-2 2v3.05" />
  </svg>
);

const TodayIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

/* ─────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────── */
interface TabIconProps {
  active?: boolean;
}

interface TabItem {
  name: string;
  href?: string;
  Icon: React.FC<TabIconProps>;
  action?: () => void;
  id: string;
}

export default function MobileNavigation() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showUpdateLogBadge, setShowUpdateLogBadge] = useState(false);
  const [sheetY, setSheetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const pathname = usePathname();
  const { user, signOut, isAuthenticated, isAdmin } = useAuth();

  const triggerSearch = useCallback(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const admin = isAdmin();

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? '?';

  /* PWA install prompt */
  useEffect(() => {
    const show = () => setShowInstallPrompt(true);
    const hide = () => setShowInstallPrompt(false);
    window.addEventListener('pwaInstallAvailable', show);
    window.addEventListener('pwaInstalled', hide);
    return () => {
      window.removeEventListener('pwaInstallAvailable', show);
      window.removeEventListener('pwaInstalled', hide);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkForTodayUpdate = async () => {
      try {
        const response = await fetch('/changelog.json', { cache: 'no-store' });
        if (!response.ok) {
          if (mounted) setShowUpdateLogBadge(false);
          return;
        }

        const entries = await response.json() as Array<{ date?: string }>;
        const today = DateTime.local().toISODate();
        const hasTodayEntry = Boolean(today) && entries.some((entry) => entry.date === today);

        if (mounted) setShowUpdateLogBadge(hasTodayEntry);
      } catch {
        if (mounted) setShowUpdateLogBadge(false);
      }
    };

    checkForTodayUpdate();

    return () => {
      mounted = false;
    };
  }, []);

  const handleInstallClick = () => {
    if (typeof window !== 'undefined' && (window as any).installPWA) {
      (window as any).installPWA();
    }
  };

  /* Close sheet on route change */
  useEffect(() => { setSheetOpen(false); setSheetY(0); }, [pathname]);

  /* Drag-to-dismiss for the sheet */
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setSheetY(delta);
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (sheetY > 100) {
      setSheetOpen(false);
      setTimeout(() => setSheetY(0), 300);
    } else {
      setSheetY(0);
    }
  };

  if (!isAuthenticated()) return null;

  /* Tab items — split into left/right groups around the raised center button */
  const leftTabs: TabItem[] = [
    { id: 'events',   name: 'Events',   href: '/calendar',  Icon: CalendarIcon },
    { id: 'today',    name: 'Today',    href: '/today',     Icon: TodayIcon },
  ];
  const rightTabs: TabItem[] = [
    { id: 'notebook', name: 'Notebook', href: '/notebook',  Icon: NotebookTabIcon },
    { id: 'boards',   name: 'Boards',   href: '/boards',    Icon: BoardTabIcon },
  ];

  /* Drawer menu sections */
  const adminItems = [
    { href: '/ccb-explorer', label: 'CCB Explorer', Icon: CompassIcon },
    { href: '/birthday-list', label: 'Birthday List', Icon: BirthdayCakeIcon },
    { href: '/bulk-message', label: 'Bulk Message', Icon: MessageBulkIcon },
    { href: '/add-leader', label: 'Add Leader', Icon: UserPlusIcon },
    { href: '/users', label: 'Manage Users', Icon: UsersIcon },
    { href: '/import-circles', label: 'Import Circles', Icon: CloudImportIcon },
  ];

  const accountItems = [
    { href: '/profile', label: 'Profile', Icon: UserIcon },
    { href: '/settings', label: 'Settings', Icon: CogIcon },
    { href: '/help', label: 'Help & Support', Icon: QuestionIcon },
    { href: '/update-log', label: 'Update Log', Icon: UpdateLogIcon },
  ];

  return (
    <>
      {/* Off-screen GlobalSearch for Cmd+K listener */}
      <div className="fixed -top-full -left-full opacity-0 pointer-events-none" aria-hidden="true">
        <GlobalSearch />
      </div>

      {/* ════════════════════════════════════════════════════
          iOS-style Tab Bar
         ════════════════════════════════════════════════════ */}
      <nav className="mobile-tab-bar md:hidden" role="tablist">
        <div className="mobile-tab-bar-inner">
          {/* Left tabs */}
          {leftTabs.map(({ id, name, href, Icon }) => {
            const active = href ? isActive(href) : false;
            return (
              <Link key={id} href={href!} role="tab" aria-selected={active}
                className={`mobile-tab-item${active ? ' active' : ''}`}>
                <span className={`mobile-tab-icon${active ? ' active' : ''}`}><Icon active={active} /></span>
                <span className={`mobile-tab-label${active ? ' active' : ''}`}>{name}</span>
              </Link>
            );
          })}

          {/* Raised center Search button */}
          <div className="mobile-tab-item" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button className="mobile-tab-raised-btn" type="button" onClick={triggerSearch} aria-label="Search">
              <SearchIcon />
            </button>
            <div className="mobile-tab-raised-ring" />
          </div>

          {/* Right tabs */}
          {rightTabs.map(({ id, name, href, Icon }) => {
            const active = href ? isActive(href) : false;
            return (
              <Link key={id} href={href!} role="tab" aria-selected={active}
                className={`mobile-tab-item${active ? ' active' : ''}`}>
                <span className={`mobile-tab-icon${active ? ' active' : ''}`}><Icon active={active} /></span>
                <span className={`mobile-tab-label${active ? ' active' : ''}`}>{name}</span>
              </Link>
            );
          })}
        </div>

      </nav>

      {/* ════════════════════════════════════════════════════
          More FAB — right side, mirrors QuickActionsFAB on left
         ════════════════════════════════════════════════════ */}
      <button
        type="button"
        onClick={() => setSheetOpen(v => !v)}
        className="md:hidden fixed right-4 z-[10002] w-9 h-9 rounded-full flex items-center justify-center text-white transition-all duration-200 active:scale-90"
        style={{
          bottom: 'calc(98px + env(safe-area-inset-bottom, 0px) + 16px)',
          background: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)',
          boxShadow: sheetOpen
            ? '0 2px 8px rgba(96, 165, 250, 0.3), 0 1px 4px rgba(0,0,0,0.3)'
            : '0 0 14px rgba(96, 165, 250, 0.45), 0 2px 8px rgba(0,0,0,0.35)',
          border: '2px solid rgba(9, 27, 52, 0.85)',
        }}
        aria-label={sheetOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={sheetOpen}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${sheetOpen ? 'rotate-90' : 'rotate-0'}`}
        >
          {sheetOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* ════════════════════════════════════════════════════
          iOS-style Bottom Sheet
         ════════════════════════════════════════════════════ */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-[9998] transition-all duration-300 ${
          sheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={() => setSheetOpen(false)}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`md:hidden fixed left-0 right-0 z-[9999] mobile-sheet ${sheetOpen ? 'open' : ''}`}
        style={{
          bottom: 'calc(98px + env(safe-area-inset-bottom, 0px))',
          transform: sheetOpen ? `translateY(${sheetY}px)` : 'translateY(100%)',
          transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="mobile-sheet-handle">
          <div className="mobile-sheet-handle-bar" />
        </div>

        {/* User card */}
        <div className="mobile-sheet-user">
          <div className="mobile-sheet-avatar">{initials}</div>
          <div className="mobile-sheet-user-info">
            <p className="mobile-sheet-user-name">{user?.name || 'User'}</p>
            <p className="mobile-sheet-user-email">{user?.email}</p>
          </div>
          {admin && <span className="mobile-sheet-badge">Admin</span>}
        </div>

        {/* Quick links */}
        <div className="mobile-sheet-section">
          <div className="mobile-sheet-group">
            <Link href="/person-lookup"
              className={`mobile-sheet-row bordered ${isActive('/person-lookup') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><SearchIcon /></span>
              <span className="mobile-sheet-row-label">Person Lookup</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/search"
              className={`mobile-sheet-row bordered ${isActive('/search') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><FindCircleIcon /></span>
              <span className="mobile-sheet-row-label">Find Leaders</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/prayer"
              className={`mobile-sheet-row bordered ${isActive('/prayer') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><PrayerIcon /></span>
              <span className="mobile-sheet-row-label">Prayer</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/progress"
              className={`mobile-sheet-row bordered ${isActive('/progress') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><ChartIcon /></span>
              <span className="mobile-sheet-row-label">Progress</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/calendar"
              className={`mobile-sheet-row bordered ${isActive('/calendar') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><CalendarIcon /></span>
              <span className="mobile-sheet-row-label">Events</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/boards"
              className={`mobile-sheet-row bordered ${isActive('/boards') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><BoardIcon /></span>
              <span className="mobile-sheet-row-label">Boards</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/notebook"
              className={`mobile-sheet-row ${isActive('/notebook') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><NotebookNavIcon /></span>
              <span className="mobile-sheet-row-label">Notebook</span>
              <ChevronRightIcon />
            </Link>
          </div>
        </div>

        {/* Admin section */}
        {admin && (
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-section-title">Admin</p>
            <div className="mobile-sheet-group">
              {adminItems.map(({ href, label, Icon }, i) => (
                <Link key={href} href={href}
                  className={`mobile-sheet-row ${isActive(href) ? 'active' : ''} ${i < adminItems.length - 1 ? 'bordered' : ''}`}>
                  <span className="mobile-sheet-row-icon"><Icon /></span>
                  <span className="mobile-sheet-row-label">{label}</span>
                  <ChevronRightIcon />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Account section */}
        <div className="mobile-sheet-section">
          <p className="mobile-sheet-section-title">Account</p>
          <div className="mobile-sheet-group">
            {accountItems.map(({ href, label, Icon }, i) => (
              <Link key={href} href={href}
                className={`mobile-sheet-row ${isActive(href) ? 'active' : ''} ${i < accountItems.length - 1 ? 'bordered' : ''}`}>
                <span className="mobile-sheet-row-icon"><Icon /></span>
                <span className="mobile-sheet-row-label flex items-center gap-2">
                  {label}
                  {href === '/update-log' && showUpdateLogBadge && (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/30">
                      New
                    </span>
                  )}
                </span>
                <ChevronRightIcon />
              </Link>
            ))}
          </div>
        </div>

        {/* PWA Install */}
        {showInstallPrompt && (
          <div className="mobile-sheet-section">
            <div className="mobile-sheet-group">
              <button onClick={handleInstallClick} className="mobile-sheet-row install">
                <span className="mobile-sheet-row-icon install"><DownloadIcon /></span>
                <span className="mobile-sheet-row-label">Install App</span>
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}

        {/* Sign out */}
        <div className="mobile-sheet-section" style={{ paddingBottom: '72px' }}>
          <div className="mobile-sheet-group">
            <button onClick={() => { signOut(); setSheetOpen(false); }}
              className="mobile-sheet-row destructive">
              <span className="mobile-sheet-row-icon destructive"><LogoutIcon /></span>
              <span className="mobile-sheet-row-label">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
