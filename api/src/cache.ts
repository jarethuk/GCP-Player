import { invalidateByTag } from '@vercel/functions'
import { createMiddleware } from 'hono/factory'
import { env } from './env.js'

/** How long the edge may serve a catalogue response without asking us. */
const EDGE_TTL_SECONDS = 60 * 60

/**
 * A day of serving stale while a refresh happens behind it. The cron runs once
 * daily, so a response that is an hour old is already the same bytes as a fresh
 * one; this means a request after the TTL expires is still answered from the
 * edge rather than waiting on Postgres.
 */
const STALE_SECONDS = 60 * 60 * 24

/**
 * The cache tags a response carries, and that a write purges.
 *
 * Deliberately coarse. The catalogue is 32 shows and a few thousand episodes,
 * and a tag per row would buy nothing but a longer header — the only listing
 * that grows per show is a show's own episodes, so that is the only one with
 * its own tag.
 *
 * Tags are scoped to the Vercel project and environment, so they need no
 * prefix. They must not contain commas: that is the delimiter.
 */
export const tags = {
  /** The show list. Changes whenever any show does — including when one of
   *  them gains episodes, because that bumps its `updatedAt`. */
  shows: 'shows',
  /** One show's episode list. */
  show: (id: string) => `show:${id}`,
  /** The unattributed worklist and single-episode reads. */
  episodes: 'episodes',
} as const

/** Vercel's own header name. Not `Cache-Tag`, which it ignores. */
const CACHE_TAG_HEADER = 'Vercel-Cache-Tag'

/** Vercel accepts at most 16 tags in one invalidation call. */
const TAGS_PER_CALL = 16

/**
 * Marks cached responses stale so the next request refetches them.
 *
 * Invalidate rather than delete: a deleted entry is revalidated in the
 * *foreground*, so every client waiting on a popular URL hits Postgres at once
 * — precisely the stampede the cache exists to prevent. Invalidation serves the
 * stale copy instantly and refreshes behind it, which for a catalogue that is
 * seconds out of date is exactly right.
 *
 * Never throws, and does nothing off Vercel. A failed purge means a client sees
 * an edit up to an hour late; a failed *write* because the purge threw would be
 * far worse, and locally there is no CDN to talk to at all.
 */
export async function invalidateTags(tags: readonly string[]): Promise<void> {
  const unique = [...new Set(tags)].filter((tag) => tag.length > 0)
  // Nothing to purge when nothing was stored, so with the cache off this is a
  // network round trip on every write for no effect at all.
  if (unique.length === 0 || process.env.VERCEL !== '1' || !env().ENABLE_VERCEL_CACHE) return

  for (let offset = 0; offset < unique.length; offset += TAGS_PER_CALL) {
    const chunk = unique.slice(offset, offset + TAGS_PER_CALL)
    try {
      await invalidateByTag(chunk)
    } catch (cause) {
      console.error('cache invalidation failed', chunk, cause)
    }
  }
}

/**
 * Caches a public read at the edge for an hour.
 *
 * `max-age=0, must-revalidate` for the client, `s-maxage` for the CDN — a
 * deliberate split. The phone apps sync on launch and on pull-to-refresh, and
 * a private cache would make pull-to-refresh silently do nothing for an hour.
 * The shared cache is what the database actually needs protecting from, and
 * this keeps every request honest while still never reaching Postgres.
 *
 * `Vercel-CDN-Cache-Control` is set so Vercel's own TTL can't be shortened by
 * anything downstream reinterpreting `Cache-Control`; `CDN-Cache-Control`
 * covers any other proxy in between.
 *
 * Cache keys are the full URL, which is why `syncedAt` is the collection
 * maximum (see delta.ts): every client converges on the same few `?since=`
 * values, so there are only a handful of keys to hit.
 *
 * All of it is switchable with `ENABLE_VERCEL_CACHE=false`, which makes every
 * response here `no-store`.
 */
export function publicCache(...responseTags: readonly string[]) {
  return createMiddleware(async (c, next) => {
    await next()

    // Never cache an error — a blip would be served for an hour.
    if (c.res.status !== 200) {
      c.header('Cache-Control', 'no-store')
      return
    }

    // Switched off by ENABLE_VERCEL_CACHE. `no-store` rather than merely
    // dropping the CDN headers, so nothing in between holds a copy either —
    // a toggle that left a proxy caching would not answer the question it
    // exists to answer. The tag goes too: a tag on a response nothing stored
    // is a header nobody will ever purge.
    if (!env().ENABLE_VERCEL_CACHE) {
      c.header('Cache-Control', 'no-store')
      c.header(CACHE_TAG_HEADER, undefined)
      return
    }

    const shared = `s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`
    c.header('Cache-Control', `public, max-age=0, must-revalidate, ${shared}`)
    c.header('CDN-Cache-Control', `public, ${shared}`)
    c.header('Vercel-CDN-Cache-Control', `public, ${shared}`)

    // What a write purges to make this response refetch before its hour is up.
    //
    // Merged with anything the handler set, because some tags are only knowable
    // once the request has been resolved — a show's episodes are addressable by
    // cuid *or* slug, and both must carry the show's canonical id or purging
    // one URL would leave the other stale.
    const fromHandler = c.res.headers.get(CACHE_TAG_HEADER)?.split(',') ?? []
    const all = [...new Set([...fromHandler, ...responseTags])].filter((tag) => tag.length > 0)
    if (all.length > 0) c.header(CACHE_TAG_HEADER, all.join(','))
  })
}

/** Tags this response from inside a handler, for tags only known at runtime. */
export function tagResponse(
  c: { header: (name: string, value: string) => void },
  ...add: string[]
) {
  c.header(CACHE_TAG_HEADER, add.filter((tag) => tag.length > 0).join(','))
}

/**
 * Anything that writes, or that is read with a token. Vercel already declines
 * to cache a response to a request carrying `Authorization`, but saying so
 * explicitly means it doesn't depend on that staying true.
 *
 * Note this cannot run when the handler *throws* past it — an auth rejection
 * never reaches the line below. Errors are marked in the app's error and
 * not-found handlers instead, so the default is always "don't store this".
 */
export const noCache = createMiddleware(async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})
