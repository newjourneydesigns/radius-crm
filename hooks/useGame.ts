"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveState,
  findPlayer,
  newId,
  nextRedoTarget,
  nextUndoTarget,
} from "@/lib/engine";
import { loadGame, saveGame } from "@/lib/store";
import { flipCoin, pickRandom, rollDice } from "@/lib/tools";
import {
  AiAction,
  ChatMessage,
  EventSource,
  GameEvent,
  InterpretResponse,
  StoredGame,
} from "@/lib/types";

// Omit must distribute across the event union to keep the discriminant.
type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;
type NewEvent = DistributiveOmit<GameEvent, "id" | "ts">;

export function useGame(id: string) {
  const [game, setGame] = useState<StoredGame | null | undefined>(undefined);
  const [thinking, setThinking] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<AiAction[]>([]);
  const gameRef = useRef<StoredGame | null>(null);

  useEffect(() => {
    const g = loadGame(id);
    gameRef.current = g;
    setGame(g);
  }, [id]);

  const state = useMemo(
    () => (game ? deriveState(game.events) : null),
    [game]
  );

  const mutate = useCallback((fn: (g: StoredGame) => void) => {
    const g = gameRef.current;
    if (!g) return;
    const next: StoredGame = {
      ...g,
      events: [...g.events],
      messages: [...g.messages],
    };
    fn(next);
    gameRef.current = next;
    saveGame(next);
    setGame(next);
  }, []);

  const append = useCallback(
    (e: NewEvent) => {
      mutate((g) => {
        g.events.push({ ...e, id: newId(), ts: Date.now() } as GameEvent);
      });
    },
    [mutate]
  );

  const say = useCallback(
    (role: ChatMessage["role"], text: string) => {
      mutate((g) => {
        g.messages.push({ role, text, ts: Date.now() });
      });
    },
    [mutate]
  );

  const undo = useCallback(
    (source: EventSource = "manual") => {
      const g = gameRef.current;
      if (!g) return false;
      const target = nextUndoTarget(g.events);
      if (!target) return false;
      append({ type: "undo", targetId: target.id, source });
      return true;
    },
    [append]
  );

  const redo = useCallback(
    (source: EventSource = "manual") => {
      const g = gameRef.current;
      if (!g) return false;
      const target = nextRedoTarget(g.events);
      if (!target) return false;
      append({ type: "redo", targetId: target.id, source });
      return true;
    },
    [append]
  );

  /** Turn interpreter actions into events. Returns follow-up chat lines. */
  const applyActions = useCallback(
    (actions: AiAction[], source: EventSource, transcript?: string): string[] => {
      const extra: string[] = [];
      for (const a of actions) {
        const g = gameRef.current;
        const st = g ? deriveState(g.events) : null;
        if (!st) break;
        const player = (like: string) => findPlayer(st.players, like);
        switch (a.kind) {
          case "adjust_score": {
            const p = player(a.player);
            if (p)
              append({ type: "score_adjusted", playerId: p.id, delta: a.delta, reason: a.reason, source, transcript });
            break;
          }
          case "set_score": {
            const p = player(a.player);
            if (p)
              append({ type: "score_set", playerId: p.id, value: a.value, reason: a.reason, source, transcript });
            break;
          }
          case "undo":
            undo(source);
            break;
          case "redo":
            redo(source);
            break;
          case "start_round":
            append({ type: "round_started", round: st.round + 1, source, transcript });
            break;
          case "win_round": {
            const p = player(a.player);
            if (p) append({ type: "round_won", playerId: p.id, source, transcript });
            break;
          }
          case "advance_turn":
            append({ type: "turn_advanced", source, transcript });
            break;
          case "roll_dice": {
            const r = rollDice(a.spec);
            if (r) {
              append({ type: "dice_rolled", spec: r.spec, rolls: r.rolls, modifier: r.modifier, total: r.total, source, transcript });
              extra.push(`🎲 ${r.spec}: ${r.rolls.join(" + ")}${r.modifier ? ` ${r.modifier > 0 ? "+" : "−"} ${Math.abs(r.modifier)}` : ""} = **${r.total}**`);
            }
            break;
          }
          case "flip_coin": {
            const result = flipCoin();
            append({ type: "coin_flipped", result, source, transcript });
            extra.push(`🪙 ${result === "heads" ? "Heads!" : "Tails!"}`);
            break;
          }
          case "pick_player": {
            const p = pickRandom(st.players);
            if (p) {
              append({ type: "player_picked", playerId: p.id, source, transcript });
              extra.push(`👉 ${p.name}!`);
            }
            break;
          }
          case "add_note":
            append({ type: "note_added", text: a.text, source, transcript });
            break;
          case "add_house_rule":
            append({ type: "house_rule_added", rule: a.rule, source, transcript });
            break;
          case "finish_game": {
            const winners =
              a.winners
                ?.map((w) => player(w)?.id)
                .filter((x): x is string => !!x) ?? st.leaderIds;
            append({ type: "game_finished", winnerIds: winners, source, transcript });
            break;
          }
          case "create_game":
            break; // only valid during setup
        }
      }
      return extra;
    },
    [append, undo, redo]
  );

  /** Send an utterance (typed or spoken) to the interpreter. */
  const send = useCallback(
    async (text: string, source: EventSource, image?: string) => {
      const g = gameRef.current;
      const st = g ? deriveState(g.events) : null;
      if (!g || !st || thinking) return;
      say("user", text || (image ? "📷 (photo)" : ""));
      setThinking(true);
      try {
        const res = await fetch("/api/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "play",
            messages: [...g.messages, { role: "user", text, ts: Date.now() }].slice(-20),
            definition: st.definition,
            players: st.players.map((p) => ({ id: p.id, name: p.name })),
            scores: Object.fromEntries(st.players.map((p) => [p.id, p.score])),
            round: st.round,
            currentPlayer:
              st.players.find((p) => p.id === st.currentPlayerId)?.name ?? null,
            image,
          }),
        });
        if (!res.ok) throw new Error(`Interpreter error ${res.status}`);
        const data = (await res.json()) as InterpretResponse;
        const extra = applyActions(data.actions, source, text);
        say("assistant", [data.reply, ...extra].filter(Boolean).join("\n"));
        if (data.proposals?.length) setPendingProposals(data.proposals);
      } catch {
        say(
          "assistant",
          "I couldn't reach the interpreter just now — scores are safe, try that again in a second."
        );
      } finally {
        setThinking(false);
      }
    },
    [applyActions, say, thinking]
  );

  const confirmProposals = useCallback(() => {
    const extra = applyActions(pendingProposals, "vision");
    setPendingProposals([]);
    say("assistant", ["Applied the correction." , ...extra].join("\n"));
  }, [applyActions, pendingProposals, say]);

  const dismissProposals = useCallback(() => {
    setPendingProposals([]);
    say("assistant", "No problem — leaving the scores as they are.");
  }, [say]);

  const canUndo = game ? nextUndoTarget(game.events) !== null : false;
  const canRedo = game ? nextRedoTarget(game.events) !== null : false;

  return {
    game,
    state,
    thinking,
    send,
    append,
    say,
    undo,
    redo,
    canUndo,
    canRedo,
    applyActions,
    pendingProposals,
    confirmProposals,
    dismissProposals,
  };
}
