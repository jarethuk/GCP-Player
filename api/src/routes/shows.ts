import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AppEnv, requireStaff } from '../auth.js'
import { invalidateTags, noCache, publicCache, tagResponse, tags } from '../cache.js'
import { prisma } from '../db.js'
import { deltaEnvelope, sinceQuery } from '../delta.js'
import { toEpisodeDto, toShowDto } from '../serialise.js'
import { defined } from '../util.js'

export const shows = new Hono<AppEnv>()

/**
 * `:id` is the cuid or the slug. The phone apps already key shows by slug, and
 * making them migrate to cuids buys nothing today.
 *
 * A soft-deleted show is not found: it exists only as a tombstone in a delta.
 */
async function resolveShowId(idOrSlug: string): Promise<string> {
  const show = await prisma.show.findFirst({
    where: { deletedAt: null, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  })
  if (!show) throw new HTTPException(404, { message: `No show "${idOrSlug}"` })
  return show.id
}

function parseSince(raw: string | undefined): Date | undefined {
  const parsed = sinceQuery.safeParse({ since: raw })
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: '`since` must be an ISO-8601 timestamp with an offset',
    })
  }
  return parsed.data.since ? new Date(parsed.data.since) : undefined
}

/**
 * Whether the caller understands Patreon: `?patreon=1`.
 *
 * Opt-in because the apps already installed don't. They decode `audioUrl` as
 * a string, and one null in a response fails the whole sync — so a client that
 * doesn't ask is sent the catalogue as it was before Patreon: no Patreon-only
 * shows, and no episode it couldn't play. It loses nothing it had. An early
 * release reaches it the moment the public feed catches up, because that is
 * when the row gains its `audioUrl` and its `updatedAt` moves.
 *
 * Part of the URL, so each answer is its own cache entry; the tags are shared,
 * so one purge clears both.
 */
function wantsPatreon(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true'
}

// ─── Reads ───────────────────────────────────────────────────────────────────

shows.get('/', publicCache(tags.shows), async (c) => {
  const since = parseSince(c.req.query('since'))
  const patreon = wantsPatreon(c.req.query('patreon'))

  const rows = await prisma.show.findMany({
    // With a cursor, tombstones travel too — that is the whole point of the
    // soft delete. Without one, the caller wants today's catalogue and has
    // nothing to remove.
    where: {
      ...(since ? { updatedAt: { gt: since } } : { deletedAt: null }),
      ...(patreon ? {} : { isPublic: true }),
    },
    // Matches the [updatedAt, id] index, and gives a stable order for a cursor
    // if this ever needs paginating.
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
  })

  const envelope = await deltaEnvelope(rows, since, async () => {
    const result = await prisma.show.aggregate({ _max: { updatedAt: true } })
    return result._max.updatedAt
  })

  return c.json({ ...envelope, shows: rows.map(toShowDto) })
})

shows.get('/:id/episodes', publicCache(tags.episodes), async (c) => {
  const showId = await resolveShowId(c.req.param('id'))
  const since = parseSince(c.req.query('since'))
  const patreon = wantsPatreon(c.req.query('patreon'))

  const rows = await prisma.episode.findMany({
    where: {
      showId,
      ...(since ? { updatedAt: { gt: since } } : { deletedAt: null }),
      ...(patreon ? {} : { audioUrl: { not: null } }),
    },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
  })

  const envelope = await deltaEnvelope(rows, since, async () => {
    const result = await prisma.episode.aggregate({
      where: { showId },
      _max: { updatedAt: true },
    })
    return result._max.updatedAt
  })

  // The show's canonical id, not the path parameter: this URL is reachable by
  // slug and by cuid, and both entries have to be purged by the same tag.
  tagResponse(c, tags.show(showId))

  return c.json({ ...envelope, episodes: rows.map(toEpisodeDto) })
})

// ─── Writes ──────────────────────────────────────────────────────────────────

const showInput = z.object({
  slug: z.string().min(1).max(80),
  title: z.string().min(1),
  system: z.string().nullish(),
  description: z.string().nullish(),
  artworkUrl: z.url().nullish(),
  matchPattern: z.string().nullish(),
  /** The Patreon collection id — the `show` in a patron's feed URL. */
  patreonShowId: z.string().regex(/^\d+$/, 'a Patreon collection id is numeric').nullish(),
  isPublic: z.boolean().optional(),
})

/**
 * Editing accepts one field creating does not: `overridden`.
 *
 * It defaults to true on any edit, so it never has to be sent — the point of
 * the flag is that editing sets it without anyone having to remember. Sending
 * it as `false` is the one way back: it hands the row to the feeds again, and
 * the next run reconciles it like any other.
 */
const showPatchInput = showInput.partial().extend({ overridden: z.boolean().optional() })

shows.post('/', requireStaff, noCache, async (c) => {
  const body = showInput.safeParse(await c.req.json().catch(() => null))
  if (!body.success) throw new HTTPException(400, { message: z.prettifyError(body.error) })

  const created = await prisma.show.create({ data: defined(body.data) })
  await invalidateTags([tags.shows])
  return c.json(toShowDto(created), 201)
})

shows.patch('/:id', requireStaff, noCache, async (c) => {
  const showId = await resolveShowId(c.req.param('id'))
  const body = showPatchInput.safeParse(await c.req.json().catch(() => null))
  if (!body.success) throw new HTTPException(400, { message: z.prettifyError(body.error) })

  const { overridden, ...rest } = body.data

  const updated = await prisma.show.update({
    where: { id: showId },
    data: {
      ...defined(rest),
      // Editing a show hands it to the person who edited it: ingest will not
      // touch it again, in any field. That is the trade — a correction that
      // survives every future run, at the cost of the row no longer tracking
      // the feed. Sending `false` gives it back.
      overridden: overridden ?? true,
      // A hand-edited row has no valid fingerprint: the hash describes what
      // *sync* last wrote, and this write was not sync. Clearing it matters on
      // the way back — a released row whose stale hash still matched the feed
      // would be seen as unchanged, and the edit would quietly stand for ever
      // instead of being reconciled away.
      hash: null,
    },
  })
  await invalidateTags([tags.shows])
  return c.json(toShowDto(updated))
})

shows.delete('/:id', requireStaff, noCache, async (c) => {
  const showId = await resolveShowId(c.req.param('id'))
  const deletedAt = new Date()

  await prisma.$transaction([
    // The episodes are tombstoned but keep their `showId`. Detaching them
    // would put them in the unattributed worklist as if they needed a home,
    // and their tombstones would be unreachable anyway — `/shows/:id/episodes`
    // stops resolving the moment the show does. Clients learn to drop them
    // from the show's own tombstone; this keeps them out of every other read.
    prisma.episode.updateMany({
      where: { showId, deletedAt: null },
      data: { deletedAt, updatedAt: deletedAt, overridden: true },
    }),
    prisma.show.update({
      where: { id: showId },
      // Overridden as well as deleted. A tombstone is still a row the feeds
      // still carry, and without this the next run would reconcile it against
      // them — rewriting its fields and republishing the deletion to every
      // client, nightly, for ever.
      data: { deletedAt, updatedAt: deletedAt, overridden: true },
    }),
  ])

  await invalidateTags([tags.shows, tags.show(showId), tags.episodes])

  return c.body(null, 204)
})
