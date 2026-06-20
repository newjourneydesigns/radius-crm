'use client';

import { usePathname } from 'next/navigation';
import MobileNavigation from "../components/layout/MobileNavigation";
import AuthenticatedNavigation from "../components/layout/AuthenticatedNavigation";
import PublicNavigation from "../components/layout/PublicNavigation";
import Footer from "../components/layout/Footer";
import QuickActionsFAB from "../components/layout/QuickActionsFAB";
import { AuthProvider } from "../contexts/AuthContext";
import { QuickActionsProvider } from "../contexts/QuickActionsContext";
import NavigationProgress from "../components/layout/NavigationProgress";
import ProtectedRoute from "../components/ProtectedRoute";
import HapticsProvider from "../components/HapticsProvider";
import { isToolkitHostName } from "../lib/circle-leader-toolkit/paths";
import { isTeamsToolkitHostName } from "../lib/teams-toolkit/paths";

// Only these routes are accessible without being signed in.
// `/auth/*` is required for the Supabase magic-link callback to complete the login flow.
// Covers both toolkits' clean-host routes (numeric group/category id + a known
// section). `schedule` is the Teams Toolkit's; the rest are shared/circles.
function isCleanToolkitRoute(pathname: string) {
  return /^\/\d+\/(events|roster|inbox|schedule|resources|health|settings|help)(\/|$)/.test(pathname);
}

function isPublicRoute(pathname: string, isDedicatedToolkitHost = false) {
  if (isDedicatedToolkitHost) return true;

  // Strip a trailing slash so '/login/' matches '/login' (Netlify can add one).
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return (
    p === '/login' ||
    p === '/search' ||
    p.startsWith('/auth') ||
    p.startsWith('/circle-leader-toolkit') ||
    p.startsWith('/teams-toolkit') ||
    isCleanToolkitRoute(p) ||
    // Public intake forms — anyone can fill these out without signing in.
    p === '/f' ||
    p.startsWith('/f/')
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isDedicatedToolkitHost =
    typeof window !== 'undefined' &&
    (isToolkitHostName(window.location.hostname) || isTeamsToolkitHostName(window.location.hostname));
  const isPublic = isPublicRoute(pathname, isDedicatedToolkitHost);
  const hideChrome =
    isDedicatedToolkitHost ||
    pathname === '/login' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/circle-leader-toolkit') ||
    pathname.startsWith('/teams-toolkit') ||
    isCleanToolkitRoute(pathname) ||
    pathname === '/f' ||
    pathname.startsWith('/f/');
  const isBoardDetailPage = /^\/boards\/[^/]+/.test(pathname);
  const isNotebookPage = pathname.startsWith('/notebook');

  // Immersive, full-screen routes: messaging and the inbox take over the whole
  // viewport (no app nav, footer, or FAB) and provide their own back button.
  const isImmersive = (() => {
    const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    return p === '/messages' || p === '/inbox';
  })();

  const content = isPublic ? children : <ProtectedRoute>{children}</ProtectedRoute>;

  return (
    <>
      {/* App-wide haptic feedback (PWA) */}
      <HapticsProvider />

      {/* Route transition progress bar */}
      <NavigationProgress />

      {!hideChrome && !isImmersive && (
        <>
          {/* Mobile Navigation */}
          <MobileNavigation />

          {/* Desktop Navigation */}
          <AuthenticatedNavigation />

          {/* Public Navigation (shown when not authenticated) */}
          <PublicNavigation />
        </>
      )}

      {/* Main Content — bottom padding clears the fixed bottom nav + safe area on
          mobile, except on immersive routes that fill the whole viewport. */}
      <main className={isImmersive ? '' : 'mobile-nav-padding'}>{content}</main>

      {!hideChrome && !isNotebookPage && !isImmersive && (
        <>
          {/* Footer — extra bottom padding on board detail pages to clear the fixed shortcut bar */}
          <div className={isBoardDetailPage ? 'pb-10' : ''}>
            <Footer />
          </div>

          {/* Quick Actions FAB */}
          <QuickActionsFAB />
        </>
      )}
    </>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QuickActionsProvider>
        <LayoutInner>{children}</LayoutInner>
      </QuickActionsProvider>
    </AuthProvider>
  );
}
