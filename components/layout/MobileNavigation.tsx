'use client';

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
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

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ─────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────── */
export default function MobileNavigation() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
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
  const leftTabs: { name: string; href?: string; Icon: React.FC<{ active?: boolean }>; action?: () => void; id: string }[] = [
    { id: 'home', name: 'Home', href: '/dashboard', Icon: HomeIcon },
    { id: 'prayer', name: 'Prayer', href: '/prayer', Icon: PrayerIcon },
  ];
  const rightTabs: { name: string; href?: string; Icon: React.FC<{ active?: boolean }>; action?: () => void; id: string }[] = [
    { id: 'calendar', name: 'Calendar', href: '/calendar', Icon: CalendarIcon },
    { id: 'more', name: 'More', Icon: EllipsisIcon, action: () => setSheetOpen(v => !v) },
  ];

  /* Drawer menu sections */
  const adminItems = [
    { href: '/ccb-explorer', label: 'CCB Explorer', Icon: CompassIcon },
    { href: '/bulk-message', label: 'Bulk Message', Icon: MessageBulkIcon },
    { href: '/add-leader', label: 'Add Leader', Icon: UserPlusIcon },
    { href: '/users', label: 'Manage Users', Icon: UsersIcon },
    { href: '/import-circles', label: 'Import Circles', Icon: CloudImportIcon },
  ];

  const accountItems = [
    { href: '/profile', label: 'Profile', Icon: UserIcon },
    { href: '/settings', label: 'Settings', Icon: CogIcon },
    { href: '/help', label: 'Help & Support', Icon: QuestionIcon },
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
          {leftTabs.map(({ id, name, href, Icon, action }) => {
            const active = href ? isActive(href) : false;
            const content = (
              <>
                <span className={`mobile-tab-icon ${active ? 'active' : ''}`}>
                  <Icon active={active} />
                </span>
                <span className={`mobile-tab-label ${active ? 'active' : ''}`}>
                  {name}
                </span>
              </>
            );
            if (href) {
              return (
                <Link key={id} href={href} role="tab" aria-selected={active}
                  className={`mobile-tab-item ${active ? 'active' : ''}`}>
                  {content}
                </Link>
              );
            }
            return (
              <div key={id} role="tab" aria-selected={active} onClick={action} tabIndex={0}
                className={`mobile-tab-item ${active ? 'active' : ''}`}>
                {content}
              </div>
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
          {rightTabs.map(({ id, name, href, Icon, action }) => {
            const active = href ? isActive(href) : (id === 'more' && sheetOpen);
            const content = (
              <>
                <span className={`mobile-tab-icon ${active ? 'active' : ''}`}>
                  <Icon active={active} />
                </span>
                <span className={`mobile-tab-label ${active ? 'active' : ''}`}>
                  {name}
                </span>
              </>
            );
            if (href) {
              return (
                <Link key={id} href={href} role="tab" aria-selected={active}
                  className={`mobile-tab-item ${active ? 'active' : ''}`}>
                  {content}
                </Link>
              );
            }
            return (
              <div key={id} role="tab" aria-selected={active} onClick={action} tabIndex={0}
                className={`mobile-tab-item ${active ? 'active' : ''}`}>
                {content}
              </div>
            );
          })}
        </div>
      </nav>

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
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
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

        {/* Progress link */}
        <div className="mobile-sheet-section">
          <div className="mobile-sheet-group">
            <Link href="/progress"
              className={`mobile-sheet-row ${isActive('/progress') ? 'active' : ''}`}>
              <span className="mobile-sheet-row-icon"><ChartIcon /></span>
              <span className="mobile-sheet-row-label">Progress</span>
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
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}

        {/* Sign out */}
        <div className="mobile-sheet-section" style={{ paddingBottom: '12px' }}>
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
