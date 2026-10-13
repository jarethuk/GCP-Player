import type { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../auth.js'
import { AUTHED, AUTHED_JSON, setTestEnv, staffSessionMock, TEST_STAFF } from '../test-helpers.js'

const row = {
  ...TEST_STAFF,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  lastLoginAt: new Date('2026-03-01T00:00:00Z'),
  otpHash: 'secret',
  otpExpiresAt: new Date('2026-03-01T00:10:00Z'),
  otpAttempts: 0,
}

const prisma = {
  staff: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  staffSession: staffSessionMock(),
}

vi.mock('../db.js', () => ({ prisma }))

describe('staff routes', () => {
  let app: Hono<AppEnv>

  beforeAll(async () => {
    setTestEnv()
    app = (await import('../app.js')).app
  })

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(prisma, { staffSession: staffSessionMock() })
    prisma.staff.findMany.mockResolvedValue([row])
    // By id, or by the address this person already holds. Any other address
    // is free — which is what the clash checks are asking about.
    prisma.staff.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id === row.id || where.email === row.email ? row : null,
    )
    prisma.staff.create.mockResolvedValue(row)
    prisma.staff.update.mockResolvedValue(row)
    prisma.staff.count.mockResolvedValue(3)
  })

  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: body === undefined ? AUTHED : AUTHED_JSON,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  it('refuses every endpoint without a session', async () => {
    expect((await app.request('/staff')).status).toBe(401)
    expect(
      (
        await app.request('/staff', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.com', name: 'A' }),
        })
      ).status,
    ).toBe(401)
    expect((await app.request('/staff/staff_1', { method: 'DELETE' })).status).toBe(401)
  })

  it('never puts the sign-in machinery on the wire', async () => {
    const body = (await (await send('GET', '/staff')).json()) as {
      staff: Array<Record<string, unknown>>
    }

    expect(body.staff[0]).toEqual({
      id: TEST_STAFF.id,
      email: TEST_STAFF.email,
      name: TEST_STAFF.name,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: '2026-03-01T00:00:00.000Z',
    })
  })

  describe('POST /staff', () => {
    it('stores the address in lowercase', async () => {
      const response = await send('POST', '/staff', { email: 'NEW@Example.COM', name: 'New' })

      expect(response.status).toBe(201)
      expect(prisma.staff.create).toHaveBeenCalledWith({
        data: { email: 'new@example.com', name: 'New' },
      })
    })

    it('refuses an address that is already staff', async () => {
      expect((await send('POST', '/staff', { email: row.email, name: 'Again' })).status).toBe(409)
      expect(prisma.staff.create).not.toHaveBeenCalled()
    })

    it('refuses something that is not an address', async () => {
      expect((await send('POST', '/staff', { email: 'nope', name: 'N' })).status).toBe(400)
    })
  })

  describe('PATCH /staff/:id', () => {
    it('leaves sessions alone when only the name changes', async () => {
      const response = await send('PATCH', '/staff/staff_1', { name: 'Ben C' })

      expect(response.status).toBe(200)
      expect(prisma.staffSession.deleteMany).not.toHaveBeenCalled()
    })

    it('ends every session when the address changes', async () => {
      // The address is the identity: moving it moves who can sign in.
      await send('PATCH', '/staff/staff_1', { email: 'elsewhere@example.com' })

      expect(prisma.staffSession.deleteMany).toHaveBeenCalledWith({
        where: { staffId: 'staff_1' },
      })
    })

    it('drops a code pending on the old address', async () => {
      await send('PATCH', '/staff/staff_1', { email: 'elsewhere@example.com' })

      expect(prisma.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ otpHash: null, otpExpiresAt: null, otpAttempts: 0 }),
        }),
      )
    })

    it('404s for somebody who is not there', async () => {
      prisma.staff.findUnique.mockResolvedValue(null)
      // A findUnique that answers for nobody is exactly the missing row.
      expect((await send('PATCH', '/staff/nobody', { name: 'X' })).status).toBe(404)
    })
  })

  describe('DELETE /staff/:id', () => {
    it('removes somebody', async () => {
      expect((await send('DELETE', '/staff/staff_1')).status).toBe(204)
      expect(prisma.staff.delete).toHaveBeenCalledWith({ where: { id: 'staff_1' } })
    })

    it('refuses the last one', async () => {
      // An empty staff table is a dashboard nobody can sign in to, and no
      // endpoint that can fix it.
      prisma.staff.count.mockResolvedValue(1)

      expect((await send('DELETE', '/staff/staff_1')).status).toBe(409)
      expect(prisma.staff.delete).not.toHaveBeenCalled()
    })
  })
})
