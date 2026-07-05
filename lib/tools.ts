export interface DiceResult {
  spec: string;
  rolls: number[];
  modifier: number;
  total: number;
  mode: "normal" | "advantage" | "disadvantage";
}

/**
 * Roll dice from a spec like "2d6", "d20+3", "4d8-2", "d20 advantage".
 * Advantage/disadvantage rolls the whole spec twice and keeps the
 * higher/lower total.
 */
export function rollDice(rawSpec: string): DiceResult | null {
  const spec = rawSpec.trim().toLowerCase();
  const mode: DiceResult["mode"] = /adv/.test(spec)
    ? "advantage"
    : /dis/.test(spec)
      ? "disadvantage"
      : "normal";
  const m = spec.match(/(\d*)d(\d+)\s*([+-]\s*\d+)?/);
  if (!m) return null;
  const count = Math.min(parseInt(m[1] || "1", 10), 100);
  const sides = Math.min(parseInt(m[2], 10), 10000);
  const modifier = m[3] ? parseInt(m[3].replace(/\s+/g, ""), 10) : 0;
  if (!count || !sides) return null;

  const rollOnce = () => {
    const rolls = Array.from(
      { length: count },
      () => 1 + Math.floor(Math.random() * sides)
    );
    return { rolls, total: rolls.reduce((a, b) => a + b, 0) + modifier };
  };

  let picked = rollOnce();
  if (mode !== "normal") {
    const second = rollOnce();
    const better =
      mode === "advantage"
        ? second.total > picked.total
        : second.total < picked.total;
    if (better) picked = second;
  }

  return {
    spec: `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}${mode !== "normal" ? ` (${mode})` : ""}`,
    rolls: picked.rolls,
    modifier,
    total: picked.total,
    mode,
  };
}

export function flipCoin(): "heads" | "tails" {
  return Math.random() < 0.5 ? "heads" : "tails";
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
