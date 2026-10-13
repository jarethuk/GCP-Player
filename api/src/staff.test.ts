import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setTestEnv } from './test-helpers.js'

setTestEnv()

const prisma = {
  staff: { findUnique: vi.fn(), update: vi.fn() },
  staffSession: { create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (operations: unknown[]) => operations),
}
const sendOtpCode = vi.fn()

vi.mock('./db.js', () => ({ prisma }))
vi.mock('./email.js', () => ({ sendOtpCode }))

const { consumeSignInCode, issueSignInCode } = await import('./staff.js')
const { hashOtpCode } = await import('./secrets.js')

const STAFF = { id: 'staff_1', email: 'ada@example.com', name: 'Ada Lovelace' }

/** The code the mocked `sendOtpCode` was handed. */
const emailedCode = (): string => sendOtpCode.mock.calls[0]?.[1] as string

describe('issueSignInCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.staff.findUnique.mockResolvedValue({ id: STAFF.id })
    prisma.staff.update.mockResolvedValue(STAFF)
  })

  it('stores a hash of the code and emails the code itself', async () => {
    await issueSignInCode(STAFF.email)

    const code = emailedCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(prisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ otpHash: hashOtpCode(code), otpAttempts: 0 }),
      }),
    )
  })

  it('stores the code before sending it', async () => {
    // A delivered email must never name a code the database will refuse.
    const order: string[] = []
    prisma.staff.update.mockImplementation(async () => {
      order.push('store')
      return STAFF
    })
    sendOtpCode.mockImplementation(async () => {
      order.push('send')
    })

    await issueSignInCode(STAFF.email)
    expect(order).toEqual(['store', 'send'])
  })

  it('does nothing at all for an address that is not staff', async () => {
    // There is no registration, so the only thing creating a row here could
    // do is let anyone in.
    prisma.staff.findUnique.mockResolvedValue(null)

    await issueSignInCode('stranger@example.com')

    expect(prisma.staff.update).not.toHaveBeenCalled()
    expect(sendOtpCode).not.toHaveBeenCalled()
  })

  it('looks the address up in lowercase', async () => {
    await issueSignInCode('  ADA@Example.COM ')
    expect(prisma.staff.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ada@example.com' } }),
    )
  })
})

describe('consumeSignInCode', () => {
  const CODE = '123456'

  const pending = (overrides: Record<string, unknown> = {}) => ({
    ...STAFF,
    otpHash: hashOtpCode(CODE),
    otpExpiresAt: new Date(Date.now() + 60_000),
    otpAttempts: 0,
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.staff.findUnique.mockResolvedValue(pending())
    prisma.staff.update.mockResolvedValue(STAFF)
  })

  const status = async (promise: Promise<unknown>): Promise<number> => {
    try {
      await promise
      return 200
    } catch (error) {
      return error instanceof HTTPException ? error.status : 500
    }
  }

  it('hands back a session token, and never stores it', async () => {
    const session = await consumeSignInCode(STAFF.email, CODE)

    expect(session.token).toHaveLength(43)
    expect(session.staff).toEqual(STAFF)
    expect(JSON.stringify(prisma.staffSession.create.mock.calls)).not.toContain(session.token)
  })

  it('spends the code and creates the session in one transaction', async () => {
    // A code that raced with itself must not be able to issue two sessions.
    await consumeSignInCode(STAFF.email, CODE)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('refuses a wrong code and counts the attempt', async () => {
    expect(await status(consumeSignInCode(STAFF.email, '000000'))).toBe(401)
    expect(prisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { otpAttempts: { increment: 1 } } }),
    )
  })

  it('refuses an expired code and clears it', async () => {
    prisma.staff.findUnique.mockResolvedValue(
      pending({ otpExpiresAt: new Date(Date.now() - 1000) }),
    )

    expect(await status(consumeSignInCode(STAFF.email, CODE))).toBe(401)
    expect(prisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } }),
    )
  })

  it('refuses the right code once the attempts are spent', async () => {
    // Otherwise five guesses buys an attacker the sixth for free.
    prisma.staff.findUnique.mockResolvedValue(pending({ otpAttempts: 5 }))
    expect(await status(consumeSignInCode(STAFF.email, CODE))).toBe(401)
    expect(prisma.staffSession.create).not.toHaveBeenCalled()
  })

  it('refuses an address with no code pending', async () => {
    prisma.staff.findUnique.mockResolvedValue({ ...STAFF, otpHash: null, otpExpiresAt: null })
    expect(await status(consumeSignInCode(STAFF.email, CODE))).toBe(401)
  })

  it('refuses an address that is not staff', async () => {
    prisma.staff.findUnique.mockResolvedValue(null)
    expect(await status(consumeSignInCode('stranger@example.com', CODE))).toBe(401)
  })

  it('says the same thing however it refuses', async () => {
    // Wrong, expired, spent and unknown are four different facts, and telling
    // them apart is exactly what an attacker wants.
    const messages = new Set<string>()

    for (const setup of [
      () => prisma.staff.findUnique.mockResolvedValue(null),
      () => prisma.staff.findUnique.mockResolvedValue(pending({ otpAttempts: 5 })),
      () =>
        prisma.staff.findUnique.mockResolvedValue(
          pending({ otpExpiresAt: new Date(Date.now() - 1000) }),
        ),
    ]) {
      setup()
      await consumeSignInCode(STAFF.email, CODE).catch((error) => {
        if (error instanceof HTTPException) messages.add(error.message)
      })
    }

    prisma.staff.findUnique.mockResolvedValue(pending())
    await consumeSignInCode(STAFF.email, '999999').catch((error) => {
      if (error instanceof HTTPException) messages.add(error.message)
    })

    expect(messages.size).toBe(1)
  })
})
