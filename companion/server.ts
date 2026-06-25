import { createServer, IncomingMessage, ServerResponse } from 'http';
import { execFile, ExecFileException } from 'child_process';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 5123;
const HOST = '127.0.0.1';

// Gap enforced between sends — Messages.app hangs if you burst
const SEND_DELAY_MS = 4000;

// Write the AppleScript to a temp file once at startup.
// Passing phone/message as argv avoids any shell-escaping issues with
// arbitrary message content (quotes, apostrophes, newlines, etc.).
const SCRIPT_PATH = join(tmpdir(), 'radius_companion.applescript');
writeFileSync(
  SCRIPT_PATH,
  `on run argv
  set phoneNum to item 1 of argv
  set msgText to item 2 of argv
  tell application "Messages"
    set svc to first service whose service type = SMS
    send msgText to buddy phoneNum of svc
  end tell
end run
`,
);

function log(msg: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runOsascript(phone: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      [SCRIPT_PATH, phone, message],
      { timeout: 30_000 },
      (err: ExecFileException | null, _stdout: string, stderr: string) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve();
      },
    );
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Single-send lock — Messages.app can't handle concurrent osascript calls
let busy = false;

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { method, url } = req;

  // ── GET /ping ─────────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/ping') {
    respond(res, 200, { ok: true });
    return;
  }

  // ── POST /send ────────────────────────────────────────────────────────────
  if (method === 'POST' && url === '/send') {
    if (busy) {
      respond(res, 429, { success: false, error: 'Busy — a send is already in progress' });
      return;
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      respond(res, 400, { success: false, error: 'Could not read request body' });
      return;
    }

    let payload: { phone?: unknown; message?: unknown };
    try {
      payload = JSON.parse(raw);
    } catch {
      respond(res, 400, { success: false, error: 'Invalid JSON' });
      return;
    }

    const { phone, message } = payload;
    if (typeof phone !== 'string' || !phone.trim()) {
      respond(res, 400, { success: false, error: 'Missing or invalid "phone"' });
      return;
    }
    if (typeof message !== 'string' || !message.trim()) {
      respond(res, 400, { success: false, error: 'Missing or invalid "message"' });
      return;
    }

    busy = true;
    try {
      log(`→ sending to ${phone}`);
      await runOsascript(phone, message);
      log(`✓ sent to ${phone}`);
      // Delay is baked into the response time so Radius's sequential await
      // naturally enforces the gap — no retry logic needed on the client side
      await sleep(SEND_DELAY_MS);
      respond(res, 200, { success: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`✗ failed ${phone}: ${errMsg}`);
      await sleep(SEND_DELAY_MS);
      respond(res, 200, { success: false, error: errMsg });
    } finally {
      busy = false;
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  log(`Radius companion listening on http://${HOST}:${PORT}`);
  log('Endpoints: GET /ping  POST /send { phone, message }');
});
