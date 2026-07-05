"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildInsights, formatDuration, summarizeGame } from "@/lib/stats";
import { listGames } from "@/lib/store";
import { StoredGame } from "@/lib/types";

export default function HistoryPage() {
  const [games, setGames] = useState<StoredGame[] | null>(null);

  useEffect(() => {
    setGames(listGames());
  }, []);

  if (games === null) {
    return <p className="py-12 text-center text-ink-dim">Opening the record book…</p>;
  }

  if (games.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-3xl font-bold">The record book</h1>
        <p className="mt-3 text-ink-dim">
          No games yet. Every game you play gets remembered here — winners,
          scores, streaks, and bragging rights.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-gold px-5 py-2 font-display font-bold text-felt"
        >
          Start the first game
        </Link>
      </div>
    );
  }

  const insights = buildInsights(games);
  const summaries = games
    .map(summarizeGame)
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">The record book</h1>
        <p className="mt-1 text-ink-dim">
          {insights.totalGames} game{insights.totalGames === 1 ? "" : "s"} ·{" "}
          {formatDuration(insights.totalTimeMs)} at the table
          {insights.mostPlayed &&
            ` · most played: ${insights.mostPlayed.name} (${insights.mostPlayed.count}×)`}
        </p>
        {insights.closestGame && (
          <p className="mt-1 text-sm text-gold">
            Closest game: {insights.closestGame.name}, decided by{" "}
            {insights.closestGame.margin}{" "}
            {insights.closestGame.margin === 1 ? "point" : "points"}.
          </p>
        )}
      </div>

      {insights.players.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-ink-dim">
            Standings
          </h2>
          <div className="overflow-x-auto rounded-xl bg-card text-card-ink shadow-cardstock">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-card-dim">
                  <th className="px-4 py-2 font-bold">Player</th>
                  <th className="px-3 py-2 text-right font-bold">Games</th>
                  <th className="px-3 py-2 text-right font-bold">Wins</th>
                  <th className="px-3 py-2 text-right font-bold">Win rate</th>
                  <th className="px-3 py-2 text-right font-bold">Best score</th>
                  <th className="px-4 py-2 text-right font-bold">Streak</th>
                </tr>
              </thead>
              <tbody>
                {insights.players.map((p) => (
                  <tr key={p.name} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2 font-display font-bold">{p.name}</td>
                    <td className="tabular px-3 py-2 text-right">{p.games}</td>
                    <td className="tabular px-3 py-2 text-right">{p.wins}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {Math.round(p.winRate * 100)}%
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      {p.bestScore ?? "—"}
                    </td>
                    <td className="tabular px-4 py-2 text-right">
                      {p.longestStreak > 1 ? `${p.longestStreak} 🔥` : p.longestStreak}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-ink-dim">
          Every game
        </h2>
        <ul className="space-y-2">
          {summaries.map((s) => (
            <li key={s.id}>
              <Link
                href={`/game/${s.id}`}
                className="block rounded-xl border felt-line bg-felt-2 px-4 py-3 hover:border-gold/50"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-bold">{s.name}</span>
                  <span className="text-xs text-ink-dim">
                    {new Date(s.date).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-dim">
                  <span>
                    {s.players
                      .map((p) => `${p.won ? "🏆 " : ""}${p.name} ${p.score}`)
                      .join(" · ")}
                  </span>
                  <span>
                    {s.finished ? formatDuration(s.durationMs) : "in play"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
