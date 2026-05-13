# radius-cli

Flag-driven CLI for the RADIUS CRM Supabase backend. Talks directly to PostgREST with the service role key — bypasses RLS, so treat it as an admin tool.

## Install (local)

```bash
cd cli
npm link    # exposes `radius` on your PATH
# or just: node bin/radius.mjs ...
```

## Auth

Credentials are resolved from, in order:
1. Environment: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
2. `~/.radius-cli/config.json` — `{ "supabaseUrl": "...", "serviceRoleKey": "..." }`
3. The repo's `.env.local` (works automatically when invoked from inside the repo)

## Quick reference

```bash
# Circle leaders
radius leaders list --campus south --status active
radius leaders show <id>
radius leaders add --name "Jane Doe" --campus south --day Tuesday --time "7:00 PM" --frequency weekly
radius leaders edit <id> --status paused --acpd "Sam"
radius leaders bulk --ids "12,15,22" --field campus --value "South"
radius leaders delete <id> --yes

# Boards
radius boards list
radius boards show <id>             # board + columns + cards
radius boards add --title "Q2 Plan"
radius boards edit <id> --title "..." --archived true

# Lists (board columns)
radius lists list --board <boardId>
radius lists add --board <boardId> --title "In Progress" --color "#f59e0b"
radius lists edit <id> --title "Doing" --position 2

# Cards
radius cards list --board <boardId>
radius cards add --list <colId> --title "Call John" --priority high --due-date 2026-05-20
radius cards edit <id> --priority urgent --assignee Trip
radius cards move <id> --to-list <colId>
radius cards archive <id>
```

All commands accept `--json` for full JSON output instead of the default table.
