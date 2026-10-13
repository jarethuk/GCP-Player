/**
 * Patreon, from the listener's side. The web port of iOS/GCP Player/Patreon.swift.
 *
 * The API knows every Patreon episode but never has its audio. That lives in
 * each patron's own feed, whose URL carries their token:
 *
 *     https://www.patreon.com/rss/glasscannon?auth=<token>&show=<collection>
 *
 * So the token is pasted in once, and the app asks that feed for an episode's
 * audio at the moment it plays. The catalogue API never sees it.
 */

/** One episode's Patreon audio, as the patron's feed describes it. */
export interface PatreonAudio {
  url: string
  durationSeconds: number | null
}

/**
 * Takes the token out of a pasted feed link. Anything Patreon hands out works —
 * the link from "Copy RSS link", with or without `&show=`, or the URL of a
 * single episode's audio (`/api/rss/u/<token>/e/…`). null if there's no token.
 */
export function tokenFromFeedLink(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (!url.hostname.endsWith('patreon.com')) return null

  const auth = url.searchParams.get('auth')
  if (auth && isPlausible(auth)) return auth

  const parts = url.pathname.split('/').filter(Boolean)
  const index = parts.indexOf('u')
  if (index >= 2 && parts[index - 2] === 'api' && parts[index - 1] === 'rss') {
    const candidate = parts[index + 1]
    if (candidate && isPlausible(candidate)) return candidate
  }
  return null
}

function isPlausible(token: string): boolean {
  return token.length >= 16 && /^[A-Za-z0-9_-]+$/.test(token)
}

/** `https://www.patreon.com/glasscannon/posts/war-breaks-out-154017528` → `154017528`. */
export function postIdFromLink(link: string): string | null {
  return /\/posts\/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)/.exec(link)?.[1] ?? null
}

/** `4353`, `72:33` or `1:12:33`. */
function seconds(value: string): number | null {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10))
  if (!parts.length || parts.length > 3 || parts.some((part) => Number.isNaN(part))) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

/**
 * Reads a patron's feed down to what playing needs: each item's post id, its
 * enclosure and its `<itunes:duration>`.
 *
 * The post id comes from the item's `<link>`, not its `<guid>`: the network's
 * back catalogue was imported from Supercast and kept Supercast's guids. The
 * link is always the post's page, ending `-<post id>`.
 */
export function parsePatreonFeed(xml: string): Map<string, PatreonAudio> {
  const items = new Map<string, PatreonAudio>()
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  for (const item of document.getElementsByTagName('item')) {
    const text = (name: string) => item.getElementsByTagName(name)[0]?.textContent?.trim() ?? null
    const link = text('link')
    const guid = text('guid')
    const postId = (link && postIdFromLink(link)) ?? (guid && /^\d+$/.test(guid) ? guid : null)
    const enclosure = item.getElementsByTagName('enclosure')[0]?.getAttribute('url')
    if (!postId || !enclosure) continue
    const duration = text('itunes:duration')
    items.set(postId, { url: enclosure, durationSeconds: duration ? seconds(duration) : null })
  }
  return items
}
