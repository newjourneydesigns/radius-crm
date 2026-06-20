'use client';

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { DateTime } from "luxon";
import { Bug, Lightbulb } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useOpenAlertCount } from "../../hooks/useOpenAlertCount";
import { useAcpdUnreadCount } from "../../hooks/useAcpdUnreadCount";
import { useInboxUnreadCount } from "../../hooks/useInboxUnreadCount";
import { MESSAGES_ENABLED } from "../../lib/features";
import { useQuickActions, type QuickActionId, type QuickActionMeta } from "../../contexts/QuickActionsContext";
import GlobalSearch from './GlobalSearch';

/* ─────────────────────────────────────────────────────────
   Tab-bar icons — SF-Symbols-inspired, filled when active
   ───────────────────────────────────────────────────────── */
const TodayIcon = ({ active }: { active?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.6} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const CalendarIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
  </svg>
) : (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2.5" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const BoardTabIcon = ({ active }: { active?: boolean }) => active ? (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
) : (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

const SearchIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const MoreTabIcon = ({ active }: { active?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r={active ? 2 : 1.4} />
    <circle cx="12" cy="12" r={active ? 2 : 1.4} />
    <circle cx="19" cy="12" r={active ? 2 : 1.4} />
  </svg>
);

/* ── Sheet row icons (20px, outline) ─────────────────── */
const PersonSearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const FindCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
    <path d="M8 11h6M11 8v6" />
  </svg>
);

const PrayerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V11m4 10V7m4 14v-8m4 8V3" />
  </svg>
);

const NotebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const CompassIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const CogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const QuestionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const UpdateLogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const BugReportIcon = () => (
  <Bug width="20" height="20" strokeWidth={1.6} />
);

const IdeaIcon = () => (
  <Lightbulb width="20" height="20" strokeWidth={1.6} />
);

const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const MessageBulkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const ChatBubbleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 10.5h8M8 14h5m-9 6l1.8-1.8A2 2 0 016.2 18H18a3 3 0 003-3V7a3 3 0 00-3-3H6a3 3 0 00-3 3v13z" />
  </svg>
);

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CloudImportIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.345A4.501 4.501 0 0118 19.5H6.75z" />
  </svg>
);

const MassUpdateIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const BirthdayCakeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v-2m0 0V4m0 2h.01M21 16.05V19a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.95M21 16.05c-1.5.5-3 .75-4.5.45-1.5-.3-3-.3-4.5 0s-3 .3-4.5-.45M21 16.05V13a2 2 0 00-2-2H5a2 2 0 00-2 2v3.05" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mobile-sheet-chevron">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* Tap-priority order for the mobile Quick Add sheet (distinct from the desktop FAB). */
const MOBILE_QUICK_ACTION_ORDER: QuickActionId[] = ['card', 'prayer', 'followup', 'note', 'connection'];

/* ─────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────── */
export default function MobileNavigation() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showUpdateLogBadge, setShowUpdateLogBadge] = useState(false);
  const [sheetY, setSheetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const pathname = usePathname() ?? '';
  const { user, signOut, isAuthenticated, isAdmin } = useAuth();
  const openAlertCount = useOpenAlertCount();
  const acpdUnreadCount = useAcpdUnreadCount(isAdmin());
  const inboxUnreadCount = useInboxUnreadCount();
  const { open: openQuickAction, actions: quickActions } = useQuickActions();

  /* Mobile-specific ordering; any action not listed falls back to its original position. */
  const orderedQuickActions: QuickActionMeta[] = [
    ...MOBILE_QUICK_ACTION_ORDER
      .map((id) => quickActions.find((a) => a.id === id))
      .filter((a): a is QuickActionMeta => Boolean(a)),
    ...quickActions.filter((a) => !MOBILE_QUICK_ACTION_ORDER.includes(a.id)),
  ];

  const triggerSearch = useCallback(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const admin = isAdmin();

  // Inbox + Messages live inside the "More" sheet on mobile, so surface their
  // unread state as a dot on the More tab itself.
  const moreHasActivity = inboxUnreadCount > 0 || (MESSAGES_ENABLED && admin && acpdUnreadCount > 0);

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
        if (!response.ok) { if (mounted) setShowUpdateLogBadge(false); return; }
        const entries = await response.json() as Array<{ date?: string }>;
        const today = DateTime.local().toISODate();
        const hasTodayEntry = Boolean(today) && entries.some((entry) => entry.date === today);
        if (mounted) setShowUpdateLogBadge(hasTodayEntry);
      } catch {
        if (mounted) setShowUpdateLogBadge(false);
      }
    };
    checkForTodayUpdate();
    return () => { mounted = false; };
  }, []);

  const handleInstallClick = () => {
    if (typeof window !== 'undefined') {
      const pwaWindow = window as Window & { installPWA?: () => void };
      pwaWindow.installPWA?.();
    }
  };

  /* Close sheet on route change */
  useEffect(() => { setSheetOpen(false); setSheetY(0); }, [pathname]);

  /* Lock body scroll while the sheet is open */
  useEffect(() => {
    if (sheetOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [sheetOpen]);

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

  const runQuickAction = (id: typeof quickActions[number]['id']) => {
    setSheetOpen(false);
    openQuickAction(id);
  };

  if (!isAuthenticated()) return null;

  /* Tab items split around the raised center Search button */
  const leftTabs = [
    { id: 'today',  name: 'Today',  href: '/today',                  Icon: TodayIcon },
    { id: 'events', name: 'Events', href: '/event-summary-tracker',  Icon: CalendarIcon },
  ];
  const rightTabs = [
    { id: 'boards', name: 'Boards', href: '/boards', Icon: BoardTabIcon },
  ];

  /* Sheet navigation (destinations not on the tab bar) */
  const toolsItems = [
    { href: '/person-lookup', label: 'Person Lookup', Icon: PersonSearchIcon },
    { href: '/birthday-list', label: 'Birthday List', Icon: BirthdayCakeIcon },
    { href: '/circle-reporting', label: 'Circle Reporting', Icon: ChartIcon },
    { href: '/touchpoint-tracker', label: 'Connection Tracker', Icon: ChartIcon },
    { href: '/progress', label: 'Progress', Icon: ChartIcon },
    ...(admin
      ? [
          { href: '/ccb-explorer', label: 'CCB Explorer', Icon: CompassIcon },
          { href: '/bulk-message', label: 'Bulk Message', Icon: MessageBulkIcon },
        ]
      : []),
  ];

  const browseItems = [
    { href: '/search',        label: 'Circle List',   Icon: FindCircleIcon },
    { href: '/notebook',      label: 'Notebook',      Icon: NotebookIcon },
    { href: '/prayer',        label: 'Prayer',        Icon: PrayerIcon },
  ];

  const adminItems = [
    { href: '/import-circles', label: 'Import Circles',  Icon: CloudImportIcon },
    { href: '/import-team',   label: 'Import Host Team',  Icon: UserPlusIcon },
    { href: '/import-circles/#mass-update', label: 'Mass Update', Icon: MassUpdateIcon },
    { href: '/users',         label: 'Manage Users',     Icon: UsersIcon },
    { href: '/ccb-usage',     label: 'CCB Usage',        Icon: ChartIcon },
    { href: '/admin/ccb-event-occurrence-delete', label: 'CCB Event Management', Icon: CalendarIcon },
  ];

  const accountItems = [
    { href: '/profile',    label: 'Profile',        Icon: UserIcon },
    { href: '/settings',   label: 'Settings',       Icon: CogIcon },
    { href: '/help',       label: 'Help & Support', Icon: QuestionIcon },
    { href: '/update-log', label: 'Update Log',     Icon: UpdateLogIcon },
  ];

  const feedbackItems = [
    { href: '/f/i-have-an-idea-yyjiwi', label: 'Share Your Idea', Icon: IdeaIcon },
    { href: 'https://vccradius.netlify.app/f/circles-toolkit-bug-report-copy-7o4vfp', label: 'Report A Bug', Icon: BugReportIcon },
  ];

  return (
    <>
      {/* Off-screen GlobalSearch for the Cmd+K listener */}
      <div className="fixed -top-full -left-full opacity-0 pointer-events-none" aria-hidden="true">
        <GlobalSearch />
      </div>

      {/* ════════ iOS-style Tab Bar ════════ */}
      <nav className="mobile-tab-bar md:hidden" role="tablist">
        <div className="mobile-tab-bar-inner">
          {leftTabs.map(({ id, name, href, Icon }) => {
            const active = isActive(href);
            return (
              <Link key={id} href={href} role="tab" aria-selected={active}
                className={`mobile-tab-item${active ? ' active' : ''}`}>
                <span className={`mobile-tab-icon${active ? ' active' : ''}`}><Icon active={active} /></span>
                <span className={`mobile-tab-label${active ? ' active' : ''}`}>{name}</span>
                {id === 'today' && openAlertCount > 0 && (
                  <span className="mobile-tab-dot alert" aria-label={`${openAlertCount} open item${openAlertCount === 1 ? '' : 's'} today`} role="img" />
                )}
              </Link>
            );
          })}

          {/* Raised center Search button */}
          <div className="mobile-tab-item mobile-tab-center">
            <button className="mobile-tab-raised-btn" type="button" onClick={triggerSearch} aria-label="Search">
              <SearchIcon />
            </button>
            <div className="mobile-tab-raised-ring" />
          </div>

          {rightTabs.map(({ id, name, href, Icon }) => {
            const active = isActive(href);
            return (
              <Link key={id} href={href} role="tab" aria-selected={active}
                className={`mobile-tab-item${active ? ' active' : ''}`}>
                <span className={`mobile-tab-icon${active ? ' active' : ''}`}><Icon active={active} /></span>
                <span className={`mobile-tab-label${active ? ' active' : ''}`}>{name}</span>
              </Link>
            );
          })}

          {/* More tab — opens the sheet. Shows a dot when there's unread inbox
              or team-message activity tucked inside it. */}
          <button
            type="button"
            role="tab"
            aria-selected={sheetOpen}
            aria-expanded={sheetOpen}
            aria-label={moreHasActivity ? 'More, new activity' : 'More'}
            onClick={() => setSheetOpen(v => !v)}
            className={`mobile-tab-item${sheetOpen ? ' active' : ''}`}
          >
            <span className={`mobile-tab-icon relative${sheetOpen ? ' active' : ''}`}>
              <MoreTabIcon active={sheetOpen} />
              {moreHasActivity && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0f1117]"
                />
              )}
            </span>
            <span className={`mobile-tab-label${sheetOpen ? ' active' : ''}`}>More</span>
          </button>
        </div>
      </nav>

      {/* ════════ Bottom Sheet ════════ */}
      <div
        className={`md:hidden fixed inset-0 z-[10005] transition-opacity duration-300 ${
          sheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={() => setSheetOpen(false)}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        className={`md:hidden fixed left-0 right-0 bottom-0 z-[10010] mobile-sheet ${sheetOpen ? 'open' : ''}`}
        aria-label="More menu"
        aria-hidden={!sheetOpen}
        style={{
          transform: sheetOpen ? `translateY(${sheetY}px)` : 'translateY(110%)',
          transition: isDragging ? 'none' : 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="mobile-sheet-handle" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="mobile-sheet-handle-bar" />
        </div>

        <div className="mobile-sheet-scroll">
          {/* User card */}
          <div className="mobile-sheet-user">
            <div className="mobile-sheet-avatar">{initials}</div>
            <div className="mobile-sheet-user-info">
              <p className="mobile-sheet-user-name">{user?.name || 'User'}</p>
              <p className="mobile-sheet-user-email">{user?.email}</p>
            </div>
            {admin && <span className="mobile-sheet-badge">Admin</span>}
          </div>

          {/* Quick Add */}
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-section-title">Quick Add</p>
            <div className="mobile-sheet-group">
              {orderedQuickActions.map((action, i) => (
                <button
                  key={action.id}
                  onClick={() => runQuickAction(action.id)}
                  className={`mobile-sheet-row ${i < orderedQuickActions.length - 1 ? 'bordered' : ''}`}
                >
                  <span className="mobile-sheet-row-icon action">{action.icon}</span>
                  <span className="mobile-sheet-row-label">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Inbox + team messaging */}
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-section-title">Activity</p>
            <div className="mobile-sheet-group">
              <Link href="/inbox" className={`mobile-sheet-row ${admin ? 'bordered' : ''} ${isActive('/inbox') ? 'active' : ''}`}>
                <span className="mobile-sheet-row-icon"><BellIcon /></span>
                <span className="mobile-sheet-row-label flex items-center gap-2">
                  Inbox
                  {inboxUnreadCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                    </span>
                  )}
                </span>
                <ChevronRightIcon />
              </Link>
              {MESSAGES_ENABLED && admin && (
                <Link href="/messages" className={`mobile-sheet-row ${isActive('/messages') ? 'active' : ''}`}>
                  <span className="mobile-sheet-row-icon"><ChatBubbleIcon /></span>
                  <span className="mobile-sheet-row-label flex items-center gap-2">
                    Messages
                    {acpdUnreadCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {acpdUnreadCount > 99 ? '99+' : acpdUnreadCount}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon />
                </Link>
              )}
            </div>
          </div>

          {/* Tools */}
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-section-title">Tools</p>
            <div className="mobile-sheet-group">
              {toolsItems.map(({ href, label, Icon }, i) => (
                <Link key={href} href={href}
                  className={`mobile-sheet-row ${i < toolsItems.length - 1 ? 'bordered' : ''} ${isActive(href) ? 'active' : ''}`}>
                  <span className="mobile-sheet-row-icon"><Icon /></span>
                  <span className="mobile-sheet-row-label">{label}</span>
                  <ChevronRightIcon />
                </Link>
              ))}
            </div>
          </div>

          {/* Browse */}
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-section-title">Browse</p>
            <div className="mobile-sheet-group">
              {browseItems.map(({ href, label, Icon }, i) => (
                <Link key={href} href={href}
                  className={`mobile-sheet-row ${i < browseItems.length - 1 ? 'bordered' : ''} ${isActive(href) ? 'active' : ''}`}>
                  <span className="mobile-sheet-row-icon"><Icon /></span>
                  <span className="mobile-sheet-row-label">{label}</span>
                  <ChevronRightIcon />
                </Link>
              ))}
            </div>
          </div>

          {/* Admin */}
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

          {/* Account */}
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
                      <span className="inline-flex items-center rounded-full bg-vc-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-vc-300 ring-1 ring-vc-400/30">
                        New
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon />
                </Link>
              ))}
            </div>
          </div>

          {/* Feedback */}
          <div className="mobile-sheet-section">
            <p className="mobile-sheet-section-title">Feedback</p>
            <div className="mobile-sheet-group">
              {feedbackItems.map(({ href, label, Icon }, i) => (
                <Link key={href} href={href}
                  className={`mobile-sheet-row ${isActive(href) ? 'active' : ''} ${i < feedbackItems.length - 1 ? 'bordered' : ''}`}>
                  <span className="mobile-sheet-row-icon"><Icon /></span>
                  <span className="mobile-sheet-row-label">{label}</span>
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
                </button>
              </div>
            </div>
          )}

          {/* Sign out */}
          <div className="mobile-sheet-section mobile-sheet-section-last">
            <div className="mobile-sheet-group">
              <button onClick={() => { signOut(); setSheetOpen(false); }} className="mobile-sheet-row destructive">
                <span className="mobile-sheet-row-icon destructive"><LogoutIcon /></span>
                <span className="mobile-sheet-row-label">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
