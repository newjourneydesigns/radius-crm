"use client";

import { useEffect, useRef, useState } from "react";

function Chip({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="shrink-0 rounded-full border felt-line bg-felt-2 px-3.5 py-1.5 text-sm text-ink hover:border-gold/50 hover:text-gold disabled:opacity-35 disabled:hover:border-ink/10 disabled:hover:text-ink"
    >
      {label}
    </button>
  );
}

function Timer() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s === null || s <= 1) {
          setRunning(false);
          return s === null ? null : 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  if (seconds === null) {
    return (
      <Chip
        label="⏱ Timer"
        title="Start a 1-minute turn timer"
        onClick={() => {
          setSeconds(60);
          setRunning(true);
        }}
      />
    );
  }

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm ${
        seconds === 0
          ? "border-ember bg-ember/20 text-ink"
          : "border-gold/50 bg-felt-2 text-gold"
      }`}
    >
      <span className="tabular font-bold">
        {seconds === 0 ? "Time!" : `${mm}:${ss}`}
      </span>
      {seconds > 0 && (
        <button
          type="button"
          aria-label={running ? "Pause timer" : "Resume timer"}
          onClick={() => setRunning((r) => !r)}
          className="hover:text-ink"
        >
          {running ? "❚❚" : "▶"}
        </button>
      )}
      <button
        type="button"
        aria-label="Clear timer"
        onClick={() => {
          setRunning(false);
          setSeconds(null);
        }}
        className="hover:text-ink"
      >
        ✕
      </button>
    </span>
  );
}

export default function Toolbar({
  finished,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNextRound,
  onNextTurn,
  onRoll,
  onFlip,
  onPick,
}: {
  finished: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNextRound: () => void;
  onNextTurn: () => void;
  onRoll: () => void;
  onFlip: () => void;
  onPick: () => void;
}) {
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3"
      role="toolbar"
      aria-label="Game tools"
    >
      <Chip label="↩ Undo" onClick={onUndo} disabled={!canUndo} />
      <Chip label="↪ Redo" onClick={onRedo} disabled={!canRedo} />
      {!finished && (
        <>
          <Chip label="Next round" onClick={onNextRound} />
          <Chip label="Next turn" onClick={onNextTurn} />
        </>
      )}
      <Chip label="🎲 Roll" title="Roll 2d6 — or say “roll a d20”" onClick={onRoll} />
      <Chip label="🪙 Flip" onClick={onFlip} />
      <Chip label="👉 Pick" title="Pick a random player" onClick={onPick} />
      <Timer />
    </div>
  );
}
