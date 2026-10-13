/**
 * The iPad's shape, for any window with the room: the shows as a sidebar that
 * is always there, the detail beside it one push deep — the poster wall, a
 * show, or an episode — and the player as a bar across the full width, over
 * both columns, opening the same player as a centred dialog.
 *
 * Settings is a sheet over it all rather than a page in the detail column,
 * which would replace whatever you were listening your way through. Its URL
 * carries the page it opened over, so closing it goes back there.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import {
  type Location,
  matchPath,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router'
import { usePlayerState } from '../app/hooks'
import { paths } from '../app/routes'
import { Copy } from '../copy/copy'
import { MINI_PLAYER_HEIGHT, MiniPlayerBar } from '../player/MiniPlayerBar'
import { NowPlaying } from '../player/NowPlaying'
import { EpisodeScreen } from '../screens/EpisodeScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { ShowScreen } from '../screens/ShowScreen'
import { ShowsGrid } from '../screens/ShowsGrid'
import { ShowsSidebar } from '../screens/ShowsSidebar'
import { Modal } from '../ui/Localized'

/** What Settings opens over when it was opened straight from a link. */
const HOME = { pathname: '/', search: '', hash: '', state: null, key: 'home' } as Location

export function WideLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const { currentGuid } = usePlayerState()
  const [isShowingNowPlaying, setShowingNowPlaying] = useState(false)

  const isSettings = matchPath(paths.settings, location.pathname) !== null
  const background = (location.state as { background?: Location } | null)?.background
  const detailLocation = isSettings ? (background ?? HOME) : location
  const selectedSlug = matchPath('/shows/:slug/*', detailLocation.pathname)?.params.slug ?? null

  // The detail column scrolls on its own. A new page starts at the top; going
  // back finds the list where it was left.
  const detail = useRef<HTMLElement>(null)
  const scrollPositions = useRef(new Map<string, number>())
  const previousKey = useRef(detailLocation.key)
  useLayoutEffect(() => {
    const element = detail.current
    if (!element || previousKey.current === detailLocation.key) return
    previousKey.current = detailLocation.key
    element.scrollTop =
      navigationType === 'POP' ? (scrollPositions.current.get(detailLocation.key) ?? 0) : 0
  }, [detailLocation.key, navigationType])

  const inset = currentGuid
    ? `calc(${MINI_PLAYER_HEIGHT}px + env(safe-area-inset-bottom))`
    : undefined

  return (
    <>
      <div className="flex h-dvh overflow-hidden">
        <aside
          className="w-[clamp(280px,32vw,360px)] shrink-0 overflow-y-auto border-r border-line/60 bg-ink-deep pt-(--top-inset)"
          style={{ paddingBottom: inset }}
        >
          <ShowsSidebar selectedSlug={selectedSlug} />
        </aside>
        <main
          ref={detail}
          className="relative min-w-0 flex-1 overflow-y-auto bg-ink"
          style={{ paddingBottom: inset }}
          onScroll={(event) =>
            scrollPositions.current.set(detailLocation.key, event.currentTarget.scrollTop)
          }
        >
          <Routes location={detailLocation}>
            <Route path="/shows/:slug" element={<ShowScreen />} />
            <Route path="/shows/:slug/episodes/:episodeId" element={<EpisodeScreen />} />
            {/* Not "select a show": the covers are worth looking at. */}
            <Route path="*" element={<ShowsGrid />} />
          </Routes>
        </main>
      </div>

      <MiniPlayerBar onOpen={() => setShowingNowPlaying(true)} />

      {isShowingNowPlaying && (
        <NowPlaying
          onClose={() => setShowingNowPlaying(false)}
          onGoToShow={(slug) => {
            setShowingNowPlaying(false)
            // A change of selection here, where a phone would push.
            if (detailLocation.pathname !== paths.show(slug)) navigate(paths.show(slug))
          }}
        />
      )}

      {isSettings && (
        <SettingsSheet
          onClose={() => (background ? navigate(-1) : navigate(paths.shows, { replace: true }))}
        />
      )}
    </>
  )
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal onDismiss={onClose} label={Copy.Settings.title} placement="center">
      <div className="relative h-[min(760px,calc(100dvh-48px))] w-[min(540px,100%)] animate-dialog-in overflow-y-auto rounded-[34px] border border-sky/15 bg-ink shadow-[0_30px_80px_rgb(0_0_0/0.55)]">
        <SettingsScreen onClose={onClose} />
      </div>
    </Modal>
  )
}
