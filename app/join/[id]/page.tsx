"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { newId } from "@/lib/engine";
import { createGame, listGames, saveGame } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { currentUserId, joinSharedGame } from "@/lib/sync";

type Status = "checking" | "needs-signin" | "not-configured" | "error";

export default function JoinPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!isSupabaseConfigured()) {
        setStatus("not-configured");
        return;
      }
      if (!(await currentUserId())) {
        setStatus("needs-signin");
        return;
      }
      try {
        // Already mirrored on this device? Go straight to the table.
        const existing = listGames().find((g) => g.sharedId === params.id);
        if (existing) {
          router.replace(`/game/${existing.id}`);
          return;
        }
        const events = await joinSharedGame(params.id);
        const game = createGame(newId(), events, [
          {
            role: "assistant",
            text: "You're at the table! Anything you score shows up on everyone's phone.",
            ts: Date.now(),
          },
        ]);
        game.sharedId = params.id;
        saveGame(game);
        router.replace(`/game/${game.id}`);
      } catch {
        setStatus("error");
      }
    })();
  }, [params.id, router]);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {status === "checking" && (
        <p className="text-ink-dim">Pulling up a chair…</p>
      )}
      {status === "needs-signin" && (
        <>
          <h1 className="font-display text-2xl font-bold">Almost there</h1>
          <p className="mt-2 text-ink-dim">
            Sign in first, then tap the invite link again.
          </p>
          <Link
            href="/account"
            className="mt-4 inline-block rounded-full bg-gold px-5 py-2.5 font-display font-bold text-felt"
          >
            Sign in
          </Link>
        </>
      )}
      {status === "not-configured" && (
        <p className="text-ink-dim">
          This build doesn&rsquo;t have shared tables switched on — see the
          Account page for setup.
        </p>
      )}
      {status === "error" && (
        <p className="text-ink-dim">
          Couldn&rsquo;t join that table — the link may be wrong, or the game
          was deleted. Ask for a fresh invite.
        </p>
      )}
    </div>
  );
}
