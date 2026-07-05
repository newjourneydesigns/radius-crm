/**
 * Engine + parser unit tests. Run with: npx tsx tests/engine.test.ts
 * Exits non-zero on the first failure.
 */
import {
  deriveState,
  findPlayer,
  inactiveEventIds,
  nextRedoTarget,
  nextUndoTarget,
} from "../lib/engine";
import { localPlay, localSetup } from "../lib/localParser";
import { lookupGame } from "../lib/registry";
import { rollDice } from "../lib/tools";
import {
  ChatMessage,
  GameDefinition,
  GameEvent,
  InterpretRequest,
} from "../lib/types";

let n = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  n++;
  if (!cond) {
    console.error(`✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
    process.exit(1);
  }
  console.log(`✓ ${name}`);
}

let seq = 0;
function ev(partial: Record<string, unknown>): GameEvent {
  return { id: `e${++seq}`, ts: seq, source: "manual", ...partial } as GameEvent;
}

const DEF: GameDefinition = {
  name: "Test Game",
  known: false,
  scoring: { direction: "highest_wins", targetScore: 20 },
  winCondition: "First to 20.",
  specialRules: [],
};

const PLAYERS = [
  { id: "p1", name: "Trip" },
  { id: "p2", name: "Erin" },
  { id: "p3", name: "Ashlyn" },
];

function created(def = DEF) {
  return ev({ type: "game_created", definition: def, players: PLAYERS });
}

// ---------- scoring & derivation ----------
{
  const events = [
    created(),
    ev({ type: "score_adjusted", playerId: "p1", delta: 12 }),
    ev({ type: "score_adjusted", playerId: "p2", delta: -3 }),
    ev({ type: "score_set", playerId: "p3", value: 7 }),
  ];
  const st = deriveState(events)!;
  check("scores derive", st.players.map((p) => p.score).join(",") === "12,-3,7");
  check("leader is Trip", st.leaderIds.join() === "p1");
  check("no target yet", st.targetReachedBy === null);
}

// ---------- undo / redo semantics ----------
{
  const base = [
    created(),
    ev({ type: "score_adjusted", playerId: "p1", delta: 5 }), // A
    ev({ type: "score_adjusted", playerId: "p2", delta: 3 }), // B
  ];
  const A = base[1], B = base[2];

  check("undo targets B first", nextUndoTarget(base)?.id === B.id);

  const undoB = ev({ type: "undo", targetId: B.id });
  const afterUndo = [...base, undoB];
  check("B inactive after undo", inactiveEventIds(afterUndo).has(B.id));
  check("undo now targets A", nextUndoTarget(afterUndo)?.id === A.id);
  check("redo targets the undo", nextRedoTarget(afterUndo)?.id === undoB.id);
  check("state drops B", deriveState(afterUndo)!.players[1].score === 0);

  const redo = ev({ type: "redo", targetId: undoB.id });
  const afterRedo = [...afterUndo, redo];
  check("B active after redo", !inactiveEventIds(afterRedo).has(B.id));
  check("state restores B", deriveState(afterRedo)!.players[1].score === 3);
  check("no redo left", nextRedoTarget(afterRedo) === null);

  // New action after an undo clears the redo stack.
  const fresh = [...afterUndo, ev({ type: "score_adjusted", playerId: "p3", delta: 1 })];
  check("new action clears redo", nextRedoTarget(fresh) === null);

  // Two undos then two redos restores everything.
  const undoA = ev({ type: "undo", targetId: A.id });
  const both = [...afterUndo, undoA];
  const r1 = nextRedoTarget(both)!;
  const both2 = [...both, ev({ type: "redo", targetId: r1.id })];
  const r2 = nextRedoTarget(both2)!;
  const both3 = [...both2, ev({ type: "redo", targetId: r2.id })];
  const st = deriveState(both3)!;
  check("double undo/redo restores", st.players[0].score === 5 && st.players[1].score === 3);
}

// ---------- rounds, turns, round-win points ----------
{
  const def: GameDefinition = {
    ...DEF,
    scoring: { direction: "highest_wins", roundWinPoints: 2 },
  };
  const events = [
    created(def),
    ev({ type: "turn_advanced" }),
    ev({ type: "round_won", playerId: "p2" }),
    ev({ type: "round_started", round: 2 }),
  ];
  const st = deriveState(events)!;
  check("round advanced", st.round === 2);
  check("round start resets turn", st.currentPlayerId === "p1");
  check("round win grants points", st.players[1].score === 2 && st.players[1].roundsWon === 1);
}

// ---------- target detection: highest wins ----------
{
  const events = [created(), ev({ type: "score_adjusted", playerId: "p2", delta: 21 })];
  const st = deriveState(events)!;
  check("highest_wins target reached", st.targetReachedBy === "p2");
}

// ---------- target detection: lowest wins (Hearts-style ceiling) ----------
{
  const hearts: GameDefinition = {
    name: "Hearts",
    known: true,
    scoring: { direction: "lowest_wins", targetScore: 100 },
    winCondition: "At 100, lowest wins.",
    specialRules: [],
  };
  const low = [created(hearts), ev({ type: "score_adjusted", playerId: "p1", delta: 5 })];
  const stLow = deriveState(low)!;
  check(
    "lowest_wins: 5 points does NOT end the game",
    stLow.targetReachedBy === null,
    stLow.targetReachedBy
  );
  const high = [...low, ev({ type: "score_adjusted", playerId: "p2", delta: 101 })];
  const stHigh = deriveState(high)!;
  check("lowest_wins: crossing 100 ends the game", stHigh.targetReachedBy === "p2");
  check("lowest_wins: leader is lowest scorer", stHigh.leaderIds.join() === "p3" || stHigh.leaderIds.join() === "p3", stHigh.leaderIds);
}

// ---------- finish & winners ----------
{
  const events = [
    created(),
    ev({ type: "score_adjusted", playerId: "p1", delta: 9 }),
    ev({ type: "game_finished", winnerIds: ["p1"] }),
  ];
  const st = deriveState(events)!;
  check("finished with winner", st.finished && st.winnerIds.join() === "p1");
}

// ---------- player matching ----------
{
  check("fuzzy prefix match", findPlayer(PLAYERS, "ash")?.id === "p3");
  check("exact beats prefix", findPlayer([{ id: "a", name: "Al" }, { id: "b", name: "Alice" }], "al")?.id === "a");
  check("no match", findPlayer(PLAYERS, "zzz") === null);
}

// ---------- dice ----------
{
  const r = rollDice("2d6+3")!;
  check("dice count", r.rolls.length === 2);
  check("dice bounds", r.rolls.every((x) => x >= 1 && x <= 6));
  check("dice modifier", r.total === r.rolls[0] + r.rolls[1] + 3);
  check("advantage parses", rollDice("d20 advantage")!.mode === "advantage");
  check("garbage rejected", rollDice("banana") === null);
}

// ---------- registry ----------
{
  check("catan known", lookupGame("Catan")?.scoring.targetScore === 10);
  check("fuzzy contains", lookupGame("settlers of catan")?.name === "Catan");
  check("unknown game", lookupGame("Flooble") === null);
}

// ---------- local parser: play phase ----------
function play(text: string, extras: Partial<InterpretRequest> = {}) {
  const msg: ChatMessage = { role: "user", text, ts: 1 };
  return localPlay({
    phase: "play",
    messages: [msg],
    players: PLAYERS,
    scores: { p1: 12, p2: 0, p3: 0 },
    currentPlayer: "p1",
    ...extras,
  });
}
{
  check("gets N", JSON.stringify(play("Trip gets 12").actions) === JSON.stringify([{ kind: "adjust_score", player: "trip", delta: 12 }]));
  check("loses word-number", JSON.stringify(play("Erin loses three").actions[0]) === JSON.stringify({ kind: "adjust_score", player: "erin", delta: -3 }));
  check("give N to X", JSON.stringify(play("give 25 points to Ashlyn").actions[0]) === JSON.stringify({ kind: "adjust_score", player: "ashlyn", delta: 25 }));
  check("give X N", JSON.stringify(play("give ashlyn 25").actions[0]) === JSON.stringify({ kind: "adjust_score", player: "ashlyn", delta: 25 }));
  check("set to", JSON.stringify(play("set Erin to 18").actions[0]) === JSON.stringify({ kind: "set_score", player: "erin", value: 18 }));
  check("plus shorthand", JSON.stringify(play("trip +5").actions[0]) === JSON.stringify({ kind: "adjust_score", player: "trip", delta: 5 }));
  check("undo", play("undo that").actions[0].kind === "undo");
  check("redo", play("redo").actions[0].kind === "redo");
  check("next round", play("start the next round").actions[0].kind === "start_round");
  check("round win", JSON.stringify(play("Ashlyn won the round").actions[0]) === JSON.stringify({ kind: "win_round", player: "ashlyn" }));
  check("game win", play("Trip wins the game").actions[0].kind === "finish_game");
  check("roll", play("roll 2d6").actions[0].kind === "roll_dice");
  check("coin", play("flip a coin").actions[0].kind === "flip_coin");
  check("pick", play("pick a player").actions[0].kind === "pick_player");
  check("note", JSON.stringify(play("note: Erin dealt twice").actions[0]) === JSON.stringify({ kind: "add_note", text: "Erin dealt twice" }));
  check("house rule", play("house rule: draw 4 stacks").actions[0].kind === "add_house_rule");
  check("whose turn answers", play("whose turn is it?").reply.includes("Trip"));
  check("score question answers", play("what's the score?").reply.includes("Trip 12"));
  check("unknown is graceful", play("blorp the fizz").actions.length === 0);
}

// ---------- local parser: setup phase ----------
function setup(texts: string[], draft?: any) {
  let d = draft;
  let res: any;
  const history: ChatMessage[] = [];
  for (const t of texts) {
    history.push({ role: "user", text: t, ts: 1 });
    res = localSetup({ phase: "setup", messages: [...history], draft: d });
    d = res.draft;
    history.push({ role: "assistant", text: res.reply, ts: 2 });
  }
  return res;
}
{
  const oneShot = setup(["We're playing Uno with Trip, Erin and Ashlyn"]);
  const create = oneShot.actions[0];
  check("one-breath known game creates", create?.kind === "create_game");
  check("one-breath player names", create.players.map((p: any) => p.name).join() === "Trip,Erin,Ashlyn");
  check("one-breath uses registry", create.definition.scoring.targetScore === 500);

  const twoStep = setup(["We're playing Catan", "Trip and Erin"]);
  check("two-step creates", twoStep.actions[0]?.kind === "create_game");

  const custom = setup([
    "We're playing Flooble",
    "Trip, Erin",
    "highest",
    "play to 50",
  ]);
  const cdef = custom.actions[0]?.definition;
  check("custom game creates", custom.actions[0]?.kind === "create_game");
  check("custom direction", cdef.scoring.direction === "highest_wins");
  check("custom target", cdef.scoring.targetScore === 50);
  check("custom marked unknown", cdef.known === false);

  const madeUp = setup(["We're making up a game"]);
  check("made-up game asks for a name", madeUp.actions.length === 0 && /call|name/i.test(madeUp.reply), madeUp.reply);
  const named = setup(["We're making up a game", "Kitchen Chaos", "Trip and Erin", "lowest", "no target"]);
  const ndef = named.actions[0]?.definition;
  check("made-up game gets named", ndef?.name === "Kitchen Chaos", ndef?.name);
  check("made-up lowest wins", ndef.scoring.direction === "lowest_wins");
}

console.log(`\nAll ${n} checks passed.`);
