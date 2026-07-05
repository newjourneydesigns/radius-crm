import { deriveState } from "./engine";
import { StoredGame } from "./types";

export interface FinishedGameSummary {
  id: string;
  name: string;
  date: number;
  durationMs: number;
  players: { name: string; score: number; won: boolean }[];
  finished: boolean;
}

export interface PlayerStats {
  name: string;
  games: number;
  wins: number;
  winRate: number;
  bestScore: number | null;
  longestStreak: number;
}

export interface HistoryInsights {
  totalGames: number;
  finishedGames: number;
  totalTimeMs: number;
  mostPlayed: { name: string; count: number } | null;
  players: PlayerStats[];
  closestGame: { name: string; margin: number; date: number } | null;
}

export function summarizeGame(g: StoredGame): FinishedGameSummary | null {
  const state = deriveState(g.events);
  if (!state) return null;
  const first = g.events[0]?.ts ?? g.createdAt;
  const last = g.events[g.events.length - 1]?.ts ?? g.updatedAt;
  return {
    id: g.id,
    name: state.definition.name,
    date: g.createdAt,
    durationMs: Math.max(0, last - first),
    players: state.players.map((p) => ({
      name: p.name,
      score: p.score,
      won: state.winnerIds.includes(p.id),
    })),
    finished: state.finished,
  };
}

export function buildInsights(games: StoredGame[]): HistoryInsights {
  const summaries = games
    .map(summarizeGame)
    .filter((s): s is FinishedGameSummary => s !== null);

  const byGameName = new Map<string, number>();
  const perPlayer = new Map<
    string,
    { games: number; wins: number; best: number | null; streak: number; maxStreak: number }
  >();
  let totalTime = 0;
  let closest: HistoryInsights["closestGame"] = null;

  // Oldest first so winning streaks accumulate in play order.
  const chronological = [...summaries].sort((a, b) => a.date - b.date);

  for (const s of chronological) {
    totalTime += s.durationMs;
    byGameName.set(s.name, (byGameName.get(s.name) ?? 0) + 1);

    if (s.finished && s.players.length >= 2) {
      const sorted = [...s.players].sort((a, b) => b.score - a.score);
      const margin = Math.abs(sorted[0].score - sorted[1].score);
      if (!closest || margin < closest.margin) {
        closest = { name: s.name, margin, date: s.date };
      }
    }

    for (const p of s.players) {
      const rec =
        perPlayer.get(p.name) ??
        { games: 0, wins: 0, best: null, streak: 0, maxStreak: 0 };
      rec.games += 1;
      rec.best = rec.best === null ? p.score : Math.max(rec.best, p.score);
      if (s.finished) {
        if (p.won) {
          rec.wins += 1;
          rec.streak += 1;
          rec.maxStreak = Math.max(rec.maxStreak, rec.streak);
        } else {
          rec.streak = 0;
        }
      }
      perPlayer.set(p.name, rec);
    }
  }

  let mostPlayed: HistoryInsights["mostPlayed"] = null;
  for (const [name, count] of byGameName) {
    if (!mostPlayed || count > mostPlayed.count) mostPlayed = { name, count };
  }

  const players: PlayerStats[] = [...perPlayer.entries()]
    .map(([name, r]) => ({
      name,
      games: r.games,
      wins: r.wins,
      winRate: r.games ? r.wins / r.games : 0,
      bestScore: r.best,
      longestStreak: r.maxStreak,
    }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games);

  return {
    totalGames: summaries.length,
    finishedGames: summaries.filter((s) => s.finished).length,
    totalTimeMs: totalTime,
    mostPlayed,
    players,
    closestGame: closest,
  };
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
