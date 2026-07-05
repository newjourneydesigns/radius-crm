"use client";

import { GameState } from "@/lib/types";

/**
 * Player cards dealt onto the felt. Big tabular digits readable from
 * across the table; the current turn gets a gold edge, leaders get a pip.
 */
export default function ScoreBoard({
  state,
  onAdjust,
  trackTurns,
}: {
  state: GameState;
  onAdjust: (playerId: string, delta: number) => void;
  trackTurns: boolean;
}) {
  const cols =
    state.players.length <= 2
      ? "grid-cols-2"
      : state.players.length <= 4
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className={`grid gap-3 ${cols}`}>
      {state.players.map((p, i) => {
        const isTurn = trackTurns && !state.finished && p.id === state.currentPlayerId;
        const isLeader = state.leaderIds.includes(p.id);
        const isWinner = state.winnerIds.includes(p.id);
        return (
          <div
            key={p.id}
            style={{ animationDelay: `${i * 60}ms` }}
            className={`relative animate-deal-in rounded-xl bg-card px-3 pb-3 pt-2 text-card-ink shadow-cardstock ${
              isTurn ? "ring-2 ring-gold" : ""
            } ${state.finished && !isWinner ? "opacity-60" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-sm font-bold uppercase tracking-wide">
                {p.name}
              </span>
              {isWinner ? (
                <span aria-label="winner" title="Winner">
                  🏆
                </span>
              ) : isLeader ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold-deep"
                  title="In the lead"
                  aria-label="in the lead"
                />
              ) : null}
            </div>
            <div
              className={`tabular text-center font-display text-6xl font-bold leading-tight ${
                p.score < 0 ? "text-ember" : ""
              }`}
            >
              {p.score}
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label={`Subtract one from ${p.name}`}
                onClick={() => onAdjust(p.id, -1)}
                disabled={state.finished}
                className="h-11 w-11 rounded-full text-xl text-card-dim active:bg-black/15 hover:bg-black/10 disabled:opacity-30"
              >
                −
              </button>
              {p.roundsWon > 0 && (
                <span className="text-xs text-card-dim">
                  {p.roundsWon} round{p.roundsWon > 1 ? "s" : ""}
                </span>
              )}
              <button
                type="button"
                aria-label={`Add one to ${p.name}`}
                onClick={() => onAdjust(p.id, 1)}
                disabled={state.finished}
                className="h-11 w-11 rounded-full text-xl text-card-dim active:bg-black/15 hover:bg-black/10 disabled:opacity-30"
              >
                +
              </button>
            </div>
            {isTurn && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 py-px text-[10px] font-bold uppercase tracking-wider text-felt">
                turn
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
