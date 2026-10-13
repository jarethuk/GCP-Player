/**
 * The API's wire shapes, mirrored.
 *
 * Hand-written rather than generated: the API is a separate npm project with
 * no workspace between them, and these five shapes change about as often as
 * the database does. `api/src/serialise.ts` is the original — if a field here
 * disagrees with that file, that file is right.
 */

export interface Show {
  id: string
  slug: string
  title: string
  system: string | null
  description: string | null
  artworkUrl: string | null
  /**
   * The Patreon collection this show is posted into — the `show` in a patron's
   * feed URL. Null for a show that isn't on Patreon.
   */
  patreonShowId: string | null
  /** False for a show that exists only on Patreon. */
  isPublic: boolean
  /**
   * Set the moment anyone edits this show here. Ingest then leaves the row
   * alone for good — the edit survives every future run, at the cost of the
   * row no longer tracking the feed in any field.
   */
  overridden: boolean
  createdAt: string
  updatedAt: string
  /** Non-null means this row is a tombstone. The dashboard never sees one. */
  deletedAt: string | null
}

/**
 * A show as the dashboard sees it: the public shape, plus the counts and the
 * one field the phone apps are deliberately never sent.
 */
export interface ShowWithCounts extends Show {
  /**
   * The regex claiming episodes whose titles never carry the show name
   * (Cannon Fodder, GCN News Minute, Strange Aeons…). Editable here and
   * nowhere else — a phone has no use for how its episodes were attributed.
   */
  matchPattern: string | null
  episodeCount: number
  latestEpisodeAt: string | null
}

export interface Episode {
  id: string
  showId: string | null
  guid: string
  title: string
  /** The full item title as published — what the parser was given. */
  rawTitle: string
  description: string | null
  /**
   * Null for an episode so far only on Patreon — a Patreon-only show's, or an
   * early release. The phones fetch its audio from the patron's own feed.
   */
  audioUrl: string | null
  /** The Patreon post, where the episode is on Patreon. */
  patreonPostId: string | null
  durationSeconds: number | null
  publishedAt: string
  season: number | null
  number: number | null
  /** True when `number` came from release order rather than from the feed. */
  numberIsDerived: boolean
  artworkUrl: string | null
  /** The episode's video version on YouTube, where the feed mentions one. */
  videoUrl: string | null
  /** See Show.overridden. Deleting an episode sets this too. */
  overridden: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Staff {
  id: string
  email: string
  name: string
  createdAt: string
  lastLoginAt: string | null
}

export type SyncStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export interface SyncRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: SyncStatus
  itemsSeen: number
  itemsCreated: number
  /** Stored rows the feed had changed since they were ingested. */
  episodesUpdated: number
  showsUpdated: number
  /** Rows the feed disagrees with that someone has edited, so they stand. */
  overriddenSkipped: number
  /** Episodes a per-show feed re-publishes that another feed already carries. */
  duplicatesSkipped: number
  itemsUnattributed: number
  numbersDerived: number
  showsCreated: number
  /** Feeds that couldn't be fetched, by name. The rest still synced. */
  failedFeeds: string[]
  error: string | null
}

export interface FeedSource {
  id: string
  url: string
  name: string
  showTitle: string | null
  sortIndex: number
  isEnabled: boolean
  lastFetchedAt: string | null
  lastError: string | null
}

/** What `POST /auth/session` hands back. */
export interface Session {
  token: string
  expiresAt: string
  staff: Pick<Staff, 'id' | 'email' | 'name'>
}

/** What a wipe-and-rebuild reports: what it destroyed, and what it put back. */
export interface ResyncResult {
  deleted: { shows: number; episodes: number }
  resynced: SyncResult
}

/** What a sync run reports when it finishes. */
export interface SyncResult {
  itemsSeen: number
  itemsCreated: number
  episodesUpdated: number
  showsUpdated: number
  overriddenSkipped: number
  duplicatesSkipped: number
  itemsUnattributed: number
  numbersDerived: number
  showsCreated: number
  failedFeeds: string[]
}
