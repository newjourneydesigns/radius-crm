'use client';

import { usePathname } from 'next/navigation';
import MobileNavigation from "../components/layout/MobileNavigation";
import AuthenticatedNavigation from "../components/layout/AuthenticatedNavigation";
import PublicNavigation from "../components/layout/PublicNavigation";
import Footer from "../components/layout/Footer";
import ScrollToTop from "../components/ui/ScrollToTop";
import RadiusAssistant from "../components/ai-assistant/RadiusAssistant";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import NavigationProgress from "../components/layout/NavigationProgress";

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const hideChrome = pathname === '/login' || pathname.startsWith('/auth');
  const isBoardDetailPage = /^\/boards\/[^/]+/.test(pathname);

  return (
    <>
      {/* Route transition progress bar */}
      <NavigationProgress />

      {!hideChrome && (
        <>
          {/* Mobile Navigation */}
          <MobileNavigation />

          {/* Desktop Navigation */}
          <AuthenticatedNavigation />

          {/* Public Navigation (shown when not authenticated) */}
          <PublicNavigation />
        </>
      )}

      {/* Main Content — bottom padding clears the fixed bottom nav + safe area on mobile */}
      <main className="mobile-nav-padding">{children}</main>

      {!hideChrome && (
        <>
          {/* Footer — extra bottom padding on board detail pages to clear the fixed shortcut bar */}
          <div className={isBoardDetailPage ? 'pb-10' : ''}>
            <Footer />
          </div>

          {/* Scroll to Top Button */}
          <ScrollToTop />

          {/* Radius AI Assistant — only if enabled for this user */}
          {user?.ai_assistant_enabled && <RadiusAssistant />}
        </>
      )}
    </>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LayoutInner>{children}</LayoutInner>
    </AuthProvider>
  );
}
