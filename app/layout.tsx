'use client';

import "../styles/globals.css";
import MobileNavigation from "../components/layout/MobileNavigation";
import AuthenticatedNavigation from "../components/layout/AuthenticatedNavigation";
import Footer from "../components/layout/Footer";
import { AuthProvider } from "../contexts/AuthContext";

export default function RootLayout({ 
  children 
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>RADIUS Circle Leader Management</title>
        <meta name="description" content="Circle Leader Management System for RADIUS" />
        <link rel="manifest" href="/manifest.json" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="RADIUS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="RADIUS" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

        {/* Favicon Links */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-16x16.png" />
        <link rel="shortcut icon" href="/icon-32x32.png" />

        {/* Apple Splash Screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        {/* Service Worker Registration */}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(registration) {
                    console.log('SW registered: ', registration);
                    
                    // Force immediate update check
                    registration.update();
                    
                    // Check for updates every 30 seconds
                    setInterval(() => {
                      registration.update();
                    }, 30000);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                      const newWorker = registration.installing;
                      if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New service worker available, reload immediately
                            console.log('New service worker installed, reloading...');
                            window.location.reload();
                          }
                        });
                      }
                    });
                    
                    // Handle controller changes
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                      console.log('Service worker controller changed, reloading...');
                      window.location.reload();
                    });
                    
                    // Listen for force reload messages from service worker
                    navigator.serviceWorker.addEventListener('message', (event) => {
                      if (event.data && event.data.type === 'FORCE_RELOAD') {
                        console.log('Force reload requested by service worker');
                        window.location.reload(true); // Force reload from server
                      }
                    });
                  })
                  .catch(function(registrationError) {
                    console.log('SW registration failed: ', registrationError);
                  });
              });
              
              // Handle service worker errors
              navigator.serviceWorker.addEventListener('error', (error) => {
                console.error('Service worker error:', error);
              });
              
              // Force reload if we detect stale cache
              window.addEventListener('beforeunload', () => {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage({type: 'SKIP_WAITING'});
                }
              });
            }
          `
        }} />
      </head>
      <body className="font-sans bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
        <AuthProvider>
          {/* Mobile Navigation */}
          <MobileNavigation />
          
          {/* Desktop Navigation */}
          <AuthenticatedNavigation />
          
          {/* Main Content */}
          <main>{children}</main>
          
          {/* Footer */}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
