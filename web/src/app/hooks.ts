import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Snapshot } from '../data/library'
import type { PlayerState } from '../player/player'
import type { CatalogueState } from './catalogue'
import type { Services } from './services'

export const ServicesContext = createContext<Services | null>(null)

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices outside <ServicesContext>')
  return services
}

/** The library as it is now; re-renders on every write. */
export function useSnapshot(): Snapshot {
  const { library } = useServices()
  return useSyncExternalStore(library.subscribe, library.getSnapshot)
}

export function useHasToken(): boolean {
  return useSnapshot().patreonToken !== null
}

export function usePlayerState(): PlayerState {
  const { player } = useServices()
  return useSyncExternalStore(player.subscribe, player.getState)
}

/** How far along this episode's download is, 0–1, or undefined when none is under way. */
export function useDownloadProgress(guid: string): number | undefined {
  const { downloads } = useServices()
  const progress = useSyncExternalStore(downloads.subscribe, downloads.getProgress)
  return progress.get(guid)
}

export function useCatalogueState(): CatalogueState {
  const { catalogue } = useServices()
  return useSyncExternalStore(catalogue.subscribe, catalogue.getState)
}

/**
 * The phones' size-class rule: the window decides the layout, never the
 * device. Wide enough and tall enough for a sidebar beside the content gets
 * the iPad layout; anything else — a phone, a narrow window, a phone on its
 * side — gets the phone's. The same thresholds as the Android tablet layout.
 * src/index.css repeats this query for `--top-inset`; change both together.
 */
export const WIDE_QUERY = '(min-width: 700px) and (min-height: 480px)'

function subscribeToWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsWideWindow(): boolean {
  return useSyncExternalStore(
    subscribeToWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  )
}

/** Whether this screen is being drawn in the wide layout, as opposed to the window being wide. */
export const WideLayoutContext = createContext(false)

export function useIsWide(): boolean {
  return useContext(WideLayoutContext)
}
