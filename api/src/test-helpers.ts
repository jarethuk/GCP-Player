import { vi } from 'vitest'
import { hashSessionToken } from './secrets.js'

/**
 * The signed-in staff member every route test borrows.
 *
 * Route tests mock `../db.js` wholesale, so there is no database to put a
 * session in — `staffSessionFor` below stands in for the one lookup
 * `requireStaff` does, and answers only for this token. Answering for any
 * token would make "refuses without a session" pass for the wrong reason.
 */
export const TEST_STAFF = { id: 'staff_1', email: 'ada@example.com', name: 'Ada Lovelace' }

export const TEST_TOKEN = 'test-session-token'

/** Headers for an authenticated request. */
export const AUTHED = { authorization: `Bearer ${TEST_TOKEN}` }

/** JSON headers for an authenticated write. */
export const AUTHED_JSON = { ...AUTHED, 'content-type': 'application/json' }

/**
 * A `prisma.staffSession` stand-in that recognises `TEST_TOKEN` and nothing
 * else. Spread into the mocked prisma object.
 */
export function staffSessionMock() {
  return {
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(TEST_TOKEN)
        ? { expiresAt: new Date(Date.now() + 86_400_000), staff: TEST_STAFF }
        : null,
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(),
  }
}

/** The environment every route test needs before importing the app. */
export function setTestEnv(): void {
  process.env.DATABASE_URL = 'postgresql://unused'
  process.env.DATABASE_URL_UNPOOLED = 'postgresql://unused'
  process.env.SESSION_KEY = 'test-session-key-at-least-32-characters-long'
  process.env.CRON_SECRET = 'cron'
}
