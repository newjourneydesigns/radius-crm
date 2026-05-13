#!/usr/bin/env node
// RADIUS CLI — flag-driven scriptable wrapper over the Supabase backend.
//
// Auth: reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env,
//       ~/.radius-cli/config.json, or the project's .env.local. Service role
//       key bypasses RLS — keep it local.

import { parseArgs, fail } from '../src/util.mjs';
import { runLeaders, leadersHelp } from '../src/commands/leaders.mjs';
import { runBoards, boardsHelp } from '../src/commands/boards.mjs';
import { runLists, listsHelp } from '../src/commands/lists.mjs';
import { runCards, cardsHelp } from '../src/commands/cards.mjs';

const TOP_HELP = `radius — RADIUS CRM CLI

Usage:
  radius <resource> <sub> [args...] [--flags]

Resources:
  leaders   Circle leaders (circle_leaders)
  boards    Project boards (project_boards)
  lists     Board columns (board_columns) — i.e. "lists" on a board
  cards     Board cards (board_cards)

Help:
  radius help <resource>
  radius <resource> --help

Output:
  Defaults to a compact table; pass --json for full JSON.

Auth:
  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env,
  ~/.radius-cli/config.json, or .env.local in the radius-crm repo.`;

const HELPS = {
  leaders: leadersHelp,
  boards: boardsHelp,
  lists: listsHelp,
  cards: cardsHelp,
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    if (argv[1] && HELPS[argv[1]]) {
      process.stdout.write(HELPS[argv[1]] + '\n');
      return;
    }
    process.stdout.write(TOP_HELP + '\n');
    return;
  }

  const [resource, sub, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);

  if (flags.help) {
    process.stdout.write((HELPS[resource] || TOP_HELP) + '\n');
    return;
  }
  if (!sub) fail(`missing subcommand for "${resource}". Try: radius help ${resource}`);

  switch (resource) {
    case 'leaders':
      return runLeaders(sub, positional, flags);
    case 'boards':
      return runBoards(sub, positional, flags);
    case 'lists':
      return runLists(sub, positional, flags);
    case 'cards':
      return runCards(sub, positional, flags);
    default:
      fail(`unknown resource: ${resource}. Try: radius help`);
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message || err}\n`);
  process.exit(1);
});
