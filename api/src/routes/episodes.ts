import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AppEnv, requireStaff } from '../auth.js'
import { invalidateTags, noCache, publicCache, tagResponse, tags } from '../cache.js'
import { prisma } from '../db.js'
import { toEpisodeDto } from '../serialise.js'
import { touchShows } from '../touch.js'
import { defined } from '../util.js'

export const episodes = new Hono<AppEnv>()

/**
 * Episodes are read per show, but they cannot be *written* that way.
 *
 * An episode the parser couldn't attribute has no show to nest under, and
 * attributing it by hand is the single most useful edit this API offers —
 * there are currently nine such episodes. The same applies to an episode
 * orphaned by deleting its show. So writes live here, addressed by episode id
 * alone, and `/shows/:id/episodes` stays a read endpoint.
 */

const episodeInput = z.object({
  showId: z.string().nullish(),
  title: z.string().min(1),
  description: z.string().nullish(),
  audioUrl: z.url(),
  durationSeconds: z.int().positive().nullish(),
  publishedAt: z.iso.datetime({ offset: true }),
  season: z.int().positive().nullish(),
  // Zero is a real episode number, not a missing one: the network's feeds
  // number their character-creation episodes "E0" — "Session Zero | Get in the
  // Trunk ... E0" and three others are in the catalogue today. Ingest never
  // passes through this schema, so rejecting 0 here made a row the API had
  // created impossible to save back, and attributing one to a show failed on a
  // field the editor never touched. `null` still means unnumbered.
  number: z.int().nonnegative().nullish(),
  artworkUrl: z.url().nullish(),
  // Editable, but only usefully so upwards: ingest fills this when it is null,
  // so clearing one the feed still carries lasts until the next run. Correcting
  // a wrong link sticks, because a non-null value is never overwritten.
  videoUrl: z.url().nullish(),
})

/** Editing accepts one field creating does not — see the note in shows.ts. */
const episodePatchInput = episodeInput.partial().extend({ overridden: z.boolean().optional() })

/** Everything the feed could not attribute — the editing worklist. */
episodes.get('/unattributed', publicCache(tags.episodes), async (c) => {
  const rows = await prisma.episode.findMany({
    where: { showId: null, deletedAt: null },
    orderBy: { publishedAt: 'asc' },
  })
  return c.json({ episodes: rows.map(toEpisodeDto) })
})

episodes.get('/:id', publicCache(tags.episodes), async (c) => {
  const episode = await prisma.episode.findFirst({
    where: { id: c.req.param('id'), deletedAt: null },
  })
  if (!episode) throw new HTTPException(404, { message: 'No such episode' })

  // Its show's tag too: re-attributing it changes this response, and that purge
  // is keyed on the show.
  tagResponse(c, tags.episodes, ...(episode.showId ? [tags.show(episode.showId)] : []))

  return c.json(toEpisodeDto(episode))
})

episodes.post('/', requireStaff, noCache, async (c) => {
  const body = episodeInput
    .extend({ guid: z.string().min(1), rawTitle: z.string().min(1).optional() })
    .safeParse(await c.req.json().catch(() => null))
  if (!body.success) throw new HTTPException(400, { message: z.prettifyError(body.error) })

  const { publishedAt, rawTitle, showId, ...rest } = body.data

  if (showId) {
    const show = await prisma.show.findUnique({ where: { id: showId }, select: { id: true } })
    if (!show) throw new HTTPException(400, { message: `No show "${showId}"` })
  }

  const created = await prisma.episode.create({
    data: defined({
      ...rest,
      showId,
      // A hand-made episode has no feed line to keep; its own title stands in
      // so the column is never empty.
      rawTitle: rawTitle ?? rest.title,
      publishedAt: new Date(publishedAt),
    }),
  })

  // touchShows purges the show tags; the episode listings need saying here.
  await touchShows([created.showId])
  await invalidateTags([tags.episodes])

  return c.json(toEpisodeDto(created), 201)
})

episodes.patch('/:id', requireStaff, noCache, async (c) => {
  const body = episodePatchInput.safeParse(await c.req.json().catch(() => null))
  if (!body.success) throw new HTTPException(400, { message: z.prettifyError(body.error) })

  const { publishedAt, showId, overridden, ...rest } = body.data

  // A showId that doesn't exist would come back as an opaque foreign-key error.
  if (showId) {
    const show = await prisma.show.findUnique({ where: { id: showId }, select: { id: true } })
    if (!show) throw new HTTPException(400, { message: `No show "${showId}"` })
  }

  // Read the current show before the write: re-attributing an episode changes
  // two shows, and the one it is leaving has to be marked too or the clients
  // that hold it will never be told it has gone.
  const before = await prisma.episode.findFirst({
    where: { id: c.req.param('id'), deletedAt: null },
    select: { showId: true },
  })
  if (!before) throw new HTTPException(404, { message: 'No such episode' })

  const updated = await prisma.episode.update({
    where: { id: c.req.param('id') },
    data: {
      ...defined({
        ...rest,
        showId,
        ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
      }),
      // Ingest leaves this row alone from here on. Attributing one of the nine
      // unattributed episodes therefore sticks, even though its title still
      // parses to no show at all. Sending `false` gives it back to the feeds.
      overridden: overridden ?? true,
      // See the note in shows.ts: a hand-edited row has no valid fingerprint,
      // and clearing it is what lets a released row be reconciled again.
      hash: null,
    },
  })

  await touchShows([before.showId, updated.showId])
  await invalidateTags([tags.episodes])

  return c.json(toEpisodeDto(updated))
})

episodes.delete('/:id', requireStaff, noCache, async (c) => {
  // Soft: a `?since=` delta cannot report a row that is simply gone, so the
  // tombstone is how a phone learns to drop the episode — and to free whatever
  // it had downloaded of it.
  const deletedAt = new Date()
  const deleted = await prisma.episode
    .update({
      where: { id: c.req.param('id') },
      // Overridden too — see the note on deleting a show. A tombstone the feed
      // still carries would otherwise be reconciled against it on every run.
      data: { deletedAt, updatedAt: deletedAt, overridden: true },
      select: { showId: true },
    })
    .catch(() => {
      throw new HTTPException(404, { message: 'No such episode' })
    })

  await touchShows([deleted.showId])
  await invalidateTags([tags.episodes])
  return c.body(null, 204)
})
