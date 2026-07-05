"use client";

import { useEffect } from "react";
import { GameState } from "@/lib/types";

/**
 * Table-center mode: the scoreboard at arm's length in giant type.
 * Holds a screen wake lock while open so the phone doesn't sleep
 * mid-game. Tap anywhere (or Esc) to come back.
 */
export default function BigBoard({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) {
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<any> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((s) => {
        sentinel = s;
      })
      .catch(() => {
        /* wake lock is best-effort */
      });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      void sentinel?.release().catch(() => {});
    };
  }, [onClose]);

  const cols =
    state.players.length <= 2
      ? "grid-cols-2"
      : state.players.length <= 4
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <button
      type="button"
      aria-label="Close big board"
      onClick={onClose}
      className="fixed inset-0 z-40 flex w-full flex-col bg-felt px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.5rem)] text-left"
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 50% -60px, rgba(228,180,84,.14), transparent 65%)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xl font-bold text-ink">
          {state.definition.name}
        </span>
        <span className="text-sm text-ink-dim">Round {state.round}</span>
      </div>

      <div className={`grid flex-1 content-center gap-x-6 gap-y-10 ${cols}`}>
        {state.players.map((p) => {
          const isTurn = !state.finished && p.id === state.currentPlayerId;
          const isLeader = state.leaderIds.includes(p.id);
          return (
            <div key={p.id} className="text-center">
              <div
                className={`truncate font-display text-2xl font-bold uppercase tracking-wide ${
                  isTurn ? "text-gold" : "text-ink-dim"
                }`}
              >
                {isLeader && <span aria-label="in the lead">● </span>}
                {p.name}
              </div>
              <div
                className={`tabular font-display font-bold leading-none ${
                  p.score < 0 ? "text-ember" : "text-ink"
                } ${state.players.length <= 3 ? "text-9xl" : "text-8xl"}`}
              >
                {p.score}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-ink-dim">
        tap anywhere to go back · screen stays awake
      </p>
    </button>
  );
}
