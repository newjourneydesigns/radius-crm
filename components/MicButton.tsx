"use client";

/**
 * The signature element: a poker-chip microphone. Press to talk;
 * the gold ring pulses while the table is being heard.
 */
export default function MicButton({
  listening,
  supported,
  onStart,
  onStop,
  size = "lg",
}: {
  listening: boolean;
  supported: boolean;
  onStart: () => void;
  onStop: () => void;
  size?: "lg" | "md";
}) {
  const dim = size === "lg" ? "h-20 w-20" : "h-14 w-14";
  return (
    <button
      type="button"
      aria-label={listening ? "Stop listening" : "Start voice input"}
      aria-pressed={listening}
      disabled={!supported}
      onClick={listening ? onStop : onStart}
      title={
        supported
          ? listening
            ? "Listening — tap to stop"
            : "Tap and speak"
          : "Voice input isn't available in this browser — type instead"
      }
      className={`relative ${dim} shrink-0 rounded-full border-4 border-dashed border-gold/80 bg-felt-3 text-gold shadow-chip transition-all active:translate-y-1 active:shadow-chip-down disabled:cursor-not-allowed disabled:opacity-40 ${
        listening ? "animate-pulse-ring border-solid bg-gold text-felt" : ""
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`mx-auto ${size === "lg" ? "h-9 w-9" : "h-6 w-6"}`}
        aria-hidden
      >
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
        <path d="M18 11a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.94V22h2v-3.06A8 8 0 0 0 20 11h-2Z" />
      </svg>
    </button>
  );
}
