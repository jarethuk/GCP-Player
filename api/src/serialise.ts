import type { Episode, FeedSource, FeedSyncRun, FeedSyncStatus, Show, Staff } from '@prisma/client'

/**
 * The wire shapes. Explicit rather than returning rows straight from Prisma,
 * so adding a column doesn't silently change the API — and so dates are ISO
 * strings, which is what every client actually wants.
 */
export interface ShowDto {
  id: string
  slug: string
  title: string
  system: string | null
  description: string | null
  artworkUrl: string | null
  /**
   * The Patreon collection this show is published into: the `show` parameter
   * of a patron's feed URL. Null for a show that isn't on Patreon.
   */
  patreonShowId: string | null
  /** False for a show that exists only on Patreon. */
  isPublic: boolean
  /** Edited by a person, so ingest no longer tracks the feed for this row. */
  overridden: boolean
  createdAt: string
  updatedAt: string
  /** Non-null means this row is a tombstone: drop your copy. */
  deletedAt: string | null
}

export interface EpisodeDto {
  id: string
  showId: string | null
  guid: string
  title: string
  rawTitle: string
  description: string | null
  /**
   * Null when the episode is so far only on Patreon. Its audio is then in the
   * patron's own feed, under `<guid>` = `patreonPostId`.
   */
  audioUrl: string | null
  /** The Patreon post, where the episode is on Patreon. */
  patreonPostId: string | null
  /** When Patreon published it, which a patron's client lists it by. */
  patreonPublishedAt: string | null
  durationSeconds: number | null
  publishedAt: string
  season: number | null
  number: number | null
  /** True when `number` came from release order rather than from the feed. */
  numberIsDerived: boolean
  artworkUrl: string | null
  /** The episode's video version on YouTube, where the feed mentions one. */
  videoUrl: string | null
  /** Edited by a person, so ingest no longer tracks the feed for this row. */
  overridden: boolean
  createdAt: string
  updatedAt: string
  /** Non-null means this row is a tombstone: drop your copy. */
  deletedAt: string | null
}

export function toShowDto(show: Show): ShowDto {
  return {
    id: show.id,
    slug: show.slug,
    title: show.title,
    system: show.system,
    description: show.description,
    artworkUrl: show.artworkUrl,
    patreonShowId: show.patreonShowId,
    isPublic: show.isPublic,
    overridden: show.overridden,
    createdAt: show.createdAt.toISOString(),
    updatedAt: show.updatedAt.toISOString(),
    deletedAt: show.deletedAt?.toISOString() ?? null,
  }
}

export function toEpisodeDto(episode: Episode): EpisodeDto {
  return {
    id: episode.id,
    showId: episode.showId,
    guid: episode.guid,
    title: episode.title,
    rawTitle: episode.rawTitle,
    description: episode.description,
    audioUrl: episode.audioUrl,
    patreonPostId: episode.patreonPostId,
    patreonPublishedAt: episode.patreonPublishedAt?.toISOString() ?? null,
    durationSeconds: episode.durationSeconds,
    publishedAt: episode.publishedAt.toISOString(),
    season: episode.season,
    number: episode.number,
    numberIsDerived: episode.numberIsDerived,
    artworkUrl: episode.artworkUrl,
    videoUrl: episode.videoUrl,
    overridden: episode.overridden,
    createdAt: episode.createdAt.toISOString(),
    updatedAt: episode.updatedAt.toISOString(),
    deletedAt: episode.deletedAt?.toISOString() ?? null,
  }
}

/**
 * A member of staff, as the dashboard sees one. No OTP columns and no session
 * rows: the code hash, its expiry and the attempt counter are the sign-in
 * machinery's own business, and nothing outside this API has any use for them.
 */
export interface StaffDto {
  id: string
  email: string
  name: string
  createdAt: string
  lastLoginAt: string | null
}

export function toStaffDto(staff: Staff): StaffDto {
  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    createdAt: staff.createdAt.toISOString(),
    lastLoginAt: staff.lastLoginAt?.toISOString() ?? null,
  }
}

/** One run of the ingest, for the dashboard's feed-sync history. */
export interface SyncRunDto {
  id: string
  startedAt: string
  finishedAt: string | null
  status: FeedSyncStatus
  itemsSeen: number
  itemsCreated: number
  /** Stored rows the feed had changed since they were ingested. */
  episodesUpdated: number
  showsUpdated: number
  /** Rows the feed disagrees with that a person has edited, so they stand. */
  overriddenSkipped: number
  duplicatesSkipped: number
  itemsUnattributed: number
  numbersDerived: number
  showsCreated: number
  failedFeeds: string[]
  error: string | null
}

export function toSyncRunDto(run: FeedSyncRun): SyncRunDto {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    status: run.status,
    itemsSeen: run.itemsSeen,
    itemsCreated: run.itemsCreated,
    episodesUpdated: run.episodesUpdated,
    showsUpdated: run.showsUpdated,
    overriddenSkipped: run.overriddenSkipped,
    duplicatesSkipped: run.duplicatesSkipped,
    itemsUnattributed: run.itemsUnattributed,
    numbersDerived: run.numbersDerived,
    showsCreated: run.showsCreated,
    failedFeeds: run.failedFeeds,
    error: run.error,
  }
}

/** A feed the ingest reads, and how it went last time. */
export interface FeedSourceDto {
  id: string
  url: string
  name: string
  showTitle: string | null
  sortIndex: number
  isEnabled: boolean
  lastFetchedAt: string | null
  lastError: string | null
}

export function toFeedSourceDto(source: FeedSource): FeedSourceDto {
  return {
    id: source.id,
    url: source.url,
    name: source.name,
    showTitle: source.showTitle,
    sortIndex: source.sortIndex,
    isEnabled: source.isEnabled,
    lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null,
    lastError: source.lastError,
  }
}
