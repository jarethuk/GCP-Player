/**
 * The network publishes every show into one channel, so the only reliable signal for which
 * show an item belongs to is its title. The house format is three pipe-separated segments:
 *
 *   "Shaggy's Fight | Blood of the Wild S1 E38 | Pathfinder 2E Quest for the Frozen Flame"
 *    └ episode      └ show + numbering        └ system / campaign
 *
 * The middle segment carries the show name with an optional trailing `S<n>` and `E<n>`.
 * There are no itunes:season / itunes:episode tags in the feed, so those numbers only exist
 * here. Some shows (the weekly news minute) publish without pipes at all, which is what
 * `knownShows` is for.
 */

export type TitleMatchConfidence = 'exact' | 'prefix' | 'none'

export interface ParsedFeedTitle {
  /**
   * Episode title with the show and system segments removed. A multi-part release carries its
   * part in brackets, because the feed gives all parts the same episode title and number and
   * they would otherwise be indistinguishable in a list.
   */
  episodeTitle: string
  /** Show name, or null when the title could not be attributed to a show. */
  showTitle: string | null
  /** Game system or campaign, from the trailing segment. Display only. */
  system: string | null
  season: number | null
  number: number | null
  /** Which part of a multi-part release this is, when the title says so. */
  part: number | null
  confidence: TitleMatchConfidence
}

/** A show the database already knows about, for attributing items that have no pipes. */
export interface KnownShow {
  title: string
  /**
   * Case-insensitive regex matched against the start of the raw title. Set it for a show that
   * *never* publishes in pipe format: those shows are otherwise invisible to attribution,
   * because the only way a show gets created automatically is by appearing in a pipe title.
   */
  matchPattern?: string | null
}

export interface ParseFeedTitleOptions {
  /**
   * Shows already in the database. Used to attribute items that have no pipes — first by
   * `matchPattern`, then by longest-prefix match on the title. Without it those items come
   * back unattributed rather than guessed.
   *
   * Plain strings are accepted as shorthand for a show with no pattern.
   */
  knownShows?: readonly (KnownShow | string)[]
}

/**
 * A long episode split across several files publishes as `… E100 Part 1`, `… Part 2`. The
 * part has to come off first: it sits *after* the episode number, so leaving it in place
 * defeats the anchored strippers below and the whole segment — number and all — ends up being
 * treated as the show name. That is how one show becomes thirty.
 */
const PART_SUFFIX = /\s+Part\.?\s*(\d{1,3})$/i
/**
 * Numbering at the *start* of what is left after a show name has been matched off the front —
 * `Episode 10 – Flashbacks`, `#13 – Adolescence`, `Part 3`. Pipe-format titles carry their
 * numbering in the middle segment instead, so this only ever applies to the fallback paths.
 */
const LEADING_EPISODE = /^(?:Episode|Ep|E)\.?\s*(\d{1,4})(?![\p{L}\p{N}])/iu
const LEADING_HASH = /^#\s*(\d{1,4})(?![\p{L}\p{N}])/u
const LEADING_PART = /^Part\.?\s*(\d{1,3})(?![\p{L}\p{N}])/iu
const EPISODE_SUFFIX = /\s+(?:E|Ep|Episode)\.?\s*(\d{1,4})$/i
const SEASON_SUFFIX = /\s+(?:S|Season)\.?\s*(\d{1,3})$/i
const LEADING_SEPARATORS = /^[\s\-–—:|,]+/
const LEADING_SEASON = /^(?:Season|S)\.?\s*(\d{1,3})(?![\p{L}\p{N}])/iu
// Single-show feeds only — see parseFeedTitleInShow.
const LEADING_NUMBER = /^(\d{1,4})(?![\p{L}\p{N}])/u
// Patreon only — The Secret Fire numbers its posts "The One Ring RPG Chapter 12". Not in
// EPISODE_SUFFIX, where it would be a guess about titles the RSS parser has never seen.
const CHAPTER_SUFFIX = /\s+Chapter\s*(\d{1,4})$/i

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Strips a trailing `S1 E38 Part 2` / `E42` / `Episode 7` from a show segment. */
function splitNumbering(segment: string): {
  showTitle: string
  season: number | null
  number: number | null
  part: number | null
} {
  let showTitle = segment
  let season: number | null = null
  let number: number | null = null
  let part: number | null = null

  // Outermost suffix first, then the episode number it was hiding, then the season.
  const partMatch = showTitle.match(PART_SUFFIX)
  if (partMatch?.index !== undefined) {
    part = Number.parseInt(partMatch[1] as string, 10)
    showTitle = showTitle.slice(0, partMatch.index).trim()
  }

  const episodeMatch = showTitle.match(EPISODE_SUFFIX)
  if (episodeMatch?.index !== undefined) {
    number = Number.parseInt(episodeMatch[1] as string, 10)
    showTitle = showTitle.slice(0, episodeMatch.index).trim()
  }

  const seasonMatch = showTitle.match(SEASON_SUFFIX)
  if (seasonMatch?.index !== undefined) {
    season = Number.parseInt(seasonMatch[1] as string, 10)
    showTitle = showTitle.slice(0, seasonMatch.index).trim()
  }

  return { showTitle, season, number, part }
}

function normaliseKnownShow(show: KnownShow | string): KnownShow {
  return typeof show === 'string' ? { title: show } : show
}

/**
 * Pulls the leading numbering off an episode title, once a show name has been taken off the
 * front of it: `Episode 10 – Flashbacks` becomes number 10 and "Flashbacks".
 */
function splitLeadingNumbering(remainder: string): {
  episodeTitle: string
  number: number | null
  part: number | null
} {
  let rest = remainder
  let number: number | null = null
  let part: number | null = null

  const episode = rest.match(LEADING_EPISODE) ?? rest.match(LEADING_HASH)
  if (episode) {
    number = Number.parseInt(episode[1] as string, 10)
    rest = rest.slice(episode[0].length)
  } else {
    const partMatch = rest.match(LEADING_PART)
    if (partMatch) {
      part = Number.parseInt(partMatch[1] as string, 10)
      rest = rest.slice(partMatch[0].length)
    }
  }

  return { episodeTitle: rest.replace(LEADING_SEPARATORS, '').trim(), number, part }
}

/**
 * A show whose `matchPattern` claims this title. Patterns are admin-authored, so a broken one
 * is skipped rather than allowed to throw the whole sync.
 */
function matchKnownShowPattern(
  title: string,
  knownShows: readonly KnownShow[],
): { showTitle: string; remainder: string } | null {
  for (const show of knownShows) {
    if (!show.matchPattern) continue

    let pattern: RegExp
    try {
      pattern = new RegExp(show.matchPattern, 'iu')
    } catch {
      continue
    }

    const match = title.match(pattern)
    // Anchored at the start only: a pattern that matches mid-title is almost always a mistake.
    if (match?.index !== 0) continue

    return {
      showTitle: collapseWhitespace(show.title),
      remainder: title.slice(match[0].length).replace(LEADING_SEPARATORS, '').trim(),
    }
  }

  return null
}

function matchKnownShowPrefix(
  title: string,
  knownShows: readonly KnownShow[],
): { showTitle: string; remainder: string } | null {
  const lower = title.toLowerCase()
  // Longest first, so "The Glass Cannon Podcast Shadowdark" wins over "The Glass Cannon Podcast".
  const candidates = [...knownShows]
    .map((show) => collapseWhitespace(show.title))
    .filter((title) => title.length > 0)
    .sort((a, b) => b.length - a.length)

  for (const normalised of candidates) {
    if (!lower.startsWith(normalised.toLowerCase())) continue

    const rest = title.slice(normalised.length)
    // Require a boundary so "Blood of the Wilderness" does not match the show "Blood of the Wild".
    if (rest.length > 0 && /[\p{L}\p{N}]/u.test(rest[0] as string)) continue

    return { showTitle: normalised, remainder: rest.replace(LEADING_SEPARATORS, '').trim() }
  }

  return null
}

export function parseFeedTitle(
  rawTitle: string,
  options: ParseFeedTitleOptions = {},
): ParsedFeedTitle {
  const raw = collapseWhitespace(rawTitle)
  const segments = raw
    .split('|')
    .map(collapseWhitespace)
    .filter((segment) => segment.length > 0)

  if (segments.length >= 2) {
    const { showTitle, season, number, part } = splitNumbering(segments[1] as string)
    const system = segments.length >= 3 ? segments.slice(2).join(' | ') : null

    const base = segments[0] as string
    // All parts of a release share one episode title and number, so the part is the only thing
    // telling them apart once the show name no longer carries it.
    const episodeTitle = part !== null ? `${base} (Part ${part})` : base

    return {
      episodeTitle,
      showTitle: showTitle.length > 0 ? showTitle : null,
      system,
      season,
      number,
      part,
      confidence: showTitle.length > 0 ? 'exact' : 'none',
    }
  }

  const known = (options.knownShows ?? []).map(normaliseKnownShow)

  // An explicit pattern beats a prefix guess: it is the only signal an admin has actually
  // asserted, and it is what lets a show that never uses the pipe format be attributed at all.
  const matched = matchKnownShowPattern(raw, known) ?? matchKnownShowPrefix(raw, known)
  if (matched) {
    const { episodeTitle, number, part } = splitLeadingNumbering(matched.remainder)
    const base = episodeTitle.length > 0 ? episodeTitle : raw

    return {
      episodeTitle: part !== null ? `${base} (Part ${part})` : base,
      showTitle: matched.showTitle,
      system: null,
      season: null,
      number,
      part,
      confidence: 'prefix',
    }
  }

  return {
    episodeTitle: raw,
    showTitle: null,
    system: null,
    season: null,
    number: null,
    part: null,
    confidence: 'none',
  }
}

/**
 * Parses a title from a feed that carries exactly one show — the eight per-show feeds in the
 * network's subscription FAQ. The show is known up front, so the title only has to give up its
 * numbering and a clean episode name.
 *
 * These feeds do not all use the house format. Alongside
 * `Tsunami of Evil | Haunted City S2 E20 | Blades in the Dark` there is
 * `Wicked Empire S1 | E10 - The Temple`, where the pipe separates the season from the episode
 * number rather than the episode from the show, and plain
 * `Androids & Aliens 155 - For Everyone But You` with no pipe at all.
 *
 * The configured spelling of the show always wins, so a per-show feed's episodes land on the
 * same show row as the main feed's copies instead of creating a near-duplicate.
 */
export function parseFeedTitleInShow(rawTitle: string, showTitle: string): ParsedFeedTitle {
  // When the feed really does use the house format, take it — it carries the season, the number
  // and the game system. Only when the pipes separate episode from show, though: a title with no
  // pipes would come back from the general parser with its numbering unread.
  if (rawTitle.includes('|')) {
    const piped = parseFeedTitle(rawTitle, { knownShows: [{ title: showTitle }] })
    if (piped.showTitle?.toLowerCase() === showTitle.toLowerCase()) {
      return { ...piped, showTitle }
    }
  }

  // Otherwise the show name and its numbering are a prefix, and any pipe is just punctuation.
  let rest = collapseWhitespace(rawTitle.replace(/\|/g, ' '))
  if (rest.toLowerCase().startsWith(showTitle.toLowerCase())) {
    rest = rest.slice(showTitle.length)
  }
  rest = rest.replace(LEADING_SEPARATORS, '').trim()

  let season: number | null = null
  const seasonMatch = rest.match(LEADING_SEASON)
  if (seasonMatch) {
    season = Number.parseInt(seasonMatch[1] as string, 10)
    rest = rest.slice(seasonMatch[0].length).replace(LEADING_SEPARATORS, '').trim()
  }

  let number: number | null = null
  // A bare leading number counts only here, where the show is already known. In the general
  // fallback it would misread titles like "Cannon Fodder 2023 Week 5" as episode 2023.
  for (const pattern of [LEADING_EPISODE, LEADING_HASH, LEADING_NUMBER]) {
    const match = rest.match(pattern)
    if (!match) continue
    number = Number.parseInt(match[1] as string, 10)
    rest = rest.slice(match[0].length).replace(LEADING_SEPARATORS, '').trim()
    break
  }

  let episodeTitle: string
  if (rest.length > 0) {
    episodeTitle = rest
  } else if (number !== null) {
    episodeTitle = `Episode ${number}`
  } else {
    // Nothing but the show's own name — keep the title as published.
    episodeTitle = collapseWhitespace(rawTitle)
  }

  return { episodeTitle, showTitle, system: null, season, number, part: null, confidence: 'exact' }
}

/**
 * Parses the title of a Patreon post. The collection it was posted into already says which
 * show it belongs to, so — as with a per-show feed — only the numbering and a clean episode
 * name have to come out of it.
 *
 * Patreon's titles are neither of the RSS feeds' formats. The show is never in them; where the
 * house format has the show, Patreon has the game system:
 *
 *   "So Wet | Shadowdark RPG Episode 44"          ← the public feed's "So Wet | The Glass
 *   "Inner Circle | Call of Cthulhu S4 E10"          Cannon Podcast Shadowdark E44 | …"
 *   "S3 | E50 – Castle Grimgorge"                 ← the Wicked Empire shape, with no show
 *
 * The episode name has to come out exactly as the public feed's does, because that is how the
 * public copy of an early release finds the Patreon one it replaces (see planSync). The first
 * shape keeps the leading segment whole and reads only the numbering off the rest; anything
 * else is handed to the per-show parser, which already reads a leading season and number.
 */
export function parsePatreonTitle(rawTitle: string, showTitle: string): ParsedFeedTitle {
  const segments = collapseWhitespace(rawTitle)
    .split('|')
    .map(collapseWhitespace)
    .filter((segment) => segment.length > 0)

  const [first, ...rest] = segments
  if (first !== undefined && rest.length > 0 && !LEADING_SEASON.test(first)) {
    const tail = rest.join(' ')
    const chapter = tail.match(CHAPTER_SUFFIX)
    const { season, number, part } = splitNumbering(tail)
    return {
      episodeTitle: part !== null ? `${first} (Part ${part})` : first,
      showTitle,
      system: null,
      season,
      number: number ?? (chapter ? Number.parseInt(chapter[1] as string, 10) : null),
      part,
      confidence: 'exact',
    }
  }

  // No pipes at all: "2023 Holiday Special", "Season 2 Talkback". Unlike a
  // per-show RSS feed, a bare leading number here is part of the name, not
  // the episode's — only an explicit "Episode 12" / "#12" is read as one.
  if (first !== undefined && rest.length === 0) {
    const { episodeTitle, number, part } = splitLeadingNumbering(first)
    const base = episodeTitle.length > 0 ? episodeTitle : first
    return {
      episodeTitle: part !== null ? `${base} (Part ${part})` : base,
      showTitle,
      system: null,
      season: null,
      number,
      part,
      confidence: 'exact',
    }
  }

  return parseFeedTitleInShow(rawTitle, showTitle)
}

/**
 * Splits a Patreon collection's title into a show and its system, in the house format's order:
 * "Legacy of the Ancients | Rise of the Runelords | Pathfinder 1E" is the show "Legacy of the
 * Ancients", system "Rise of the Runelords | Pathfinder 1E".
 */
export function parsePatreonCollectionTitle(title: string): {
  showTitle: string
  system: string | null
} {
  const [first, ...rest] = collapseWhitespace(title)
    .split('|')
    .map(collapseWhitespace)
    .filter((segment) => segment.length > 0)
  return {
    showTitle: first ?? collapseWhitespace(title),
    system: rest.length > 0 ? rest.join(' | ') : null,
  }
}

/** URL-safe key for a show name. Stable across syncs, so it is safe to link to. */
export function slugifyShowTitle(title: string): string {
  return collapseWhitespace(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** itunes:duration comes through as `HH:MM:SS`, `MM:SS` or a plain second count. */
export function parseDurationSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10)
    return Number.isFinite(seconds) ? seconds : null
  }

  const parts = trimmed.split(':')
  if (parts.length < 2 || parts.length > 3) return null

  let total = 0
  for (const part of parts) {
    if (!/^\d{1,2}$/.test(part.trim())) return null
    total = total * 60 + Number.parseInt(part, 10)
  }
  return total
}
