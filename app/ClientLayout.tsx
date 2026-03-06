'use client';

import { usePathname } from 'next/navigation';
import MobileNavigation from "../components/layout/MobileNavigation";
import AuthenticatedNavigation from "../components/layout/AuthenticatedNavigation";
import PublicNavigation from "../components/layout/PublicNavigation";
import Footer from "../components/layout/Footer";
import ScrollToTop from "../components/ui/ScrollToTop";
import RadiusAssistant from "../components/ai-assistant/RadiusAssistant";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isDemo } = useAuth();
  const hideChrome = pathname === '/login' || pathname.startsWith('/auth');

  return (
    <>
      {!hideChrome && (
        <>
          {/* Demo mode banner — visible on all screen sizes */}
          {isDemo && (
            <div className="bg-amber-500 text-amber-950 text-center text-xs font-semibold py-1.5 px-4 sticky top-0 z-[10002]">
              🎭 Demo Mode — no live data. Set{' '}
              <code className="font-mono bg-amber-400/50 px-1 rounded">NEXT_PUBLIC_DEMO_MODE=false</code>{' '}
              in <code className="font-mono bg-amber-400/50 px-1 rounded">.env.local</code> to connect to Supabase.
            </div>
          )}

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
          {/* Footer */}
          <Footer />

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
