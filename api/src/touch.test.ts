import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const prisma = { show: { updateMany: vi.fn() } }
vi.mock('./db.js', () => ({ prisma }))

const invalidateTags = vi.fn()
vi.mock('./cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cache.js')>()),
  invalidateTags,
}))

describe('touchShows', () => {
  let touchShows: (ids: Iterable<string | null | undefined>) => Promise<number>

  beforeAll(async () => {
    touchShows = (await import('./touch.js')).touchShows
  })

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.show.updateMany.mockResolvedValue({ count: 0 })
  })

  it('writes nothing when there is nothing to mark', async () => {
    // The additive rule depends on this: a cron run that inserts no episodes
    // must not move a single `updatedAt`, or every client re-syncs daily.
    expect(await touchShows([])).toBe(0)
    expect(await touchShows([null, undefined])).toBe(0)
    expect(prisma.show.updateMany).not.toHaveBeenCalled()
  })

  it('marks each show once', async () => {
    await touchShows(['a', 'b', 'a', null, 'b'])

    expect(prisma.show.updateMany).toHaveBeenCalledTimes(1)
    const call = prisma.show.updateMany.mock.calls[0]?.[0]
    expect(call.where.id.in.sort()).toEqual(['a', 'b'])
  })

  it('purges the cache entries it just made stale', async () => {
    // Bumping a cursor the edge then serves from an hour-old copy moves the
    // data without anyone being able to see it.
    await touchShows(['a', 'b'])

    expect(invalidateTags).toHaveBeenCalledWith(['shows', 'show:a', 'show:b'])
  })

  it('stamps every row with the same instant', async () => {
    // Rows sharing a timestamp cannot straddle a client's `since` cursor, so
    // one statement's worth of shows is always fetched together or not at all.
    await touchShows(['a', 'b'])
    expect(prisma.show.updateMany.mock.calls[0]?.[0].data.updatedAt).toBeInstanceOf(Date)
  })
})
