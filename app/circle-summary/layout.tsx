import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import './circle-summary.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Circle Leader Dashboard',
  // Override the root manifest so iOS "Add to Home Screen" launches the
  // Circle Leader Dashboard sign-in router instead of the main RADIUS admin app.
  manifest: '/manifest-circle-summary.json',
  appleWebApp: {
    capable: true,
    title: 'Dashboard',
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
