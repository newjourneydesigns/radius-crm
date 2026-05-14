'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SignInForm from './SignInForm';

export default function CircleSummarySignInPage() {
  const router = useRouter();
  // Hide the sign-in form until we know whether the leader is already logged
  // in — otherwise it flashes for a moment before the redirect kicks in.
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-summary/me');
        const data = await res.json();
        if (cancelled) return;
        const groupId = data?.leader?.ccb_group_id;
        if (groupId != null) {
          router.replace(`/circle-summary/${groupId}/events`);
          return;
        }
      } catch {}
      if (!cancelled) setCheckedAuth(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <header className="cs-hero py-14 sm:py-20 px-6 text-center">
        <div className="cs-vc-mark mx-auto">VC</div>
        <h1 className="cs-display text-5xl sm:text-7xl">Circle Summary</h1>
        <p className="mt-3 text-white/85 text-sm sm:text-base font-medium tracking-wide">
          For Circle Leaders at Valley Creek
        </p>
      </header>

      <main className="px-4 py-10 max-w-md mx-auto">
        {checkedAuth && <SignInForm />}
      </main>
    </>
  );
}
