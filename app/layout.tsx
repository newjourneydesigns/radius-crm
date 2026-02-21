import "../styles/globals.css";
import ClientLayout from "./ClientLayout";

export const metadata = {
  title: 'RADIUS Circle Leader Management',
  description: 'Circle Leader Management System for RADIUS',
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

  const swScript = [
    'if ("serviceWorker" in navigator) {',
    '  window.addEventListener("load", function() {',
    '    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {',
    '      navigator.serviceWorker.register("/sw.js")',
    '        .then(function(registration) {',
    '          console.log("SW registered: ", registration);',
    '          registration.addEventListener("updatefound", function() {',
    '            var newWorker = registration.installing;',
    '            if (newWorker) {',
    '              newWorker.addEventListener("statechange", function() {',
    '                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {',
    '                  console.log("New service worker installed, reloading...");',
    '                  window.location.reload();',
    '                }',
    '              });',
    '            }',
    '          });',
    '        })',
    '        .catch(function(err) { console.log("SW registration failed: ", err); });',
    '    } else {',
    '      console.log("Service worker disabled in development");',
    '    }',
    '  });',
    '}',
    'var deferredPrompt;',
    'window.addEventListener("beforeinstallprompt", function(e) {',
    '  console.log("PWA install prompt available");',
    '  e.preventDefault();',
    '  deferredPrompt = e;',
    '  window.dispatchEvent(new CustomEvent("pwaInstallAvailable"));',
    '});',
    'window.addEventListener("appinstalled", function() {',
    '  console.log("PWA installed successfully");',
    '  deferredPrompt = null;',
    '  window.dispatchEvent(new CustomEvent("pwaInstalled"));',
    '});',
    'window.installPWA = function() {',
    '  if (deferredPrompt) {',
    '    deferredPrompt.prompt();',
    '    deferredPrompt.userChoice.then(function(choiceResult) {',
    '      console.log(choiceResult.outcome === "accepted" ? "User accepted install" : "User dismissed install");',
    '      deferredPrompt = null;',
    '    });',
    '  }',
    '};',
  ].join('\n');

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="color-scheme" content="dark" />

        {/* FullCalendar */}
        <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.20/index.global.min.js" />

        {/* PWA Meta Tags */}
        <meta name="application-name" content="RADIUS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RADIUS CRM" />
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

        {/* Force dark theme immediately */}
        <script dangerouslySetInnerHTML={{ __html: darkThemeScript }} />

        {/* Service Worker + PWA Install */}
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </head>
      <body className="font-sans dark bg-slate-900 min-h-screen text-gray-100">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
