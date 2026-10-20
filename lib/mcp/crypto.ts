import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export const base64Url = (buf: Buffer) => buf.toString('base64url');

/** Opaque, unguessable credential. The prefix only makes leaked values easy to recognise. */
export const randomCredential = (prefix: string) => `${prefix}_${base64Url(randomBytes(32))}`;

/** RFC 7636 S256: BASE64URL(SHA256(verifier)). */
export const pkceS256 = (verifier: string) => base64Url(createHash('sha256').update(verifier).digest());

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// RFC 7636 §4.1 / §4.2
export const isValidCodeVerifier = (v: string) => /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
// SHA-256 → base64url without padding is always exactly 43 characters.
export const isValidCodeChallenge = (v: string) => /^[A-Za-z0-9_-]{43}$/.test(v);
