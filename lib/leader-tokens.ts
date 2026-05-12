/**
 * Leader Auth — Email OTP + Signed Session Cookie
 *
 * Flow:
 *  1. Leader enters email or phone → we lookup circle_leaders → email on file
 *  2. Generate 6-digit code, store SHA-256 hash + 10min TTL in leader_otp_codes
 *  3. Resend delivers the code to the leader's email
 *  4. Leader enters code → server hashes, compares, marks consumed
 *  5. Server issues a signed session cookie (24h) — used as auth on all
 *     /api/circle-summary/* routes
 *
 * Cookie format: <leader_id_b64>.<expires_ms>.<hmac_sha256_b64>
 * HMAC is over `<leader_id>:<expires_ms>` using LEADER_SESSION_SECRET.
 */

import { createHmac, createHash, randomInt, timingSafeEqual } from 'crypto';

const SESSION_SECRET_ENV = 'LEADER_SESSION_SECRET';
export const SESSION_COOKIE_NAME = 'radius_leader_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const OTP_TTL_MS = 10 * 60 * 1000; // 10min
export const OTP_MAX_ATTEMPTS = 5;

function getSessionSecret(): string {
  const s = process.env[SESSION_SECRET_ENV];
  if (!s || s.length < 32) {
    throw new Error(
      `${SESSION_SECRET_ENV} is not set or too short (min 32 chars). Generate with: openssl rand -base64 48`
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// ---- OTP ----

/** Generate a cryptographically random 6-digit code (zero-padded). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** SHA-256 hash of an OTP code for storage. Compare hashes, never plaintext. */
export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// ---- Session cookie ----

function signSession(leaderId: string, expiresMs: number): string {
  return b64urlEncode(
    createHmac('sha256', getSessionSecret())
      .update(`${leaderId}:${expiresMs}`)
      .digest()
  );
}

export function createSessionToken(leaderId: string, ttlMs = SESSION_TTL_MS): string {
  const expiresMs = Date.now() + ttlMs;
  return `${b64urlEncode(leaderId)}.${expiresMs}.${signSession(leaderId, expiresMs)}`;
}

export function verifySessionToken(token: string | undefined | null): { leaderId: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let leaderId: string;
  try {
    leaderId = b64urlDecode(parts[0]).toString('utf8');
  } catch {
    return null;
  }
  const expiresMs = Number(parts[1]);
  if (!leaderId || !Number.isFinite(expiresMs)) return null;
  if (Date.now() > expiresMs) return null;

  const expected = signSession(leaderId, expiresMs);
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { leaderId };
}

/** Normalize a phone number for comparison: digits only, last 10. */
export function normalizePhone(input: string): string {
  const digits = (input || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Normalize an email for comparison: lowercase, trim. */
export function normalizeEmail(input: string): string {
  return (input || '').trim().toLowerCase();
}
