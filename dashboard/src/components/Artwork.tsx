import { Artwork as SharedArtwork } from '@gcp/web-components'

export interface ArtworkProps {
  url: string | null
  /** The title behind it: its initial stands in until there is artwork. */
  title: string
  /** CSS pixels. */
  size?: number
}

/**
 * A show's cover as the apps draw it — a rounded square at a seventh of its
 * size, asked for at the size it's drawn at where the host can resize. The
 * imgix rewrite lives in the shared `artworkUrl`, beside the web app's.
 */
export function Artwork({ url, title, size = 40 }: ArtworkProps) {
  return <SharedArtwork url={url} size={size} title={title} />
}
