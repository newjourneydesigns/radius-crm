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
import * as store from "../lib/store";
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
  check("timer with minutes", JSON.stringify(play("set a timer for 2 minutes").actions[0]) === JSON.stringify({ kind: "start_timer", seconds: 120 }));
  check("timer with seconds", JSON.stringify(play("30 second timer").actions[0]) === JSON.stringify({ kind: "start_timer", seconds: 30 }));
  check("bare timer defaults to a minute", JSON.stringify(play("start a timer").actions[0]) === JSON.stringify({ kind: "start_timer", seconds: 60 }));
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
  const asksRules = setup(["We're playing Uno with Trip, Erin and Ashlyn"]);
  check("setup asks about house rules", /house rules/i.test(asksRules.reply), asksRules.reply);
  check("house-rules step has a skip chip", asksRules.suggestions?.includes("No house rules"));

  const oneShot = setup(["We're playing Uno with Trip, Erin and Ashlyn", "no house rules"]);
  const create = oneShot.actions[0];
  check("one-breath known game creates", create?.kind === "create_game");
  check("one-breath player names", create.players.map((p: any) => p.name).join() === "Trip,Erin,Ashlyn");
  check("one-breath uses registry", create.definition.scoring.targetScore === 500);

  const twoStep = setup(["We're playing Catan", "Trip and Erin", "none"]);
  check("two-step creates", twoStep.actions[0]?.kind === "create_game");

  const custom = setup([
    "We're playing Flooble",
    "Trip, Erin",
    "highest",
    "play to 50",
    "Draw two on ties; Jokers are wild",
  ]);
  const cdef = custom.actions[0]?.definition;
  check("custom game creates", custom.actions[0]?.kind === "create_game");
  check("custom direction", cdef.scoring.direction === "highest_wins");
  check("custom target", cdef.scoring.targetScore === 50);
  check("custom marked unknown", cdef.known === false);
  check("house rules captured in setup", cdef.specialRules.join("|") === "Draw two on ties|Jokers are wild", cdef.specialRules);

  const madeUp = setup(["We're making up a game"]);
  check("made-up game asks for a name", madeUp.actions.length === 0 && /call|name/i.test(madeUp.reply), madeUp.reply);
  const named = setup(["We're making up a game", "Kitchen Chaos", "Trip and Erin", "lowest", "no target", "no"]);
  const ndef = named.actions[0]?.definition;
  check("made-up game gets named", ndef?.name === "Kitchen Chaos", ndef?.name);
  check("made-up lowest wins", ndef.scoring.direction === "lowest_wins");

  // Guests play tonight, stay out of the roster.
  const guests = setup(["We're playing Uno with Trip and Bob (guest)", "no"]);
  const gplayers = guests.actions[0]?.players;
  check("guest flagged", gplayers?.find((p: any) => p.name === "Bob")?.guest === true, gplayers);
  check("non-guest unflagged", !gplayers?.find((p: any) => p.name === "Trip")?.guest);

  // Starting from a saved favorite: definition (house rules included) is
  // reused and setup only needs players — no rules re-ask.
  const favDef = {
    name: "Family Rummy",
    known: false,
    scoring: { direction: "highest_wins" as const, targetScore: 300 },
    winCondition: "First to 300.",
    specialRules: ["Aces high", "No first-turn melds"],
  };
  const favMsg: ChatMessage = { role: "user", text: "Trip and Erin", ts: 1 };
  const fav = localSetup({
    phase: "setup",
    messages: [favMsg],
    draft: { name: favDef.name, definition: favDef, step: "players" },
  });
  check("favorite creates without re-asking", fav.actions[0]?.kind === "create_game", fav.reply);
  check(
    "favorite keeps its house rules",
    fav.actions[0]?.definition.specialRules.join("|") === "Aces high|No first-turn melds"
  );
  check("favorite keeps target", fav.actions[0]?.definition.scoring.targetScore === 300);
}

// ---------- setup suggestions (tappable quick answers) ----------
{
  const dir = setup(["We're playing Flooble", "Trip, Erin"]);
  check(
    "direction step suggests chips",
    dir.suggestions?.join("|") === "Highest score wins|Lowest score wins",
    dir.suggestions
  );
  const chipFlow = setup([
    "We're playing Flooble",
    "Trip, Erin",
    "Highest score wins",
    "No target",
    "No house rules",
  ]);
  const cdef = chipFlow.actions[0]?.definition;
  check("chip answers create the game", chipFlow.actions[0]?.kind === "create_game");
  check("chip direction parsed", cdef.scoring.direction === "highest_wins");
  check("no-target chip parsed", cdef.scoring.targetScore === undefined);
  check("no-house-rules chip parsed", cdef.specialRules.length === 0);
  const target = setup(["We're playing Flooble", "Trip, Erin", "lowest"]);
  check("target step suggests no-target", target.suggestions?.includes("No target"));
  const lost = play("blorp the fizz");
  check("play fallback suggests safe examples", (lost.suggestions ?? []).includes("What's the score?"));
}

// ---------- share text + guest-free stats ----------
{
  const { buildShareText } = await_import_shareCard();
  const events = [
    created(),
    ev({ type: "score_adjusted", playerId: "p1", delta: 12 }),
    ev({ type: "score_adjusted", playerId: "p2", delta: 8 }),
    ev({ type: "game_finished", winnerIds: ["p1"] }),
  ];
  const st = deriveState(events)!;
  const text = buildShareText(st, 62 * 60000);
  check("share text leads with the winner", text.startsWith("🏆 Trip takes Test Game!"), text);
  check("share text has standings", text.includes("Trip: 12") && text.includes("Erin: 8"));
  check("share text has duration", text.includes("1h 2m"));

  const { buildInsights } = require("../lib/stats") as typeof import("../lib/stats");
  const guestGame = {
    id: "sg",
    createdAt: 1,
    updatedAt: 2,
    messages: [],
    events: [
      ev({
        type: "game_created",
        definition: DEF,
        players: [
          { id: "p1", name: "Trip" },
          { id: "p2", name: "Sam", guest: true },
        ],
      }),
      ev({ type: "score_adjusted", playerId: "p2", delta: 5 }),
      ev({ type: "game_finished", winnerIds: ["p2"] }),
    ],
  };
  const insights = buildInsights([guestGame as any]);
  check("guests stay out of standings", !insights.players.some((p) => p.name === "Sam"), insights.players);
  check("regulars still counted", insights.players.some((p) => p.name === "Trip"));
}

function await_import_shareCard() {
  return require("../lib/shareCard") as typeof import("../lib/shareCard");
}

// ---------- player roster (store) ----------
{
  // Minimal localStorage shim — store.ts only touches window.localStorage
  // inside function bodies, so installing the mock here is early enough.
  const mem = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
    },
  };

  store.upsertRosterNames(["Trip", "Erin"]);
  store.upsertRosterNames(["trip", "Ashlyn"]); // case-insensitive dedupe
  let roster = store.listRoster();
  check("roster upsert dedupes by case", roster.length === 3, roster.map((p) => p.name));

  check("add rejects duplicates", store.addRosterPlayer("ERIN") === false);
  check("add rejects empty", store.addRosterPlayer("   ") === false);
  check("add accepts new", store.addRosterPlayer("Zoe") === true);

  const zoe = store.listRoster().find((p) => p.name === "Zoe")!;
  store.toggleRegular(zoe.id);
  check("regular toggles on", store.listRoster().find((p) => p.id === zoe.id)!.regular);
  check("regulars sort first", store.listRoster()[0].id === zoe.id);

  // Rename propagates into stored game history.
  store.createGame(
    "g1",
    [
      {
        type: "game_created",
        id: "e1",
        ts: 1,
        source: "manual",
        definition: DEF,
        players: [
          { id: "p1", name: "Zoe" },
          { id: "p2", name: "Trip" },
        ],
      },
    ],
    []
  );
  check("rename works", store.renameRosterPlayer(zoe.id, "Zoey") === true);
  check(
    "rename updates roster",
    store.listRoster().some((p) => p.name === "Zoey") &&
      !store.listRoster().some((p) => p.name === "Zoe")
  );
  const g1 = store.loadGame("g1")!;
  const createdEv = g1.events[0] as Extract<GameEvent, { type: "game_created" }>;
  check("rename propagates to history", createdEv.players[0].name === "Zoey");

  // Rename onto an existing name merges the two entries.
  const erin = store.listRoster().find((p) => p.name === "Erin")!;
  store.toggleRegular(erin.id);
  const trip = store.listRoster().find((p) => p.name === "Trip")!;
  check("merge rename returns true", store.renameRosterPlayer(trip.id, "Erin") === true);
  roster = store.listRoster();
  check("merge collapses duplicates", roster.filter((p) => p.name === "Erin").length === 1);
  check("merge keeps regular flag", roster.find((p) => p.name === "Erin")!.regular);
  const g1b = store.loadGame("g1")!;
  const createdEvB = g1b.events[0] as Extract<GameEvent, { type: "game_created" }>;
  check("merge rename updates history too", createdEvB.players[1].name === "Erin");

  store.deleteRosterPlayer(zoe.id);
  check("delete removes from roster", !store.listRoster().some((p) => p.id === zoe.id));
  check("delete leaves history alone", store.loadGame("g1") !== null);

  // Seeding builds the roster from history when it's empty.
  mem.delete("aisk:players");
  store.seedRosterFromHistory();
  const seeded = store.listRoster().map((p) => p.name);
  check("seed from history", seeded.includes("Zoey") && seeded.includes("Erin"), seeded);
}

console.log(`\nAll ${n} checks passed.`);
