"use client";

import { AiAction } from "@/lib/types";

/** Vision-proposed corrections wait here — nothing changes until confirmed. */
export default function ConfirmBanner({
  proposals,
  onConfirm,
  onDismiss,
}: {
  proposals: AiAction[];
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (!proposals.length) return null;
  const lines = proposals.map((p) =>
    p.kind === "set_score"
      ? `${p.player} → ${p.value}`
      : p.kind === "adjust_score"
        ? `${p.player} ${p.delta >= 0 ? "+" : ""}${p.delta}`
        : p.kind
  );
  return (
    <div
      role="alertdialog"
      aria-label="Confirm score correction"
      className="animate-deal-in rounded-xl border border-gold/60 bg-felt-3 p-4"
    >
      <p className="text-sm text-ink">
        From the photo, I&rsquo;d change:{" "}
        <strong className="text-gold">{lines.join(", ")}</strong>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-gold px-4 py-1.5 font-display text-sm font-bold text-felt"
        >
          Apply changes
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border felt-line px-4 py-1.5 text-sm text-ink-dim hover:text-ink"
        >
          Keep as is
        </button>
      </div>
    </div>
  );
}
