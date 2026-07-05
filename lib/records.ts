import { buildInsights, formatDuration, summarizeGame } from "./stats";
import { StoredGame } from "./types";

export interface RecordEntry {
  key: string;
  label: string;
  holder: string;
  value: string;
  date: number;
}

/** All-time records across every game on this device. Guests don't hold records. */
export function computeRecords(games: StoredGame[]): RecordEntry[] {
  const summaries = games
    .map(summarizeGame)
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const records: RecordEntry[] = [];

  let highest: { name: string; score: number; game: string; date: number } | null = null;
  let margin: { name: string; diff: number; game: string; date: number } | null = null;
  let fastest: { name: string; ms: number; game: string; date: number } | null = null;
  let marathon: { game: string; ms: number; date: number } | null = null;

  for (const s of summaries) {
    for (const p of s.players) {
      if (!p.guest && (!highest || p.score > highest.score)) {
        highest = { name: p.name, score: p.score, game: s.name, date: s.date };
      }
    }
    if (s.finished) {
      const winners = s.players.filter((p) => p.won && !p.guest);
      const losers = s.players.filter((p) => !p.won);
      if (winners.length && losers.length) {
        const best = winners[0];
        const diff = losers.reduce(
          (acc, p) => Math.max(acc, Math.abs(best.score - p.score)),
          0
        );
        if (diff > 0 && (!margin || diff > margin.diff)) {
          margin = { name: best.name, diff, game: s.name, date: s.date };
        }
        if (s.durationMs > 0 && (!fastest || s.durationMs < fastest.ms)) {
          fastest = { name: best.name, ms: s.durationMs, game: s.name, date: s.date };
        }
      }
      if (s.durationMs > 0 && (!marathon || s.durationMs > marathon.ms)) {
        marathon = { game: s.name, ms: s.durationMs, date: s.date };
      }
    }
  }

  if (highest) {
    records.push({
      key: "highest_score",
      label: "Highest score ever",
      holder: highest.name,
      value: `${highest.score} in ${highest.game}`,
      date: highest.date,
    });
  }
  if (margin) {
    records.push({
      key: "biggest_win",
      label: "Biggest blowout",
      holder: margin.name,
      value: `won ${margin.game} by ${margin.diff}`,
      date: margin.date,
    });
  }
  if (fastest) {
    records.push({
      key: "fastest_win",
      label: "Fastest win",
      holder: fastest.name,
      value: `${fastest.game} in ${formatDuration(fastest.ms)}`,
      date: fastest.date,
    });
  }
  if (marathon) {
    records.push({
      key: "marathon",
      label: "Longest game",
      holder: marathon.game,
      value: formatDuration(marathon.ms),
      date: marathon.date,
    });
  }

  const insights = buildInsights(games);
  const streaker = insights.players.reduce(
    (acc, p) => (p.longestStreak > (acc?.longestStreak ?? 1) ? p : acc),
    null as null | (typeof insights.players)[number]
  );
  if (streaker && streaker.longestStreak > 1) {
    records.push({
      key: "streak",
      label: "Longest winning streak",
      holder: streaker.name,
      value: `${streaker.longestStreak} in a row`,
      date: Date.now(),
    });
  }

  return records;
}

/**
 * Which records did this game just set? Compared against the record book
 * as it stood before the game — the winner screen celebrates these.
 */
export function newRecordCallouts(
  allGames: StoredGame[],
  gameId: string
): string[] {
  const now = computeRecords(allGames);
  const before = computeRecords(allGames.filter((g) => g.id !== gameId));
  return now
    .filter((r) => {
      const prev = before.find((p) => p.key === r.key);
      return !prev || prev.holder !== r.holder || prev.value !== r.value;
    })
    .map((r) => `${r.label} — ${r.holder}, ${r.value}`);
}
