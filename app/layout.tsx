import type { Viewport } from "next";
import "../styles/globals.css";
import ClientLayout from "./ClientLayout";

// Viewport (incl. theme-color) lives here as a Next export rather than a
// hardcoded <meta> so nested segments can override individual fields. The
// /circle-leader-toolkit segment swaps theme-color to brand green; everything else
// inherits the dark shell color below.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f1117",
  colorScheme: "dark",
};

export const metadata = {
  title: 'Radius',
  description: 'Radius',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/icon-32x32.png',
    apple: [
      { url: '/apple-touch-icon.png' },
      { url: '/apple-touch-icon-152x152.png', sizes: '152x152' },
      { url: '/apple-touch-icon-120x120.png', sizes: '120x120' },
    ],
  },
};

export default function RootLayout({ 
  children 
}: {
  children: React.ReactNode;
}) {
  const darkThemeScript = [
    '(function() {',
    '  var html = document.documentElement;',
    '  html.classList.add("dark");',
    '  localStorage.setItem("theme", "dark");',
    '  localStorage.setItem("color-scheme", "dark");',
    '})();',
  ].join('\n');

  const swScript = (process.env.NODE_ENV === 'production' ? [
    'if ("serviceWorker" in navigator) {',
    '  window.addEventListener("load", function() {',
    '    navigator.serviceWorker.register("/sw.js", { scope: "/" })',
    '      .then(function(registration) {',
    '        console.log("SW registered with scope:", registration.scope);',
    '        registration.addEventListener("updatefound", function() {',
    '          var newWorker = registration.installing;',
    '          if (newWorker) {',
    '            newWorker.addEventListener("statechange", function() {',
    '              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {',
    '                console.log("New service worker installed; prompting for refresh");',
    '                window.__radiusUpdateAvailable = true;',
    '                window.dispatchEvent(new CustomEvent("radiusUpdateAvailable"));',
    '              }',
    '            });',
    '          }',
    '        });',
    '      })',
    '      .catch(function(err) { console.error("SW registration failed: ", err); });',
    '  });',
    '}',
  ] : [
    'if ("serviceWorker" in navigator) {',
    '  window.addEventListener("load", function() {',
    '    if (window.location.pathname.indexOf("/circle-leader-toolkit") === 0) return;',
    '    navigator.serviceWorker.getRegistrations().then(function(registrations) {',
    '      registrations.forEach(function(registration) { registration.unregister(); });',
    '    });',
    '    if ("caches" in window) {',
    '      caches.keys().then(function(names) {',
    '        names.forEach(function(name) { caches.delete(name); });',
    '      });',
    '    }',
    '  });',
    '}',
  ]).concat([
    'var deferredPrompt;',
    'window.addEventListener("beforeinstallprompt", function(e) {',
    '  console.log("PWA install prompt available");',
    '  e.preventDefault();',
    '  deferredPrompt = e;',
    '  window.deferredPrompt = e;',
    '  window.__radiusPwaInstallAvailable = true;',
    '  window.dispatchEvent(new CustomEvent("pwaInstallAvailable"));',
    '});',
    'window.addEventListener("appinstalled", function() {',
    '  console.log("PWA installed successfully");',
    '  deferredPrompt = null;',
    '  window.deferredPrompt = null;',
    '  window.__radiusPwaInstallAvailable = false;',
    '  window.dispatchEvent(new CustomEvent("pwaInstalled"));',
    '});',
    'window.installPWA = function() {',
    '  if (deferredPrompt) {',
    '    deferredPrompt.prompt();',
    '    deferredPrompt.userChoice.then(function(choiceResult) {',
    '      console.log(choiceResult.outcome === "accepted" ? "User accepted install" : "User dismissed install");',
    '      deferredPrompt = null;',
    '      window.deferredPrompt = null;',
    '      window.__radiusPwaInstallAvailable = false;',
    '    });',
    '  }',
    '};',
  ]).join('\n');

  return (
    <html lang="en" className="dark">
      <head>
        {/* FullCalendar */}
        <script defer src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.20/index.global.min.js" />

        {/* PWA Meta Tags */}
        <meta name="application-name" content="Radius" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Radius" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#0f1117" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Force dark theme immediately */}
        <script dangerouslySetInnerHTML={{ __html: darkThemeScript }} />

        {/* Service Worker + PWA Install */}
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body className="font-sans dark bg-[#0f1117] min-h-screen text-gray-100">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
