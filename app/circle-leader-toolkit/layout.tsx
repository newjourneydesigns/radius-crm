import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import './circle-leader-toolkit.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

// Override the dark root theme-color with brand green for the whole segment so
// the OS/browser chrome (status bar, PWA title bar) matches the splash + hero
// instead of flashing dark navy on entry. Merges with the root viewport export,
// so width/scale are inherited.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#34B233',
  // Light canvas for the whole segment so the browser doesn't paint a near-black
  // document background (the root app is color-scheme: dark) during the load
  // seams before our CSS applies.
  colorScheme: 'light',
};

export const metadata: Metadata = {
  title: 'Circle Leader Toolkit',
  // Override the root manifest so iOS "Add to Home Screen" launches the
  // Circle Leader Toolkit sign-in router instead of the main RADIUS admin app.
  manifest: '/manifest-circle-leader-toolkit.json',
  appleWebApp: {
    capable: true,
    title: 'Toolkit',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/circle-summary-icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/circle-summary-icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/circle-summary-icon-192.png?v=2',
    apple: '/circle-summary-apple-touch-icon.png?v=2',
  },
};

export default function CircleSummaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${openSans.variable} cs-root min-h-screen bg-white`}>
      {children}
    </div>
  );
}
