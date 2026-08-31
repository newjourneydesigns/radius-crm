import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import { getSessionStudentLeader } from '../../lib/student-toolkit/session';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../lib/leader-tokens';
// Reuse the Circle Leader Toolkit's structural styles + the same Valley Creek
// green; student-toolkit.css only adds Student-specific component styles. Order
// matters — student styles must come last.
import '../circle-leader-toolkit/circle-leader-toolkit.css';
import './student-toolkit.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

const TOOLKIT_PUBLIC_URL = 'https://studentstoolkit.netlify.app';

// Override the dark root theme-color with Valley Creek green for the whole
// segment so the OS/browser chrome matches the hero instead of flashing dark.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#34B233',
  colorScheme: 'light',
};

export async function generateMetadata(): Promise<Metadata> {
  // When the visitor is already signed in, hand the manifest a signed,
  // leader-scoped token via `?s=` so the installed home-screen icon signs
  // itself in on first launch (iOS isolates a PWA's cookies from Safari).
  const leader = await getSessionStudentLeader();
  const manifestHref =
    leader?.id != null
      ? `/manifest-student-toolkit.json?s=${createSessionToken(leader.id, RADIUS_LINK_TTL_MS)}`
      : '/manifest-student-toolkit.json';

  return {
    metadataBase: new URL(TOOLKIT_PUBLIC_URL),
    title: 'Student Toolkit',
    description: 'Student leader resources for Valley Creek Students.',
    // Private leader portal — keep it out of search results.
    robots: { index: false, follow: false },
    manifest: manifestHref,
    appleWebApp: {
      capable: true,
      title: 'Student Toolkit',
      statusBarStyle: 'default',
    },
  };
}

export default function StudentToolkitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${openSans.variable} cs-root st-root min-h-screen bg-white`}>
      {children}
    </div>
  );
}
