/**
 * The app's records, as they are kept in IndexedDB and in memory.
 *
 * The same schema as iOS/GCP Player/Models.swift, less what the web has no
 * use for: nothing goes to iCloud. Dates are epoch
 * milliseconds, so they sort and compare as numbers; the sync cursors are the
 * API's own strings, handed back exactly as they arrived.
 */

export interface Show {
  /** The API's id. The slug is what everything here keys on. */
  id: string
  slug: string
  title: string
  /** Game system or campaign, e.g. "Pathfinder 2E" (display only). */
  system: string | null
  artworkUrl: string | null
  /**
   * The Patreon collection this show is posted into — the `show=` of a
   * patron's feed URL. null for a show that isn't on Patreon.
   */
  patreonShowId: string | null
  /** False for a show that exists only on Patreon. */
  isPublic: boolean

  /**
   * The `syncedAt` from this show's last episodes response, passed back as
   * `?since=`. null means never synced, which asks for the whole back
   * catalogue. Per show, because a show whose request fails must not advance
   * a cursor the others share.
   */
  episodesSyncedAt: string | null

  /** What every list sorts on: the newest episode of any kind. */
  latestEpisodeAt: number
  /** The newest episode anyone can play. Without a Patreon token, only this can make a show NEW. */
  latestPublicEpisodeAt: number
  /** The newest episode, Patreon's included. */
  latestAnyEpisodeAt: number

  /** Starred ("My Shows"). This browser's own; the catalogue sync never writes it. */
  isStarred: boolean
  starredUpdatedAt: number | null
}

export interface Episode {
  id: string
  /** The RSS guid — the episode's identity. Syncing upserts on it. */
  guid: string
  /** null: the episode couldn't be attributed to a show. */
  showSlug: string | null

  /** Cleaned title, e.g. "Shaggy's Fight". */
  title: string
  /** The feed's full title, kept for auditing. */
  rawTitle: string
  /** HTML, from the feed. */
  description: string | null

  /**
   * The public enclosure. null for an episode that so far exists only on
   * Patreon: its audio comes from the patron's own feed, fetched at play.
   */
  audioUrl: string | null
  /** The Patreon post, where the episode is on Patreon. With a token this is the copy that plays. */
  patreonPostId: string | null
  durationSeconds: number | null
  /** Patreon's runtime, learnt from the patron's feed the first time the episode plays from there. */
  patreonDurationSeconds: number | null
  publishedAt: number
  /** When Patreon published it — for an early release, months before `publishedAt`. */
  patreonPublishedAt: number | null
  season: number | null
  number: number | null
  artworkUrl: string | null
  /** The episode's video on YouTube, where the network filmed one. */
  videoUrl: string | null

  /** Listened to. This browser's own, like the position. */
  isPlayed: boolean
  /** Where playback left off, in seconds. */
  positionSeconds: number
  stateUpdatedAt: number | null

  /**
   * When the audio landed in this browser's download cache; null or absent
   * when it isn't there. Absent on rows written before the web had
   * downloads. See downloads/downloads.ts.
   */
  downloadedAt?: number | null
  /** Asked for by hand, so a launch sweep keeps it after it has been heard. */
  downloadIsManual?: boolean
}

/** The patron's feed token, or its removal. One at most. */
export interface PatreonCredential {
  token: string | null
  updatedAt: number
}
