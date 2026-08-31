import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../lib/student-toolkit/session';
import {
  isStudentToolkitHostName,
  studentToolkitLeaderPath,
} from '../../lib/student-toolkit/paths';
import SignInForm from './SignInForm';

export const dynamic = 'force-dynamic';

// Why a magic link dropped someone back here, in words they can act on.
const REASONS: Record<string, string> = {
  link_expired: 'That link has expired. Enter your email and we’ll send you a code.',
  not_available:
    'Your Student Toolkit access is turned off. Ask your student pastor to turn it back on.',
};

export default async function StudentToolkitSignInPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // On the dedicated student host the middleware serves the toolkit at the
  // root, so leader paths drop the /student-toolkit prefix — sending the full
  // path there would cost a 308 on the way in.
  const hostname = (headers().get('host') || '').split(':')[0];
  const cleanHost = isStudentToolkitHostName(hostname);

  // Server-side auth check: a signed-in student leader skips straight to their
  // home page before any HTML hits the browser.
  const leader = await getSessionStudentLeader();
  if (leader?.id != null) {
    redirect(studentToolkitLeaderPath(leader.id, 'home/', { cleanHost }));
  }

  const notice = searchParams?.reason ? REASONS[searchParams.reason] ?? null : null;

  return (
    <>
      <header className="cs-hero py-14 sm:py-20 px-6 text-center">
        <img
          src="/VCC Icon (White).png"
          alt="Valley Creek"
          className="mx-auto h-20 sm:h-28 w-auto mb-6"
        />
        <h1 className="cs-display text-5xl sm:text-7xl">Student Toolkit</h1>
        <p className="mt-3 text-white/85 text-sm sm:text-base font-medium tracking-wide">
          For Student Leaders
        </p>
      </header>

      <main className="px-4 py-10 max-w-md mx-auto">
        <SignInForm cleanHost={cleanHost} notice={notice} />
      </main>
    </>
  );
}
