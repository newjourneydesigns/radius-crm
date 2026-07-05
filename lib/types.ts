// ---------- Game definition ----------

export type ScoringDirection = "highest_wins" | "lowest_wins";

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
}

export interface GameScoring {
  direction: ScoringDirection;
  /** Game ends when a player reaches this score (if set). */
  targetScore?: number;
  /** Fixed number of rounds (if the game is round-based). */
  rounds?: number;
  /** Points granted automatically when a player "wins the round". */
  roundWinPoints?: number;
}

export interface GameDefinition {
  name: string;
  /** True when the AI (or built-in registry) recognized the game. */
  known: boolean;
  scoring: GameScoring;
  winCondition: string;
  /** Official rules in one or two sentences, for the rules assistant. */
  rulesSummary?: string;
  specialRules: string[];
  teams?: Team[];
}

export interface Player {
  id: string;
  name: string;
  teamId?: string;
  /** One-night players: play and score normally, stay out of the roster/stats. */
  guest?: boolean;
}

// ---------- Events (the source of truth) ----------

export type EventSource = "user_text" | "user_voice" | "ai" | "manual" | "vision";

interface BaseEvent {
  id: string;
  ts: number;
  source: EventSource;
  /** Raw utterance that produced this event, when it came from language. */
  transcript?: string;
}

export type GameEvent = BaseEvent &
  (
    | { type: "game_created"; definition: GameDefinition; players: Player[] }
    | { type: "score_adjusted"; playerId: string; delta: number; reason?: string }
    | { type: "score_set"; playerId: string; value: number; reason?: string }
    | { type: "round_started"; round: number }
    | { type: "round_won"; playerId: string }
    | { type: "turn_advanced"; playerId?: string }
    | { type: "note_added"; text: string }
    | { type: "house_rule_added"; rule: string }
    | { type: "dice_rolled"; spec: string; rolls: number[]; modifier: number; total: number }
    | { type: "coin_flipped"; result: "heads" | "tails" }
    | { type: "player_picked"; playerId: string }
    | { type: "game_finished"; winnerIds: string[] }
    | { type: "undo"; targetId: string }
    | { type: "redo"; targetId: string }
  );

export type GameEventType = GameEvent["type"];

/** Event types that undo can target. */
export const UNDOABLE_TYPES: GameEventType[] = [
  "score_adjusted",
  "score_set",
  "round_started",
  "round_won",
  "turn_advanced",
  "note_added",
  "house_rule_added",
  "game_finished",
];

// ---------- Derived state ----------

export interface PlayerState extends Player {
  score: number;
  roundsWon: number;
}

export interface LogLine {
  eventId: string;
  ts: number;
  text: string;
  undone: boolean;
}

export interface GameState {
  definition: GameDefinition;
  players: PlayerState[];
  round: number;
  turnIndex: number;
  currentPlayerId: string | null;
  finished: boolean;
  winnerIds: string[];
  notes: string[];
  houseRules: string[];
  log: LogLine[];
  /** Player(s) currently in the lead (not necessarily winners). */
  leaderIds: string[];
  /** Set when someone crossed the target score but the game isn't finished. */
  targetReachedBy: string | null;
}

// ---------- Storage ----------

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export interface StoredGame {
  id: string;
  createdAt: number;
  updatedAt: number;
  events: GameEvent[];
  messages: ChatMessage[];
}

export interface FavoriteGame {
  definition: GameDefinition;
  savedAt: number;
}

/** A person in the player database, independent of any single game. */
export interface RosterPlayer {
  id: string;
  name: string;
  /** Regulars are the recurring crew — offered first at setup. */
  regular: boolean;
  /** Small square data-URL portrait. */
  photo?: string;
  createdAt: number;
  lastPlayedAt: number | null;
}

// ---------- AI actions (what the interpreter returns) ----------

export type AiAction =
  | {
      kind: "create_game";
      definition: GameDefinition;
      players: { name: string; guest?: boolean }[];
    }
  | { kind: "adjust_score"; player: string; delta: number; reason?: string }
  | { kind: "set_score"; player: string; value: number; reason?: string }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "start_round" }
  | { kind: "win_round"; player: string }
  | { kind: "advance_turn" }
  | { kind: "roll_dice"; spec: string }
  | { kind: "flip_coin" }
  | { kind: "pick_player" }
  | { kind: "add_note"; text: string }
  | { kind: "add_house_rule"; rule: string }
  | { kind: "finish_game"; winners?: string[] };

/** Partial definition collected during keyless setup. */
export interface SetupDraft {
  name?: string;
  playerNames?: string[];
  /** Names among playerNames who are one-night guests. */
  guests?: string[];
  direction?: ScoringDirection;
  targetScore?: number | null;
  houseRules?: string[];
  /** Full definition to reuse (starting from a saved favorite). */
  definition?: GameDefinition;
  step?: "name" | "players" | "direction" | "target" | "rules" | "done";
}

export interface InterpretRequest {
  phase: "setup" | "play";
  messages: ChatMessage[];
  definition?: GameDefinition;
  players?: Player[];
  scores?: Record<string, number>;
  round?: number;
  currentPlayer?: string | null;
  draft?: SetupDraft;
  /** Base64 data-URL of a photo, for vision requests. */
  image?: string;
}

export interface InterpretResponse {
  reply: string;
  actions: AiAction[];
  /** Actions that must be confirmed by the user before applying (vision). */
  proposals?: AiAction[];
  draft?: SetupDraft;
  /** Short tappable answers to the question just asked, if any. */
  suggestions?: string[];
  provider: "gemini" | "groq" | "local";
}
