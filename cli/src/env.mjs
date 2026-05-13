// Resolve Supabase credentials from process.env, then ~/.radius-cli/config.json,
// then the project's .env.local (when run from inside the repo).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..'); // cli/src -> cli -> repo root

function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function readDotenvLocal() {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(REPO_ROOT, '.env.local'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return parseDotenv(readFileSync(p, 'utf8'));
      } catch {}
    }
  }
  return {};
}

function readUserConfig() {
  const p = resolve(homedir(), '.radius-cli', 'config.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

export function resolveCreds() {
  const dotenv = readDotenvLocal();
  const cfg = readUserConfig();

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    cfg.supabaseUrl ||
    dotenv.NEXT_PUBLIC_SUPABASE_URL ||
    dotenv.SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    cfg.serviceRoleKey ||
    dotenv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        'in env, ~/.radius-cli/config.json, or the project .env.local.'
    );
  }

  return { url: url.replace(/\/+$/, ''), serviceKey };
}
