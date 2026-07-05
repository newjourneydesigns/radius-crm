import { GameState } from "./types";
import { formatDuration } from "./stats";

/** Plain-text result summary for SMS / share sheets. */
export function buildShareText(state: GameState, durationMs: number): string {
  const winners = state.players.filter((p) => state.winnerIds.includes(p.id));
  const standings = [...state.players].sort((a, b) =>
    state.definition.scoring.direction === "lowest_wins"
      ? a.score - b.score
      : b.score - a.score
  );
  const lines = standings.map(
    (p) =>
      `${state.winnerIds.includes(p.id) ? "🏆 " : ""}${p.name}: ${p.score}`
  );
  const who = winners.map((w) => w.name).join(" & ") || "Nobody";
  return [
    `🏆 ${who} ${winners.length > 1 ? "take" : "takes"} ${state.definition.name}!`,
    ...lines,
    `${formatDuration(durationMs)} at the table · scored by AI Scorekeeper`,
  ].join("\n");
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Render the winner card as a 1080×1350 image — felt, gold, big type —
 * good enough to drop straight into the group chat.
 */
export async function renderShareImage(
  state: GameState,
  photoMap: Map<string, string>,
  durationMs: number
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* system fonts are fine */
  }

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const display = (px: number, weight = 700) =>
    `${weight} ${px}px "Bricolage Grotesque", Georgia, serif`;
  const body = (px: number, weight = 400) =>
    `${weight} ${px}px "Atkinson Hyperlegible", system-ui, sans-serif`;

  // Felt with a lamplight glow.
  ctx.fillStyle = "#0C2B1C";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -100, 80, W / 2, -100, 900);
  glow.addColorStop(0, "rgba(228,180,84,0.22)");
  glow.addColorStop(1, "rgba(228,180,84,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Poker-chip ring motif.
  ctx.strokeStyle = "rgba(228,180,84,0.5)";
  ctx.lineWidth = 10;
  ctx.setLineDash([34, 22]);
  ctx.beginPath();
  ctx.arc(W / 2, 320, 180, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = "center";

  // Eyebrow + game name.
  ctx.fillStyle = "#E4B454";
  ctx.font = body(30, 700);
  ctx.fillText("G A M E   O V E R", W / 2, 96);
  ctx.fillStyle = "#EFE9D8";
  ctx.font = display(64);
  ctx.fillText(state.definition.name, W / 2, 170);

  // Trophy inside the chip ring.
  ctx.font = "160px serif";
  ctx.fillText("🏆", W / 2, 380);

  // Winners.
  const winners = state.players.filter((p) => state.winnerIds.includes(p.id));
  const who = winners.map((w) => w.name).join(" & ") || "Nobody";
  ctx.fillStyle = "#E4B454";
  ctx.font = display(who.length > 14 ? 72 : 96);
  ctx.fillText(who, W / 2, 620);
  ctx.fillStyle = "#EFE9D8";
  ctx.font = display(44);
  ctx.fillText(winners.length > 1 ? "take it!" : "takes it!", W / 2, 690);

  // Standings card.
  const standings = [...state.players].sort((a, b) =>
    state.definition.scoring.direction === "lowest_wins"
      ? a.score - b.score
      : b.score - a.score
  );
  const cardX = 90;
  const cardY = 760;
  const rowH = 88;
  const cardH = 60 + standings.length * rowH;
  ctx.fillStyle = "#F5EFDE";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, W - cardX * 2, cardH, 28);
  ctx.fill();

  for (let i = 0; i < standings.length; i++) {
    const p = standings[i];
    const y = cardY + 70 + i * rowH;
    const won = state.winnerIds.includes(p.id);

    // Portrait (or initials chip).
    const photo = photoMap.get(p.name.toLowerCase());
    const ax = cardX + 66;
    const ay = y - 14;
    const r = 30;
    const img = photo ? await loadImage(photo) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      ctx.drawImage(img, ax - r, ay - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = "#143824";
      ctx.fillRect(ax - r, ay - r, r * 2, r * 2);
      ctx.fillStyle = "#E4B454";
      ctx.font = display(26);
      ctx.textAlign = "center";
      const initials = p.name
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0] ?? "")
        .join("")
        .toUpperCase();
      ctx.fillText(initials, ax, ay + 10);
    }
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = won ? "#B98A2F" : "#252B20";
    ctx.font = display(40);
    ctx.fillText(
      `${won ? "🏆 " : ""}${p.name}${p.guest ? "  (guest)" : ""}`,
      cardX + 120,
      y
    );
    ctx.textAlign = "right";
    ctx.font = display(48);
    ctx.fillText(String(p.score), W - cardX - 50, y);
    ctx.textAlign = "center";
  }

  // Footer.
  ctx.fillStyle = "rgba(239,233,216,0.75)";
  ctx.font = body(30);
  ctx.fillText(
    `${new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })} · ${formatDuration(durationMs)} at the table`,
    W / 2,
    H - 96
  );
  ctx.fillStyle = "#E4B454";
  ctx.font = body(28, 700);
  ctx.fillText("A I   S C O R E K E E P E R", W / 2, H - 46);

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
}

/**
 * Share the results: native share sheet with the image when available
 * (that's the "text it to the table" path on phones), otherwise open the
 * SMS composer prefilled with the text summary.
 */
export async function shareResults(
  state: GameState,
  photoMap: Map<string, string>,
  durationMs: number
): Promise<"shared" | "sms" | "failed"> {
  const text = buildShareText(state, durationMs);
  const blob = await renderShareImage(state, photoMap, durationMs);
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
  };

  if (blob && typeof nav.share === "function") {
    const file = new File([blob], "game-night.png", { type: "image/png" });
    const withImage: ShareData = { files: [file], text };
    try {
      if (nav.canShare?.(withImage)) {
        await nav.share(withImage);
        return "shared";
      }
      await nav.share({ text });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "shared"; // user closed the sheet
    }
  }

  // Desktop / no share sheet: open the SMS composer with the summary.
  window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  return "sms";
}

export async function downloadShareImage(
  state: GameState,
  photoMap: Map<string, string>,
  durationMs: number
): Promise<boolean> {
  const blob = await renderShareImage(state, photoMap, durationMs);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-final.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
