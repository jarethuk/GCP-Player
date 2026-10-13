/**
 * The rules the screens ask about — what an episode is listed by, whether it
 * plays, whether a show is NEW. Ported one for one from the extensions in
 * iOS/GCP Player/Models.swift, with the Patreon token passed in rather than
 * read from a singleton, so each is a plain function of its inputs.
 */

import { Copy } from '../copy/copy'
import type { Episode, Show } from './types'

// -- Episodes ----------------------------------------------------------------

/**
 * The date an episode is listed and ordered by. For a patron, Patreon's: an
 * early release came out when Patreon posted it. Without a token the public
 * date, which is when this listener could first hear it.
 */
export function listedAt(episode: Episode, hasToken: boolean): number {
  return hasToken ? (episode.patreonPublishedAt ?? episode.publishedAt) : episode.publishedAt
}

/** On Patreon only, with no public audio yet. */
export function isPatreonExclusive(episode: Episode): boolean {
  return episode.audioUrl === null && episode.patreonPostId !== null
}

/** Patreon's alone, and no token to reach it with: shown, but padlocked. */
export function isLocked(episode: Episode, hasToken: boolean): boolean {
  return episode.audioUrl === null && !hasToken
}

/**
 * Plays from the patron's feed rather than the public one — every Patreon
 * episode once there is a token, the public ones included, because Patreon's
 * copy has no ads.
 */
export function playsFromPatreon(episode: Episode, hasToken: boolean): boolean {
  return episode.patreonPostId !== null && hasToken
}

/** Its audio is in this browser's download cache, as far as the row knows. */
export function isDownloaded(episode: Episode): boolean {
  return episode.downloadedAt != null
}

/** The runtime of the copy that will actually play. */
export function effectiveDurationSeconds(episode: Episode, hasToken: boolean): number | null {
  return playsFromPatreon(episode, hasToken)
    ? (episode.patreonDurationSeconds ?? episode.durationSeconds)
    : episode.durationSeconds
}

/** "42 min", or "" with no runtime. */
export function durationText(episode: Episode, hasToken: boolean): string {
  const seconds = effectiveDurationSeconds(episode, hasToken)
  return seconds === null ? '' : Copy.Episode.duration(Math.floor(seconds / 60))
}

/** Oldest first — the order you'd listen to a campaign in. */
export function inListeningOrder(episodes: readonly Episode[], hasToken: boolean): Episode[] {
  return [...episodes].sort(
    (a, b) =>
      listedAt(a, hasToken) - listedAt(b, hasToken) ||
      a.publishedAt - b.publishedAt ||
      a.guid.localeCompare(b.guid),
  )
}

/** The feed's description is HTML; the phones strip it to text, and so does this. */
export function plainDescription(episode: Episode): string | null {
  if (!episode.description) return null
  const withoutTags = episode.description.replace(/<[^>]+>/g, ' ')
  const text = decodeEntities(withoutTags).replace(/\s+/g, ' ').trim()
  return text || null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity
    }
    return ENTITIES[body.toLowerCase()] ?? entity
  })
}

// -- Shows -------------------------------------------------------------------

/**
 * Five days. Nearly every show on the network is weekly, so the chip marks the
 * current episode and then goes out for a day or two before the next lands.
 */
export const RECENT_WINDOW_MS = 5 * 24 * 60 * 60 * 1000

/** Most recently published first, then by title. */
export function sortShows(shows: Iterable<Show>): Show[] {
  return [...shows].sort(
    (a, b) => b.latestEpisodeAt - a.latestEpisodeAt || a.title.localeCompare(b.title),
  )
}

/**
 * Unheard episodes in a show. Without a Patreon token, padlocked ones don't
 * count: an early release nobody here can play is not something new to listen to.
 */
export function unplayedCount(episodes: readonly Episode[], hasToken: boolean): number {
  let count = 0
  for (const episode of episodes) {
    if (!episode.isPlayed && (hasToken || episode.audioUrl !== null)) count += 1
  }
  return count
}

/**
 * "New" means newly published *and* not yet heard — on a back catalogue this
 * size almost every show has something unplayed. Only what this browser can
 * play counts.
 */
export function hasNewEpisode(
  show: Show,
  unplayed: number,
  hasToken: boolean,
  now = Date.now(),
): boolean {
  const latest = hasToken ? show.latestAnyEpisodeAt : show.latestPublicEpisodeAt
  return unplayed > 0 && latest > now - RECENT_WINDOW_MS
}

/**
 * A padlock where the NEW chip would be: no token, and what the show has is
 * Patreon's — a Patreon-only show, always, or a public one whose newest
 * episode is an early release.
 */
export function hasLockedNewEpisode(
  show: Show,
  unplayed: number,
  hasToken: boolean,
  now = Date.now(),
): boolean {
  if (hasToken || hasNewEpisode(show, unplayed, hasToken, now)) return false
  if (!show.isPublic) return true
  return (
    show.latestAnyEpisodeAt > show.latestPublicEpisodeAt &&
    show.latestAnyEpisodeAt > now - RECENT_WINDOW_MS
  )
}

/** The oldest unheard episode that plays here, or null when there isn't one. */
export function nextUnplayed(episodes: readonly Episode[], hasToken: boolean): Episode | null {
  let best: Episode | null = null
  for (const episode of episodes) {
    if (episode.isPlayed || isLocked(episode, hasToken)) continue
    if (!best || listedAt(episode, hasToken) < listedAt(best, hasToken)) best = episode
  }
  return best
}

/** "S0" / "E000": the widest numbering in a show, so every chip reserves the same room. */
export function chipTemplate(episodes: readonly Episode[]): { season: string; number: string } {
  const widest = (values: number[], label: (value: number) => string, fallback: string) => {
    if (!values.length) return fallback
    const digits = String(Math.max(...values)).length
    return label(0).replace('0', '0'.repeat(digits))
  }
  return {
    season: widest(
      episodes.flatMap((episode) => (episode.season === null ? [] : [episode.season])),
      Copy.Episode.season,
      Copy.Episode.season(0),
    ),
    number: widest(
      episodes.flatMap((episode) => (episode.number === null ? [] : [episode.number])),
      Copy.Episode.number,
      Copy.Episode.number(0),
    ),
  }
}

/** Does any episode in the show carry a season? If none do, no chip draws one. */
export function hasSeasons(episodes: readonly Episode[]): boolean {
  return episodes.some((episode) => episode.season !== null)
}
