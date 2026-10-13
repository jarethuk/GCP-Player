import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

/** How many requests one caller may make to one endpoint, and over what span. */
export interface RateLimitRule {
  /** Keys the counter, so two rules never share an allowance. */
  name: string
  limit: number
  windowMs: number
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Stops the map growing without bound in a long-lived local process. */
function sweep(now: number): void {
  if (buckets.size < 1000) return
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
}

/**
 * A fixed window, in memory.
 *
 * Honest about what it is: on Vercel every instance starts with empty buckets,
 * so the effective allowance is this limit times however many instances are
 * warm. It is a brake on a script hammering one connection, not a defence.
 *
 * The defence that matters is in the database and does not depend on this:
 * `Staff.otpAttempts` caps a code at five guesses inside its ten minutes, and
 * a request for a code never reveals whether the address has an account.
 */
export function rateLimit(rule: RateLimitRule) {
  return createMiddleware(async (c, next) => {
    const now = Date.now()
    sweep(now)

    // Vercel's own header first: `x-forwarded-for` is caller-supplied
    // everywhere else and can be anything at all.
    const caller =
      c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    const key = `${rule.name}:${caller}`

    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > rule.limit) {
      c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      throw new HTTPException(429, { message: 'Too many attempts. Try again shortly.' })
    }

    await next()
  })
}

/** Test seam: the buckets are module state, and tests must not inherit them. */
export function resetRateLimits(): void {
  buckets.clear()
}
