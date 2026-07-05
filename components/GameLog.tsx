"use client";

import { useState } from "react";
import { GameState } from "@/lib/types";

/** Collapsible audit trail — every event, including what was undone. */
export default function GameLog({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  const hasExtras = state.notes.length > 0 || state.houseRules.length > 0;
  if (!state.log.length && !hasExtras) return null;

  return (
    <section className="border-t felt-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm text-ink-dim hover:text-ink"
      >
        <span className="font-display font-bold uppercase tracking-wider">
          Table log
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4 text-sm">
          {state.houseRules.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wider text-gold">
                House rules
              </h3>
              <ul className="list-inside list-disc space-y-0.5 text-ink-dim">
                {state.houseRules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {state.notes.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wider text-gold">
                Notes
              </h3>
              <ul className="list-inside list-disc space-y-0.5 text-ink-dim">
                {state.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          <ol className="space-y-1">
            {[...state.log].reverse().map((line) => (
              <li
                key={line.eventId}
                className={
                  line.undone ? "text-ink-dim/50 line-through" : "text-ink-dim"
                }
              >
                <time className="tabular mr-2 text-xs opacity-70">
                  {new Date(line.ts).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                {line.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
