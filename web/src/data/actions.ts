/**
 * The only ways this browser's own state changes outside a sync: played,
 * position and starred. Each is stamped with when it changed, as on the
 * phones — nothing reads the stamp yet, but it is what will settle a
 * disagreement once there is an account to sync these to.
 */

import type { Library } from './library'
import { isLocked, listedAt } from './logic'

/**
 * Marks an episode heard or unheard. Its position goes back to the start
 * either way: the whole point of a position is somewhere to come back to.
 */
export function markPlayed(library: Library, guid: string, played = true): Promise<void> {
  return library.updateEpisode(guid, {
    isPlayed: played,
    positionSeconds: 0,
    stateUpdatedAt: Date.now(),
  })
}

/** Marks every episode of the same show listed before this one. */
export function markAllPreviousPlayed(library: Library, guid: string): Promise<void> {
  const snapshot = library.getSnapshot()
  const episode = snapshot.episodes.get(guid)
  if (!episode?.showSlug) return Promise.resolve()
  const hasToken = snapshot.patreonToken !== null
  const before = listedAt(episode, hasToken)
  const now = Date.now()
  const earlier = library
    .episodesOf(episode.showSlug)
    .filter((other) => !other.isPlayed && listedAt(other, hasToken) < before)
    .map((other) => ({ ...other, isPlayed: true, positionSeconds: 0, stateUpdatedAt: now }))
  return library.write({ putEpisodes: earlier })
}

export function updatePosition(library: Library, guid: string, seconds: number): Promise<void> {
  return library.updateEpisode(guid, { positionSeconds: seconds, stateUpdatedAt: Date.now() })
}

export function setStarred(library: Library, slug: string, starred: boolean): Promise<void> {
  const show = library.getSnapshot().shows.get(slug)
  if (!show || show.isStarred === starred) return Promise.resolve()
  return library.updateShow(slug, { isStarred: starred, starredUpdatedAt: Date.now() })
}

/**
 * The episode after `guid` within its show, in listening order, stepping over
 * padlocked ones: running into one would end the session on something that
 * can't play.
 */
export function nextEpisodeAfter(library: Library, guid: string): string | null {
  const snapshot = library.getSnapshot()
  const episode = snapshot.episodes.get(guid)
  if (!episode?.showSlug) return null
  const hasToken = snapshot.patreonToken !== null
  const at = listedAt(episode, hasToken)
  let best: { guid: string; at: number; publishedAt: number } | null = null
  for (const other of library.episodesOf(episode.showSlug)) {
    if (other.guid === guid || isLocked(other, hasToken)) continue
    const otherAt = listedAt(other, hasToken)
    const after =
      otherAt > at ||
      (otherAt === at &&
        (other.publishedAt > episode.publishedAt ||
          (other.publishedAt === episode.publishedAt && other.guid > guid)))
    if (!after) continue
    if (
      !best ||
      otherAt < best.at ||
      (otherAt === best.at && other.publishedAt < best.publishedAt)
    ) {
      best = { guid: other.guid, at: otherAt, publishedAt: other.publishedAt }
    }
  }
  return best?.guid ?? null
}

/**
 * Where an episode sits in its show, in listening order — the "12 of 50" on
 * the player. Its position, not its number: Time For Chaos restarts at E1
 * every season.
 */
export function positionInShow(
  library: Library,
  guid: string,
): { index: number; total: number } | null {
  const snapshot = library.getSnapshot()
  const episode = snapshot.episodes.get(guid)
  if (!episode?.showSlug) return null
  const episodes = library.episodesOf(episode.showSlug)
  if (!episodes.length) return null
  const hasToken = snapshot.patreonToken !== null
  const at = listedAt(episode, hasToken)
  const earlier = episodes.filter((other) => listedAt(other, hasToken) < at).length
  return { index: earlier + 1, total: episodes.length }
}
