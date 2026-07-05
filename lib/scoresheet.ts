import { inactiveEventIds } from "./engine";
import { GameEvent } from "./types";

export interface ScoresheetRow {
  round: number;
  /** Net points each player gained or lost during this round. */
  deltas: Record<string, number>;
}

export interface Scoresheet {
  rows: ScoresheetRow[];
  totals: Record<string, number>;
}

/**
 * The classic paper scoresheet, derived from the event log: one row per
 * round, one column per player. score_set events contribute the difference
 * from the player's running total, so the sheet always sums to the board.
 */
export function buildScoresheet(events: GameEvent[]): Scoresheet | null {
  const created = events.find((e) => e.type === "game_created");
  if (!created || created.type !== "game_created") return null;

  const inactive = inactiveEventIds(events);
  const totals: Record<string, number> = {};
  for (const p of created.players) totals[p.id] = 0;
  const roundWinPoints = created.definition.scoring.roundWinPoints;

  const rows: ScoresheetRow[] = [{ round: 1, deltas: {} }];
  const add = (playerId: string, delta: number) => {
    if (!(playerId in totals) || delta === 0) return;
    const row = rows[rows.length - 1];
    row.deltas[playerId] = (row.deltas[playerId] ?? 0) + delta;
    totals[playerId] += delta;
  };

  for (const e of events) {
    if (inactive.has(e.id)) continue;
    switch (e.type) {
      case "round_started":
        rows.push({ round: e.round, deltas: {} });
        break;
      case "score_adjusted":
        add(e.playerId, e.delta);
        break;
      case "score_set":
        add(e.playerId, e.value - (totals[e.playerId] ?? 0));
        break;
      case "round_won":
        if (roundWinPoints) add(e.playerId, roundWinPoints);
        break;
      default:
        break;
    }
  }

  return { rows, totals };
}
