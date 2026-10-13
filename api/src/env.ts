import { existsSync } from 'node:fs'
import { z } from 'zod'

// Same reasoning as prisma.config.ts: Node loads the file, so no dotenv.
// On Vercel there is no .env and the variables are already set.
if (existsSync('.env')) process.loadEnvFile('.env')

const schema = z.object({
  /** Pooled at runtime — a serverless function opens a connection per invocation. */
  DATABASE_URL: z.string().min(1),
  /** Used only by `prisma migrate`; not read here, but required so a missing one fails early. */
  DATABASE_URL_UNPOOLED: z.string().min(1),
  /**
   * Keys the HMAC over sign-in codes. Changing it invalidates every code that
   * has been emailed but not yet typed in — which is a ten-minute window, and
   * the reason it is safe to rotate. Sessions are unaffected: their tokens are
   * hashed, not signed.
   */
  SESSION_KEY: z.string().min(32),
  /** Vercel sets this for scheduled invocations. */
  CRON_SECRET: z.string().min(1),
  /**
   * Whether public reads may be held at the edge. On unless set otherwise, so
   * the deployed default is the cheap one.
   *
   * Turn it off when the catalogue is being edited and every change has to be
   * visible immediately — an hour of stale answers is the whole point of the
   * cache and exactly the wrong thing while working on the data. Also the
   * first thing to try when a client is being served something that looks
   * out of date: flip it off and see whether the answer changes, which
   * distinguishes a stale edge from a wrong row.
   *
   * Accepts true/false, 1/0 and yes/no, because this gets set by hand in the
   * Vercel dashboard and the exact spelling should not matter.
   */
  ENABLE_VERCEL_CACHE: z.stringbool().default(true),
  /**
   * Sends the sign-in code, through the Resend template aliased `otp` — it
   * takes one variable, OTP_CODE. Leave both unset locally and the code is
   * written to the log instead of emailed, so signing in needs no inbox.
   */
  RESEND_API_KEY: z.string().optional(),
  /** Must be an address on a domain verified in Resend. */
  RESEND_FROM: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/**
 * Validated once, lazily. Lazily because importing this module must not throw
 * in tests that never touch the database, and once because a serverless
 * instance handles many requests.
 */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
      throw new Error(`Invalid environment: ${missing}. See .env.example.`)
    }
    cached = parsed.data
  }
  return cached
}
