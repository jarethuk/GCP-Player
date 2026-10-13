/**
 * The compact "now playing" bar pinned to the foot of every screen, the full
 * width of the window. Tapping it opens Now Playing.
 */

import { Artwork } from '@gcp/web-components'
import { usePlayerState, useServices } from '../app/hooks'
import { GradientPlayButton } from '../ui/Localized'
import { useCurrentEpisode } from './useCurrentEpisode'

/** How much room the bar takes, for the lists to leave at their foot. */
export const MINI_PLAYER_HEIGHT = 64

export function MiniPlayerBar({ onOpen }: { onOpen: () => void }) {
  const { player } = useServices()
  const state = usePlayerState()
  const { episode, show } = useCurrentEpisode()
  if (!episode) return null

  const progress =
    state.duration > 0 ? Math.min(Math.max(state.currentTime / state.duration, 0), 1) : 0

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-deep/94 pb-safe backdrop-blur-xl">
      <div className="h-0.5 bg-sky/16" aria-hidden="true">
        <div className="h-full bg-accent-gradient" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="relative flex items-center gap-2.5 px-3.5 py-[9px]">
        {/* The whole bar opens the player; the play button sits above it. */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={show ? `${episode.title}, ${show.title}` : episode.title}
          className="absolute inset-0 cursor-pointer"
        />
        <span className="pointer-events-none">
          <Artwork url={episode.artworkUrl ?? show?.artworkUrl} size={40} />
        </span>
        <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-px">
          <p className="truncate font-body text-[13px] font-bold text-bone">{episode.title}</p>
          <p className="truncate font-body text-[10.5px] text-muted">{show?.title ?? ''}</p>
        </div>
        <span className="relative ml-2">
          <GradientPlayButton
            isPlaying={state.isPlaying}
            size={32}
            onClick={() => player.togglePlayPause()}
          />
        </span>
      </div>
    </div>
  )
}
