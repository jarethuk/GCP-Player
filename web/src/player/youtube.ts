/**
 * The episode's video, where the network filmed one — roughly half the
 * catalogue. A link out to YouTube rather than a player of ours: YouTube's
 * terms rule out separating the audio and playing it in the background,
 * which is everything this app is for. See WatchOnYouTube.swift.
 */

/**
 * `link` with YouTube's `t=` start time, replacing any the feed's link
 * already carried. The first few seconds aren't worth a jump, and a finished
 * episode's position is 0, so both open at the start.
 *
 * Close rather than exact: a public episode's audio carries ads the video
 * doesn't; Patreon's ad-free copy lines up far better.
 */
export function youTubeLink(link: string, seconds: number): string {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return link
  }
  url.searchParams.delete('t')
  url.searchParams.delete('start')
  if (seconds >= 5) url.searchParams.set('t', String(Math.floor(seconds)))
  return url.toString()
}

/** A usable video link, or null when the feed mentioned none. */
export function videoLink(videoUrl: string | null): string | null {
  if (!videoUrl) return null
  try {
    return new URL(videoUrl).toString()
  } catch {
    return null
  }
}
