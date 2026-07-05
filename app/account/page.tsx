"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AccountPage() {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    const sb = getSupabase();
    if (!sb || !email.trim()) return;
    setError(null);
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    if (err) setError(err.message);
    else setSent(true);
  };

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
    setSent(false);
  };

  if (!configured) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-8">
        <h1 className="font-display text-3xl font-bold">Account</h1>
        <p className="text-ink-dim">
          Accounts power <strong className="text-ink">shared tables</strong> —
          everyone scores the same game from their own phone, live.
        </p>
        <div className="rounded-xl border felt-line bg-felt-2 p-4 text-sm text-ink-dim">
          <p className="font-bold text-ink">Not switched on yet</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>Create a free Supabase project</li>
            <li>
              Run <code className="text-gold">supabase/schema.sql</code> in its
              SQL editor
            </li>
            <li>
              Set <code className="text-gold">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and <code className="text-gold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              in <code className="text-gold">.env.local</code>
            </li>
          </ol>
          <p className="mt-2">
            Everything else works without it — games stay on this device.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="py-12 text-center text-ink-dim">Checking the guest list…</p>;
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="font-display text-3xl font-bold">Account</h1>
      {userEmail ? (
        <>
          <p className="text-ink-dim">
            Signed in as <strong className="text-ink">{userEmail}</strong>. You
            can share any live game and join tables friends send you.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full border felt-line px-5 py-2.5 font-display font-bold text-ink-dim active:bg-felt-2 hover:text-ink"
          >
            Sign out
          </button>
        </>
      ) : sent ? (
        <p className="rounded-xl border border-gold/50 bg-felt-2 p-4 text-ink">
          Check your email — tap the magic link and you&rsquo;re in. No
          password to remember.
        </p>
      ) : (
        <>
          <p className="text-ink-dim">
            Sign in with a magic link to share live games across phones. No
            passwords.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              className="min-w-0 flex-1 rounded-full bg-felt-2 px-4 py-2.5 text-[16px] text-ink ring-1 ring-inset ring-ink/10 placeholder:text-ink-dim/70 focus:outline-none focus:ring-gold/60"
            />
            <button
              type="button"
              onClick={signIn}
              disabled={!email.includes("@")}
              className="shrink-0 rounded-full bg-gold px-5 py-2.5 font-display text-sm font-bold text-felt disabled:opacity-40"
            >
              Send link
            </button>
          </div>
          {error && <p className="text-sm text-ember">{error}</p>}
        </>
      )}
    </div>
  );
}
