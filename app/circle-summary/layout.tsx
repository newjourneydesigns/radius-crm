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
  title: 'Circle Summary — Valley Creek',
  // Override the root manifest so iOS "Add to Home Screen" launches the
  // Circle Summary sign-in router instead of the main RADIUS admin app.
  manifest: '/manifest-circle-summary.json',
  appleWebApp: {
    capable: true,
    title: 'Circle Summary',
    statusBarStyle: 'default',
  },
  icons: {
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
