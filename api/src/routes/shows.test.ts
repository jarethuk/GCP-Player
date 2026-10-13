import type { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../auth.js'
import { AUTHED_JSON, setTestEnv, staffSessionMock } from '../test-helpers.js'

const show = {
  id: 'show_1',
  slug: 'haunted-city',
  title: 'Haunted City',
  system: 'Blades in the Dark',
  description: null,
  artworkUrl: null,
  matchPattern: null,
  patreonShowId: null as string | null,
  isPublic: true,
  overridden: false,
  hash: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
  deletedAt: null as Date | null,
}

const episode = {
  id: 'ep_1',
  showId: 'show_1',
  guid: 'guid-1',
  title: 'Enter the Dusk',
  rawTitle: 'Enter the Dusk | Haunted City S1 E1 | Blades in the Dark',
  description: null,
  audioUrl: 'https://cdn.example/1.mp3' as string | null,
  patreonPostId: null as string | null,
  durationSeconds: 3600,
  publishedAt: new Date('2022-02-25T00:00:00Z'),
  season: 1,
  number: 1,
  artworkUrl: null,
  videoUrl: null,
  overridden: false,
  hash: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T00:00:00Z'),
  deletedAt: null as Date | null,
}

const prisma = {
  show: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
  episode: { findMany: vi.fn(), aggregate: vi.fn(), updateMany: vi.fn() },
  staffSession: staffSessionMock(),
  // The array form: its members are built before the call, so asserting on the
  // underlying update mocks is enough.
  $transaction: vi.fn(async (operations: unknown[]) => operations),
}

vi.mock('../db.js', () => ({ prisma }))

/** `Response.json()` is `unknown`; these endpoints have a known envelope. */
interface Envelope {
  syncedAt: string
  fullResync: boolean
  shows?: Array<Record<string, unknown>>
  episodes?: Array<Record<string, unknown>>
}

describe('show routes', () => {
  let app: Hono<AppEnv>

  const get = async (path: string): Promise<Envelope> =>
    (await app.request(path)).json() as Promise<Envelope>

  beforeAll(async () => {
    setTestEnv()
    app = (await import('../app.js')).app
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks strips the session stand-in's implementation with everything else.
    Object.assign(prisma, { staffSession: staffSessionMock() })
    prisma.show.findMany.mockResolvedValue([show])
    prisma.show.findFirst.mockResolvedValue({ id: show.id })
    prisma.episode.findMany.mockResolvedValue([episode])
    prisma.show.aggregate.mockResolvedValue({ _max: { updatedAt: show.updatedAt } })
    prisma.episode.aggregate.mockResolvedValue({ _max: { updatedAt: episode.updatedAt } })
    prisma.show.update.mockResolvedValue(show)
    prisma.episode.updateMany.mockResolvedValue({ count: 1 })
  })

  // The invariant the reconciling ingest rests on. Without it a hand-made
  // correction is silently undone by the next cron run, which is exactly the
  // failure the flag exists to prevent.
  describe('editing hands the row to the editor', () => {
    it('marks an edited show overridden', async () => {
      await app.request('/shows/show_1', {
        method: 'PATCH',
        headers: AUTHED_JSON,
        body: JSON.stringify({ description: 'Written by hand' }),
      })

      expect(prisma.show.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ overridden: true }) }),
      )
    })

    it('hands the row back to the feeds when overridden is sent as false', async () => {
      await app.request('/shows/show_1', {
        method: 'PATCH',
        headers: AUTHED_JSON,
        body: JSON.stringify({ overridden: false }),
      })

      // The cleared hash is half the release: a stale one that still matched
      // the feed would read as unchanged, and the edit would stand for ever.
      expect(prisma.show.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overridden: false, hash: null }),
        }),
      )
    })

    it('marks a deleted show and every episode under it overridden', async () => {
      await app.request('/shows/show_1', { method: 'DELETE', headers: AUTHED_JSON })

      expect(prisma.show.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ overridden: true }) }),
      )
      // The cascade matters as much as the show itself: the episodes are
      // tombstoned but keep their showId, and the feeds still carry every one
      // of them.
      expect(prisma.episode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ overridden: true }) }),
      )
    })
  })

  describe('GET /shows', () => {
    it('returns everything and flags a full resync when no cursor is given', async () => {
      const body = await get('/shows')

      expect(body.fullResync).toBe(true)
      expect(body.shows).toHaveLength(1)
      expect(body.shows?.[0]?.slug).toBe('haunted-city')
      // Dates go out as ISO strings, not as whatever JSON.stringify makes of a Date.
      expect(body.shows?.[0]?.updatedAt).toBe('2026-02-01T00:00:00.000Z')
      // No cursor means "today's catalogue" — tombstones are only of interest
      // to a caller that might be holding one.
      expect(prisma.show.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, isPublic: true } }),
      )
    })

    it('filters strictly after the cursor and does not flag a full resync', async () => {
      const since = '2026-01-15T00:00:00.000Z'
      const body = await get(`/shows?since=${encodeURIComponent(since)}`)

      expect(body.fullResync).toBe(false)
      expect(prisma.show.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { updatedAt: { gt: new Date(since) }, isPublic: true } }),
      )
    })

    it('takes syncedAt from the newest row rather than the clock', async () => {
      const body = await get('/shows')
      expect(body.syncedAt).toBe('2026-02-01T00:00:00.000Z')
    })

    it('advances an empty delta to the collection maximum', async () => {
      // So every client converges on one URL and the edge cache is actually hit.
      prisma.show.findMany.mockResolvedValue([])
      const since = '2026-01-15T00:00:00.000Z'
      const body = await get(`/shows?since=${encodeURIComponent(since)}`)

      expect(body.shows).toEqual([])
      expect(body.syncedAt).toBe('2026-02-01T00:00:00.000Z')
    })

    it('sends tombstones to a caller with a cursor', async () => {
      const tombstone = { ...show, deletedAt: new Date('2026-03-01T00:00:00Z') }
      prisma.show.findMany.mockResolvedValue([tombstone])
      const body = await get('/shows?since=2026-01-15T00:00:00.000Z')

      expect(body.shows?.[0]?.deletedAt).toBe('2026-03-01T00:00:00.000Z')
    })

    it('lets the edge hold the answer for an hour', async () => {
      const response = await app.request('/shows')
      expect(response.headers.get('Vercel-CDN-Cache-Control')).toContain('s-maxage=3600')
      expect(response.headers.get('Cache-Control')).toContain('must-revalidate')
    })

    it('rejects a cursor that is not a timestamp', async () => {
      const response = await app.request('/shows?since=last-tuesday')
      expect(response.status).toBe(400)
    })

    it('rejects a timestamp with no offset, which would be ambiguous', async () => {
      const response = await app.request('/shows?since=2026-01-15T00:00:00')
      expect(response.status).toBe(400)
    })
  })

  describe('GET /shows/:id/episodes', () => {
    it('accepts a slug as well as an id', async () => {
      const body = await get('/shows/haunted-city/episodes')

      expect(body.episodes).toHaveLength(1)
      expect(prisma.show.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, OR: [{ id: 'haunted-city' }, { slug: 'haunted-city' }] },
        }),
      )
    })

    it('scopes the delta to the show', async () => {
      const since = '2026-01-15T00:00:00.000Z'
      await app.request(`/shows/show_1/episodes?since=${encodeURIComponent(since)}`)

      expect(prisma.episode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            showId: 'show_1',
            updatedAt: { gt: new Date(since) },
            audioUrl: { not: null },
          },
        }),
      )
    })

    it('hides tombstoned episodes from a caller with no cursor', async () => {
      await app.request('/shows/show_1/episodes')

      expect(prisma.episode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { showId: 'show_1', deletedAt: null, audioUrl: { not: null } },
        }),
      )
    })

    it('404s for a show that does not exist', async () => {
      prisma.show.findFirst.mockResolvedValue(null)
      const response = await app.request('/shows/nope/episodes')
      expect(response.status).toBe(404)
    })
  })

  // The apps already installed decode `audioUrl` as a string: one null would
  // fail their whole sync. Patreon is only for a client that asks for it.
  describe('Patreon', () => {
    it('keeps Patreon-only shows from a client that does not ask for them', async () => {
      await app.request('/shows')
      expect(prisma.show.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isPublic: true }) }),
      )
    })

    it('sends every show, with its Patreon id, to a client that asks', async () => {
      prisma.show.findMany.mockResolvedValue([
        { ...show, isPublic: false, patreonShowId: '2224146' },
      ])
      const body = await get('/shows?patreon=1')

      expect(prisma.show.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      )
      expect(body.shows?.[0]).toMatchObject({ isPublic: false, patreonShowId: '2224146' })
    })

    it('sends episodes with no public audio only to a client that asks', async () => {
      const early = {
        ...episode,
        guid: 'patreon:168443753',
        audioUrl: null,
        patreonPostId: '168443753',
      }
      prisma.episode.findMany.mockResolvedValue([early])
      const body = await get('/shows/show_1/episodes?patreon=true')

      expect(prisma.episode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { showId: 'show_1', deletedAt: null } }),
      )
      expect(body.episodes?.[0]).toMatchObject({ audioUrl: null, patreonPostId: '168443753' })
    })
  })

  describe('writes', () => {
    it('are never cached', async () => {
      const response = await app.request('/shows', {
        method: 'POST',
        headers: AUTHED_JSON,
        body: JSON.stringify({ title: 'no slug' }),
      })
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('refuses a create with no session', async () => {
      const response = await app.request('/shows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'x', title: 'X' }),
      })
      expect(response.status).toBe(401)
    })

    it('refuses an authenticated create with a bad body', async () => {
      const response = await app.request('/shows', {
        method: 'POST',
        headers: AUTHED_JSON,
        body: JSON.stringify({ title: 'no slug' }),
      })
      expect(response.status).toBe(400)
    })
  })
})
