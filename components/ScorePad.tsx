"use client";

import { useState } from "react";
import { PlayerState } from "@/lib/types";

const PRESETS = [-10, -5, -1, 1, 5, 10];

/** Bottom-sheet number pad: big-thumb score entry for one player. */
export default function ScorePad({
  player,
  onAdjust,
  onSet,
  onClose,
}: {
  player: PlayerState;
  onAdjust: (delta: number) => void;
  onSet: (value: number) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const n = parseInt(custom, 10);
  const hasCustom = !isNaN(n);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label={`Score pad for ${player.name}`}>
      <button
        type="button"
        aria-label="Close score pad"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50"
      />
      <div
        data-testid="score-pad"
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-gold/30 bg-felt-2 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-display text-lg font-bold">{player.name}</span>
          <span className="tabular font-display text-3xl font-bold text-gold">
            {player.score}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2">
          {PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onAdjust(d)}
              className={`h-12 rounded-xl font-display text-lg font-bold active:translate-y-px ${
                d < 0
                  ? "bg-felt-3 text-ember"
                  : "bg-felt-3 text-gold"
              }`}
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Amount…"
            aria-label="Custom amount"
            className="tabular min-w-0 flex-1 rounded-xl bg-felt-3 px-4 py-3 text-[16px] text-ink ring-1 ring-inset ring-ink/10 placeholder:text-ink-dim/60 focus:outline-none focus:ring-gold/60"
          />
          <button
            type="button"
            disabled={!hasCustom}
            onClick={() => {
              onAdjust(Math.abs(n));
              setCustom("");
            }}
            className="rounded-xl bg-felt-3 px-4 font-display font-bold text-gold disabled:opacity-35"
          >
            Add
          </button>
          <button
            type="button"
            disabled={!hasCustom}
            onClick={() => {
              onAdjust(-Math.abs(n));
              setCustom("");
            }}
            className="rounded-xl bg-felt-3 px-4 font-display font-bold text-ember disabled:opacity-35"
          >
            Minus
          </button>
          <button
            type="button"
            disabled={!hasCustom}
            onClick={() => {
              onSet(n);
              setCustom("");
            }}
            className="rounded-xl bg-felt-3 px-4 font-display font-bold text-ink disabled:opacity-35"
          >
            Set
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-gold py-3 font-display font-bold text-felt"
        >
          Done
        </button>
      </div>
    </div>
  );
}
