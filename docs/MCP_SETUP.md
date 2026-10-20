# Radius MCP: read-only assistant access

Radius runs a private [MCP](https://modelcontextprotocol.io) server so one signed-in user's AI assistant
(ChatGPT "dot") can read Circle Leader information. **It is read-only. Nothing it exposes can change Radius.**

- MCP endpoint: `https://vccradius.netlify.app/api/mcp/` (Streamable HTTP, stateless, JSON responses)
- Login: OAuth 2.1 authorization code + PKCE (S256), run by Radius itself. Radius signs the user in with its
  existing login, then shows a consent screen at `/oauth/authorize/`.
- Client registration: **CIMD** (client ID metadata document). No dynamic registration endpoint exists.
- Scope: `radius:read`

> The trailing slash on the endpoint is deliberate. The site runs with `trailingSlash: true`, so a URL
> without it is answered with a 308 redirect, and an external client is not required to follow a redirect on a POST.

## How access is controlled

| Question | Answer |
| --- | --- |
| Who can connect an assistant? | Only a Radius user with a row in `mcp_access`. The table starts empty. |
| What can it do? | Call five read-only tools. There are no write tools, no messaging and no delete. |
| Whose data does it see? | Radius shares leader data with every signed-in user, so the assistant sees **all** leaders and notes, not only the user's own circles. Personal to-dos are the exception: only the token's own user's. |
| Can it reach the database directly? | No. Its token is an opaque string that only works at `/api/mcp/`. It is not a Supabase token. |
| What is never returned? | Phone numbers, emails, birthdays, additional-leader contact details, prayer points. |
| How long does access last? | Access tokens: 1 hour. Refresh tokens: 30 days, rotating. Each approval ends after 90 days. |
| Is it logged? | Every tool call and connection event goes to `mcp_audit_log` (tool, arguments capped at 2,000 characters, record count, outcome; not record contents). If a call can't be logged it is not answered. |
| Where are secrets? | Tokens and codes are stored only as SHA-256 hashes. The service key never leaves the server. |

## One-time setup

Do these in order. None of it needs a secret pasted into chat.

### 1. Create the tables

Open the Radius Supabase project, go to **SQL Editor**, and run the contents of
`supabase/migrations/20261020000000_mcp_oauth.sql`. It is safe to run twice. It creates six tables with
row-level security on and no policies, so only the server can touch them.

### 2. Turn access on for your account

```sql
insert into public.mcp_access (user_id, granted_by)
select id, 'manual' from public.users where lower(email) = lower('trip.ochenski@valleycreek.org')
on conflict (user_id) do update set revoked_at = null, scopes = array['radius:read'];
```

It should report `INSERT 0 1`. `INSERT 0 0` means no Radius user has that email.

### 3. Deploy

Merge the pull request. Netlify deploys from `main` on its own. Do not trigger a manual redeploy.

The site address comes from `MCP_PUBLIC_URL`, falling back to `NEXT_PUBLIC_APP_URL`. It must be an
`https://` origin with no path. If `NEXT_PUBLIC_APP_URL` on the `vccradius` Netlify site is already
`https://vccradius.netlify.app`, nothing needs setting. Otherwise add `MCP_PUBLIC_URL` and redeploy once.

### 4. Check discovery

These should return JSON (open them in a browser):

- `https://vccradius.netlify.app/.well-known/oauth-protected-resource/api/mcp`
- `https://vccradius.netlify.app/.well-known/oauth-authorization-server`

The `issuer` and the first `authorization_servers` entry must be exactly `https://vccradius.netlify.app`.

### 5. Register the server in ChatGPT

Add a custom MCP server (or private plugin) with:

- **URL:** `https://vccradius.netlify.app/api/mcp/`
- **Authentication:** OAuth
- **Client registration:** client ID metadata document (CIMD)
- **Scope:** `radius:read`

ChatGPT then shows the **redirect URI** it will use. Copy it exactly. It is usually
`https://chatgpt.com/connector_platform_oauth_redirect`, but use whatever it shows.

### 6. Allow that redirect URI

```sql
insert into public.mcp_allowed_redirects (redirect_uri, note)
values ('PASTE THE EXACT URI FROM CHATGPT HERE', 'ChatGPT dot');
```

No redeploy is needed. Matching is exact. Until this row exists, every connection attempt is refused.
This is deliberate, so Radius never sends a sign-in code to an address you didn't approve.

### 7. Connect

1. In a browser, **sign in to Radius first** (password sign-in is the smoothest; a magic link opens on the
   default page, so start the connection again afterwards).
2. In ChatGPT, click **Connect** on the Radius server.
3. Read the consent screen at `vccradius.netlify.app/oauth/authorize/` and choose **Allow read-only access**.
4. Ask dot something that needs a real record, e.g. "Find my circle leaders in the Denton campus and show their latest notes."

## Tools

All tools require the `radius:read` scope and are annotated `readOnlyHint: true`. Arguments are validated
against the published input schema; unknown arguments (including any `user_id`) are rejected.
Lists are paged with `limit` and `cursor`. Each response carries `total` and `next_cursor` (null on the last page).

| Tool | What it returns |
| --- | --- |
| `search_leaders` | A page of leaders. Filters: `query`, `campus`, `acpd`, `status[]`, `circle_type`, `day`, `leader_type`, `follow_up_required`. |
| `get_leader` | One leader's profile and circle info, plus their latest note and latest connection. |
| `list_leader_notes` | A leader's notes, newest first, authors by name. `since` filters by date. |
| `list_leader_connections` | A leader's logged interactions (date, type, note), newest first. |
| `list_follow_ups` | Follow-ups with `status` = `upcoming`, `overdue`, `completed` or `all`; optional `leader_id`, `from`, `to`. |

Every record carries a stable `id`, relevant dates, and a `radius_url` link where one exists.

### What "follow-up" means in Radius

Radius has two kinds, and `list_follow_ups` labels each by `source`:

- `leader_follow_up`: the follow-up flag and date on a leader. It is shared by everyone and **has no completed
  state**. Clearing it removes the flag and leaves a note ("Follow-up cleared."), so resolutions are found with `list_leader_notes`.
- `personal_todo`: the signed-in user's own to-do items about leaders. These can be completed, and only
  the token's own user's are ever returned.

"Overdue" means due before today in Central time. Open follow-ups with no date count as upcoming.

### Example calls (sample data, not real people)

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_leaders","arguments":{"acpd":"Alex","status":["active"],"limit":2}}}
```

```json
{
  "items": [
    {
      "id": 1, "name": "Jordan Avery", "campus": "Lake Highlands", "acpd": "Alex Morgan", "status": "active",
      "leader_type": "circle", "circle_name": "LVT | S1 | Jordan Avery", "circle_type": "Women's",
      "circle_location": null, "day": "Tuesday", "time": null, "frequency": null,
      "check_in_cadence": null, "last_check_in_date": null,
      "follow_up_required": true, "follow_up_date": "2026-10-10",
      "radius_url": "https://vccradius.netlify.app/circle/1"
    }
  ],
  "total": 1,
  "next_cursor": null
}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_follow_ups","arguments":{"status":"overdue"}}}
```

```json
{
  "as_of_date": "2026-10-20",
  "timezone": "America/Chicago",
  "items": [
    {
      "id": "leader:1", "source": "leader_follow_up", "status": "overdue",
      "leader_id": 1, "leader_name": "Jordan Avery", "summary": "Check on her family situation",
      "due_date": "2026-10-10", "due_time": null, "completed_at": null,
      "radius_url": "https://vccradius.netlify.app/circle/1"
    }
  ],
  "total": 1,
  "next_cursor": null
}
```

The full input and output schemas are returned by `tools/list`, and are defined in `lib/mcp/tools.ts`.

## Turning access off

Any one of these works immediately:

```sql
-- Stop one person entirely (existing tokens stop working on their next request)
update public.mcp_access set revoked_at = now() where user_id = (select id from public.users where lower(email) = lower('trip.ochenski@valleycreek.org'));

-- End every connection for everyone but leave the user enabled (they must approve again)
update public.mcp_oauth_grants set revoked_at = now() where revoked_at is null;

-- Stop all connection attempts
delete from public.mcp_allowed_redirects;
```

The assistant can also end its own connection at `POST /api/mcp-oauth/revoke/`.

## Checking what it did

```sql
-- Latest 50 events
select at, event, tool, args, ok, result_count, error, duration_ms
from public.mcp_audit_log order by at desc limit 50;

-- Connections currently allowed
select user_id, client_id, scope, created_at, expires_at, last_used_at
from public.mcp_oauth_grants where revoked_at is null and expires_at > now();
```

## Housekeeping

Used-up codes and expired tokens accumulate, and the audit log grows. Nothing breaks if you ignore this for a
long time, but to tidy up (safe to run any time):

```sql
delete from public.mcp_oauth_codes  where expires_at < now() - interval '1 day';
delete from public.mcp_oauth_tokens where expires_at < now() - interval '1 day';
delete from public.mcp_audit_log    where at < now() - interval '180 days';
```

## Environment variables (all optional if the defaults fit)

| Variable | Purpose |
| --- | --- |
| `MCP_PUBLIC_URL` | The site's `https://` origin; also the OAuth issuer. Falls back to `NEXT_PUBLIC_APP_URL`. |
| `MCP_OAUTH_ALLOWED_REDIRECT_URIS` | Comma-separated exact redirect URIs, in addition to the `mcp_allowed_redirects` table. Usually unnecessary. |
| `MCP_OAUTH_ALLOWED_CLIENT_HOSTS` | Hosts a CIMD `client_id` may be fetched from. Defaults to `chatgpt.com`. |

## Proposed write tools (NOT built, NOT enabled)

Nothing below exists in the code. It is a proposal to approve before any of it is built.

| Tool | Does | Needs |
| --- | --- | --- |
| `log_interaction` | Adds a connection (date, type, note) to a leader. | `radius:write` |
| `add_note` | Adds a note to a leader's profile. | `radius:write` |
| `create_follow_up` | Creates a personal to-do about a leader, or sets a leader's follow-up date. | `radius:write` |
| `complete_follow_up` | Completes a personal to-do, or clears a leader's follow-up with a required resolution note. | `radius:write` |

Every write would ship with all of these, or it doesn't ship:

- **Separate permission.** A new `radius:write` scope, off by default, granted per user in `mcp_access` and
  approved on its own consent screen. Disabling it must not break reads.
- **No duplicates.** A required `idempotency_key` per call, enforced by a unique database constraint, so a retried call returns the first result.
- **Conflict protection.** Edits and completions require the record's `updated_at` as it was read, and fail if it changed in the meantime.
- **Audit history.** Each write records who, when, the exact before and after values, and the idempotency key.
- **Saved-record response.** The tool returns the record as stored, with its id and `radius_url`, so the assistant can read it back and confirm.
- **Written by the right person.** Notes and to-dos are attributed to the signed-in user, never to a service account.
- **Confirmation.** The tool description tells the assistant to show the user exactly what will be saved and wait for a yes first.

Deliberately excluded for good: sending messages to leaders, bulk changes, and any delete.

## Open risk: someone else starting the connection (not fixed)

The consent screen can't tell whether *you* started "Connect" in ChatGPT, or someone else did and sent you the
link. If an attacker began a connection in their own ChatGPT and talked an enabled user into opening that
link while signed in and clicking Allow, the approval would go back with the attacker's session details.
Whether that would hand the attacker tokens depends on how ChatGPT ties its callback to the connection, which
I can't verify from here. Today the exposure is one enabled account (yours), and the screen names the account
and what it grants, but treat any "connect Radius" link you didn't start yourself as hostile.

A proper fix is a **pairing step**: a "Connect assistant" button inside Radius that records a short-lived
(about 10 minutes) pairing for your account, and an approval that is refused unless one is open. I'd build it
together with a **list of active connections with a Disconnect button**, which today needs SQL. It adds a
small page and one table, so I have not built it without your say-so.

## Known limits

- **Matching, not guessing:** `acpd`, `campus` and the like are substring matches on what's stored in Radius.
- **Only one Radius user is expected.** The code supports several (each gets their own token and personal to-dos), but access is granted one row at a time.
- **Rate limit:** 120 messages a minute per connection (every message in a batch counts), tracked per server
  instance, so it slows a runaway loop and isn't a hard cap.
- **Long follow-up lists:** each source is read up to 500 records. When that limit is hit, `list_follow_ups`
  returns `results_may_be_incomplete: true`; narrow with `leader_id`, `from` or `to`.
- **Note authors:** author names come from the users table, which Radius itself shows only to ACPD users.
  Enable assistant access only for accounts that already see those names.
- **Duplicate-looking retries:** a refresh token used a second time within 10 seconds is refused but doesn't end
  the connection (a client retrying after a lost response). After that, reuse ends the connection.
- **Leader ids are integers.** `supabase/schema.sql` in this repo shows UUIDs, but the app's types and queries use integers, and these tools follow the app. If a live id turns out to be a UUID, `get_leader` and the list tools will say the id isn't valid.
