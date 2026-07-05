import { GameDefinition } from "./types";

/**
 * Built-in definitions for popular games so setup works instantly even
 * without an AI key. With a key, the model handles anything; this registry
 * is the offline floor, not the ceiling.
 */
const KNOWN: Record<string, Omit<GameDefinition, "known">> = {
  catan: {
    name: "Catan",
    scoring: { direction: "highest_wins", targetScore: 10 },
    winCondition: "First player to reach 10 victory points wins.",
    rulesSummary:
      "Build settlements (1 VP) and cities (2 VP), collect development cards, and claim Longest Road or Largest Army (2 VP each). First to 10 points on their turn wins.",
    specialRules: [],
  },
  uno: {
    name: "Uno",
    scoring: { direction: "highest_wins", targetScore: 500 },
    winCondition:
      "Round winner scores the value of cards left in opponents' hands. First to 500 wins.",
    rulesSummary:
      "Match the top card by color or number. Say 'Uno' at one card left. Round winner collects points from everyone else's remaining cards.",
    specialRules: [],
  },
  scrabble: {
    name: "Scrabble",
    scoring: { direction: "highest_wins" },
    winCondition: "Highest total score when tiles run out wins.",
    rulesSummary:
      "Form words on the board; letter values plus premium squares score each play. Using all seven tiles earns a 50-point bingo.",
    specialRules: [],
  },
  yahtzee: {
    name: "Yahtzee",
    scoring: { direction: "highest_wins", rounds: 13 },
    winCondition: "Highest grand total after 13 rounds wins.",
    rulesSummary:
      "Roll five dice up to three times per turn and fill one category per round. Upper section bonus at 63+; Yahtzee scores 50.",
    specialRules: [],
  },
  hearts: {
    name: "Hearts",
    scoring: { direction: "lowest_wins", targetScore: 100 },
    winCondition:
      "When someone reaches 100 points, the player with the fewest points wins.",
    rulesSummary:
      "Avoid taking hearts (1 point each) and the queen of spades (13). Taking all of them 'shoots the moon' and gives everyone else 26.",
    specialRules: [],
  },
  spades: {
    name: "Spades",
    scoring: { direction: "highest_wins", targetScore: 500 },
    winCondition: "First partnership to 500 points wins.",
    rulesSummary:
      "Bid tricks as a partnership; making the bid scores 10 per trick bid, overtricks score 1 each (bags), missing the bid loses 10 per trick bid.",
    specialRules: [],
  },
  farkle: {
    name: "Farkle",
    scoring: { direction: "highest_wins", targetScore: 10000 },
    winCondition: "First player to 10,000 points wins.",
    rulesSummary:
      "Roll six dice and bank scoring dice (1s = 100, 5s = 50, triples and runs score more). Rolling no scorers is a farkle — you lose the turn's points.",
    specialRules: [],
  },
  rummy: {
    name: "Rummy",
    scoring: { direction: "highest_wins", targetScore: 500 },
    winCondition: "First player to 500 points wins.",
    rulesSummary:
      "Meld sets and runs; going out scores the deadwood left in opponents' hands.",
    specialRules: [],
  },
  "phase 10": {
    name: "Phase 10",
    scoring: { direction: "lowest_wins" },
    winCondition:
      "First to complete phase 10 wins; ties break by lowest score.",
    rulesSummary:
      "Complete ten phases in order (sets, runs, colors). Cards left in hand each round score against you.",
    specialRules: [],
  },
  cribbage: {
    name: "Cribbage",
    scoring: { direction: "highest_wins", targetScore: 121 },
    winCondition: "First player to peg 121 points wins.",
    rulesSummary:
      "Score during play (15s, pairs, runs) and by counting your hand and crib. First past 121 on the board wins immediately.",
    specialRules: [],
  },
  "ticket to ride": {
    name: "Ticket to Ride",
    scoring: { direction: "highest_wins" },
    winCondition: "Highest score after final scoring wins.",
    rulesSummary:
      "Claim train routes for points, complete destination tickets for bonuses (or penalties if unfinished), longest continuous route earns 10.",
    specialRules: [],
  },
  dominoes: {
    name: "Dominoes",
    scoring: { direction: "highest_wins", targetScore: 100 },
    winCondition: "First player to 100 points wins.",
    rulesSummary:
      "Score when the open ends total a multiple of five; going out earns the round's remaining pips (rounded to fives).",
    specialRules: [],
  },
  golf: {
    name: "Golf (card game)",
    scoring: { direction: "lowest_wins", rounds: 9 },
    winCondition: "Lowest total after 9 rounds wins.",
    rulesSummary:
      "Swap cards to minimize your layout's value; pairs in a column cancel out. Low score after nine 'holes' wins.",
    specialRules: [],
  },
  "skip-bo": {
    name: "Skip-Bo",
    scoring: { direction: "highest_wins", targetScore: 500 },
    winCondition:
      "Empty your stockpile to win the round (25 points + 5 per card left in others' stockpiles). First to 500 wins.",
    rulesSummary:
      "Play cards in sequence 1–12 onto shared building piles; the first player to empty their stockpile wins the round.",
    specialRules: [],
  },
  qwirkle: {
    name: "Qwirkle",
    scoring: { direction: "highest_wins" },
    winCondition: "Highest score when the bag runs out wins.",
    rulesSummary:
      "Place tiles sharing color or shape in lines; score one point per tile in each line touched, six-tile lines score a 12-point Qwirkle.",
    specialRules: [],
  },
};

export function lookupGame(nameLike: string): GameDefinition | null {
  const q = nameLike.trim().toLowerCase();
  if (!q) return null;
  const key =
    Object.keys(KNOWN).find((k) => k === q) ??
    Object.keys(KNOWN).find((k) => q.includes(k) || k.includes(q));
  if (!key) return null;
  return { ...KNOWN[key], known: true };
}
