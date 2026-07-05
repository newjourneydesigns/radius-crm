"use client";

import { useState } from "react";
import { buildScoresheet } from "@/lib/scoresheet";
import { GameEvent, GameState } from "@/lib/types";

/** The paper scoresheet: rounds down the side, players across the top. */
export default function ScoresheetGrid({
  events,
  state,
}: {
  events: GameEvent[];
  state: GameState;
}) {
  const [open, setOpen] = useState(false);
  const sheet = buildScoresheet(events);
  if (!sheet) return null;
  const hasAnyScores = sheet.rows.some((r) => Object.keys(r.deltas).length > 0);
  if (!hasAnyScores && sheet.rows.length <= 1) return null;

  return (
    <section className="border-t felt-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm text-ink-dim hover:text-ink"
      >
        <span className="font-display font-bold uppercase tracking-wider">
          Scoresheet
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto rounded-xl bg-card text-card-ink shadow-cardstock">
          <table className="w-full text-sm" data-testid="scoresheet">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-card-dim">
                <th className="px-3 py-2 text-left font-bold">Rd</th>
                {state.players.map((p) => (
                  <th key={p.id} className="max-w-24 truncate px-3 py-2 text-right font-bold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row) => (
                <tr key={row.round} className="border-b border-black/5">
                  <td className="px-3 py-1.5 text-card-dim">R{row.round}</td>
                  {state.players.map((p) => {
                    const d = row.deltas[p.id];
                    return (
                      <td
                        key={p.id}
                        className={`tabular px-3 py-1.5 text-right ${
                          d === undefined ? "text-card-dim/50" : d < 0 ? "text-ember" : ""
                        }`}
                      >
                        {d === undefined ? "·" : d > 0 ? `+${d}` : d}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="font-display font-bold">
                <td className="px-3 py-2 text-xs uppercase tracking-wider text-card-dim">
                  Total
                </td>
                {state.players.map((p) => (
                  <td key={p.id} className="tabular px-3 py-2 text-right text-base">
                    {sheet.totals[p.id] ?? 0}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
