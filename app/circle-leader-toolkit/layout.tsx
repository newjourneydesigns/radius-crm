import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import { getSessionLeader } from '../../lib/circle-leader-toolkit/session';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../lib/leader-tokens';
import ToolkitSplashGate from '../../components/circle-leader-toolkit/ToolkitSplashGate';
import './circle-leader-toolkit.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

const TOOLKIT_PUBLIC_URL = 'https://circlestoolkit.netlify.app';
const TOOLKIT_OG_IMAGE_URL = `${TOOLKIT_PUBLIC_URL}/circles-toolkit-og.png?v=1`;

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

export async function generateMetadata(): Promise<Metadata> {
  // Override the root manifest so iOS "Add to Home Screen" launches the
  // Circles Toolkit — not the main RADIUS admin app and its login.
  //
  // When the visitor is already signed in, hand the manifest a signed,
  // leader-scoped token via `?s=`. The dynamic manifest bakes it into
  // `start_url` so the installed home-screen icon signs itself in on first
  // launch — iOS isolates a PWA's cookies from Safari, so the magic-link
  // session otherwise wouldn't carry into the installed app. The token is
  // long-lived to match RADIUS-issued leader links; access is still revoked
  // centrally when a leader is archived or toolkit access is turned off.
  const leader = await getSessionLeader();
  const manifestHref =
    leader?.id != null
      ? `/manifest-circle-leader-toolkit.json?s=${createSessionToken(leader.id, RADIUS_LINK_TTL_MS)}`
      : '/manifest-circle-leader-toolkit.json';

  return {
    metadataBase: new URL(TOOLKIT_PUBLIC_URL),
    title: 'Circles Toolkit',
    description: 'Circle leader resources for Valley Creek Circles.',
    // Private leader portal — keep it out of search results.
    robots: { index: false, follow: false },
    manifest: manifestHref,
    openGraph: {
      type: 'website',
      url: `${TOOLKIT_PUBLIC_URL}/`,
      siteName: 'Circles Toolkit',
      title: 'Circles Toolkit',
      description: 'Circle leader resources for Valley Creek Circles.',
      images: [
        {
          url: TOOLKIT_OG_IMAGE_URL,
          width: 1200,
          height: 630,
          alt: 'Circles Toolkit',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Circles Toolkit',
      description: 'Circle leader resources for Valley Creek Circles.',
      images: [TOOLKIT_OG_IMAGE_URL],
    },
    appleWebApp: {
      capable: true,
      title: 'Circles Toolkit',
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
}

export default function CircleSummaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${openSans.variable} cs-root min-h-screen bg-white`}>
      {/* iOS PWA launch ("splash") screens for the installed Toolkit app. Without
          these, iOS shows a blank WHITE screen on cold start (it ignores the
          manifest background_color in apple-mobile-web-app-capable mode) before
          the green CircleSplash appears. Each image is the white Circles mark on
          brand green so the native launch screen is seamless with CircleSplash.
          Next hoists these <link>s into <head>. Regenerate with:
          node scripts/generate-toolkit-splash.js */}
      <link rel="apple-touch-startup-image" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1320x2868.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1206x2622.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1290x2796.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1179x2556.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1284x2778.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1170x2532.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1125x2436.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1242x2688.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-828x1792.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-1242x2208.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-750x1334.png" />
      <link rel="apple-touch-startup-image" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash-toolkit/toolkit-splash-640x1136.png" />
      {children}
      {/* Holds the animated green splash for a purposeful beat on a fresh launch
          so it reads as an intentional welcome, not a single-frame flash. */}
      <ToolkitSplashGate />
    </div>
  );
}
