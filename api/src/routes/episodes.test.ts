import type { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../auth.js'
import { AUTHED_JSON, setTestEnv, staffSessionMock } from '../test-helpers.js'

const episode = {
  id: 'ep_1',
  showId: 'show_1',
  guid: 'guid-1',
  title: 'Session Zero',
  rawTitle: 'Session Zero | Get in the Trunk Music from a Darkened Room E0 | Delta Green',
  description: null,
  audioUrl: 'https://cdn.example/0.mp3',
  durationSeconds: 3600,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  season: null as number | null,
  number: 0,
  artworkUrl: null,
  videoUrl: null,
  overridden: false,
  hash: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null as Date | null,
}

const prisma = {
  show: { findUnique: vi.fn(), updateMany: vi.fn() },
  episode: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  staffSession: staffSessionMock(),
}

vi.mock('../db.js', () => ({ prisma }))

/** A complete, valid create body; individual tests vary one field. */
const body = (over: Record<string, unknown> = {}) => ({
  guid: 'guid-1',
  title: 'Session Zero',
  audioUrl: 'https://cdn.example/0.mp3',
  publishedAt: '2026-01-01T00:00:00.000Z',
  showId: 'show_1',
  ...over,
})

describe('episode routes', () => {
  let app: Hono<AppEnv>

  const post = (payload: unknown) =>
    app.request('/episodes', {
      method: 'POST',
      headers: AUTHED_JSON,
      body: JSON.stringify(payload),
    })

  const patch = (payload: unknown) =>
    app.request('/episodes/ep_1', {
      method: 'PATCH',
      headers: AUTHED_JSON,
      body: JSON.stringify(payload),
    })

  beforeAll(async () => {
    setTestEnv()
    app = (await import('../app.js')).app
  })

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(prisma, { staffSession: staffSessionMock() })
    prisma.show.findUnique.mockResolvedValue({ id: 'show_1' })
    prisma.show.updateMany.mockResolvedValue({ count: 1 })
    prisma.episode.create.mockResolvedValue(episode)
    prisma.episode.update.mockResolvedValue(episode)
    prisma.episode.findFirst.mockResolvedValue({ showId: 'show_1' })
    prisma.episode.findMany.mockResolvedValue([])
  })

  // The invariant the reconciling ingest rests on. Without it a hand-made
  // correction is silently undone by the next cron run, which is exactly the
  // failure the flag exists to prevent.
  describe('editing hands the row to the editor', () => {
    it('marks an edited episode overridden', async () => {
      await patch({ title: 'Corrected' })

      expect(prisma.episode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ overridden: true }) }),
      )
    })

    it('clears the hash, so a release can be reconciled', async () => {
      await patch({ title: 'Corrected' })

      expect(prisma.episode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ hash: null }) }),
      )
    })

    // The way back. Without it the flag is a one-way door, and a row edited by
    // mistake never tracks the feed again.
    it('hands the row back to the feeds when overridden is sent as false', async () => {
      await patch({ overridden: false })

      expect(prisma.episode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overridden: false, hash: null }),
        }),
      )
    })

    it('marks a deleted episode overridden too', async () => {
      // A tombstone the feeds still carry would otherwise be reconciled
      // against them nightly, republishing the deletion for ever.
      await app.request('/episodes/ep_1', { method: 'DELETE', headers: AUTHED_JSON })

      expect(prisma.episode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overridden: true, deletedAt: expect.any(Date) }),
        }),
      )
    })
  })

  describe('episode number zero', () => {
    // Four episodes in the live catalogue are numbered 0 by the feeds
    // themselves — "Session Zero | Get in the Trunk ... E0", "Zero to Heroes
    // | ... Gatewalkers E0". Ingest writes them happily because it does not go
    // through this schema, so rejecting 0 here meant a row the API had created
    // could not be saved back: attributing one to a show, which is the single
    // most useful edit the dashboard offers, failed on a field nobody touched.
    it('is accepted on create', async () => {
      const response = await post(body({ number: 0 }))
      expect(response.status).toBe(201)
      expect(prisma.episode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: 0 }) }),
      )
    })

    it('is accepted on edit', async () => {
      const response = await patch({ number: 0 })
      expect(response.status).toBe(200)
      expect(prisma.episode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: 0 }) }),
      )
    })

    it('is still not a negative number', async () => {
      // The fix is "zero counts", not "stop checking".
      expect((await post(body({ number: -1 }))).status).toBe(400)
    })

    it('is still not a fraction', async () => {
      expect((await post(body({ number: 1.5 }))).status).toBe(400)
    })

    it('leaves null meaning unnumbered', async () => {
      // Distinct from 0, which means "numbered, and the number is zero".
      const response = await post(body({ number: null }))
      expect(response.status).toBe(201)
    })
  })

  describe('the other numbers', () => {
    it('still refuses a zero-length episode', async () => {
      // Unlike an episode number, zero seconds is not a real value.
      expect((await post(body({ durationSeconds: 0 }))).status).toBe(400)
    })
  })

  it('refuses a write with no session', async () => {
    const response = await app.request('/episodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    })
    expect(response.status).toBe(401)
  })
})
