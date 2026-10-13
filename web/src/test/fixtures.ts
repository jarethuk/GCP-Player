import type {
  CatalogueClient,
  EpisodeDTO,
  EpisodesResponse,
  ShowDTO,
  ShowsResponse,
} from '../data/api'
import { openDatabase } from '../data/db'
import { Library } from '../data/library'
import type { Episode, Show } from '../data/types'

let databases = 0

/** A library on a fresh fake-indexeddb database of its own. */
export async function freshLibrary(): Promise<Library> {
  databases += 1
  return Library.open(await openDatabase(`test-${databases}-${Math.random()}`))
}

export function showDTO(slug: string, overrides: Partial<ShowDTO> = {}): ShowDTO {
  return {
    id: `id-${slug}`,
    slug,
    title: slug.replace(/-/g, ' '),
    system: 'Pathfinder 2E',
    description: null,
    artworkUrl: null,
    patreonShowId: null,
    isPublic: true,
    updatedAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

export function episodeDTO(guid: string, overrides: Partial<EpisodeDTO> = {}): EpisodeDTO {
  return {
    id: `id-${guid}`,
    showId: null,
    guid,
    title: guid,
    rawTitle: guid,
    description: null,
    audioUrl: `https://audio.example/${guid}.mp3`,
    patreonPostId: null,
    patreonPublishedAt: null,
    durationSeconds: 3600,
    publishedAt: '2026-09-01T00:00:00.000Z',
    season: null,
    number: null,
    artworkUrl: null,
    videoUrl: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

/**
 * A catalogue API in memory. Each call answers with whatever the test has
 * queued, and records what it was asked.
 */
export class FakeCatalogue implements CatalogueClient {
  shows: ShowsResponse = { syncedAt: '2026-09-01T00:00:00.000Z', fullResync: true, shows: [] }
  episodes = new Map<string, EpisodesResponse | Error>()
  calls: string[] = []

  async fetchShows(since: string | null): Promise<ShowsResponse> {
    this.calls.push(`shows since=${since}`)
    return this.shows
  }

  async fetchEpisodes(slug: string, since: string | null): Promise<EpisodesResponse> {
    this.calls.push(`${slug} since=${since}`)
    const answer = this.episodes.get(slug) ?? {
      syncedAt: '2026-09-01T00:00:00.000Z',
      fullResync: since === null,
      episodes: [],
    }
    if (answer instanceof Error) throw answer
    return answer
  }
}

export function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show',
    slug: 'show',
    title: 'A Show',
    system: null,
    artworkUrl: null,
    patreonShowId: null,
    isPublic: true,
    episodesSyncedAt: null,
    latestEpisodeAt: 0,
    latestPublicEpisodeAt: 0,
    latestAnyEpisodeAt: 0,
    isStarred: false,
    starredUpdatedAt: null,
    ...overrides,
  }
}

export function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'episode',
    guid: 'episode',
    showSlug: 'show',
    title: 'An Episode',
    rawTitle: 'An Episode',
    description: null,
    audioUrl: 'https://audio.example/episode.mp3',
    patreonPostId: null,
    durationSeconds: 3600,
    patreonDurationSeconds: null,
    publishedAt: Date.parse('2026-09-01T00:00:00Z'),
    patreonPublishedAt: null,
    season: null,
    number: null,
    artworkUrl: null,
    videoUrl: null,
    isPlayed: false,
    positionSeconds: 0,
    stateUpdatedAt: null,
    ...overrides,
  }
}
