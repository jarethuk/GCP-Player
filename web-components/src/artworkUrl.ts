/**
 * Where to ask for artwork at the size it's drawn at.
 *
 * The feeds' covers are 3000×3000. Megaphone serves them through imgix, which
 * renders a thumbnail on request — w=168 is 8 KB instead of 660 KB — so those
 * are asked for at size. The other hosts (Acast, Anchor's CloudFront) ignore
 * resize parameters and get the URL exactly as the feed published it, so a
 * host that doesn't understand a query string isn't handed one.
 *
 * The same rule as ArtworkLoader.remoteURL on iOS. `pixels` is the longest
 * edge in device pixels.
 */
export function artworkUrl(source: string, pixels: number): string {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return source
  }
  if (!url.hostname.endsWith('imgix.net')) return source
  const edge = String(Math.round(pixels))
  for (const name of ['max-w', 'max-h', 'w', 'h']) url.searchParams.delete(name)
  url.searchParams.set('w', edge)
  url.searchParams.set('h', edge)
  if (!url.searchParams.has('fit')) url.searchParams.set('fit', 'crop')
  return url.toString()
}
