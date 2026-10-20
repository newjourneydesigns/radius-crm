# Radius private plugin package

A secret-free description of the Radius MCP server for OpenAI's private plugin format. It holds no client
secret, token or key: the server uses CIMD, so there is no client secret at all, and sign-in happens in the
browser when the connection is approved.

**You may not need this folder.** The simplest route is to register the server directly in ChatGPT, as
step 5 of [`docs/MCP_SETUP.md`](../../../docs/MCP_SETUP.md). Use this package only if you prefer a file-based private plugin.

Things to know before relying on it:

- The `$schema` URLs and the overall layout come from OpenAI's
  [plugin documentation](https://developers.openai.com/plugins/build/plugins). I could not validate the files
  against the live schema from here, and the documentation is ambiguous about exactly where
  `"mode": "cimd"` sits inside the `auth` block. If ChatGPT rejects `mcp.json`, trust the registration screen
  over this file, and tell me what it expects.
- The URL assumes production is `https://vccradius.netlify.app`. Change it if the site is served elsewhere,
  and keep the trailing slash.
- Connecting still requires the one-time steps in `docs/MCP_SETUP.md` (database tables, your access row, and
  the redirect URI row), or sign-in will be refused.
