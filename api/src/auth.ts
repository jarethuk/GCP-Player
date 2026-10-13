import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { prisma } from './db.js'
import { env } from './env.js'
import { hashSessionToken, secretsMatch } from './secrets.js'

/** Who is signed in, as every authenticated handler sees them. */
export interface SignedInStaff {
  id: string
  email: string
  name: string
}

/** The Hono generic every route carrying a session is built on. */
export type AppEnv = { Variables: { staff: SignedInStaff } }

function bearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

/**
 * Guards everything that writes, and the staff-only reads.
 *
 * The bearer token is a session handed out by `POST /auth/session`, not a
 * shared secret from the environment: sessions belong to a person, expire, and
 * die with the staff row (the cascade on `StaffSession`), which a single
 * `API_TOKEN` could do none of.
 *
 * One indexed lookup per authenticated request. That is a database round trip
 * the old token check didn't need, but it is also the only way "remove this
 * person" can take effect before their session would have expired anyway — and
 * every request this guards is already doing database work.
 *
 * Reads of the catalogue itself stay public: it is the network's own published
 * feeds, and the phone apps have no account.
 */
export const requireStaff = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) throw new HTTPException(401, { message: 'Unauthorized' })

  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      staff: { select: { id: true, email: true, name: true } },
    },
  })

  // An expired row is deleted rather than merely refused: it is dead weight,
  // and the browser holding it is about to be told to sign in again.
  if (session && session.expiresAt.getTime() <= Date.now()) {
    await prisma.staffSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
    throw new HTTPException(401, { message: 'Your session has expired. Sign in again.' })
  }

  if (!session) throw new HTTPException(401, { message: 'Unauthorized' })

  c.set('staff', session.staff)
  await next()
})

/**
 * Guards the cron endpoint. Vercel sends `Authorization: Bearer $CRON_SECRET`
 * on scheduled invocations.
 *
 * A staff session is *not* accepted here — running the ingest by hand from the
 * dashboard goes through `POST /admin/sync`, which is behind `requireStaff`.
 * Keeping the two apart means the cron secret is only ever the cron's.
 */
export const requireCronSecret = createMiddleware(async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token || !secretsMatch(token, env().CRON_SECRET)) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  await next()
})
