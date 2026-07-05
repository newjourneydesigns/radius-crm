"use client";

import { useEffect, useRef, useState } from "react";
import { buildInsights, PlayerStats } from "@/lib/stats";
import {
  addRosterPlayer,
  deleteRosterPlayer,
  listGames,
  listRoster,
  renameRosterPlayer,
  seedRosterFromHistory,
  toggleRegular,
} from "@/lib/store";
import { RosterPlayer } from "@/lib/types";

function PlayerRow({
  player,
  stats,
  onChanged,
}: {
  player: RosterPlayer;
  stats?: PlayerStats;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const commitRename = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== player.name) {
      renameRosterPlayer(player.id, name);
      onChanged();
    } else {
      setName(player.name);
    }
  };

  return (
    <li className="rounded-xl border felt-line bg-felt-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={name}
              aria-label="Player name"
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setName(player.name);
                  setEditing(false);
                }
              }}
              className="w-full rounded-lg bg-felt-3 px-3 py-1.5 text-[16px] font-bold text-ink ring-1 ring-gold/50 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              aria-label={`Rename ${player.name}`}
              title="Tap to rename"
              onClick={() => setEditing(true)}
              className="max-w-full truncate text-left font-display text-lg font-bold text-ink hover:text-gold"
            >
              {player.name}
              {player.regular && (
                <span className="ml-2 align-middle text-xs font-bold uppercase tracking-wider text-gold">
                  regular
                </span>
              )}
            </button>
          )}
          <p className="mt-0.5 text-sm text-ink-dim">
            {stats
              ? `${stats.games} game${stats.games === 1 ? "" : "s"} · ${stats.wins} win${stats.wins === 1 ? "" : "s"}${stats.longestStreak > 1 ? ` · ${stats.longestStreak} streak 🔥` : ""}`
              : "Hasn't played yet"}
          </p>
        </div>

        <button
          type="button"
          aria-label={
            player.regular
              ? `Remove ${player.name} from regulars`
              : `Mark ${player.name} as a regular`
          }
          aria-pressed={player.regular}
          title="Regulars are offered first when starting a game"
          onClick={() => {
            toggleRegular(player.id);
            onChanged();
          }}
          className={`shrink-0 rounded-full border px-3.5 py-2 text-sm ${
            player.regular
              ? "border-gold bg-gold font-bold text-felt"
              : "felt-line text-ink-dim active:bg-felt-3 hover:border-gold/50 hover:text-gold"
          }`}
        >
          ★
        </button>

        <button
          type="button"
          aria-label={`Remove ${player.name}`}
          onClick={() => {
            if (confirmingDelete) {
              deleteRosterPlayer(player.id);
              onChanged();
            } else {
              setConfirmingDelete(true);
              confirmTimer.current = setTimeout(
                () => setConfirmingDelete(false),
                3000
              );
            }
          }}
          className={`shrink-0 rounded-full border px-3.5 py-2 text-sm ${
            confirmingDelete
              ? "border-ember bg-ember/20 font-bold text-ember"
              : "felt-line text-ink-dim active:bg-felt-3 hover:border-ember/60 hover:text-ember"
          }`}
        >
          {confirmingDelete ? "Remove?" : "✕"}
        </button>
      </div>
    </li>
  );
}

export default function PlayersPage() {
  const [roster, setRoster] = useState<RosterPlayer[] | null>(null);
  const [statsByName, setStatsByName] = useState<Map<string, PlayerStats>>(new Map());
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState(false);

  const refresh = () => {
    setRoster(listRoster());
    const insights = buildInsights(listGames());
    setStatsByName(
      new Map(insights.players.map((p) => [p.name.toLowerCase(), p]))
    );
  };

  useEffect(() => {
    seedRosterFromHistory();
    refresh();
  }, []);

  const add = () => {
    if (!newName.trim()) return;
    const ok = addRosterPlayer(newName);
    setAddError(!ok);
    if (ok) {
      setNewName("");
      refresh();
    }
  };

  if (roster === null) {
    return <p className="py-12 text-center text-ink-dim">Gathering the crew…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">The crew</h1>
        <p className="mt-1 text-ink-dim">
          Everyone who plays. Mark your <span className="text-gold">★ regulars</span>{" "}
          and they&rsquo;re one tap to seat when a game starts. Renaming someone
          updates their whole history.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={newName}
          aria-label="New player name"
          placeholder="Add a player…"
          enterKeyHint="done"
          autoComplete="off"
          onChange={(e) => {
            setNewName(e.target.value);
            setAddError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className={`min-w-0 flex-1 rounded-full bg-felt-2 px-4 py-2.5 text-[16px] text-ink ring-1 ring-inset placeholder:text-ink-dim/70 focus:outline-none ${
            addError ? "ring-ember" : "ring-ink/10 focus-within:ring-gold/60"
          }`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newName.trim()}
          className="shrink-0 rounded-full bg-gold px-5 py-2.5 font-display text-sm font-bold text-felt disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {addError && (
        <p className="-mt-3 text-sm text-ember">
          That name&rsquo;s already on the crew.
        </p>
      )}

      {roster.length === 0 ? (
        <p className="rounded-xl border felt-line bg-felt-2 px-4 py-6 text-center text-ink-dim">
          No players yet. Add your crew above, or just start a game — everyone
          at the table joins automatically.
        </p>
      ) : (
        <ul className="space-y-2">
          {roster.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              stats={statsByName.get(p.name.toLowerCase())}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
