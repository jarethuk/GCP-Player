import { fingerprint } from './hash.js'
import type { FeedItem } from './parse-feed.js'
import {
  collapseWhitespace,
  type KnownShow,
  parseFeedTitle,
  parseFeedTitleInShow,
  parsePatreonTitle,
  slugifyShowTitle,
} from './parse-title.js'

/**
 * The guid given to an episode first seen on Patreon. A patron's feed uses the
 * bare post id as its `<guid>`, which is too plain to share a unique column
 * with every RSS guid the network has ever published.
 */
export const PATREON_GUID_PREFIX = 'patreon:'

export interface PlanFeed {
  name: string
  showTitle: string | null
  channelArtworkUrl: string | null
  items: FeedItem[]
  /**
   * Set when this "feed" is a Patreon collection rather than RSS. Its items
   * have no public audio, its titles are parsed differently, and a show it is
   * the only source of is created with `isPublic: false`. See patreon.ts.
   */
  patreonShowId?: string | null
  /**
   * A system for sources whose item titles carry none — Patreon's. Like the
   * channel image, a last resort behind anything a title or a person supplied.
   */
  fallbackSystem?: string | null
}

export interface ExistingShow {
  id: string
  title: string
  matchPattern: string | null
  artworkUrl: string | null
  system: string | null
  /** Null on a row that predates the hash column: it reads as changed once. */
  hash: string | null
  /** Edited by a person. Ingest does not touch this row at all. */
  overridden: boolean
  /** Absent means public, which every show was before Patreon. */
  isPublic?: boolean
}

/** Enough of a stored episode to reconcile it against the feed. */
export interface ExistingEpisode {
  id: string
  guid: string
  title: string
  showId: string | null
  number: number | null
  /** See Episode.numberIsDerived. */
  numberIsDerived: boolean
  videoUrl: string | null
  hash: string | null
  overridden: boolean
  /**
   * Soft-deleted. Still passed in so its guid and title keep the feed from
   * re-inserting it, but never planned for an update: the write would be
   * refused anyway, and planning it anyway reads as a change on every run.
   */
  deleted?: boolean
  /** See Episode.patreonPostId. Absent on every row that came from RSS. */
  patreonPostId?: string | null
  /** See Episode.patreonPublishedAt. */
  patreonPublishedAt?: Date | null
  /**
   * Whether the row has an `audioUrl`. Absent means it does, as every RSS row
   * does; false is a Patreon post the public feed has not caught up with.
   */
  hasPublicAudio?: boolean
}

export interface PlannedShow {
  slug: string
  title: string
  system: string | null
  artworkUrl: string | null
  isPublic: boolean
  patreonShowId: string | null
  hash: string
}

/**
 * A stored show whose feed-derived fields have moved.
 *
 * Only `system` and `artworkUrl`: a show is *identified* by its title, so a
 * title that changes in the feed is a different show rather than an edit to
 * this one, and `description` and `matchPattern` are only ever set by hand.
 */
export interface ShowUpdate {
  id: string
  system: string | null
  artworkUrl: string | null
  isPublic: boolean
  hash: string
}

export interface PlannedEpisode {
  guid: string
  title: string
  rawTitle: string
  description: string | null
  audioUrl: string | null
  patreonPostId: string | null
  patreonPublishedAt: Date | null
  durationSeconds: number | null
  publishedAt: Date
  season: number | null
  /** Filled by deriveNumbers when the feed supplies none. */
  number: number | null
  artworkUrl: string | null
  /** See Episode.numberIsDerived. */
  numberIsDerived: boolean
  videoUrl: string | null
  /** Set once deriveNumbers has run, so a derived number is inside the hash. */
  hash: string
  /** Resolved against the created/existing shows once ids are known. */
  showTitle: string | null
}

/** A stored episode whose feed-derived fields have moved. */
export interface EpisodeUpdate {
  id: string
  title: string
  rawTitle: string
  description: string | null
  audioUrl: string | null
  /**
   * Set once and then kept: on a Patreon row from the start, and on a public
   * row when its Patreon re-post is first seen.
   */
  patreonPostId: string | null
  /** When Patreon published it. See Episode.patreonPublishedAt. */
  patreonPublishedAt: Date | null
  durationSeconds: number | null
  publishedAt: Date
  season: number | null
  number: number | null
  numberIsDerived: boolean
  artworkUrl: string | null
  videoUrl: string | null
  hash: string
  /** Resolved against the created/existing shows once ids are known. */
  showTitle: string | null
}

export interface SyncPlan {
  shows: PlannedShow[]
  showUpdates: ShowUpdate[]
  episodes: PlannedEpisode[]
  episodeUpdates: EpisodeUpdate[]
  itemsSeen: number
  duplicatesSkipped: number
  itemsUnattributed: number
  /** Episodes given a number the feed did not supply. */
  numbersDerived: number
  /** Rows the feed disagrees with that a person has edited, so they stand. */
  overriddenSkipped: number
}

/** The state a show's feed items add up to, before it meets the stored row. */
interface IntendedShow {
  slug: string
  title: string
  system: string | null
  /** Real per-episode artwork only — never the channel image. */
  artworkUrl: string | null
  /**
   * The channel image of a feed carrying this show, kept apart from the real
   * thing so it can stay a genuine last resort.
   *
   * Folding it into `artworkUrl` was safe while ingest only filled blanks. It
   * is not safe now: a show whose recent items happen to carry no artwork would
   * have its own picture overwritten with the network's generic one, every
   * night, and the feed would look like it had changed each time.
   */
  channelArtworkUrl: string | null
  /** See PlanFeed.fallbackSystem. */
  fallbackSystem: string | null
  /** Carried by at least one public feed this run, rather than only by Patreon. */
  seenPublic: boolean
  /** The Patreon collection a show created this run is built from. */
  patreonShowId: string | null
}

/**
 * Identifies an episode across feeds: its show plus its cleaned title.
 *
 * Publish dates cannot be part of this — the per-show feeds re-date their back
 * catalogue, so the same episode carries different dates in different feeds.
 * Multi-part releases stay distinct because the parser writes the part into the
 * title ("Ranger Things (Part 2)"). Null for unattributed episodes, which are
 * never de-duplicated.
 */
export function duplicateKey(showTitle: string | null, episodeTitle: string): string | null {
  if (!showTitle) return null
  return `${showTitle.toLowerCase()}|${titleKey(episodeTitle)}`
}

/**
 * An episode title with its punctuation gone. Patreon and the public feed
 * disagree on it for the same episode — "You're Not My Father!" on one, no
 * bang on the other — and an early release that misses its public copy stays
 * a second, locked row for good. Letters and digits are left alone, so parts
 * and numbers still tell episodes apart. Never stored, so changing it moves
 * nothing: every run rebuilds the key set from the rows.
 */
function titleKey(title: string): string {
  return collapseWhitespace(title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' '))
}

/**
 * Works out what to write. Pure: feeds and current state in, rows out — no
 * network and no database, which is what makes the awkward parts testable.
 *
 * Ingest **reconciles**. It used to only insert, on the assumption that a
 * published episode never changes; the network does edit published items, and
 * under that assumption a correction made upstream could never reach a phone.
 * So a run now plans inserts *and* updates, and four things have to be right,
 * because nothing downstream can repair them:
 *
 *  - **An overridden row is never touched.** Not field by field — the whole
 *    row. A person editing anything in the dashboard is saying they know better
 *    than the feed about that record, and a run that "only" refreshed the
 *    fields they didn't touch would still undo half of that.
 *  - **An update needs a genuine difference.** Everything sync would write is
 *    hashed and compared against the hash of what it wrote last time, so an
 *    unchanged catalogue moves no `updatedAt` at all. Get this wrong and every
 *    phone re-downloads 1,300 rows every night.
 *  - **Nothing already stored is inserted again.** Both the guid map and the
 *    show+title set are seeded from the database, not just built up within the
 *    run. The client apps get away with per-run state because they always read
 *    all nine feeds together; here the main feed can 404 on one run and succeed
 *    on the next, and without the database-seeded key set its copies would land
 *    alongside the per-show feed's.
 *  - **Feeds are walked in `sortIndex` order**, main feed first, so its copy of
 *    a cross-posted episode is the one kept.
 */
export function planSync(
  feeds: PlanFeed[],
  existingShows: ExistingShow[],
  existingEpisodes: ExistingEpisode[],
): SyncPlan {
  const showTitleById = new Map(existingShows.map((show) => [show.id, show.title]))
  const knownShowTitles = new Map(
    existingShows.map((show) => [show.title.toLowerCase(), show.title]),
  )
  const knownShows: KnownShow[] = existingShows.map((show) => ({
    title: show.title,
    matchPattern: show.matchPattern,
  }))

  const seenGuids = new Set(existingEpisodes.map((episode) => episode.guid))
  const existingByGuid = new Map(existingEpisodes.map((episode) => [episode.guid, episode]))
  // Keys of episodes that can be played without Patreon. A Patreon post whose
  // key is here is the network re-posting a public episode for patrons, and
  // is skipped like any other cross-post.
  const seenKeys = new Set<string>()
  // Patreon-first rows by key: where the public copy of an early release finds
  // the row it takes over. Promoted rows stay in here, because the public
  // item's own guid never makes it into the table — this is how it finds its
  // row again on every later run.
  const patreonRowByKey = new Map<string, ExistingEpisode>()
  for (const episode of existingEpisodes) {
    const showTitle = episode.showId ? showTitleById.get(episode.showId) : undefined
    const key = duplicateKey(showTitle ?? null, episode.title)
    if (!key) continue
    if (episode.hasPublicAudio !== false) seenKeys.add(key)
    if (episode.guid.startsWith(PATREON_GUID_PREFIX) && !patreonRowByKey.has(key)) {
      patreonRowByKey.set(key, episode)
    }
  }
  // Stored rows a feed has already reconciled in this run. A row belongs to
  // the first feed that claims it: the public copy of an early release before
  // the Patreon post, and the main feed before a per-show cross-post. Two
  // feeds reconciling one row would write it twice and flap its hash.
  const claimed = new Set<string>()

  // The Patreon post that re-posts each public episode, by the episode's key.
  // Patreon's copy has no ads, so a patron's client plays it in preference,
  // and it can only find it through the public row's `patreonPostId`.
  //
  // Read before the walk because the public feeds are planned first, and the
  // row has to carry the id in the same write that reconciles it. A post
  // already stored on a row of its own — an early release not yet promoted —
  // is left to the promotion path, and a key two posts share ("After Dark
  // Bonus Content") links neither: `patreonPostId` is unique, and one wrong
  // guess would fail the whole run's transaction.
  const patreonPostByKey = new Map<string, string | null>()
  // When each post went up on Patreon, whichever row it ends up on — so a
  // patron's client can list an episode where Patreon put it, months before
  // the public feed did.
  const patreonDateByPost = new Map<string, Date>()
  const storedPostIds = new Set(
    existingEpisodes.flatMap((episode) => (episode.patreonPostId ? [episode.patreonPostId] : [])),
  )
  for (const feed of feeds) {
    if (!feed.patreonShowId || !feed.showTitle) continue
    for (const item of feed.items) {
      if (item.patreonPostId) patreonDateByPost.set(item.patreonPostId, item.publishedAt)
      if (!item.patreonPostId || storedPostIds.has(item.patreonPostId)) continue
      const key = duplicateKey(
        feed.showTitle,
        parsePatreonTitle(item.rawTitle, feed.showTitle).episodeTitle,
      )
      if (!key) continue
      patreonPostByKey.set(key, patreonPostByKey.has(key) ? null : item.patreonPostId)
    }
  }
  /** The Patreon twin of a public episode, handed out once. */
  const takePatreonPost = (key: string | null): string | null => {
    if (!key) return null
    const postId = patreonPostByKey.get(key) ?? null
    if (postId) patreonPostByKey.set(key, null)
    return postId
  }
  /**
   * The Patreon date of a row's post: from this run's read of Patreon, or,
   * on a run where Patreon failed, whatever was stored.
   */
  const patreonDate = (postId: string | null, stored: Date | null | undefined): Date | null =>
    postId ? (patreonDateByPost.get(postId) ?? stored ?? null) : null

  const existingByTitle = new Map(
    existingShows.map((show) => [show.title.toLowerCase(), show] as const),
  )

  // Every show the run sees, existing or not. Accumulated across all feeds and
  // only compared with the stored row at the end: settling a show's artwork the
  // moment the first feed mentions it would let a later feed change it back,
  // and the row would then flap between two values on alternate runs and
  // re-stamp `updatedAt` every night for nothing.
  const intendedShows = new Map<string, IntendedShow>()

  const episodes: PlannedEpisode[] = []
  const episodeUpdates: EpisodeUpdate[] = []
  let itemsSeen = 0
  let duplicatesSkipped = 0
  let itemsUnattributed = 0
  let overriddenSkipped = 0

  for (const feed of feeds) {
    const fromPatreon = Boolean(feed.patreonShowId)

    // Oldest first, so a newer item's artwork and system win for a show.
    const ordered = [...feed.items].sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
    )

    for (const item of ordered) {
      itemsSeen += 1

      const parsed =
        fromPatreon && feed.showTitle
          ? parsePatreonTitle(item.rawTitle, feed.showTitle)
          : feed.showTitle
            ? parseFeedTitleInShow(item.rawTitle, feed.showTitle)
            : parseFeedTitle(item.rawTitle, { knownShows })

      let showTitle: string | null = null
      if (parsed.showTitle) {
        // Canonical spelling, so a per-show feed's items land on the same row.
        showTitle = knownShowTitles.get(parsed.showTitle.toLowerCase()) ?? parsed.showTitle

        if (!knownShowTitles.has(showTitle.toLowerCase())) {
          knownShowTitles.set(showTitle.toLowerCase(), showTitle)
          knownShows.push({ title: showTitle })
        }

        // Never blank a value a previous item supplied with a later item that
        // carries none. The channel image is a last resort, so it never
        // displaces real per-episode artwork seen earlier in the walk.
        const key = showTitle.toLowerCase()
        const previous = intendedShows.get(key)
        intendedShows.set(key, {
          slug: previous?.slug ?? slugifyShowTitle(showTitle),
          title: showTitle,
          system: parsed.system ?? previous?.system ?? null,
          artworkUrl: item.artworkUrl ?? previous?.artworkUrl ?? null,
          channelArtworkUrl: previous?.channelArtworkUrl ?? feed.channelArtworkUrl,
          fallbackSystem: previous?.fallbackSystem ?? feed.fallbackSystem ?? null,
          seenPublic: (previous?.seenPublic ?? false) || !fromPatreon,
          patreonShowId: previous?.patreonShowId ?? feed.patreonShowId ?? null,
        })
      } else {
        itemsUnattributed += 1
      }

      const key = duplicateKey(showTitle, parsed.episodeTitle)

      let stored = existingByGuid.get(item.guid)
      // The public feed catching up with an early release. Its guid has never
      // been stored, but a Patreon post with the same show and title has: that
      // row becomes the public episode rather than gaining a twin, so every
      // phone holding it — keyed on its guid — sees it simply become playable.
      if (!stored && !fromPatreon && key) {
        const early = patreonRowByKey.get(key)
        if (early && !claimed.has(early.id)) stored = early
      }

      if (stored) {
        if (claimed.has(stored.id)) continue
        claimed.add(stored.id)

        if (stored.overridden) {
          overriddenSkipped += 1
          continue
        }

        // A tombstone. Its hash never matches — nothing writes one to a
        // deleted row — so without this it would be "updated" on every run,
        // and its show re-marked as changed for every client each time.
        if (stored.deleted) continue

        // A Patreon post whose row the public feed has taken over. The public
        // copy owns it now — even on a run where that feed failed, which is
        // why this reads the stored row and not only `claimed`.
        if (fromPatreon && stored.hasPublicAudio !== false) continue

        // A derived number is not feed data, so it has to survive a run that
        // the feed still supplies no number for — hence `?? stored.number`, and
        // hence clearing `numberIsDerived` only when the feed really numbered
        // it. Without this, reconciling would wipe every number the release-
        // order pass has ever invented, on every run.
        const number = parsed.number ?? stored.number
        const numberIsDerived = parsed.number !== null ? false : stored.numberIsDerived

        const patreonPostId =
          item.patreonPostId ?? stored.patreonPostId ?? (fromPatreon ? null : takePatreonPost(key))
        const candidate = {
          title: parsed.episodeTitle,
          rawTitle: item.rawTitle,
          description: item.description,
          audioUrl: item.audioUrl,
          patreonPostId,
          patreonPublishedAt: patreonDate(patreonPostId, stored.patreonPublishedAt),
          durationSeconds: item.durationSeconds,
          publishedAt: item.publishedAt,
          season: parsed.season,
          number,
          numberIsDerived,
          artworkUrl: item.artworkUrl,
          videoUrl: item.videoUrl,
          showTitle,
        }

        const hash = episodeFingerprint(candidate)
        if (hash !== stored.hash) {
          episodeUpdates.push({ ...candidate, id: stored.id, hash })
        }

        // The seeded key set may hold this episode under an *old* title, or —
        // for an early release just promoted — not at all. Either would leave
        // the cross-posted twin free to land beside it as a second row.
        if (key && !fromPatreon) seenKeys.add(key)
        continue
      }

      // Already planned earlier in this same run — two feeds carrying one guid.
      // The stored case is handled above.
      if (seenGuids.has(item.guid)) continue

      if (key && seenKeys.has(key)) {
        duplicatesSkipped += 1
        continue
      }

      seenGuids.add(item.guid)
      // Not for a Patreon post: they are told apart by post id alone. Patreon
      // titles repeat inside one show — every Shadowdark episode has a post
      // called "After Dark Bonus Content" — and keying them would keep only the
      // first. The key set is for finding a *public* twin, which a Patreon post
      // never is.
      if (key && !fromPatreon) seenKeys.add(key)

      const patreonPostId = item.patreonPostId ?? (fromPatreon ? null : takePatreonPost(key))
      episodes.push({
        guid: item.guid,
        title: parsed.episodeTitle,
        rawTitle: item.rawTitle,
        description: item.description,
        audioUrl: item.audioUrl,
        patreonPostId,
        patreonPublishedAt: patreonDate(patreonPostId, null),
        durationSeconds: item.durationSeconds,
        publishedAt: item.publishedAt,
        season: parsed.season,
        number: parsed.number,
        artworkUrl: item.artworkUrl,
        numberIsDerived: false,
        videoUrl: item.videoUrl,
        // Placeholder. The real one is written below, once deriveNumbers has
        // settled the number that belongs inside it.
        hash: '',
        showTitle,
      })
    }
  }

  const numbersDerived = deriveNumbers(episodes, existingEpisodes, showTitleById)

  // Only now is a new episode's row final, so only now can it be fingerprinted.
  // A derived number is part of what sync writes, so it has to be inside the
  // hash — otherwise the next run would compute a different one and rewrite a
  // row that had not changed.
  for (const episode of episodes) {
    episode.hash = episodeFingerprint(episode)
  }

  const shows: PlannedShow[] = []
  const showUpdates: ShowUpdate[] = []

  for (const [key, intended] of intendedShows) {
    const existing = existingByTitle.get(key)

    if (!existing) {
      const created = {
        slug: intended.slug,
        title: intended.title,
        system: intended.system ?? intended.fallbackSystem,
        artworkUrl: intended.artworkUrl ?? intended.channelArtworkUrl,
        isPublic: intended.seenPublic,
      }
      shows.push({
        ...created,
        patreonShowId: intended.patreonShowId,
        hash: showFingerprint(created),
      })
      continue
    }

    if (existing.overridden) {
      overriddenSkipped += 1
      continue
    }

    // A feed that says nothing about a field leaves the stored value alone.
    // Overwriting with the null would mean a show whose recent items carry no
    // artwork loses the artwork it has, which is a worse answer than keeping
    // it — and hashing the fallback rather than the absence is what stops the
    // row flapping between the two on alternate runs.
    // The channel image sits *behind* the stored value, not in front of it: it
    // is what a show with no picture at all falls back to, not a reason to
    // replace one it already has.
    //
    // Except a Patreon image. Patreon signs its image URLs with an expiry a few
    // weeks out, so a stored one is not worth keeping — the collection's
    // current URL replaces it whenever Patreon re-signs it. Only a Patreon-only
    // show ever has one: any show a public feed carries has real artwork first.
    //
    // A show turns public the first time a public feed carries it, and never
    // back: a run where that feed failed is not the network withdrawing it.
    const kept = existing.artworkUrl && !isSignedPatreonUrl(existing.artworkUrl)
    const resolved = {
      system: intended.system ?? existing.system ?? intended.fallbackSystem,
      artworkUrl:
        intended.artworkUrl ??
        (kept ? existing.artworkUrl : null) ??
        intended.channelArtworkUrl ??
        existing.artworkUrl,
      isPublic: intended.seenPublic || existing.isPublic !== false,
    }

    const hash = showFingerprint({ title: intended.title, ...resolved })
    if (hash === existing.hash) continue

    showUpdates.push({
      id: existing.id,
      system: resolved.system,
      artworkUrl: resolved.artworkUrl,
      isPublic: resolved.isPublic,
      hash,
    })
  }

  return {
    shows,
    showUpdates,
    episodes,
    episodeUpdates,
    itemsSeen,
    duplicatesSkipped,
    itemsUnattributed,
    numbersDerived,
    overriddenSkipped,
  }
}

/**
 * The feed-derived half of a show row.
 *
 * `slug` is absent on purpose: it is derived from the title, and a show is
 * matched by title, so it cannot change without the row already being a
 * different show.
 */
function showFingerprint(show: {
  title: string
  system: string | null
  artworkUrl: string | null
  isPublic: boolean
}): string {
  // `isPublic` joins the list only when it is false, so every public show
  // hashes exactly as it did before Patreon existed — adding the column must
  // not re-stamp 32 shows and send them to every phone for nothing.
  return fingerprint([show.title, show.system, show.artworkUrl, ...(show.isPublic ? [] : [false])])
}

/** A Patreon CDN URL, which is signed and stops working a few weeks out. */
function isSignedPatreonUrl(url: string): boolean {
  return url.includes('patreonusercontent.com') && url.includes('token-hash=')
}

/** Everything sync writes to an episode row, in a fixed order. */
function episodeFingerprint(episode: Omit<EpisodeUpdate, 'id' | 'hash'>): string {
  return fingerprint([
    episode.showTitle,
    episode.title,
    episode.rawTitle,
    episode.description,
    episode.audioUrl,
    episode.durationSeconds,
    episode.publishedAt,
    episode.season,
    episode.number,
    episode.numberIsDerived,
    episode.artworkUrl,
    episode.videoUrl,
    // Appended only when set, for the same reason as `isPublic` on a show:
    // the 1,300 RSS rows must hash exactly as they did before.
    ...(episode.patreonPostId ? [episode.patreonPostId] : []),
    ...(episode.patreonPublishedAt ? [episode.patreonPublishedAt] : []),
  ])
}

/**
 * Numbers the episodes of shows the feed never numbers, in release order.
 *
 * Most of the network's shows publish no episode number at all — Cannon Fodder,
 * GCN News Minute, the live shows — which leaves their rows without the chip
 * every other show has. Release order is the only ordering that exists for
 * them, and it is the order the app lists them in anyway.
 *
 * **Only shows the feed never numbers.** Two things in the real data rule out
 * anything cleverer:
 *
 *  - An unnumbered episode inside a *numbered* show is an announcement, not a
 *    missing number — "Time For Chaos RSS Feed Update", "Where Did Glass Cannon
 *    Network Presents Go?". Giving those a number files them in the sequence as
 *    though they were episodes.
 *  - Time For Chaos restarts at E1 each season, so there is no "highest number
 *    so far" to continue from without colliding with a future episode.
 *
 * Numbering continues from the highest derived number already stored, so a run
 * only ever appends — the same rule as everything else here. A back-catalogue
 * episode appearing later therefore lands at the end rather than renumbering
 * what is already on people's phones. It runs over newly planned episodes only:
 * a stored row keeps the number it was given, because the feed still supplies
 * none to replace it with.
 */
function deriveNumbers(
  planned: PlannedEpisode[],
  existing: ExistingEpisode[],
  showTitleById: Map<string, string>,
): number {
  const feedNumbers = new Set<string>()
  const highestDerived = new Map<string, number>()

  for (const episode of existing) {
    const showTitle = episode.showId ? showTitleById.get(episode.showId) : undefined
    if (!showTitle) continue
    const key = showTitle.toLowerCase()

    if (episode.number !== null && !episode.numberIsDerived) feedNumbers.add(key)
    if (episode.numberIsDerived && episode.number !== null) {
      highestDerived.set(key, Math.max(highestDerived.get(key) ?? 0, episode.number))
    }
  }

  // A number arriving in this run counts too: the first sync of a numbered show
  // has nothing stored yet to learn that from.
  for (const episode of planned) {
    if (episode.number !== null && episode.showTitle) {
      feedNumbers.add(episode.showTitle.toLowerCase())
    }
  }

  const byShow = new Map<string, PlannedEpisode[]>()
  for (const episode of planned) {
    if (episode.number !== null || !episode.showTitle) continue
    const key = episode.showTitle.toLowerCase()
    if (feedNumbers.has(key)) continue
    const list = byShow.get(key)
    if (list) list.push(episode)
    else byShow.set(key, [episode])
  }

  let derived = 0
  for (const [key, episodes] of byShow) {
    let next = (highestDerived.get(key) ?? 0) + 1
    for (const episode of episodes.sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
    )) {
      episode.number = next++
      episode.numberIsDerived = true
      derived += 1
    }
  }
  return derived
}
