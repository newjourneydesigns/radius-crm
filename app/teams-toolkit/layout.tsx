import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import { getSessionLeader } from '../../lib/teams-toolkit/session';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../lib/leader-tokens';
// Reuse the Circle Leader Toolkit's structural styles, then re-skin to the
// Teams indigo. Order matters — teams overrides must come last.
import '../circle-leader-toolkit/circle-leader-toolkit.css';
import './teams-toolkit.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

const TOOLKIT_PUBLIC_URL = 'https://teamstoolkit.netlify.app';

// Override the dark root theme-color with Teams indigo for the whole segment so
// the OS/browser chrome matches the hero instead of flashing dark navy.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3955A8',
  colorScheme: 'light',
};

export async function generateMetadata(): Promise<Metadata> {
  // When the visitor is already signed in, hand the manifest a signed,
  // leader-scoped token via `?s=` so the installed home-screen icon signs
  // itself in on first launch (iOS isolates a PWA's cookies from Safari).
  const leader = await getSessionLeader();
  const manifestHref =
    leader?.id != null
      ? `/manifest-teams-toolkit.json?s=${createSessionToken(leader.id, RADIUS_LINK_TTL_MS)}`
      : '/manifest-teams-toolkit.json';

  return {
    metadataBase: new URL(TOOLKIT_PUBLIC_URL),
    title: 'Teams Toolkit',
    description: 'Team leader resources for Valley Creek Teams.',
    // Private leader portal — keep it out of search results.
    robots: { index: false, follow: false },
    manifest: manifestHref,
    appleWebApp: {
      capable: true,
      title: 'Teams Toolkit',
      statusBarStyle: 'default',
    },
  };
}

export default function TeamsToolkitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${openSans.variable} cs-root ts-root min-h-screen bg-white`}>
      {children}
    </div>
  );
}
