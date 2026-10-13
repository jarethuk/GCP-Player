import type { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../auth.js'
import { resetRateLimits } from '../rate-limit.js'
import { AUTHED, setTestEnv, staffSessionMock, TEST_STAFF, TEST_TOKEN } from '../test-helpers.js'

const issueSignInCode = vi.fn()
const consumeSignInCode = vi.fn()
const endSession = vi.fn()

const prisma = { staffSession: staffSessionMock() }

vi.mock('../db.js', () => ({ prisma }))
vi.mock('../staff.js', () => ({ issueSignInCode, consumeSignInCode, endSession }))

describe('auth routes', () => {
  let app: Hono<AppEnv>

  beforeAll(async () => {
    setTestEnv()
    app = (await import('../app.js')).app
  })

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(prisma, { staffSession: staffSessionMock() })
    // The limiter is module state, and a test must not inherit the previous
    // one's counters.
    resetRateLimits()
    consumeSignInCode.mockResolvedValue({
      token: 'a-fresh-session-token',
      expiresAt: new Date('2026-10-18T00:00:00Z'),
      staff: TEST_STAFF,
    })
  })

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  describe('POST /auth/code', () => {
    it('answers 204 for an address that is staff', async () => {
      const response = await post('/auth/code', { email: TEST_STAFF.email })

      expect(response.status).toBe(204)
      expect(issueSignInCode).toHaveBeenCalledWith(TEST_STAFF.email)
    })

    it('answers 204 identically for one that is not', async () => {
      // Answering differently would turn this into a way to enumerate staff.
      issueSignInCode.mockResolvedValue(undefined)
      const response = await post('/auth/code', { email: 'stranger@example.com' })

      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    })

    it('rejects something that is not an address before touching the database', async () => {
      expect((await post('/auth/code', { email: 'nope' })).status).toBe(400)
      expect(issueSignInCode).not.toHaveBeenCalled()
    })

    it('is never cached', async () => {
      const response = await post('/auth/code', { email: TEST_STAFF.email })
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('stops a caller asking over and over', async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        expect((await post('/auth/code', { email: TEST_STAFF.email })).status).toBe(204)
      }
      expect((await post('/auth/code', { email: TEST_STAFF.email })).status).toBe(429)
    })
  })

  describe('POST /auth/session', () => {
    it('hands back the token, its expiry and who it belongs to', async () => {
      const response = await post('/auth/session', { email: TEST_STAFF.email, code: '123456' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        token: 'a-fresh-session-token',
        expiresAt: '2026-10-18T00:00:00.000Z',
        staff: TEST_STAFF,
      })
    })

    it('refuses anything that is not six digits, without spending an attempt', async () => {
      for (const code of ['12345', '1234567', 'abcdef', '12 34 56']) {
        expect((await post('/auth/session', { email: TEST_STAFF.email, code })).status).toBe(400)
      }
      expect(consumeSignInCode).not.toHaveBeenCalled()
    })

    it('keeps a leading-zero code intact', async () => {
      await post('/auth/session', { email: TEST_STAFF.email, code: '000042' })
      expect(consumeSignInCode).toHaveBeenCalledWith(TEST_STAFF.email, '000042')
    })

    it('has its own allowance, separate from asking for a code', async () => {
      // Mistyping the code five times must not also stop you asking for a new one.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await post('/auth/session', { email: TEST_STAFF.email, code: '123456' })
      }
      expect(
        (await post('/auth/session', { email: TEST_STAFF.email, code: '123456' })).status,
      ).toBe(429)
      expect((await post('/auth/code', { email: TEST_STAFF.email })).status).toBe(204)
    })
  })

  describe('the signed-in endpoints', () => {
    it('says who the caller is', async () => {
      const response = await app.request('/auth/me', { headers: AUTHED })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ staff: TEST_STAFF })
    })

    it('refuses to say who an unauthenticated caller is', async () => {
      expect((await app.request('/auth/me')).status).toBe(401)
    })

    it('ends this session on sign-out', async () => {
      const response = await app.request('/auth/session', { method: 'DELETE', headers: AUTHED })

      expect(response.status).toBe(204)
      expect(endSession).toHaveBeenCalledWith(TEST_TOKEN)
    })

    it('refuses a sign-out with no session to end', async () => {
      expect((await app.request('/auth/session', { method: 'DELETE' })).status).toBe(401)
      expect(endSession).not.toHaveBeenCalled()
    })
  })
})
