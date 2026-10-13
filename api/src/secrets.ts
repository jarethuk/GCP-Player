import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

/**
 * Sign-in codes and session tokens are both credentials, so both come from the
 * CSPRNG rather than Math.random, which is seeded predictably and must never
 * generate a secret.
 */

/** Six digits, zero-padded — `000042` is a valid code. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Codes are stored as an HMAC keyed on SESSION_KEY, so a database dump alone
 * cannot be replayed to sign in as somebody. Keyed rather than a bare hash
 * because six digits is a million possibilities — a rainbow table over that
 * space is trivial, and the key is what puts it out of reach.
 */
export function hashOtpCode(code: string): string {
  return createHmac('sha256', env().SESSION_KEY).update(code).digest('hex')
}

/** 32 bytes, base64url. What the browser holds and sends as its bearer token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * A plain SHA-256, not an HMAC: 256 bits of CSPRNG output has no search space
 * to speed up, so a key would buy nothing — and unlike the codes, a session
 * must survive SESSION_KEY being rotated.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time compare, so a wrong secret cannot be narrowed down by timing. */
export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** The address is the identity, so `Ada@` and `ada@` must not be two accounts. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}
