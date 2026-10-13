import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashSessionToken } from './secrets.js'
import { setTestEnv, TEST_STAFF, TEST_TOKEN } from './test-helpers.js'

const prisma = {
  staffSession: { findUnique: vi.fn(), deleteMany: vi.fn() },
}

vi.mock('./db.js', () => ({ prisma }))

describe('requireStaff', () => {
  let app: Hono

  beforeAll(async () => {
    setTestEnv()
    const { requireStaff } = await import('./auth.js')
    app = new Hono()
    app.get('/guarded', requireStaff, (c) => c.json({ staff: c.get('staff') }))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.staffSession.deleteMany.mockResolvedValue({ count: 1 })
    prisma.staffSession.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 86_400_000),
      staff: TEST_STAFF,
    })
  })

  const call = (authorization?: string) =>
    app.request('/guarded', authorization ? { headers: { authorization } } : {})

  it('allows a live session and hands the handler who it belongs to', async () => {
    const response = await call(`Bearer ${TEST_TOKEN}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ staff: TEST_STAFF })
  })

  it('looks the session up by the hash of the token, never the token itself', async () => {
    await call(`Bearer ${TEST_TOKEN}`)

    expect(prisma.staffSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashSessionToken(TEST_TOKEN) } }),
    )
  })

  it('rejects a missing header', async () => {
    expect((await call()).status).toBe(401)
    expect(prisma.staffSession.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a bare token without the Bearer scheme', async () => {
    expect((await call(TEST_TOKEN)).status).toBe(401)
  })

  it('rejects a token no session matches', async () => {
    prisma.staffSession.findUnique.mockResolvedValue(null)
    expect((await call('Bearer nope')).status).toBe(401)
  })

  it('rejects an expired session, and deletes the row on the way out', async () => {
    prisma.staffSession.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
      staff: TEST_STAFF,
    })

    const response = await call(`Bearer ${TEST_TOKEN}`)

    expect(response.status).toBe(401)
    expect(prisma.staffSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(TEST_TOKEN) },
    })
  })
})

describe('requireCronSecret', () => {
  let app: Hono

  beforeAll(async () => {
    setTestEnv()
    const { requireCronSecret } = await import('./auth.js')
    app = new Hono()
    app.get('/cron', requireCronSecret, (c) => c.json({ ok: true }))
  })

  const call = (authorization?: string) =>
    app.request('/cron', authorization ? { headers: { authorization } } : {})

  it('allows the cron secret', async () => {
    expect((await call('Bearer cron')).status).toBe(200)
  })

  it('rejects a wrong secret', async () => {
    expect((await call('Bearer nope')).status).toBe(401)
  })

  it('rejects a secret of the right length but wrong content', async () => {
    expect((await call('Bearer nron')).status).toBe(401)
    expect((await call('Bearer croN')).status).toBe(401)
  })

  it('ignores surrounding whitespace, which a shell can easily add', async () => {
    expect((await call('Bearer  cron ')).status).toBe(200)
  })

  it("rejects a staff session — the cron secret is the cron's alone", async () => {
    expect((await call(`Bearer ${TEST_TOKEN}`)).status).toBe(401)
    expect(prisma.staffSession.findUnique).not.toHaveBeenCalled()
  })
})
