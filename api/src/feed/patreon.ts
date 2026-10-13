import type { FeedItem } from './parse-feed.js'
import { collapseWhitespace, parsePatreonCollectionTitle } from './parse-title.js'
import { type ExistingShow, PATREON_GUID_PREFIX, type PlanFeed } from './plan.js'
import { PATREON_SHOW_LINKS } from './sources.js'

/**
 * Patreon, as a source of episodes.
 *
 * Some of the network's shows exist only on Patreon, and the public ones get
 * their episodes there first — Blood of the Wild's patrons are more than a
 * season ahead. The catalogue should know about all of it, and the phones
 * should be able to play it for a patron. But not from here: the audio of a
 * Patreon post is only reachable through a patron's personal feed, whose URL
 * carries their own token, and that token never leaves their phone.
 *
 * So the split is:
 *
 *  - **The API reads Patreon's public, unauthenticated JSON** — the same one
 *    the campaign page uses. It lists the podcast collections and every post
 *    in them: title, date, duration. No audio, and no token needed to get
 *    this far. Those posts become episodes with a null `audioUrl` and their
 *    `patreonPostId`.
 *  - **A client with a token fetches the patron's feed itself**,
 *    `https://www.patreon.com/rss/<creator>?auth=<token>&show=<patreonShowId>`,
 *    and matches each item's `<guid>` — the bare post id — to `patreonPostId`.
 *
 * These are Patreon's internal endpoints, not its documented API (which
 * needs a creator's OAuth token to read anyone's posts). They have been
 * stable, but they are not promised to be: a change will surface as the
 * "Patreon" feed in a run's failed feeds, and the RSS catalogue carries on
 * without it.
 */

/** The Glass Cannon Network's Patreon campaign. */
export const PATREON_CAMPAIGN_ID = '369921'

const API = 'https://www.patreon.com/api'
const FETCH_TIMEOUT_MS = 20_000
/**
 * The largest collection has ~300 posts and Patreon answers 500 in one page,
 * so this is one request per collection today. The cursor is followed anyway.
 */
const PAGE_SIZE = 500
/** A guard against a cursor that never ends, not a real limit. */
const MAX_PAGES = 20

export interface PatreonCollection {
  /** What Patreon's API calls a collection, and a patron's feed calls `show`. */
  id: string
  title: string
  /** Signed, and expires within weeks. See planSync's artwork note. */
  artworkUrl: string | null
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asObject = (value: unknown): Json => (isObject(value) ? value : {})

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null

/**
 * The podcast collections, from the campaign's launcher feed — the carousel of
 * shows at the top of the Patreon page. Sections of any other type (the
 * creator's "Featured" row) are not shows and are skipped.
 */
export function parsePatreonCollections(body: unknown): PatreonCollection[] {
  const data = asObject(body).data
  if (!Array.isArray(data)) throw new Error('Patreon launcher feed has no data')

  const collections: PatreonCollection[] = []
  for (const section of data) {
    const attributes = asObject(asObject(section).attributes)
    if (attributes.section_type_id !== 'posts_by_podcast') continue

    const header = asObject(attributes.header)
    const destination = asObject(asObject(header.navigation).destination)
    const id = /^collection\/(\d+)$/.exec(asString(destination.internal_destination) ?? '')?.[1]
    const title = asString(header.title)
    if (!id || !title) continue

    collections.push({
      id,
      title: collapseWhitespace(title),
      artworkUrl: asString(header.image_url),
    })
  }
  return collections
}

/**
 * One page of a collection's posts, as feed items.
 *
 * Only posts carrying audio: a collection can hold a text announcement, and
 * that is not an episode. The duration lives on the included `media` row, not
 * on the post. `audioUrl` is null on every item — see the file comment.
 */
export function parsePatreonPosts(body: unknown): { items: FeedItem[]; next: string | null } {
  const root = asObject(body)
  const data = root.data
  if (!Array.isArray(data)) throw new Error('Patreon posts response has no data')

  const durations = new Map<string, number>()
  for (const included of Array.isArray(root.included) ? root.included : []) {
    const media = asObject(included)
    const seconds = asObject(asObject(media.attributes).metadata).duration_s
    if (media.type === 'media' && typeof media.id === 'string' && typeof seconds === 'number') {
      durations.set(media.id, Math.round(seconds))
    }
  }

  const items: FeedItem[] = []
  for (const entry of data) {
    const post = asObject(entry)
    const id = asString(post.id)
    const attributes = asObject(post.attributes)
    const title = asString(attributes.title)
    const published = asString(attributes.published_at)
    const audioId = asString(asObject(asObject(asObject(post.relationships).audio).data).id)
    if (!id || !title || !published || !audioId) continue

    const publishedAt = new Date(published)
    if (Number.isNaN(publishedAt.getTime())) continue

    items.push({
      guid: `${PATREON_GUID_PREFIX}${id}`,
      patreonPostId: id,
      rawTitle: collapseWhitespace(title),
      // The body of a locked post is not public, and neither is its audio.
      description: null,
      audioUrl: null,
      durationSeconds: durations.get(audioId) ?? null,
      publishedAt,
      // Per-post images are signed and expire. Stored on 1,000 rows they
      // would re-stamp every one of them each time Patreon re-signed them.
      artworkUrl: null,
      videoUrl: null,
    })
  }

  const next = asString(asObject(asObject(asObject(root.meta).pagination).cursors).next)
  return { items, next }
}

/**
 * Turns the collections into plan feeds, each pointed at the show it belongs
 * to, and says which stored shows need their `patreonShowId` filling in.
 *
 * A collection belongs to:
 *
 *  1. the show already carrying its id;
 *  2. else the show `knownLinks` names for it, which is then linked. If that
 *     show doesn't exist yet — a fresh database — the collection sits this
 *     run out: guessing by title is exactly what the list is there to stop,
 *     and the public feeds create the show in the same run, so the next one
 *     links it;
 *  3. else a live show whose title is the collection's first segment, which
 *     is then linked, unless someone has edited it;
 *  4. else a new show, which the plan creates with `isPublic: false`.
 *
 * A collection whose show was deleted, or whose title belongs to a show
 * already linked to a *different* collection, is left out rather than
 * attached somewhere it may not belong. Each is named in `skipped`.
 */
export function resolvePatreonFeeds(
  collections: { collection: PatreonCollection; items: FeedItem[] }[],
  existingShows: (ExistingShow & {
    slug: string
    patreonShowId: string | null
    deletedAt: Date | null
  })[],
  knownLinks: readonly { slug: string; patreonShowId: string }[] = PATREON_SHOW_LINKS,
): { feeds: PlanFeed[]; links: { showId: string; patreonShowId: string }[]; skipped: string[] } {
  const byPatreonId = new Map(
    existingShows.filter((show) => show.patreonShowId).map((show) => [show.patreonShowId, show]),
  )
  const bySlug = new Map(existingShows.map((show) => [show.slug, show]))
  const byTitle = new Map(existingShows.map((show) => [show.title.toLowerCase(), show]))
  const knownSlug = new Map(knownLinks.map((link) => [link.patreonShowId, link.slug]))

  const feeds: PlanFeed[] = []
  const links: { showId: string; patreonShowId: string }[] = []
  const skipped: string[] = []

  for (const { collection, items } of collections) {
    const name = `Patreon: ${collection.title}`
    const parsed = parsePatreonCollectionTitle(collection.title)

    let show = byPatreonId.get(collection.id)
    const slug = knownSlug.get(collection.id)
    if (!show && slug) {
      show = bySlug.get(slug)
      if (!show || show.patreonShowId || show.deletedAt) {
        skipped.push(name)
        continue
      }
      links.push({ showId: show.id, patreonShowId: collection.id })
    }
    if (!show) {
      const titled = byTitle.get(parsed.showTitle.toLowerCase())
      if (titled?.patreonShowId) {
        skipped.push(name)
        continue
      }
      if (titled && !titled.deletedAt && !titled.overridden) {
        links.push({ showId: titled.id, patreonShowId: collection.id })
      }
      show = titled
    }
    if (show?.deletedAt) {
      skipped.push(name)
      continue
    }

    feeds.push({
      name,
      showTitle: show?.title ?? parsed.showTitle,
      channelArtworkUrl: collection.artworkUrl,
      // Patreon's post titles carry no system, so the collection's stands in.
      fallbackSystem: parsed.system,
      patreonShowId: collection.id,
      items,
    })
  }

  return { feeds, links, skipped }
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/vnd.api+json, application/json' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function fetchPatreonCollections(
  campaignId = PATREON_CAMPAIGN_ID,
): Promise<PatreonCollection[]> {
  const url = new URL(`${API}/cwh_feed/v1`)
  url.searchParams.set('fields[launcher-feed-section]', 'section_type_id,header')
  url.searchParams.set('filter[campaign_id]', campaignId)
  url.searchParams.set('json-api-version', '1.0')
  url.searchParams.set('json-api-use-default-includes', 'false')
  url.searchParams.set('json-api-use-default-fields', 'false')
  return parsePatreonCollections(await getJson(url.toString()))
}

export async function fetchPatreonPosts(
  collectionId: string,
  campaignId = PATREON_CAMPAIGN_ID,
): Promise<FeedItem[]> {
  const items: FeedItem[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/posts`)
    url.searchParams.set('filter[campaign_id]', campaignId)
    url.searchParams.set('filter[collection_id]', collectionId)
    // Without this the locked posts — nearly all of them — are left out.
    url.searchParams.set('filter[contains_exclusive_posts]', 'true')
    url.searchParams.set('sort', 'published_at')
    url.searchParams.set('fields[post]', 'title,published_at,post_type')
    url.searchParams.set('fields[media]', 'metadata')
    url.searchParams.set('include', 'audio')
    url.searchParams.set('page[count]', String(PAGE_SIZE))
    if (cursor) url.searchParams.set('page[cursor]', cursor)
    url.searchParams.set('json-api-version', '1.0')
    url.searchParams.set('json-api-use-default-includes', 'false')

    const { items: pageItems, next } = parsePatreonPosts(await getJson(url.toString()))
    items.push(...pageItems)
    if (!next) return items
    cursor = next
  }
  throw new Error(`more than ${MAX_PAGES} pages of posts`)
}
