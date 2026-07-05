# AI Scorekeeper

**Choose any game. The AI does the rest.**

An AI-first scorekeeping companion — not a digital scoresheet. Say
*"We're playing Catan"* or *"we're making up a game"* and it builds the right
scoresheet, keeps score through plain conversation, answers rules questions,
and remembers every game night.

## What works today

- **Conversational setup** — name any game; known games get correct scoring
  automatically, unknown games are learned through a short conversation.
- **Natural-language scorekeeping** — "Trip gets 12", "Erin loses three",
  "undo that", "next round", "Ashlyn won the round".
- **Event-sourced engine** — every change is an immutable event; state is
  always derived from the log, so undo/redo are unlimited and the full audit
  trail lives in the Table log.
- **Voice-first** — the poker-chip mic button uses the Web Speech API
  (Chrome/Safari); typing always works everywhere.
- **Vision (with a Gemini key)** — photograph the scoreboard and the AI
  proposes corrections. Nothing is ever applied without confirmation.
- **Rules assistant** — ask "how do ties work?" mid-game; house rules are
  stored and flagged separately from official rules.
- **Game tools** — AI dice (`2d6`, `d20+3`, advantage/disadvantage), coin
  flips, random player picker, turn & round tracking, a turn timer, notes.
- **History & insights** — every game, winner, score, and duration; win
  rates, streaks, most-played games, and the closest game on record.
- **Favorites & rematch** — one tap to run it back.

## How the AI layer works

`POST /api/interpret` turns table talk into structured actions:

1. **Gemini 2.0 Flash** (primary, handles vision) — set `GEMINI_API_KEY`
2. **Groq Llama 3.3 70B** (fallback) — set `GROQ_API_KEY`
3. **Local parser + built-in game registry** (no keys) — common phrases and
   ~15 popular games work fully offline

The model returns `{ reply, actions[] }`; actions become events; events
become state. Score changes proposed from a photo come back as `proposals`
and wait for explicit confirmation.

## Running it

```bash
npm install
cp .env.example .env.local   # add keys, or skip — it works without them
npm run dev
```

`npm test` runs the engine and parser unit tests (event sourcing, undo/redo
semantics, target detection, the natural-language command grammar).

Data is stored in `localStorage` per device for now (see roadmap).

## Architecture

```
app/
  page.tsx              # "What are we playing?" — conversational setup
  game/[id]/page.tsx    # live table: scoreboard, chat, tools, log
  history/page.tsx      # record book: standings, streaks, every game
  api/interpret/route.ts# NL -> actions (Gemini -> Groq -> local)
components/             # MicButton (the chip), ScoreBoard, ChatPanel, ...
hooks/useGame.ts        # event log <-> derived state <-> interpreter
hooks/useSpeech.ts      # Web Speech API wrapper
lib/engine.ts           # event sourcing: deriveState, undo/redo targets
lib/types.ts            # events, actions, definitions — the contract
lib/localParser.ts      # keyless fallback interpreter
lib/registry.ts         # built-in definitions for popular games
lib/stats.ts            # history insights
lib/store.ts            # localStorage persistence
```

**Event sourcing is the core bet.** `undo` and `redo` are themselves events
that deactivate other events; nothing is ever deleted. That gives replay,
auditing, and analytics for free, and leaves the door open for sync and
multiplayer (swap `lib/store.ts` for a synced backend without touching the
engine).

## Roadmap

- Supabase persistence + realtime sync (shared tables, multiplayer)
- PWA install + offline service worker
- Teams UI (engine already models teams)
- Voice replies (TTS) and continuous listening
- Richer vision: dice reading, card recognition, board-state analysis
- Per-player profiles across devices
