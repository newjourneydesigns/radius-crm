import { findPlayer } from "./engine";
import { lookupGame } from "./registry";
import {
  AiAction,
  InterpretRequest,
  InterpretResponse,
  SetupDraft,
} from "./types";

/**
 * Keyless fallback interpreter. Handles the common scorekeeping phrases and
 * a guided setup conversation so the app works fully offline. The AI
 * providers handle everything richer.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  twenty: 20, "twenty-five": 25, fifty: 50, hundred: 100,
};

function parseNumber(s: string): number | null {
  const n = parseInt(s.replace(/,/g, ""), 10);
  if (!isNaN(n)) return n;
  return NUMBER_WORDS[s.toLowerCase()] ?? null;
}

function splitNames(raw: string): string[] {
  return raw
    .split(/,|\band\b|&/i)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 0 && s.length < 30);
}

// ---------- Setup phase ----------

export function localSetup(req: InterpretRequest): InterpretResponse {
  const text = req.messages[req.messages.length - 1]?.text.trim() ?? "";
  const draft: SetupDraft = { ...(req.draft ?? {}) };
  const lower = text.toLowerCase();

  // Step 0 — they're inventing a game; get a real name for it first.
  if (!draft.name && draft.step !== "name" &&
      /mak(?:e|ing)\s+(?:it\s+|one\s+)?up|our own game|invent(?:ed|ing)? a game|new game/.test(lower)) {
    draft.step = "name";
    return local(
      "Love it — a brand new game. What should we call it?",
      [],
      draft
    );
  }
  if (draft.step === "name" && !draft.name) {
    draft.name = title(text.replace(/^(it'?s called|call it|let'?s call it)\s+/i, ""));
    draft.step = "players";
    return local(`${draft.name} — great name. Who's playing?`, [], draft);
  }

  // Step 1 — which game? (match on the original text so names keep their case)
  if (!draft.name) {
    const m = text.match(
      /(?:we'?re playing|let'?s play|playing|play)\s+(.+?)(?:\s+with\s+(.+))?[.!]?$/i
    );
    const gameName = m ? m[1].trim() : text;
    if (!gameName) {
      return local("What are we playing tonight?", [], draft);
    }
    draft.name = title(gameName);
    if (m?.[2]) draft.playerNames = splitNames(m[2]);

    const known = lookupGame(draft.name);
    if (known) {
      draft.name = known.name;
      draft.direction = known.scoring.direction;
      draft.targetScore = known.scoring.targetScore ?? null;
      draft.step = "players";
      if (draft.playerNames?.length) {
        return finishSetup(draft, known.known);
      }
      return local(
        `${known.name} — great pick. ${known.winCondition} Who's playing?`,
        [],
        draft
      );
    }
    draft.step = "players";
    return local(
      `"${draft.name}" — I don't know that one yet, so teach me as we go. Who's playing?`,
      [],
      draft
    );
  }

  // Step 2 — players
  if (draft.step === "players" || !draft.playerNames?.length) {
    const names = splitNames(text);
    if (!names.length) {
      return local("Give me the player names, like \"Trip, Erin and Ashlyn\".", [], draft);
    }
    draft.playerNames = names;
    if (draft.direction) {
      return finishSetup(draft, lookupGame(draft.name) !== null);
    }
    draft.step = "direction";
    return local(
      `Got it — ${names.join(", ")}. Does the highest score win, or the lowest?`,
      [],
      draft,
      ["Highest score wins", "Lowest score wins"]
    );
  }

  // Step 3 — direction
  if (draft.step === "direction") {
    draft.direction = /low/.test(lower) ? "lowest_wins" : "highest_wins";
    draft.step = "target";
    return local(
      "Play to a target score? Tell me the number, or say \"no target\".",
      [],
      draft,
      ["No target", "100", "500"]
    );
  }

  // Step 4 — target score
  if (draft.step === "target") {
    const n = text.match(/\d[\d,]*/);
    draft.targetScore = /no|none|nah/.test(lower)
      ? null
      : n
        ? parseNumber(n[0])
        : null;
    return finishSetup(draft, false);
  }

  return finishSetup(draft, false);
}

function finishSetup(draft: SetupDraft, known: boolean): InterpretResponse {
  const registry = known ? lookupGame(draft.name ?? "") : null;
  const definition = registry ?? {
    name: draft.name ?? "House Game",
    known,
    scoring: {
      direction: draft.direction ?? "highest_wins",
      targetScore: draft.targetScore ?? undefined,
    },
    winCondition:
      draft.targetScore != null
        ? `First to ${draft.targetScore} ${draft.direction === "lowest_wins" ? "(lowest score wins)" : ""} wins.`
        : draft.direction === "lowest_wins"
          ? "Lowest score wins."
          : "Highest score wins.",
    specialRules: [],
  };
  const players = (draft.playerNames ?? []).map((name) => ({ name }));
  const action: AiAction = { kind: "create_game", definition, players };
  return {
    reply: `Table's set — ${definition.name} with ${players
      .map((p) => p.name)
      .join(", ")}. Say things like "${players[0]?.name ?? "Trip"} gets 12" and I'll keep score. Good luck!`,
    actions: [action],
    draft: { ...draft, step: "done" },
    provider: "local",
  };
}

// ---------- Play phase ----------

export function localPlay(req: InterpretRequest): InterpretResponse {
  const text = req.messages[req.messages.length - 1]?.text.trim() ?? "";
  const lower = text.toLowerCase().replace(/[.!?]+$/, "");
  const players = req.players ?? [];
  const name = (like: string) => findPlayer(players, like)?.name ?? null;

  // Undo / redo
  if (/^(undo|no wait|scratch that|take that back)/.test(lower))
    return local("Undone.", [{ kind: "undo" }]);
  if (/^redo/.test(lower)) return local("Redone.", [{ kind: "redo" }]);

  // Dice / coin / picker
  const dice = lower.match(/roll (?:a |an |the )?(.+)/);
  if (dice) {
    const spec = /d\d/.test(dice[1]) ? dice[1] : "1d6";
    return local("Rolling…", [{ kind: "roll_dice", spec }]);
  }
  if (/flip a? ?coin|coin flip|heads or tails/.test(lower))
    return local("Flipping…", [{ kind: "flip_coin" }]);
  if (/pick (a|someone|a player|random)/.test(lower))
    return local("Drawing a name…", [{ kind: "pick_player" }]);

  // Rounds & turns
  if (/(start |begin )?(the )?next round|start round/.test(lower))
    return local("On to the next round.", [{ kind: "start_round" }]);
  if (/next turn|(their|his|her) turn|pass the turn/.test(lower))
    return local("Turn passed.", [{ kind: "advance_turn" }]);
  if (/whose turn/.test(lower)) {
    const current = players.find((p) => p.id === req.currentPlayer);
    return local(
      current ? `It's ${current.name}'s turn.` : "I haven't been tracking turns yet — say \"next turn\" to start.",
      []
    );
  }

  // Round wins
  const roundWin = lower.match(/(\w+)\s+(?:won|wins|takes)\s+(?:the\s+)?round/);
  if (roundWin && name(roundWin[1]))
    return local(`Round to ${name(roundWin[1])}!`, [
      { kind: "win_round", player: roundWin[1] },
    ]);

  // Game win
  const gameWin = lower.match(/(\w+)\s+(?:won|wins|takes)\s+(?:the\s+)?(game|it all)/);
  if (gameWin && name(gameWin[1]))
    return local(`🏆 ${name(gameWin[1])} takes it!`, [
      { kind: "finish_game", winners: [gameWin[1]] },
    ]);
  if (/^(end|finish) (the )?game/.test(lower))
    return local("Calling it — final scores are on the board.", [
      { kind: "finish_game" },
    ]);

  // Notes & house rules
  const note = text.match(/^note:?\s+(.+)/i);
  if (note) return local("Noted.", [{ kind: "add_note", text: note[1] }]);
  const rule = text.match(/^house rule:?\s+(.+)/i);
  if (rule)
    return local("House rule saved.", [{ kind: "add_house_rule", rule: rule[1] }]);

  // "give five points to Erin" / "give Erin 5 points" / "give Erin 5"
  const giveTo = lower.match(/give\s+([\d,]+|\w+)\s*(?:points?|pts)?\s+to\s+(\w+)/);
  const giveWho = lower.match(/give\s+(\w+)\s+([\d,]+|\w+)\s*(?:points?|pts)?\s*$/);
  const give = giveTo
    ? { n: parseNumber(giveTo[1]), who: giveTo[2] }
    : giveWho
      ? { n: parseNumber(giveWho[2]), who: giveWho[1] }
      : null;
  if (give && give.n != null && name(give.who)) {
    return local(`+${give.n} to ${name(give.who)}.`, [
      { kind: "adjust_score", player: give.who, delta: give.n },
    ]);
  }

  // "set Erin to 18"
  const set = lower.match(/set\s+(\w+)(?:'s score)?\s+to\s+(-?[\d,]+)/);
  if (set && name(set[1])) {
    const n = parseNumber(set[2]);
    if (n != null)
      return local(`${name(set[1])} set to ${n}.`, [
        { kind: "set_score", player: set[1], value: n },
      ]);
  }

  // "Trip gets 12" / "Erin loses three" / "Trip +5" / "minus 2 for Erin"
  const gain = lower.match(
    /(\w+)\s+(?:gets?|scores?|gains?|earns?|adds?|\+)\s*([\d,]+|\w+)/
  );
  if (gain && name(gain[1])) {
    const n = parseNumber(gain[2]);
    if (n != null)
      return local(`+${n} to ${name(gain[1])}.`, [
        { kind: "adjust_score", player: gain[1], delta: n },
      ]);
  }
  const lose = lower.match(
    /(\w+)\s+(?:loses?|drops?|minus|-)\s*([\d,]+|\w+)/
  );
  if (lose && name(lose[1])) {
    const n = parseNumber(lose[2]);
    if (n != null)
      return local(`−${n} from ${name(lose[1])}.`, [
        { kind: "adjust_score", player: lose[1], delta: -n },
      ]);
  }

  // Score questions
  if (/score|standing|who'?s winning|leader/.test(lower)) {
    const scores = players
      .map((p) => `${p.name} ${req.scores?.[p.id] ?? 0}`)
      .join(", ");
    return local(scores ? `Current scores: ${scores}.` : "No scores yet.", []);
  }

  return local(
    'I didn\'t catch that. Try "Trip gets 12", "undo", "next round", or "roll 2d6". (Add a GEMINI_API_KEY to unlock full conversation.)',
    [],
    undefined,
    ["What's the score?", "Whose turn is it?", "Next round", "Roll 2d6"]
  );
}

function local(
  reply: string,
  actions: AiAction[],
  draft?: SetupDraft,
  suggestions: string[] = []
): InterpretResponse {
  return { reply, actions, draft, suggestions, provider: "local" };
}

function title(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
