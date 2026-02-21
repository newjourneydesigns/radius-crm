'use client';

import { usePathname } from 'next/navigation';
import MobileNavigation from "../components/layout/MobileNavigation";
import AuthenticatedNavigation from "../components/layout/AuthenticatedNavigation";
import PublicNavigation from "../components/layout/PublicNavigation";
import Footer from "../components/layout/Footer";
import ScrollToTop from "../components/ui/ScrollToTop";
import { AuthProvider } from "../contexts/AuthContext";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname === '/login' || pathname.startsWith('/auth');

  return (
    <AuthProvider>
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

      {/* Main Content — extra bottom padding on mobile prevents the fixed bottom nav from overlapping content */}
      <main className="pb-20 md:pb-0">{children}</main>

      {!hideChrome && (
        <>
          {/* Footer */}
          <Footer />

          {/* Scroll to Top Button */}
          <ScrollToTop />
        </>
      )}
    </AuthProvider>
  );
}
