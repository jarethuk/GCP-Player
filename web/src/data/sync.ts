/**
 * Brings the local copy in line with the catalogue API. A port of
 * iOS/GCP Player/SyncEngine.swift, and the same three rules:
 *
 * 1. **Local state is never touched.** Played, position and starred belong to
 *    this browser; only the catalogue fields are written.
 * 2. **Only what changed is asked for.** The API marks a show whenever its
 *    episodes change, so the shows a delta returns are exactly the shows worth
 *    looking inside. A visit with nothing new is one request.
 * 3. **A tombstone is a deletion.**
 */

import type { CatalogueClient, EpisodeDTO, EpisodesResponse, ShowDTO } from './api'
import type { Library } from './library'
import type { Episode, Show } from './types'

export interface SyncResult {
  showsCreated: number
  showsRemoved: number
  /** Shows whose episodes were actually asked for. */
  showsChecked: number
  episodesCreated: number
  episodesUpdated: number
  episodesRemoved: number
  /** Shows whose episode delta failed. Their cursors are left alone. */
  failedShows: string[]
}

const DISTANT_PAST = 0

function time(iso: string): number {
  return Date.parse(iso)
}

export async function sync(library: Library, api: CatalogueClient): Promise<SyncResult> {
  const result: SyncResult = {
    showsCreated: 0,
    showsRemoved: 0,
    showsChecked: 0,
    episodesCreated: 0,
    episodesUpdated: 0,
    episodesRemoved: 0,
    failedShows: [],
  }

  const showsBySlug = new Map(library.getSnapshot().shows)

  // Unlike the phones, the web app has always asked for Patreon — but the
  // flag is kept, so the same code path starts every cursor over should it
  // ever be cleared.
  const needsPatreonCatalogue = !(await library.getMeta('catalogueIncludesPatreon'))
  if (needsPatreonCatalogue) {
    await library.deleteMeta('showsSyncedAt')
    for (const [slug, show] of showsBySlug)
      showsBySlug.set(slug, { ...show, episodesSyncedAt: null })
  }

  // A cursor with nothing to apply it to would skip the whole catalogue and
  // leave the app permanently empty — so an empty library asks for everything.
  const storedCursor = (await library.getMeta('showsSyncedAt')) ?? null
  const since = showsBySlug.size === 0 ? null : storedCursor

  // -- Shows -----------------------------------------------------------------

  const response = await api.fetchShows(since)
  const changedSlugs = new Set<string>()
  const removedSlugs = new Set<string>()

  for (const dto of response.shows) {
    if (dto.deletedAt !== null) {
      if (showsBySlug.delete(dto.slug)) {
        removedSlugs.add(dto.slug)
        result.showsRemoved += 1
      }
      continue
    }
    changedSlugs.add(dto.slug)
    const existing = showsBySlug.get(dto.slug)
    if (!existing) result.showsCreated += 1
    showsBySlug.set(dto.slug, applyShow(dto, existing))
  }

  // A full answer is also a complete one: anything held that the server
  // didn't list is gone.
  if (response.fullResync) {
    const listed = new Set(response.shows.map((dto) => dto.slug))
    for (const slug of [...showsBySlug.keys()]) {
      if (listed.has(slug)) continue
      showsBySlug.delete(slug)
      removedSlugs.add(slug)
      result.showsRemoved += 1
    }
  }

  await library.write({
    putShows: [...showsBySlug.values()],
    deleteShows: [...removedSlugs],
    deleteEpisodes: [...removedSlugs].flatMap((slug) =>
      library.episodesOf(slug).map((episode) => episode.guid),
    ),
  })

  // -- Episodes: a delta for the shows that changed ----------------------------

  // Plus any show that has never had its episodes fetched — a run that failed
  // partway through would otherwise leave it empty for good.
  const cursors = [...showsBySlug.values()]
    .filter((show) => changedSlugs.has(show.slug) || show.episodesSyncedAt === null)
    .map((show) => ({ slug: show.slug, since: show.episodesSyncedAt }))
  result.showsChecked = cursors.length

  // Concurrently: on a first visit this is one request per show.
  const deltas = await Promise.all(
    cursors.map(async ({ slug, since }) => {
      try {
        return { slug, delta: await api.fetchEpisodes(slug, since) }
      } catch (error) {
        return { slug, error }
      }
    }),
  )

  const putShows: Show[] = []
  const putEpisodes: Episode[] = []
  const deleteEpisodes: string[] = []

  for (const outcome of deltas) {
    const show = showsBySlug.get(outcome.slug)
    if (!show) continue
    if (!('delta' in outcome) || !outcome.delta) {
      result.failedShows.push(outcome.slug)
      continue
    }
    const delta: EpisodesResponse = outcome.delta
    const snapshot = library.getSnapshot()

    // Newest publish dates, for the sort and the NEW chip — of what anyone can
    // play, and of everything. A full answer starts from nothing.
    let latestPublic = delta.fullResync ? DISTANT_PAST : show.latestPublicEpisodeAt
    let latestAny = delta.fullResync ? DISTANT_PAST : show.latestAnyEpisodeAt
    let removedAny = false

    for (const dto of delta.episodes) {
      if (dto.deletedAt !== null) {
        if (snapshot.episodes.has(dto.guid)) {
          deleteEpisodes.push(dto.guid)
          result.episodesRemoved += 1
          removedAny = true
        }
        continue
      }
      const publishedAt = time(dto.publishedAt)
      latestAny = Math.max(latestAny, publishedAt)
      if (dto.audioUrl !== null) latestPublic = Math.max(latestPublic, publishedAt)

      const existing = snapshot.episodes.get(dto.guid)
      if (existing) result.episodesUpdated += 1
      else result.episodesCreated += 1
      putEpisodes.push(applyEpisode(dto, existing, show.slug))
    }

    if (removedAny) {
      // Folding a maximum only moves it forwards, so a deletion is recomputed
      // from what is left.
      const deleted = new Set(deleteEpisodes)
      const updated = new Map(putEpisodes.map((episode) => [episode.guid, episode]))
      const remaining = [
        ...library.episodesOf(show.slug).filter((episode) => !updated.has(episode.guid)),
        ...putEpisodes.filter((episode) => episode.showSlug === show.slug),
      ].filter((episode) => !deleted.has(episode.guid))
      latestAny = Math.max(DISTANT_PAST, ...remaining.map((episode) => episode.publishedAt))
      latestPublic = Math.max(
        DISTANT_PAST,
        ...remaining.filter((episode) => episode.audioUrl !== null).map((e) => e.publishedAt),
      )
    }

    // Only after the rows are in hand: a cursor advanced past data that failed
    // to apply would skip it for good.
    putShows.push({
      ...show,
      latestPublicEpisodeAt: latestPublic,
      latestAnyEpisodeAt: latestAny,
      latestEpisodeAt: latestAny,
      episodesSyncedAt: delta.syncedAt,
    })
  }

  await library.write({ putShows, putEpisodes, deleteEpisodes })

  // Last, and only once the shows it describes are committed.
  await library.setMeta('showsSyncedAt', response.syncedAt)
  if (needsPatreonCatalogue && result.failedShows.length === 0) {
    await library.setMeta('catalogueIncludesPatreon', true)
  }
  return result
}

/**
 * Throws away everything held locally and fetches it again — the escape hatch
 * for a copy that has drifted, which a delta can't repair.
 */
export async function clearAndResync(library: Library, api: CatalogueClient): Promise<SyncResult> {
  await library.clear()
  // The cursor goes too, or the resync asks only for what changed since a
  // catalogue that is no longer here.
  await library.deleteMeta('showsSyncedAt')
  return sync(library, api)
}

// -- Applying one row ----------------------------------------------------------

function applyShow(dto: ShowDTO, existing: Show | undefined): Show {
  return {
    // This browser's own, and left alone.
    episodesSyncedAt: null,
    latestEpisodeAt: DISTANT_PAST,
    latestPublicEpisodeAt: DISTANT_PAST,
    latestAnyEpisodeAt: DISTANT_PAST,
    isStarred: false,
    starredUpdatedAt: null,
    ...existing,
    id: dto.id,
    slug: dto.slug,
    title: dto.title,
    system: dto.system,
    artworkUrl: dto.artworkUrl,
    patreonShowId: dto.patreonShowId ?? null,
    isPublic: dto.isPublic ?? true,
  }
}

function applyEpisode(dto: EpisodeDTO, existing: Episode | undefined, showSlug: string): Episode {
  return {
    patreonDurationSeconds: null,
    isPlayed: false,
    positionSeconds: 0,
    stateUpdatedAt: null,
    ...existing,
    id: dto.id,
    guid: dto.guid,
    // Reasserted, not only set on insert: an episode can be re-attributed on
    // the server.
    showSlug,
    title: dto.title,
    rawTitle: dto.rawTitle,
    description: dto.description,
    audioUrl: dto.audioUrl,
    patreonPostId: dto.patreonPostId ?? null,
    patreonPublishedAt: dto.patreonPublishedAt ? time(dto.patreonPublishedAt) : null,
    durationSeconds: dto.durationSeconds,
    publishedAt: time(dto.publishedAt),
    season: dto.season,
    number: dto.number,
    artworkUrl: dto.artworkUrl,
    videoUrl: dto.videoUrl ?? null,
  }
}
