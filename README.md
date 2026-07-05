# AI Scorekeeper

**Choose any game. The AI does the rest.**

An AI-first scorekeeping companion — not a digital scoresheet. Say
*"We're playing Catan"* or *"we're making up a game"* and it builds the right
scoresheet, keeps score through plain conversation, answers rules questions,
and remembers every game night.

## What works today

- **Conversational setup** — name any game; known games get correct scoring
  automatically, unknown games are learned through a short conversation.
  Every question comes with tappable quick answers, players from past game
  nights are one tap to re-add, and a live "setting the table" card shows
  the scoresheet being built as you talk.
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
- **Built for the table** — mobile-first: sticky composer and header with
  safe-area support, 44px touch targets, no tap flash or double-tap zoom,
  and an installable web-app manifest (add it to your home screen).

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

## Shared tables & accounts (optional)

With a Supabase project, the whole table can score one game live from
their own phones:

1. Create a free Supabase project and enable Email (magic link) auth
2. Run `supabase/schema.sql` in the SQL editor — tables, RLS policies,
   a capability-style `join_shared_game` RPC, and the realtime publication
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then sign in on the Account page, tap **🔗 Invite** on any game, and text
the link to the table. Every score event syncs both ways in realtime;
the event log's immutable ids make merging conflict-free. Without keys,
sharing is hidden behind a friendly explainer and everything else works
device-locally.

> Note: the sync layer is code-complete and unit-typed but hasn't been
> exercised against a live Supabase project yet — treat the first shared
> game as a smoke test.

## Roadmap

- Offline service worker (manifest is already in place)
- Chat/rules-question sync for shared tables (score events sync today)
- Teams UI (engine already models teams)
- Voice replies (TTS) and continuous listening
- Richer vision: dice reading, card recognition, board-state analysis
- Per-player profiles across devices
