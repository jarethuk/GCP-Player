import type { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../auth.js'
import { AUTHED, AUTHED_JSON, setTestEnv, staffSessionMock } from '../test-helpers.js'

const prisma = {
  show: { count: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  episode: { count: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
  feedSyncRun: { findMany: vi.fn() },
  feedSource: { findMany: vi.fn() },
  staffSession: staffSessionMock(),
}
const runSync = vi.fn()
const seedFeedSources = vi.fn()
const seedShows = vi.fn()
const invalidateTags = vi.fn()

vi.mock('../db.js', () => ({ prisma }))
vi.mock('../feed/sync.js', () => ({ runSync }))
vi.mock('../seed.js', () => ({ seedFeedSources, seedShows }))
vi.mock('../cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cache.js')>()),
  invalidateTags,
}))

const CONFIRMATION = 'delete-everything-and-resync'

let app: Hono<AppEnv>

beforeAll(async () => {
  setTestEnv()
  app = (await import('../app.js')).app
})

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks strips the session stand-in's implementation with everything else.
  Object.assign(prisma, { staffSession: staffSessionMock() })
})

describe('POST /admin/resync', () => {
  beforeEach(() => {
    prisma.show.count.mockResolvedValue(32)
    prisma.episode.count.mockResolvedValue(1279)
    prisma.show.deleteMany.mockResolvedValue({ count: 32 })
    prisma.episode.deleteMany.mockResolvedValue({ count: 1279 })
    runSync.mockResolvedValue({ itemsCreated: 1279 })
  })

  const post = (body: unknown) =>
    app.request('/admin/resync', {
      method: 'POST',
      headers: AUTHED_JSON,
      body: JSON.stringify(body),
    })

  it('refuses without a session', async () => {
    const response = await app.request('/admin/resync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: CONFIRMATION }),
    })

    expect(response.status).toBe(401)
    expect(prisma.episode.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses a session alone, without the confirmation', async () => {
    // A session can be left open on an unattended laptop; this endpoint would
    // then be one stray request away from emptying the catalogue.
    const response = await post({})

    expect(response.status).toBe(400)
    expect(prisma.episode.deleteMany).not.toHaveBeenCalled()
    expect(runSync).not.toHaveBeenCalled()
  })

  it('refuses the wrong confirmation', async () => {
    expect((await post({ confirm: 'yes' })).status).toBe(400)
    expect(prisma.show.deleteMany).not.toHaveBeenCalled()
  })

  it('is not reachable by GET', async () => {
    // Nothing that follows links should be able to wipe the catalogue.
    const response = await app.request('/admin/resync', { headers: AUTHED })
    expect(response.status).toBe(404)
  })

  it('wipes, re-seeds, resyncs and purges — in that order', async () => {
    const order: string[] = []
    prisma.episode.deleteMany.mockImplementation(async () => {
      order.push('delete episodes')
      return { count: 1279 }
    })
    prisma.show.deleteMany.mockImplementation(async () => {
      order.push('delete shows')
      return { count: 32 }
    })
    seedShows.mockImplementation(async () => {
      order.push('seed')
      return 6
    })
    runSync.mockImplementation(async () => {
      order.push('sync')
      return { itemsCreated: 1279 }
    })
    invalidateTags.mockImplementation(async () => {
      order.push('purge')
    })

    const response = await post({ confirm: CONFIRMATION })

    expect(response.status).toBe(200)
    // Episodes before shows because of the foreign key; re-seed before the
    // sync or the six regex-attributed shows lose their match patterns and
    // several hundred episodes come back unattributed.
    expect(order).toEqual(['delete episodes', 'delete shows', 'seed', 'sync', 'purge'])
  })

  it('reports what it destroyed', async () => {
    const body = (await (await post({ confirm: CONFIRMATION })).json()) as {
      deleted: { shows: number; episodes: number }
    }
    expect(body.deleted).toEqual({ shows: 32, episodes: 1279 })
  })

  it('purges every episode listing, not just the ones it can name', async () => {
    // The rebuild gives every show a new id, so `show:<oldId>` tags are
    // unreachable — the shared `episodes` tag is what clears them.
    await post({ confirm: CONFIRMATION })
    expect(invalidateTags).toHaveBeenCalledWith(['shows', 'episodes'])
  })

  it('is never cached', async () => {
    const response = await post({ confirm: CONFIRMATION })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe("the dashboard's reads", () => {
  beforeEach(() => {
    prisma.show.findMany.mockResolvedValue([
      {
        id: 'show_1',
        slug: 'haunted-city',
        title: 'Haunted City',
        system: null,
        description: null,
        artworkUrl: null,
        matchPattern: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        deletedAt: null,
      },
    ])
    prisma.episode.groupBy.mockResolvedValue([
      {
        showId: 'show_1',
        _count: { _all: 45 },
        _max: { publishedAt: new Date('2026-03-01T00:00:00Z') },
      },
    ])
    prisma.episode.count.mockResolvedValue(9)
    prisma.feedSyncRun.findMany.mockResolvedValue([])
    prisma.feedSource.findMany.mockResolvedValue([])
  })

  it('refuses every one of them without a session', async () => {
    for (const path of ['/admin/shows', '/admin/syncs', '/admin/feeds']) {
      expect((await app.request(path)).status).toBe(401)
    }
  })

  it('joins the episode counts onto the shows in memory', async () => {
    // One aggregate rather than a count per show: 32 shows is 32 round trips
    // otherwise, and this page is the one place that would notice.
    const response = await app.request('/admin/shows', { headers: AUTHED })
    const body = (await response.json()) as {
      unattributedCount: number
      shows: Array<{ slug: string; episodeCount: number; latestEpisodeAt: string | null }>
    }

    expect(prisma.episode.groupBy).toHaveBeenCalledTimes(1)
    expect(body.unattributedCount).toBe(9)
    expect(body.shows[0]).toMatchObject({
      slug: 'haunted-city',
      episodeCount: 45,
      latestEpisodeAt: '2026-03-01T00:00:00.000Z',
    })
  })

  it('gives a show with no episodes a zero rather than leaving it out', async () => {
    prisma.episode.groupBy.mockResolvedValue([])
    const response = await app.request('/admin/shows', { headers: AUTHED })
    const body = (await response.json()) as { shows: Array<{ episodeCount: number }> }

    expect(body.shows[0]?.episodeCount).toBe(0)
  })

  it('caps the sync history, however large a limit is asked for', async () => {
    await app.request('/admin/syncs?limit=5000', { headers: AUTHED })
    expect(prisma.feedSyncRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }))
  })

  it('falls back to a sensible page when the limit is nonsense', async () => {
    await app.request('/admin/syncs?limit=banana', { headers: AUTHED })
    expect(prisma.feedSyncRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }))
  })

  it('never lets the edge hold a dashboard read', async () => {
    const response = await app.request('/admin/shows', { headers: AUTHED })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /admin/sync', () => {
  it('refuses without a session', async () => {
    expect((await app.request('/admin/sync', { method: 'POST' })).status).toBe(401)
  })

  it('runs the ingest and purges only when it actually wrote something', async () => {
    runSync.mockResolvedValue({ itemsCreated: 0, showsCreated: 0 })
    await app.request('/admin/sync', { method: 'POST', headers: AUTHED })

    expect(runSync).toHaveBeenCalled()
    // A daily re-ingest of an unchanged catalogue writes nothing, and purging
    // the edge for it would throw away an hour of cache for no reason.
    expect(invalidateTags).not.toHaveBeenCalled()
  })

  it('purges when the ingest inserted episodes', async () => {
    runSync.mockResolvedValue({ itemsCreated: 3, showsCreated: 0 })
    await app.request('/admin/sync', { method: 'POST', headers: AUTHED })

    expect(invalidateTags).toHaveBeenCalledWith(['shows', 'episodes'])
  })
})
