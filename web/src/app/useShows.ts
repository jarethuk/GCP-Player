import { useMemo } from 'react'
import { sortShows, unplayedCount } from '../data/logic'
import type { Show } from '../data/types'
import { useSnapshot } from './hooks'

/**
 * Every show, most recently published first, with its unplayed count — what
 * the NEW chip asks about. Counted from memory, so unlike the phones there is
 * no cache to keep in step: a played mark or a new token recounts on the next
 * render.
 */
export function useShows(): {
  shows: Show[]
  unplayed: ReadonlyMap<string, number>
  hasToken: boolean
} {
  const snapshot = useSnapshot()
  const hasToken = snapshot.patreonToken !== null
  const shows = useMemo(() => sortShows(snapshot.shows.values()), [snapshot.shows])
  const unplayed = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [slug, episodes] of snapshot.episodesByShow)
      counts.set(slug, unplayedCount(episodes, hasToken))
    return counts
  }, [snapshot.episodesByShow, hasToken])
  return { shows, unplayed, hasToken }
}
