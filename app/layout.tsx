'use client';

import "../styles/globals.css";
import { usePathname } from 'next/navigation';
import MobileNavigation from "../components/layout/MobileNavigation";
import AuthenticatedNavigation from "../components/layout/AuthenticatedNavigation";
import PublicNavigation from "../components/layout/PublicNavigation";
import Footer from "../components/layout/Footer";
import ScrollToTop from "../components/ui/ScrollToTop";
import { AuthProvider } from "../contexts/AuthContext";

export default function RootLayout({ 
  children 
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideChrome = pathname === '/login' || pathname.startsWith('/auth');

  return (
    <html lang="en" className="dark">
      <head>
        <title>RADIUS Circle Leader Management</title>
        <meta name="description" content="Circle Leader Management System for RADIUS" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="color-scheme" content="dark" />

        {/* FullCalendar base styles (v6 packages bundle CSS in the global build) */}
        <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.20/index.global.min.js" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="RADIUS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RADIUS" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#091b34" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#091b34" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

        {/* Favicon Links */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-16x16.png" />
        <link rel="shortcut icon" href="/icon-32x32.png" />

        {/* Apple PWA Configuration - No Splash */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RADIUS CRM" />
        
        {/* Dark Green Theme Force Script */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              // Force dark theme immediately
              const html = document.documentElement;
              html.classList.add('dark');
              
              // Force theme preference
              localStorage.setItem('theme', 'dark');
              localStorage.setItem('color-scheme', 'dark');
            })();
          `
        }} />
        
        {/* Service Worker Registration */}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                // Only register service worker in production
                if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                      
                      // Check for updates
                      registration.addEventListener('updatefound', function() {
                        const newWorker = registration.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              console.log('New service worker installed, reloading...');
                              window.location.reload();
                            }
                          });
                        }
                      });
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                } else {
                  console.log('Service worker disabled in development');
                }
              });
            }

            // PWA Install Prompt
            let deferredPrompt;
            let installButton = null;

            window.addEventListener('beforeinstallprompt', (e) => {
              console.log('PWA install prompt available');
              e.preventDefault();
              deferredPrompt = e;
              
              // Show install button in navigation
              window.dispatchEvent(new CustomEvent('pwaInstallAvailable'));
            });

            window.addEventListener('appinstalled', (evt) => {
              console.log('PWA installed successfully');
              deferredPrompt = null;
              window.dispatchEvent(new CustomEvent('pwaInstalled'));
            });

            // Function to trigger install
            window.installPWA = function() {
              if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                  if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                  } else {
                    console.log('User dismissed the install prompt');
                  }
                  deferredPrompt = null;
                });
              }
            };
          `
        }} />
      </head>
      <body className="font-sans dark bg-slate-900 min-h-screen text-gray-100">
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
          
          {/* Main Content */}
          <main>{children}</main>
          
          {!hideChrome && (
            <>
              {/* Footer */}
              <Footer />

              {/* Scroll to Top Button */}
              <ScrollToTop />
            </>
          )}
        </AuthProvider>
      </body>
    </html>
  );
}
