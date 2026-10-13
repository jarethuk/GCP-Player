/**
 * The catalogue API in ../../api — the same two GET calls the phones make.
 *
 * Both are deltas: pass the `syncedAt` from the previous response as `since`
 * and only what changed comes back. Responses are cached at the edge for an
 * hour, which works because every client converges on the same `since`
 * values — so the cursor is handed back exactly as the API sent it, never
 * re-formatted.
 */

import { Copy } from '../copy/copy'

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'https://gcp-player-api.vercel.app'

export interface ShowsResponse {
  syncedAt: string
  fullResync: boolean
  shows: ShowDTO[]
}

export interface EpisodesResponse {
  syncedAt: string
  fullResync: boolean
  episodes: EpisodeDTO[]
}

export interface ShowDTO {
  id: string
  slug: string
  title: string
  system: string | null
  description: string | null
  artworkUrl: string | null
  patreonShowId?: string | null
  /** Absent from an API that predates Patreon. */
  isPublic?: boolean
  updatedAt: string
  /** Non-null: a tombstone. */
  deletedAt: string | null
}

export interface EpisodeDTO {
  id: string
  showId: string | null
  guid: string
  title: string
  rawTitle: string
  description: string | null
  /** null for an episode that is so far only on Patreon. */
  audioUrl: string | null
  patreonPostId?: string | null
  patreonPublishedAt?: string | null
  durationSeconds: number | null
  publishedAt: string
  season: number | null
  number: number | null
  artworkUrl: string | null
  videoUrl?: string | null
  updatedAt: string
  deletedAt: string | null
}

export class APIError extends Error {
  constructor(readonly status: number) {
    super(status === 404 ? Copy.Errors.showGone : Copy.Errors.catalogueStatus(status))
  }
}

export interface CatalogueClient {
  fetchShows(since: string | null): Promise<ShowsResponse>
  fetchEpisodes(showSlug: string, since: string | null): Promise<EpisodesResponse>
}

/**
 * Both calls ask for Patreon (`patreon=1`): Patreon-only shows, and episodes
 * with no public audio. Without it the API answers as it did before Patreon.
 */
export function createCatalogueClient(baseUrl = API_BASE_URL): CatalogueClient {
  async function get<T>(path: string, since: string | null): Promise<T> {
    const url = new URL(baseUrl + path)
    url.searchParams.set('patreon', '1')
    if (since) url.searchParams.set('since', since)

    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new Error(Copy.Errors.catalogueUnreachable)
    }
    if (!response.ok) throw new APIError(response.status)
    return (await response.json()) as T
  }

  return {
    fetchShows: (since) => get('/shows', since),
    fetchEpisodes: (showSlug, since) =>
      get(`/shows/${encodeURIComponent(showSlug)}/episodes`, since),
  }
}
