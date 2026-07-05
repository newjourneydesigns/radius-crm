"use client";

import Link from "next/link";
import { useRef, useEffect, useState } from "react";
import { computeRecords } from "@/lib/records";
import { buildInsights, formatDuration, summarizeGame } from "@/lib/stats";
import { exportAll, importAll, listGames } from "@/lib/store";
import { StoredGame } from "@/lib/types";

function BackupSection({ onRestored }: { onRestored: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const backup = () => {
    const blob = new Blob([exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scorekeeper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const restore = async (file: File) => {
    try {
      const result = importAll(await file.text());
      setMessage(
        `Restored ${result.games} game${result.games === 1 ? "" : "s"} and ${result.players} player${result.players === 1 ? "" : "s"}.`
      );
      onRestored();
    } catch {
      setMessage("That doesn't look like a Scorekeeper backup file.");
    }
  };

  return (
    <section className="border-t felt-line pt-4">
      <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-ink-dim">
        Keep it safe
      </h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={backup}
          className="rounded-full border felt-line bg-felt-2 px-4 py-2 text-sm text-ink active:bg-felt-3 hover:border-gold/50 hover:text-gold"
        >
          ⬇ Back up game nights
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void restore(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-full border felt-line bg-felt-2 px-4 py-2 text-sm text-ink active:bg-felt-3 hover:border-gold/50 hover:text-gold"
        >
          ⬆ Restore from backup
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-ink-dim">{message}</p>}
      <p className="mt-2 text-xs text-ink-dim/70">
        Games live on this device — the backup file moves them anywhere.
      </p>
    </section>
  );
}

export default function HistoryPage() {
  const [games, setGames] = useState<StoredGame[] | null>(null);

  const refresh = () => setGames(listGames());
  useEffect(refresh, []);

  if (games === null) {
    return <p className="py-12 text-center text-ink-dim">Opening the record book…</p>;
  }

  if (games.length === 0) {
    return (
      <div className="space-y-10 py-16">
        <div className="text-center">
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
        <BackupSection onRestored={refresh} />
      </div>
    );
  }

  const insights = buildInsights(games);
  const records = computeRecords(games);
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

      {records.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-ink-dim">
            All-time records
          </h2>
          <ul className="space-y-1.5" data-testid="records">
            {records.map((r) => (
              <li
                key={r.key}
                className="flex items-baseline justify-between gap-3 rounded-xl border felt-line bg-felt-2 px-4 py-2.5"
              >
                <span className="text-sm text-ink-dim">🏅 {r.label}</span>
                <span className="min-w-0 truncate text-right text-sm">
                  <strong className="font-display text-gold">{r.holder}</strong>
                  <span className="ml-1.5 text-ink-dim">{r.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <BackupSection onRestored={refresh} />
    </div>
  );
}
