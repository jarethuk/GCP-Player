import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AppEnv, requireStaff } from '../auth.js'
import { noCache } from '../cache.js'
import { rateLimit } from '../rate-limit.js'
import { consumeSignInCode, endSession, issueSignInCode } from '../staff.js'

export const auth = new Hono<AppEnv>()

/**
 * Both sit well above one sign-in — a code, then the code typed in — and well
 * below what it takes to mine addresses, send somebody a pile of email, or
 * work through a six-digit code before it expires.
 *
 * Two allowances rather than one shared between them, so mistyping the code
 * five times still leaves the caller able to ask for a new one.
 */
const ONE_MINUTE = 60_000
const REQUEST_CODE_LIMIT = { name: 'auth-code', limit: 6, windowMs: ONE_MINUTE }
const VERIFY_CODE_LIMIT = { name: 'auth-session', limit: 6, windowMs: ONE_MINUTE }

const requestCodeInput = z.object({ email: z.email() })
const verifyCodeInput = z.object({
  email: z.email(),
  // Exactly six digits: anything else is not a code this API ever issued, and
  // rejecting it here keeps it out of the attempt counter.
  code: z.string().regex(/^\d{6}$/, 'A code is six digits.'),
})

function body<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) })
  return parsed.data
}

/**
 * Emails a sign-in code.
 *
 * Always 204, whether or not the address belongs to anybody: there is no
 * registration here, and an endpoint that answered differently for a known
 * address would be a way to enumerate the staff list.
 *
 * Nothing in the response says whether the code was emailed or written to the
 * log, either: that depends only on how this API is configured, which is a
 * fact about the deployment and not about the address.
 */
auth.post('/code', rateLimit(REQUEST_CODE_LIMIT), noCache, async (c) => {
  const { email } = body(requestCodeInput, await c.req.json().catch(() => null))
  await issueSignInCode(email)
  return c.body(null, 204)
})

/** Exchanges a code for a session token. The token is shown exactly once. */
auth.post('/session', rateLimit(VERIFY_CODE_LIMIT), noCache, async (c) => {
  const { email, code } = body(verifyCodeInput, await c.req.json().catch(() => null))
  const session = await consumeSignInCode(email, code)

  return c.json({
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    staff: session.staff,
  })
})

/** Signing out. Ends this session only; other browsers stay signed in. */
auth.delete('/session', requireStaff, noCache, async (c) => {
  const token = c.req.header('authorization')?.slice('Bearer '.length).trim()
  if (token) await endSession(token)
  return c.body(null, 204)
})

/** Who the caller is. The dashboard's "am I still signed in?" on load. */
auth.get('/me', requireStaff, noCache, (c) => c.json({ staff: c.get('staff') }))
