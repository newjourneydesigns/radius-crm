import { findPlayer } from "./engine";
import { lookupGame } from "./registry";
import {
  AiAction,
  GameDefinition,
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

/** "Trip, Erin and Bob (guest)" → names, with guests flagged. */
function splitNames(raw: string): { name: string; guest: boolean }[] {
  return raw
    .split(/,|\band\b|&/i)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 0 && s.length < 40)
    .map((s) => {
      const guest = /\(\s*guest\s*\)$/i.test(s);
      return { name: s.replace(/\s*\(\s*guest\s*\)$/i, "").trim(), guest };
    })
    .filter((p) => p.name.length > 0);
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
    if (m?.[2]) applyPlayers(draft, splitNames(m[2]));

    const known = lookupGame(draft.name);
    if (known) {
      draft.name = known.name;
      draft.direction = known.scoring.direction;
      draft.targetScore = known.scoring.targetScore ?? null;
      draft.step = "players";
      if (draft.playerNames?.length) {
        return askHouseRules(draft);
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
    // A game-name phrase isn't a players answer — re-ask instead of seating
    // "We're Playing Catan" at the table.
    if (/^(we'?re playing|let'?s play|we are playing)\b/i.test(text.trim())) {
      return local(`${draft.name} it is. Who's playing?`, [], draft);
    }
    const names = splitNames(text);
    if (!names.length) {
      return local("Give me the player names, like \"Trip, Erin and Ashlyn\".", [], draft);
    }
    applyPlayers(draft, names);
    // Starting from a saved favorite: the definition (house rules included)
    // is already known, so the table is ready as soon as we have players.
    if (draft.definition) {
      return finishSetup(draft);
    }
    if (draft.direction) {
      return askHouseRules(draft);
    }
    draft.step = "direction";
    return local(
      `Got it — ${draft.playerNames!.join(", ")}. Does the highest score win, or the lowest?`,
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
    return askHouseRules(draft);
  }

  // Step 5 — house rules
  if (draft.step === "rules") {
    draft.houseRules = /^(no|none|nope|nah)/i.test(lower)
      ? []
      : text
          .replace(/^house rules?:?\s*/i, "")
          .split(";")
          .map((r) => r.trim())
          .filter(Boolean);
    return finishSetup(draft);
  }

  return finishSetup(draft);
}

function applyPlayers(
  draft: SetupDraft,
  players: { name: string; guest: boolean }[]
) {
  draft.playerNames = players.map((p) => p.name);
  draft.guests = players.filter((p) => p.guest).map((p) => p.name);
}

function askHouseRules(draft: SetupDraft): InterpretResponse {
  draft.step = "rules";
  return local(
    "Any house rules tonight? Tell me, or say \"no house rules\".",
    [],
    draft,
    ["No house rules"]
  );
}

function finishSetup(draft: SetupDraft): InterpretResponse {
  const base = draft.definition ?? lookupGame(draft.name ?? "");
  const houseRules = draft.houseRules ?? [];
  const definition: GameDefinition = base
    ? {
        ...base,
        specialRules: [...base.specialRules, ...houseRules],
      }
    : {
        name: draft.name ?? "House Game",
        known: false,
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
        specialRules: houseRules,
      };
  const guests = draft.guests ?? [];
  const players = (draft.playerNames ?? []).map((name) => ({
    name,
    guest: guests.includes(name) || undefined,
  }));
  const action: AiAction = { kind: "create_game", definition, players };
  const rulesNote = definition.specialRules.length
    ? ` House rules noted (${definition.specialRules.length}).`
    : "";
  return {
    reply: `Table's set — ${definition.name} with ${players
      .map((p) => (p.guest ? `${p.name} (guest)` : p.name))
      .join(", ")}.${rulesNote} Say things like "${players[0]?.name ?? "Trip"} gets 12" and I'll keep score. Good luck!`,
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

  // "set a timer for 2 minutes" / "30 second timer" / "start a timer"
  const timer = lower.match(
    /(?:(\d+)\s*(seconds?|secs?|minutes?|mins?)\s+timer)|(?:timer\s*(?:for)?\s*(\d+)?\s*(seconds?|secs?|minutes?|mins?)?)/
  );
  if (/timer/.test(lower) && timer) {
    const n = parseNumber(timer[1] ?? timer[3] ?? "") ?? 1;
    const unit = timer[2] ?? timer[4] ?? "minutes";
    const seconds = /min|^m/.test(unit) ? n * 60 : n;
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    const label = mm
      ? `${mm}:${String(ss).padStart(2, "0")}`
      : `${ss} second${ss === 1 ? "" : "s"}`;
    return local(`⏱ Timer set — ${label}. I'll chime when it's up.`, [
      { kind: "start_timer", seconds },
    ]);
  }
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
