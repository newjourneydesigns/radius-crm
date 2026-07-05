"use client";

import { SetupDraft } from "@/lib/types";

/**
 * The scoresheet being built, live, as the setup conversation happens —
 * the user watches the AI understand them.
 */
export default function SetupProgress({ draft }: { draft?: SetupDraft }) {
  if (!draft || draft.step === "done") return null;
  if (!draft.name && !draft.playerNames?.length) return null;

  const rows: { label: string; value?: string }[] = [
    { label: "Game", value: draft.name },
    { label: "Players", value: draft.playerNames?.join(", ") },
    {
      label: "Scoring",
      value: draft.direction
        ? `${draft.direction === "lowest_wins" ? "lowest wins" : "highest wins"}${
            draft.targetScore ? ` · to ${draft.targetScore}` : ""
          }`
        : undefined,
    },
  ];

  return (
    <div
      className="animate-deal-in rounded-xl bg-card px-4 py-3 text-card-ink shadow-cardstock"
      aria-label="Scoresheet in progress"
    >
      <p className="mb-1.5 font-display text-xs font-bold uppercase tracking-wider text-card-dim">
        Setting the table
      </p>
      <dl className="space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 text-card-dim">{r.label}</dt>
            <dd className={r.value ? "font-bold" : "text-card-dim"}>
              {r.value ? (
                <>
                  <span aria-hidden className="mr-1 text-gold-deep">✓</span>
                  {r.value}
                </>
              ) : (
                "…"
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
