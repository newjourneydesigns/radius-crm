import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../lib/teams-toolkit/session';
import SignInForm from './SignInForm';

// Server-side auth check: a signed-in team leader skips straight to their
// roster before any HTML hits the browser.
export default async function TeamsToolkitSignInPage() {
  const leader = await getSessionLeader();
  if (leader?.ccb_category_id != null) {
    redirect(`/teams-toolkit/${leader.ccb_category_id}/roster/`);
  }

  return (
    <>
      <header className="cs-hero py-14 sm:py-20 px-6 text-center">
        <img
          src="/VCC Icon (White).png"
          alt="Valley Creek"
          className="mx-auto h-20 sm:h-28 w-auto mb-6"
        />
        <h1 className="cs-display text-5xl sm:text-7xl">Teams Toolkit</h1>
        <p className="mt-3 text-white/85 text-sm sm:text-base font-medium tracking-wide">
          For Team Leaders
        </p>
      </header>

      <main className="px-4 py-10 max-w-md mx-auto">
        <SignInForm />
      </main>
    </>
  );
}
