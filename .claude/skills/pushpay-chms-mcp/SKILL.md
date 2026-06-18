---
name: pushpay-chms-mcp
description: >-
  Use when working on RADIUS's CCB / Church Community Builder / Pushpay ChMS v2
  integration — looking up real v2 REST endpoint paths, request params, or JSON
  response field names; tightening the defensive field mapping in
  lib/ccb/ccb-v2-client.ts; debugging OAuth, rate limits, or 4xx/5xx from
  api.ccbchurch.com; or scaffolding a new v2 endpoint method. Connects to
  Pushpay's ChMS v2 MCP server (docs.pushpay.io) so you look up the actual API
  contract instead of guessing field names.
---

# Pushpay ChMS v2 MCP

Pushpay hosts a remote MCP server backed by the ChMS v2 API documentation. It
gives an AI editor three things: **documentation search**, **API reference
lookup**, and **integration code scaffolding** for the ChMS v2 (Church Community
Builder) REST API at `https://api.ccbchurch.com`.

Use it as the source of truth for the v2 API **contract** — endpoint paths,
query params, and response JSON shapes — so RADIUS's v2 client stops guessing.

## Why this matters here

`lib/ccb/ccb-v2-client.ts` maps response fields **defensively** — it tries
`first_name` / `firstName` / `name.first`, `phones[]` vs `phone{}`, etc. — with
a comment that says the exact v2 field names "aren't pinned by static docs yet."
That defensiveness is a stopgap. When you have the MCP connected, look up the
real field names and **tighten the mapping to what v2 actually returns**, rather
than adding yet another fallback variant.

The companion to this is the live verifier route `app/api/ccb/v2-verify/route.ts`
— MCP tells you what the docs *say*, `v2-verify` confirms what the account
*returns*. Use both; trust live data when they disagree.

## Connecting the server

The server is remote (no install). Add it to whichever client you're using.

**Claude Code** — add to `.mcp.json` at the repo root (or user/project settings):

```json
{
  "mcpServers": {
    "pushpay-chmsv2": {
      "type": "http",
      "url": "https://pushpay-chmsv2.readme.io/mcp"
    }
  }
}
```

**Cursor** — `~/.cursor/mcp.json` (Windsurf / Claude Desktop are equivalent):

```json
{
  "mcpServers": {
    "pushpay-chmsv2": { "url": "https://pushpay-chmsv2.readme.io/mcp" }
  }
}
```

After adding it, restart/reload the client and confirm the `pushpay-chmsv2`
tools appear before relying on them.

### Auth note

Documentation and API-reference lookups work without credentials. Pulling
**real data from a ChMS account** through the MCP requires auth headers passed
through the MCP client's header config — it is *not* wired to RADIUS's stored
OAuth tokens. Do not paste live tokens into a shared config. For real-account
checks against RADIUS's own credentials, prefer the in-repo `v2-verify` route,
which already uses the encrypted OAuth tokens.

## How to use it during v2 work

1. **Before adding/finishing a v2 endpoint method**, ask the MCP for that
   endpoint: e.g. "Show the ChMS v2 `GET /individuals/{id}` response schema" or
   "What query params does `GET /groups/{id}/attendance` accept?"
2. **Match the existing client shape.** New methods mirror the v1 `CCBClient`
   return shapes so callers don't change — see `getIndividualProfile` /
   `getGroupParticipants` / `getGroupAttendanceInRange` as the template. Route
   every request through `CCBv2Client.request()` so you inherit bearer auth,
   the required Accept header, telemetry, the daily-budget tripwire, and
   429/retry-after handling. Don't call `fetch` directly.
3. **Replace guesses with facts.** Once the MCP confirms the real field name,
   collapse the defensive `firstString(a, b, c)` fallbacks to the verified
   field. Keep one fallback only if `v2-verify` shows live data genuinely
   differs from the docs.
4. **Verify against live data** via `app/api/ccb/v2-verify/route.ts` before
   trusting a mapping in production.

## Project facts the MCP won't tell you

- **Base/auth**: REST at `https://api.ccbchurch.com`; OAuth2 authorization_code
  on `oauth.ccbchurch.com`; every request needs
  `Accept: application/vnd.ccbchurch.v2+json`. See `lib/ccb/ccb-v2-config.ts`.
- **Version toggle**: `CCB_API_VERSION=v2` routes through the v2 client;
  defaults to `v1`. Env: `CCB_V2_CLIENT_ID`, `CCB_V2_CLIENT_SECRET`,
  `CCB_V2_REDIRECT_URI`, `CCB_V2_SUBDOMAIN` (falls back to `CCB_SUBDOMAIN`).
- **Connect flow**: an admin authorizes once via `/api/ccb/oauth/start`;
  `getValidAccessToken()` refreshes transparently. Tokens are AES-256-GCM
  encrypted in `ccb_oauth_tokens`.
- **Rate limits**: v2 limits are **per-endpoint** (no daily cap). The daily
  budget in `ccb-api-gateway.ts` is RADIUS's own tripwire, not a CCB limit.
- **CCB data is read-only** from RADIUS's perspective (per project rules).

## Guardrails

- The MCP is documentation/code-gen — using it costs no RADIUS AI quota. But it
  is **not** the `/api/ai-summarize` pipeline; don't route app AI features
  through it.
- Don't commit live OAuth tokens or account data pulled via the MCP.
- Trust **live `v2-verify` output over static docs** when they conflict — v2's
  JSON has shown nested/object phone shapes the reference doesn't always spell
  out.
