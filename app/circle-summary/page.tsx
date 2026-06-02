import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../lib/circle-summary/session';
import SignInForm from './SignInForm';

// Server-side auth check: if the leader already has a valid session cookie,
// redirect straight to their events page before any HTML hits the browser.
// This kills the previous client-side /api/circle-summary/me round trip and
// the accompanying flash of the sign-in form.
export default async function CircleSummarySignInPage() {
  const leader = await getSessionLeader();
  if (leader?.ccb_group_id != null) {
    // Trailing slash matches `trailingSlash: true` in next.config so the browser
    // lands on the final URL in one hop instead of taking an extra 308 — fewer
    // blank cross-document frames before the events page paints.
    redirect(`/circle-summary/${leader.ccb_group_id}/events/`);
  }

  return (
    <>
      <header className="cs-hero py-14 sm:py-20 px-6 text-center">
        <img
          src="/Circles Logo V2-White.png"
          alt="Circles"
          className="mx-auto h-24 sm:h-32 w-auto mb-6"
        />
        <h1 className="cs-display text-5xl sm:text-7xl">Circle Summary</h1>
        <p className="mt-3 text-white/85 text-sm sm:text-base font-medium tracking-wide">
          For Circle Leaders at Valley Creek
        </p>
      </header>

      <main className="px-4 py-10 max-w-md mx-auto">
        <SignInForm />
      </main>
    </>
  );
}
