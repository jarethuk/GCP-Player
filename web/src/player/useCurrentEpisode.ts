import { useHasToken, usePlayerState, useServices, useSnapshot } from '../app/hooks'
import { positionInShow } from '../data/actions'
import type { Episode, Show } from '../data/types'

/** The episode in the player, its show, and where it sits in that show. */
export function useCurrentEpisode(): {
  episode: Episode | undefined
  show: Show | undefined
  position: { index: number; total: number } | null
  nextGuid: string | null
  hasToken: boolean
} {
  const { library, player } = useServices()
  const snapshot = useSnapshot()
  const { currentGuid } = usePlayerState()
  const hasToken = useHasToken()
  const episode = currentGuid ? snapshot.episodes.get(currentGuid) : undefined
  const show = episode?.showSlug ? snapshot.shows.get(episode.showSlug) : undefined
  return {
    episode,
    show,
    position: episode ? positionInShow(library, episode.guid) : null,
    nextGuid: episode ? player.nextEpisodeGuid() : null,
    hasToken,
  }
}
