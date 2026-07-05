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
      className="shrink-0 whitespace-nowrap rounded-full border felt-line bg-felt-2 px-4 py-2 text-sm text-ink active:bg-felt-3 hover:border-gold/50 hover:text-gold disabled:opacity-35 disabled:hover:border-ink/10 disabled:hover:text-ink"
    >
      {label}
    </button>
  );
}

function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.stop(ctx.currentTime + 0.7);
  } catch {
    /* no audio permission — the "Time!" pill still shows */
  }
}

const TIMER_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "2m", seconds: 120 },
  { label: "5m", seconds: 300 },
];

function Timer({ request }: { request?: { seconds: number; ts: number } | null }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [picking, setPicking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // "Set a timer for two minutes" — spoken or typed — lands here.
  useEffect(() => {
    if (request) {
      setSeconds(request.seconds);
      setRunning(true);
      setPicking(false);
    }
  }, [request]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s === null || s <= 1) {
          setRunning(false);
          if (s !== null) chime();
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
    if (picking) {
      return (
        <>
          {TIMER_PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              title={`Start a ${p.label} timer`}
              onClick={() => {
                setSeconds(p.seconds);
                setRunning(true);
                setPicking(false);
              }}
            />
          ))}
          <Chip label="✕" title="Cancel timer" onClick={() => setPicking(false)} />
        </>
      );
    }
    return (
      <Chip
        label="⏱ Timer"
        title="Start a turn timer — or say “set a timer for 2 minutes”"
        onClick={() => setPicking(true)}
      />
    );
  }

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm ${
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
  onInvite,
  timerRequest,
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
  onInvite?: () => void;
  timerRequest?: { seconds: number; ts: number } | null;
}) {
  return (
    <div
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3"
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
      <Timer request={timerRequest} />
      {onInvite && (
        <Chip
          label="🔗 Invite"
          title="Share this table — everyone scores from their own phone"
          onClick={onInvite}
        />
      )}
    </div>
  );
}
