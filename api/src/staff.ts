import { HTTPException } from 'hono/http-exception'
import { prisma } from './db.js'
import { sendOtpCode } from './email.js'
import {
  generateOtpCode,
  generateSessionToken,
  hashOtpCode,
  hashSessionToken,
  normaliseEmail,
  secretsMatch,
} from './secrets.js'

/** Long enough to find the email, short enough that a stolen one is stale. */
export const CODE_TTL_MINUTES = 10

/** A dashboard is not a phone; a month of not signing in again is plenty. */
export const SESSION_TTL_DAYS = 30

/** Six digits is a million possibilities, and five guesses is not a dent. */
const MAX_OTP_ATTEMPTS = 5

/** What a successful sign-in hands back. The token is never stored. */
export interface IssuedSession {
  token: string
  expiresAt: Date
  staff: { id: string; email: string; name: string }
}

/**
 * Emails a sign-in code, if that address belongs to a member of staff.
 *
 * An unknown address is a no-op, deliberately and silently: there is no
 * registration, so the only thing creating a row here could do is let anyone
 * in. The caller answers 204 either way, so this endpoint cannot be used to
 * find out who has an account.
 *
 * A second request supersedes the first — the previous code stops working the
 * moment this one is stored, which is also what resets the attempt counter.
 */
export async function issueSignInCode(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail)
  const staff = await prisma.staff.findUnique({ where: { email }, select: { id: true } })
  if (!staff) return

  const code = generateOtpCode()
  const otpExpiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)

  await prisma.staff.update({
    where: { id: staff.id },
    data: { otpHash: hashOtpCode(code), otpExpiresAt, otpAttempts: 0 },
  })

  // Sent after the code is stored, so a delivered email always matches what
  // the database will accept.
  await sendOtpCode(email, code)
}

/** Drops whatever code is pending for this person. */
async function clearOtp(id: string): Promise<void> {
  await prisma.staff.update({
    where: { id },
    data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
  })
}

/**
 * Exchanges a code for a session.
 *
 * Every refusal is the same 401 with the same wording. The code being wrong,
 * expired, already spent, or for an address with no account are four different
 * facts, and telling them apart is exactly what an attacker wants.
 */
export async function consumeSignInCode(rawEmail: string, code: string): Promise<IssuedSession> {
  const email = normaliseEmail(rawEmail)
  const refuse = () =>
    new HTTPException(401, { message: 'That code is wrong or has expired. Ask for a new one.' })

  const staff = await prisma.staff.findUnique({ where: { email } })
  if (!staff?.otpHash || !staff.otpExpiresAt) throw refuse()

  // Checked before the compare, so the cap cannot be walked past by a caller
  // who keeps guessing after hitting it.
  if (staff.otpAttempts >= MAX_OTP_ATTEMPTS) {
    await clearOtp(staff.id)
    throw refuse()
  }

  if (!secretsMatch(hashOtpCode(code), staff.otpHash)) {
    await prisma.staff.update({
      where: { id: staff.id },
      data: { otpAttempts: { increment: 1 } },
    })
    throw refuse()
  }

  if (staff.otpExpiresAt.getTime() <= Date.now()) {
    await clearOtp(staff.id)
    throw refuse()
  }

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

  // One transaction: the code has to be spent in the same breath the session
  // is created, or a code that raced with itself could issue two.
  await prisma.$transaction([
    prisma.staffSession.create({
      data: { staffId: staff.id, tokenHash: hashSessionToken(token), expiresAt },
    }),
    prisma.staff.update({
      where: { id: staff.id },
      data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0, lastLoginAt: new Date() },
    }),
    // Housekeeping, on the one request per month that can afford it.
    prisma.staffSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
  ])

  return { token, expiresAt, staff: { id: staff.id, email: staff.email, name: staff.name } }
}

/** Signing out. Idempotent — a token that isn't there is already gone. */
export async function endSession(token: string): Promise<void> {
  await prisma.staffSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
}
