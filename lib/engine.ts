import {
  GameDefinition,
  GameEvent,
  GameState,
  LogLine,
  Player,
  PlayerState,
  UNDOABLE_TYPES,
} from "./types";

export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

/**
 * Undo/redo are events like everything else. An `undo` deactivates its
 * target; a `redo` deactivates a specific `undo`, which reactivates that
 * undo's target. Walking the log in order yields the set of inactive events.
 */
export function inactiveEventIds(events: GameEvent[]): Set<string> {
  const inactive = new Set<string>();
  const undoTargets = new Map<string, string>(); // undo event id -> target id
  for (const e of events) {
    if (e.type === "undo") {
      inactive.add(e.targetId);
      undoTargets.set(e.id, e.targetId);
    } else if (e.type === "redo") {
      const target = undoTargets.get(e.targetId);
      if (target) {
        inactive.delete(target);
        inactive.add(e.targetId); // the undo itself is now spent
      }
    }
  }
  return inactive;
}

/** The event an "undo" should target right now, or null if nothing to undo. */
export function nextUndoTarget(events: GameEvent[]): GameEvent | null {
  const inactive = inactiveEventIds(events);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (inactive.has(e.id)) continue;
    if (UNDOABLE_TYPES.includes(e.type)) return e;
  }
  return null;
}

/** The `undo` event a "redo" should target right now, or null. */
export function nextRedoTarget(events: GameEvent[]): GameEvent | null {
  const inactive = inactiveEventIds(events);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "undo" && !inactive.has(e.id)) return e;
    // Any new undoable action clears the redo stack, like a text editor.
    if (UNDOABLE_TYPES.includes(e.type) && !inactive.has(e.id)) return null;
  }
  return null;
}

function describe(e: GameEvent, names: Map<string, string>): string {
  const name = (id?: string) => (id ? names.get(id) ?? "Someone" : "Someone");
  switch (e.type) {
    case "game_created":
      return `Game started: ${e.definition.name}`;
    case "score_adjusted":
      return `${name(e.playerId)} ${e.delta >= 0 ? "+" : "−"}${Math.abs(e.delta)}${e.reason ? ` (${e.reason})` : ""}`;
    case "score_set":
      return `${name(e.playerId)} set to ${e.value}${e.reason ? ` (${e.reason})` : ""}`;
    case "round_started":
      return `Round ${e.round} started`;
    case "round_won":
      return `${name(e.playerId)} won the round`;
    case "turn_advanced":
      return `${name(e.playerId)}'s turn`;
    case "note_added":
      return `Note: ${e.text}`;
    case "house_rule_added":
      return `House rule: ${e.rule}`;
    case "dice_rolled":
      return `Rolled ${e.spec}: ${e.rolls.join(" + ")}${e.modifier ? ` ${e.modifier > 0 ? "+" : "−"} ${Math.abs(e.modifier)}` : ""} = ${e.total}`;
    case "coin_flipped":
      return `Coin flip: ${e.result}`;
    case "player_picked":
      return `Picked ${name(e.playerId)}`;
    case "game_finished":
      return `Game over — ${e.winnerIds.map((id) => name(id)).join(" & ")} won`;
    case "undo":
      return "Undo";
    case "redo":
      return "Redo";
  }
}

export function deriveState(events: GameEvent[]): GameState | null {
  const created = events.find((e) => e.type === "game_created") as
    | Extract<GameEvent, { type: "game_created" }>
    | undefined;
  if (!created) return null;

  const definition: GameDefinition = created.definition;
  const basePlayers: Player[] = created.players;
  const players: PlayerState[] = basePlayers.map((p) => ({
    ...p,
    score: 0,
    roundsWon: 0,
  }));
  const byId = new Map(players.map((p) => [p.id, p]));
  const names = new Map(players.map((p) => [p.id, p.name]));

  const inactive = inactiveEventIds(events);
  let round = 1;
  let turnIndex = 0;
  let finished = false;
  let winnerIds: string[] = [];
  const notes: string[] = [];
  const houseRules: string[] = [...definition.specialRules];
  const log: LogLine[] = [];

  for (const e of events) {
    if (e.type === "undo" || e.type === "redo") continue;
    const undone = inactive.has(e.id);
    if (e.type !== "game_created") {
      log.push({ eventId: e.id, ts: e.ts, text: describe(e, names), undone });
    }
    if (undone) continue;

    switch (e.type) {
      case "score_adjusted": {
        const p = byId.get(e.playerId);
        if (p) p.score += e.delta;
        break;
      }
      case "score_set": {
        const p = byId.get(e.playerId);
        if (p) p.score = e.value;
        break;
      }
      case "round_started":
        round = e.round;
        turnIndex = 0;
        break;
      case "round_won": {
        const p = byId.get(e.playerId);
        if (p) {
          p.roundsWon += 1;
          if (definition.scoring.roundWinPoints) {
            p.score += definition.scoring.roundWinPoints;
          }
        }
        break;
      }
      case "turn_advanced":
        if (e.playerId) {
          const idx = players.findIndex((p) => p.id === e.playerId);
          if (idx >= 0) turnIndex = idx;
        } else {
          turnIndex = (turnIndex + 1) % players.length;
        }
        break;
      case "note_added":
        notes.push(e.text);
        break;
      case "house_rule_added":
        houseRules.push(e.rule);
        break;
      case "game_finished":
        finished = true;
        winnerIds = e.winnerIds;
        break;
      default:
        break;
    }
  }

  const dir = definition.scoring.direction;
  const best =
    dir === "lowest_wins"
      ? Math.min(...players.map((p) => p.score))
      : Math.max(...players.map((p) => p.score));
  const anyScored = players.some((p) => p.score !== 0);
  const leaderIds = anyScored
    ? players.filter((p) => p.score === best).map((p) => p.id)
    : [];

  let targetReachedBy: string | null = null;
  const target = definition.scoring.targetScore;
  if (!finished && target != null) {
    const reached = players.find((p) =>
      dir === "lowest_wins" ? p.score <= target && anyScored : p.score >= target
    );
    if (reached) targetReachedBy = reached.id;
  }

  return {
    definition,
    players,
    round,
    turnIndex,
    currentPlayerId: players[turnIndex]?.id ?? null,
    finished,
    winnerIds,
    notes,
    houseRules,
    log,
    leaderIds,
    targetReachedBy,
  };
}

/** Case-insensitive, prefix-tolerant player lookup ("ash" -> "Ashlyn"). */
export function findPlayer(players: Player[], nameLike: string): Player | null {
  const q = nameLike.trim().toLowerCase();
  if (!q) return null;
  return (
    players.find((p) => p.name.toLowerCase() === q) ??
    players.find((p) => p.name.toLowerCase().startsWith(q)) ??
    players.find((p) => p.name.toLowerCase().includes(q)) ??
    null
  );
}
