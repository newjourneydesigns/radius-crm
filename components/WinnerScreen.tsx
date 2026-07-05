"use client";

import { useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar";
import { downloadShareImage, shareResults } from "@/lib/shareCard";
import { formatDuration } from "@/lib/stats";
import { GameState } from "@/lib/types";

const CONFETTI_COLORS = ["#E4B454", "#F5EFDE", "#CE5B4E", "#B98A2F", "#1C4530"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.8,
        duration: 2.6 + Math.random() * 2,
        size: 7 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tilt: Math.random() * 360,
        round: i % 3 === 0,
      })),
    []
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-[-4%] animate-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.7,
            backgroundColor: p.color,
            borderRadius: p.round ? "50%" : "2px",
            transform: `rotate(${p.tilt}deg)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function WinnerScreen({
  state,
  photoMap,
  durationMs,
  onRematch,
  onClose,
  recordCallouts = [],
}: {
  state: GameState;
  photoMap: Map<string, string>;
  durationMs: number;
  onRematch: () => void;
  onClose: () => void;
  recordCallouts?: string[];
}) {
  const [shareState, setShareState] = useState<"idle" | "busy" | "sms">("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const winners = state.players.filter((p) => state.winnerIds.includes(p.id));
  const standings = [...state.players].sort((a, b) =>
    state.definition.scoring.direction === "lowest_wins"
      ? a.score - b.score
      : b.score - a.score
  );
  const topScore = winners[0]?.score ?? standings[0]?.score ?? 0;

  const share = async () => {
    setShareState("busy");
    const result = await shareResults(state, photoMap, durationMs);
    setShareState(result === "sms" ? "sms" : "idle");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Final results"
      className="fixed inset-0 z-50 overflow-y-auto bg-felt"
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 50% -60px, rgba(228,180,84,.18), transparent 65%)",
      }}
    >
      <Confetti />
      <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),2.5rem)] text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.35em] text-gold">
          Game over
        </p>
        <p className="mt-1 text-ink-dim">{state.definition.name}</p>

        <div className="mt-6 flex items-center justify-center -space-x-3">
          {winners.length ? (
            winners.map((w) => (
              <Avatar
                key={w.id}
                name={w.name}
                photo={photoMap.get(w.name.toLowerCase())}
                size="xl"
                className="border-4 border-felt shadow-cardstock"
              />
            ))
          ) : (
            <span className="text-7xl">🤝</span>
          )}
        </div>

        <h1 className="mt-5 font-display text-5xl font-bold leading-tight text-gold">
          {winners.map((w) => w.name).join(" & ") || "It's a draw"}
        </h1>
        <p className="mt-1 font-display text-xl text-ink">
          {winners.length ? (winners.length > 1 ? "take it!" : "takes it!") : ""}
        </p>
        <p className="tabular mt-3 font-display text-7xl font-bold leading-none text-ink">
          {topScore}
        </p>
        <p className="mt-1 text-sm text-ink-dim">
          final score · {formatDuration(durationMs)} at the table
        </p>

        {recordCallouts.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {recordCallouts.map((c) => (
              <p
                key={c}
                className="rounded-full border border-gold/50 bg-felt-3 px-4 py-1.5 text-sm text-gold"
              >
                🏅 {c}
              </p>
            ))}
          </div>
        )}

        <div className="mt-7 w-full rounded-2xl bg-card px-5 py-4 text-left text-card-ink shadow-cardstock">
          {standings.map((p, i) => {
            const won = state.winnerIds.includes(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 py-2 ${i > 0 ? "border-t border-black/10" : ""}`}
              >
                <span className="tabular w-5 text-sm text-card-dim">{i + 1}</span>
                <Avatar
                  name={p.name}
                  photo={photoMap.get(p.name.toLowerCase())}
                  size="sm"
                />
                <span className={`min-w-0 flex-1 truncate font-display font-bold ${won ? "text-gold-deep" : ""}`}>
                  {p.name}
                  {p.guest && (
                    <span className="ml-1.5 text-xs font-normal text-card-dim">
                      guest
                    </span>
                  )}
                </span>
                <span className={`tabular font-display text-2xl font-bold ${won ? "text-gold-deep" : ""}`}>
                  {p.score}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={share}
          disabled={shareState === "busy"}
          className="mt-6 w-full rounded-full bg-gold py-3.5 font-display text-lg font-bold text-felt shadow-chip active:translate-y-0.5 active:shadow-chip-down disabled:opacity-60"
        >
          {shareState === "busy" ? "Setting up…" : "📲 Text it to the table"}
        </button>
        {shareState === "sms" && (
          <p className="mt-2 text-sm text-ink-dim">
            Opened your messages with the recap — save the image below to
            attach it.
          </p>
        )}
        <button
          type="button"
          onClick={() => downloadShareImage(state, photoMap, durationMs)}
          className="mt-3 w-full rounded-full border felt-line py-3 font-display font-bold text-ink active:bg-felt-2"
        >
          Save the winner card
        </button>
        <div className="mt-3 flex w-full gap-3">
          <button
            type="button"
            onClick={onRematch}
            className="flex-1 rounded-full border border-gold/60 py-3 font-display font-bold text-gold active:bg-felt-2"
          >
            Rematch
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border felt-line py-3 font-display font-bold text-ink-dim active:bg-felt-2"
          >
            Back to the table
          </button>
        </div>
      </div>
    </div>
  );
}
