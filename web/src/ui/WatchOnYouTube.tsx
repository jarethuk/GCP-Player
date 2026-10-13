import { type MenuEntry, OutlineButton, PlayRectangleIcon } from '@gcp/web-components'
import { useServices } from '../app/hooks'
import { Copy } from '../copy/copy'
import type { Episode } from '../data/types'
import { videoLink, youTubeLink } from '../player/youtube'

/**
 * Opens the video where the listener has got to — the player's live position
 * if this is the episode loaded, the saved one otherwise. Read at the tap, not
 * at the last render, which on the episode screen could be minutes behind.
 *
 * The player pauses as the video opens: in the phones' apps YouTube takes the
 * audio session, and in a browser both would otherwise talk at once.
 */
export function useOpenOnYouTube(episode: Episode): (() => void) | null {
  const { player } = useServices()
  const link = videoLink(episode.videoUrl)
  if (!link) return null
  return () => {
    const state = player.getState()
    const isLoaded = state.currentGuid === episode.guid
    const seconds = isLoaded ? state.currentTime : episode.positionSeconds
    if (isLoaded && state.isPlaying) player.pause()
    window.open(youTubeLink(link, seconds), '_blank', 'noopener,noreferrer')
  }
}

/** Renders nothing when the network never filmed this one. */
export function WatchOnYouTubeButton({ episode }: { episode: Episode }) {
  const open = useOpenOnYouTube(episode)
  if (!open) return null
  return (
    <OutlineButton
      onClick={open}
      aria-label={Copy.Youtube.a11yWatch}
      title={Copy.Youtube.a11yWatchHint}
    >
      <PlayRectangleIcon size={14} />
      {Copy.Youtube.watch}
    </OutlineButton>
  )
}

export function watchOnYouTubeEntry(open: (() => void) | null): MenuEntry[] {
  return open
    ? [
        {
          key: 'youtube',
          label: Copy.Youtube.watch,
          icon: <PlayRectangleIcon size={18} />,
          onSelect: open,
        },
      ]
    : []
}
