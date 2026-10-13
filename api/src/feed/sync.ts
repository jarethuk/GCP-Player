import { invalidateTags, tags } from '../cache.js'
import { prisma } from '../db.js'
import { touchShows } from '../touch.js'
import type { FeedItem } from './parse-feed.js'
import { parseFeed } from './parse-feed.js'
import {
  fetchPatreonCollections,
  fetchPatreonPosts,
  type PatreonCollection,
  resolvePatreonFeeds,
} from './patreon.js'
import { type EpisodeUpdate, type PlanFeed, planSync, type ShowUpdate } from './plan.js'

export interface SyncResult {
  /** Null when the run changed nothing and failed nothing, so wasn't kept. */
  runId: string | null
  itemsSeen: number
  itemsCreated: number
  showsCreated: number
  duplicatesSkipped: number
  itemsUnattributed: number
  /** Existing shows marked as changed because their episodes changed. */
  showsTouched: number
  /** Stored episodes the feed had changed since they were ingested. */
  episodesUpdated: number
  showsUpdated: number
  /** Rows the feed disagrees with that a person has edited, so they stand. */
  overriddenSkipped: number
  /** Episodes given a number derived from release order. */
  numbersDerived: number
  failedFeeds: string[]
}

/** Matches the clients: a feed gets 20 seconds, then it counts as failed. */
const FETCH_TIMEOUT_MS = 20_000

/**
 * Rows per `createMany`. The first run inserts ~1,300 episodes; one statement
 * of that size is fine for Postgres but not for a function timeout if anything
 * upstream is slow, and chunking keeps a partial failure small.
 */
const INSERT_CHUNK = 500

/**
 * How long a run's record is kept. The history is for noticing a feed change
 * or a failing feed this week, not an archive, and at two cron runs a day plus
 * the dashboard's own it would otherwise grow without end.
 */
const RUN_HISTORY_DAYS = 7

/**
 * Deletes runs that started more than `RUN_HISTORY_DAYS` ago. Best-effort:
 * losing old history is never worth losing a sync over, so a failure here is
 * logged and the run carries on.
 */
async function pruneRunHistory(): Promise<void> {
  const cutoff = new Date(Date.now() - RUN_HISTORY_DAYS * 24 * 60 * 60 * 1000)
  try {
    await prisma.feedSyncRun.deleteMany({ where: { startedAt: { lt: cutoff } } })
  } catch (cause) {
    console.warn('[sync] could not prune run history', cause)
  }
}

/**
 * Applies the plan's updates inside one transaction.
 *
 * **Atomic, and on one `updatedAt`.** Both matter for the same reason: a client
 * reading half-written work would take the timestamp it found as its cursor and
 * never ask again for the rows written after it. One transaction means there is
 * no half; one timestamp means no row can straddle the cursor. It is the same
 * hazard touchShows avoids by doing its work in a single updateMany.
 *
 * `overridden: false` is repeated in every WHERE clause even though the plan
 * already excluded those rows. The plan works from a snapshot read at the start
 * of the run, and a person can edit a record while the feeds are being fetched;
 * putting the condition in the statement means the database refuses the write
 * rather than trusting a read that may be a few seconds stale.
 */
async function applyUpdates(
  shows: ShowUpdate[],
  episodes: (EpisodeUpdate & { showId: string | null })[],
  patreonLinks: { showId: string; patreonShowId: string }[],
  writtenAt: Date,
): Promise<void> {
  if (shows.length === 0 && episodes.length === 0 && patreonLinks.length === 0) return

  await prisma.$transaction([
    ...shows.map((show) =>
      prisma.show.updateMany({
        where: { id: show.id, overridden: false },
        data: {
          system: show.system,
          artworkUrl: show.artworkUrl,
          isPublic: show.isPublic,
          hash: show.hash,
          updatedAt: writtenAt,
        },
      }),
    ),
    // Fill-a-blank only, and never on an edited row: a show someone linked by
    // hand, or to a different collection, keeps what they chose.
    ...patreonLinks.map((link) =>
      prisma.show.updateMany({
        where: { id: link.showId, overridden: false, patreonShowId: null },
        data: { patreonShowId: link.patreonShowId, updatedAt: writtenAt },
      }),
    ),
    ...episodes.map((episode) =>
      prisma.episode.updateMany({
        // Never a tombstone. The plan is fed soft-deleted rows on purpose, so
        // that a deleted episode is not re-inserted by its cross-posted twin;
        // rewriting one would republish the deletion to every client for
        // nothing. A hand-deleted row is overridden anyway — this covers the
        // rest.
        where: { id: episode.id, overridden: false, deletedAt: null },
        data: {
          showId: episode.showId,
          title: episode.title,
          rawTitle: episode.rawTitle,
          description: episode.description,
          audioUrl: episode.audioUrl,
          patreonPostId: episode.patreonPostId,
          patreonPublishedAt: episode.patreonPublishedAt,
          durationSeconds: episode.durationSeconds,
          publishedAt: episode.publishedAt,
          season: episode.season,
          number: episode.number,
          numberIsDerived: episode.numberIsDerived,
          artworkUrl: episode.artworkUrl,
          videoUrl: episode.videoUrl,
          hash: episode.hash,
          updatedAt: writtenAt,
        },
      }),
    ),
  ])
}

/**
 * Every podcast collection on the network's Patreon, with its posts.
 *
 * Failures are reported by name, like a dead RSS feed: Patreon being down, or
 * changing the shape of an API it never promised to keep, costs the catalogue
 * the Patreon episodes and nothing else.
 */
async function fetchPatreon(): Promise<{
  collections: { collection: PatreonCollection; items: FeedItem[] }[]
  failed: string[]
}> {
  let collections: PatreonCollection[]
  try {
    collections = await fetchPatreonCollections()
  } catch {
    return { collections: [], failed: ['Patreon'] }
  }

  const fetched = await Promise.all(
    collections.map(async (collection) => {
      try {
        return { collection, items: await fetchPatreonPosts(collection.id) }
      } catch {
        return { collection, items: null }
      }
    }),
  )

  return {
    collections: fetched.flatMap(({ collection, items }) => (items ? [{ collection, items }] : [])),
    failed: fetched.filter((f) => f.items === null).map((f) => `Patreon: ${f.collection.title}`),
  }
}

/**
 * Reads every enabled feed and reconciles the catalogue against it.
 *
 * Inserts what is new, updates what the feed has changed, and leaves alone
 * anything a person has edited. The property everything rests on is that a run
 * against an unchanged catalogue writes *nothing*: no row is rewritten unless
 * its hash has moved, so `updatedAt` stays put and clients get an empty delta
 * rather than 1,300 rows a night.
 *
 * The first run after the hash column is deployed is the exception, and is
 * meant to be. Every stored row has a null hash, so every row reads as changed
 * and the whole catalogue is re-stamped once. That is the point of the change:
 * the old insert-only ingest could never apply an upstream correction, so this
 * is the run that finally pushes the feed's current truth to every client.
 */
export async function runSync(): Promise<SyncResult> {
  const run = await prisma.feedSyncRun.create({ data: {}, select: { id: true } })
  await pruneRunHistory()

  try {
    const sources = await prisma.feedSource.findMany({
      where: { isEnabled: true },
      orderBy: { sortIndex: 'asc' },
    })

    // Alongside the RSS feeds, and just as optional.
    const patreonFetch = fetchPatreon()

    // Fetched concurrently; a dead feed is reported, not fatal. One 404 must
    // not cost the user the other eight.
    const fetched = await Promise.all(
      sources.map(async (source) => {
        try {
          const response = await fetch(source.url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const parsed = parseFeed(await response.text())
          return { source, parsed, error: null as string | null }
        } catch (cause) {
          return {
            source,
            parsed: null,
            error: cause instanceof Error ? cause.message : String(cause),
          }
        }
      }),
    )

    await Promise.all(
      fetched.map(({ source, error }) =>
        prisma.feedSource.update({
          where: { id: source.id },
          data: { lastFetchedAt: new Date(), lastError: error },
        }),
      ),
    )

    const patreon = await patreonFetch
    const failedFeeds = [
      ...fetched.filter((f) => f.error !== null).map((f) => f.source.name),
      ...patreon.failed,
    ]
    const live = fetched.filter((f) => f.parsed !== null)

    // Only a total wash-out is worth failing the run over. Patreon alone is
    // not a catalogue: without the public feeds, every public show's early
    // releases would look like the whole of it.
    if (live.length === 0) {
      throw new Error(`no feeds could be read (${failedFeeds.join(', ')})`)
    }

    // Order matters: `sources` is sorted by sortIndex and Promise.all preserves
    // it, so the main feed is planned first and its copy of a cross-posted
    // episode is the one kept.
    const rssFeeds: PlanFeed[] = live.map(({ source, parsed }) => ({
      name: source.name,
      showTitle: source.showTitle,
      channelArtworkUrl: parsed?.channelArtworkUrl ?? null,
      items: parsed?.items ?? [],
    }))

    const [existingShows, existingEpisodes] = await Promise.all([
      // Soft-deleted shows included too, so a slug that is tombstoned is not
      // recreated under a unique-constraint violation.
      prisma.show.findMany({
        select: {
          id: true,
          slug: true,
          title: true,
          matchPattern: true,
          artworkUrl: true,
          system: true,
          hash: true,
          overridden: true,
          isPublic: true,
          patreonShowId: true,
          deletedAt: true,
        },
      }),
      // Every stored episode, but only the columns the plan needs — notably not
      // `description`, which is most of the bytes in the table and which the
      // plan compares through the hash rather than by reading. ~1,300 narrow
      // rows is a few hundred kilobytes and one round trip, far cheaper than
      // asking the database about each feed item in turn.
      //
      // Deliberately *including* soft-deleted rows. Their guids and titles go
      // into the plan's "already seen" sets, which is what stops the next cron
      // run resurrecting an episode someone deleted by hand — and stops a
      // cross-posted twin sneaking in to replace it.
      prisma.episode.findMany({
        select: {
          id: true,
          guid: true,
          title: true,
          showId: true,
          number: true,
          numberIsDerived: true,
          videoUrl: true,
          hash: true,
          overridden: true,
          patreonPostId: true,
          patreonPublishedAt: true,
          // Only to know whether it is null — a Patreon post the public feed
          // hasn't caught up with yet.
          audioUrl: true,
          deletedAt: true,
        },
      }),
    ])

    // Patreon last, after every public feed: the public copy of an episode is
    // the one kept, and it is what takes over an early release's row.
    const patreonFeeds = resolvePatreonFeeds(patreon.collections, existingShows)
    failedFeeds.push(...patreonFeeds.skipped.map((name) => `${name} (no show to attach to)`))
    const feeds = [...rssFeeds, ...patreonFeeds.feeds]

    const plan = planSync(
      feeds,
      existingShows,
      existingEpisodes.map(({ audioUrl, deletedAt, ...episode }) => ({
        ...episode,
        hasPublicAudio: audioUrl !== null,
        deleted: deletedAt !== null,
      })),
    )

    // Shows first: episodes carry a foreign key onto them.
    const createdShows = plan.shows.length
      ? await prisma.show.createManyAndReturn({
          data: plan.shows,
          skipDuplicates: true,
          select: { id: true, title: true },
        })
      : []

    const showIdByTitle = new Map<string, string>([
      ...existingShows.map((show) => [show.title.toLowerCase(), show.id] as const),
      ...createdShows.map((show) => [show.title.toLowerCase(), show.id] as const),
    ])

    // Shows that gained episodes in this run. Their `updatedAt` is bumped
    // below so clients know to come back for them — see touchShows.
    const gainedEpisodes = new Set<string>()

    let itemsCreated = 0
    for (let offset = 0; offset < plan.episodes.length; offset += INSERT_CHUNK) {
      const chunk = plan.episodes.slice(offset, offset + INSERT_CHUNK).map((episode) => {
        const { showTitle, ...rest } = episode
        const showId = showTitle ? (showIdByTitle.get(showTitle.toLowerCase()) ?? null) : null
        if (showId) gainedEpisodes.add(showId)
        return { ...rest, showId }
      })
      // skipDuplicates covers the guid unique index: a feed republishing an
      // item mid-run, or two runs overlapping, rather than the cross-post case
      // the plan already handled.
      const { count } = await prisma.episode.createMany({ data: chunk, skipDuplicates: true })
      itemsCreated += count
    }

    // Resolved the same way as the inserts: the plan speaks in show titles,
    // because it runs before any id exists.
    const episodeUpdates = plan.episodeUpdates.map((episode) => ({
      ...episode,
      showId: episode.showTitle
        ? (showIdByTitle.get(episode.showTitle.toLowerCase()) ?? null)
        : null,
    }))

    const writtenAt = new Date()
    await applyUpdates(plan.showUpdates, episodeUpdates, patreonFeeds.links, writtenAt)

    // An updated episode's show has changed as far as a client is concerned,
    // and nothing else in this run would say so: the show gained no episode, so
    // it is not in `gainedEpisodes`, and without a bump here the phones holding
    // it would never come back for the row.
    //
    // Both sides of a re-attribution, not just the new one. Sync moves an
    // episode between shows when an edited match pattern finally claims it, and
    // the show it *left* has to be marked too or the clients holding it will
    // never be told it has gone.
    const showIdByEpisodeId = new Map(existingEpisodes.map((e) => [e.id, e.showId] as const))
    const touchedByUpdate = episodeUpdates.flatMap((episode) => [
      showIdByEpisodeId.get(episode.id) ?? null,
      episode.showId,
    ])

    // A newly created show is already new to every client, and a show this run
    // updated has just had its own `updatedAt` written; neither needs marking.
    const linkedShows = patreonFeeds.links.map((link) => link.showId)
    const freshlyStamped = new Set([
      ...createdShows.map((show) => show.id),
      ...plan.showUpdates.map((show) => show.id),
      ...linkedShows,
    ])
    const showsTouched = await touchShows(
      [...gainedEpisodes, ...touchedByUpdate].filter(
        (id) => id !== null && !freshlyStamped.has(id),
      ),
    )

    // touchShows purged the shows it marked. A run that created a show, updated
    // one, or wrote any episode also changes the listings, and nothing else
    // would say so. A show this run updated is purged by id here rather than by
    // touchShows, which skipped it precisely because its timestamp was already
    // written — bumping a cursor the edge then serves from an hour-old copy
    // would move the data without anyone being able to see it.
    const wroteAnything =
      createdShows.length > 0 ||
      plan.showUpdates.length > 0 ||
      linkedShows.length > 0 ||
      episodeUpdates.length > 0 ||
      itemsCreated > 0
    if (wroteAnything) {
      await invalidateTags([
        tags.shows,
        tags.episodes,
        ...createdShows.map((show) => tags.show(show.id)),
        ...plan.showUpdates.map((show) => tags.show(show.id)),
        ...linkedShows.map((id) => tags.show(id)),
      ])
    }

    const result: SyncResult = {
      runId: run.id,
      itemsSeen: plan.itemsSeen,
      itemsCreated,
      showsCreated: createdShows.length,
      duplicatesSkipped: plan.duplicatesSkipped,
      itemsUnattributed: plan.itemsUnattributed,
      numbersDerived: plan.numbersDerived,
      showsTouched,
      episodesUpdated: episodeUpdates.length,
      showsUpdated: plan.showUpdates.length,
      overriddenSkipped: plan.overriddenSkipped,
      failedFeeds,
    }

    // A quiet run leaves no record. The cron polls every ten minutes through
    // the release windows, and a history of runs that found nothing would bury
    // the few that did. The row was still written at the start, so a run the
    // function timeout kills mid-way is left behind as RUNNING, not lost.
    if (!wroteAnything && showsTouched === 0 && failedFeeds.length === 0) {
      await prisma.feedSyncRun.delete({ where: { id: run.id } })
      return { ...result, runId: null }
    }

    await prisma.feedSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        itemsSeen: result.itemsSeen,
        itemsCreated: result.itemsCreated,
        showsCreated: result.showsCreated,
        duplicatesSkipped: result.duplicatesSkipped,
        itemsUnattributed: result.itemsUnattributed,
        numbersDerived: result.numbersDerived,
        episodesUpdated: result.episodesUpdated,
        showsUpdated: result.showsUpdated,
        overriddenSkipped: result.overriddenSkipped,
        failedFeeds: result.failedFeeds,
      },
    })

    return result
  } catch (cause) {
    await prisma.feedSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        error: cause instanceof Error ? cause.message : String(cause),
      },
    })
    throw cause
  }
}
