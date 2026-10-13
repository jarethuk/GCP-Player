import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AppEnv, requireStaff } from '../auth.js'
import { invalidateTags, noCache, tags } from '../cache.js'
import { prisma } from '../db.js'
import { runSync } from '../feed/sync.js'
import { seedFeedSources, seedShows } from '../seed.js'
import { toFeedSourceDto, toShowDto, toSyncRunDto } from '../serialise.js'

export const admin = new Hono<AppEnv>()

// Everything here is the dashboard's, and none of it may be cached: these are
// the reads whose whole job is to be current.
admin.use('*', requireStaff, noCache)

/** Typing this is the only thing standing between a stolen session and the catalogue. */
const CONFIRMATION = 'delete-everything-and-resync'

const resyncInput = z.object({
  confirm: z.literal(CONFIRMATION),
})

// ─── The dashboard's reads ───────────────────────────────────────────────────

/**
 * The shows list with the numbers the catalogue view needs, which the public
 * `/shows` deliberately doesn't carry: a phone counts its own episodes locally
 * and the delta endpoint must stay a delta.
 *
 * Two aggregate queries and a join in memory, rather than a count per show —
 * 32 shows is 32 round trips otherwise, and this page is the one place that
 * would notice.
 */
admin.get('/shows', async (c) => {
  const [shows, counts, unattributedCount] = await Promise.all([
    prisma.show.findMany({ where: { deletedAt: null }, orderBy: { title: 'asc' } }),
    prisma.episode.groupBy({
      by: ['showId'],
      where: { deletedAt: null },
      _count: { _all: true },
      _max: { publishedAt: true },
    }),
    prisma.episode.count({ where: { deletedAt: null, showId: null } }),
  ])

  const byShow = new Map(counts.map((row) => [row.showId, row]))

  return c.json({
    unattributedCount,
    shows: shows.map((show) => ({
      ...toShowDto(show),
      // Editable here and nowhere else, which is why it rides on this
      // response rather than on the public ShowDto: a phone has no use for
      // the regex that attributed its episodes, and putting it in the delta
      // would grow every sync for nobody's benefit.
      matchPattern: show.matchPattern,
      episodeCount: byShow.get(show.id)?._count._all ?? 0,
      latestEpisodeAt: byShow.get(show.id)?._max.publishedAt?.toISOString() ?? null,
    })),
  })
})

/**
 * The ingest's history — how the dashboard shows feed syncs.
 *
 * Newest first, and capped: this table grows by one row a day forever, and
 * nothing on the page reads past the first screenful.
 */
admin.get('/syncs', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 100)
  const runs = await prisma.feedSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit })
  return c.json({ runs: runs.map(toSyncRunDto) })
})

/** The nine feeds, and how each one went last time it was read. */
admin.get('/feeds', async (c) => {
  const sources = await prisma.feedSource.findMany({ orderBy: { sortIndex: 'asc' } })
  return c.json({ feeds: sources.map(toFeedSourceDto) })
})

// ─── The dashboard's writes ──────────────────────────────────────────────────

/**
 * Runs the ingest now, rather than waiting for tomorrow's cron.
 *
 * Safe to call twice: ingest is additive, so a second run against an unchanged
 * catalogue writes nothing at all. Separate from `/cron/sync` so that the
 * cron secret stays the cron's alone — this one is behind a staff session.
 */
admin.post('/sync', async (c) => {
  const result = await runSync()
  // An ingest that inserted anything has moved the shows it touched.
  if (result.itemsCreated > 0 || result.showsCreated > 0) {
    await invalidateTags([tags.shows, tags.episodes])
  }
  return c.json(result)
})

/**
 * Wipes the catalogue and rebuilds it from the feeds. For testing against a
 * real deployment, where the alternative is connecting to production Postgres
 * by hand.
 *
 * `POST`, never `GET`: a destructive action must not be reachable by anything
 * that follows links, and must not be replayable from a browser history entry.
 * On top of the session the body has to carry an explicit confirmation string
 * — a session can be left open on an unattended laptop, and this endpoint
 * would then be one stray request away from emptying the catalogue.
 *
 * Deletes are **hard** here, deliberately, unlike `DELETE /shows/:id`. A soft
 * delete would leave ~1,300 tombstones that every client then has to process,
 * only to be told about the same episodes again under new ids a second later.
 * Clients survive the round trip because they key on guid and slug, which the
 * rebuild reproduces exactly; what they see is every row's `updatedAt` moving,
 * so they re-download the catalogue once.
 */
admin.post('/resync', async (c) => {
  const body = resyncInput.safeParse(await c.req.json().catch(() => null))
  if (!body.success) {
    throw new HTTPException(400, {
      message: `Send {"confirm":"${CONFIRMATION}"} to confirm. This deletes every show and episode.`,
    })
  }

  const before = {
    shows: await prisma.show.count(),
    episodes: await prisma.episode.count(),
  }

  // Episodes first: they carry the foreign key.
  await prisma.episode.deleteMany({})
  await prisma.show.deleteMany({})

  // Without this the six regex-attributed shows are gone, and the sync that
  // follows cannot attribute Cannon Fodder, GCN News Minute or the rest —
  // several hundred episodes would come back unattributed instead.
  await seedFeedSources()
  await seedShows()

  const result = await runSync()

  // Everything changed, so nothing cached is still true.
  await invalidateTags([tags.shows, tags.episodes])

  return c.json({ deleted: before, resynced: result })
})
