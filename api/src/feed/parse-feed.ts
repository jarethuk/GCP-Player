import { XMLParser } from 'fast-xml-parser'
import { parseDurationSeconds } from './parse-title.js'

/** One `<item>` from a feed, reduced to the fields that get stored. */
export interface FeedItem {
  guid: string
  rawTitle: string
  description: string | null
  /** Null only for a Patreon post, whose audio is a patron's alone — see patreon.ts. */
  audioUrl: string | null
  /** The Patreon post an item came from. Absent for every RSS item. */
  patreonPostId?: string | null
  durationSeconds: number | null
  publishedAt: Date
  artworkUrl: string | null
  /** The episode's video version on YouTube, where the feed mentions one. */
  videoUrl: string | null
}

export interface ParsedFeed {
  /** Channel-level `<itunes:image>`, used when a show's items carry none of their own. */
  channelArtworkUrl: string | null
  items: FeedItem[]
  /** Items missing a title, guid, audio URL or a usable date. Counted, not silently dropped. */
  skipped: number
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  // Megaphone escapes HTML inside <description>; keep it verbatim and sanitise at render time.
  processEntities: true,
})

type XmlNode = Record<string, unknown>

function asArray(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value) ? value : [value]
  return list.filter((entry): entry is XmlNode => typeof entry === 'object' && entry !== null)
}

/** fast-xml-parser gives a string for a plain element and an object when it carries attributes. */
function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && '#text' in value) {
    const inner = (value as XmlNode)['#text']
    if (typeof inner === 'string') return inner.trim() || null
    if (typeof inner === 'number') return String(inner)
  }
  return null
}

function attrOf(value: unknown, attribute: string): string | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = (value as XmlNode)[attribute]
  return typeof raw === 'string' ? raw : null
}

/**
 * A YouTube URL that identifies one video.
 *
 * Deliberately narrow. The network puts `youtube.com/theglasscannon` in almost
 * every description — 179 items carry it — and a link to the channel is not a
 * video version of the episode. Only the forms that name a video count.
 */
const VIDEO_URL =
  /https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/))[A-Za-z0-9_-]{6,}/

/**
 * The video version of an episode, where the feed mentions one.
 *
 * Two shapes, because the network publishes through two hosts:
 *
 *  - **The Acast per-show feeds put it in `<item><link>`** — the episode's
 *    canonical link *is* the video, on every item they carry.
 *  - **The main Megaphone feed mostly writes it into the prose**, as "Watch the
 *    video here: …". Only 136 of its items use `<link>`; the rest need reading
 *    out of the text, where the URL is usually wrapped in word joiners (U+2060)
 *    that a laxer pattern would swallow into the video id.
 *
 * Both description fields are searched, not just the one that gets stored:
 * either may carry the link, and preferring `<content:encoded>` for the text is
 * a separate question from finding a URL.
 *
 * Null is ordinary, not a failure. Nothing published before the network started
 * filming in 2020 has a video, and two current shows — Blood of the Wild, GCN
 * News Minute — are never filmed at all.
 */
function videoUrlOf(item: XmlNode): string | null {
  const link = VIDEO_URL.exec(textOf(item.link) ?? '')
  if (link) return link[0]

  for (const field of ['content:encoded', 'description'] as const) {
    const match = VIDEO_URL.exec(textOf(item[field]) ?? '')
    if (match) return match[0]
  }
  return null
}

/** Turns a raw RSS body into the fields we store. Pure — no network, no database. */
export function parseFeed(xml: string): ParsedFeed {
  const doc = parser.parse(xml) as XmlNode
  const rss = doc.rss as XmlNode | undefined
  const channel = rss?.channel as XmlNode | undefined
  if (!channel) throw new Error('Feed has no <channel> element')

  const channelArtworkUrl = attrOf(channel['itunes:image'], '@_href')
  const items: FeedItem[] = []
  let skipped = 0

  for (const item of asArray(channel.item)) {
    const rawTitle = textOf(item.title)
    const audioUrl = attrOf(item.enclosure, '@_url')
    // No <guid>? Fall back to the audio URL as the stable identity.
    const guid = textOf(item.guid) ?? audioUrl
    const pubDate = textOf(item.pubDate)

    if (!rawTitle || !guid || !audioUrl || !pubDate) {
      skipped += 1
      continue
    }

    const publishedAt = new Date(pubDate)
    if (Number.isNaN(publishedAt.getTime())) {
      skipped += 1
      continue
    }

    items.push({
      guid,
      rawTitle,
      // Prefer the long-form <content:encoded> over <description>.
      description: textOf(item['content:encoded']) ?? textOf(item.description),
      audioUrl,
      durationSeconds: parseDurationSeconds(textOf(item['itunes:duration'])),
      publishedAt,
      artworkUrl: attrOf(item['itunes:image'], '@_href'),
      videoUrl: videoUrlOf(item),
    })
  }

  return { channelArtworkUrl, items, skipped }
}
