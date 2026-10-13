/**
 * The phone's shape: one stack — shows, a show, an episode — with the player
 * as a bar at the foot of every screen and a sheet above them all.
 *
 * The window scrolls, so a phone's browser can tuck its toolbars away, and the
 * router puts each screen's scroll back when you come back to it.
 */

import { useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router'
import { usePlayerState } from '../app/hooks'
import { paths } from '../app/routes'
import { MINI_PLAYER_HEIGHT, MiniPlayerBar } from '../player/MiniPlayerBar'
import { NowPlaying } from '../player/NowPlaying'
import { EpisodeScreen } from '../screens/EpisodeScreen'
import { useBack } from '../screens/navigation'
import { SettingsScreen } from '../screens/SettingsScreen'
import { ShowScreen } from '../screens/ShowScreen'
import { ShowsScreen } from '../screens/ShowsScreen'

export function PhoneLayout() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const { currentGuid } = usePlayerState()
  const [isShowingNowPlaying, setShowingNowPlaying] = useState(false)

  // A push slides in from the right and a pop from the left, as the stack
  // does. Not the page the app opened on, which is just there — the router
  // calls arriving at it a POP.
  const firstKey = useRef(location.key)
  const hasMoved = useRef(false)
  if (location.key !== firstKey.current) hasMoved.current = true
  const animation = !hasMoved.current
    ? ''
    : navigationType === 'PUSH'
      ? 'animate-push'
      : navigationType === 'POP'
        ? 'animate-pop'
        : ''

  return (
    <>
      <div
        key={location.pathname}
        className={animation}
        // The bar overlays the page; this is what lets the last row scroll clear of it.
        style={{
          paddingBottom: currentGuid
            ? `calc(${MINI_PLAYER_HEIGHT}px + env(safe-area-inset-bottom))`
            : undefined,
        }}
      >
        <Routes location={location}>
          <Route path="/" element={<ShowsScreen />} />
          <Route path="/settings" element={<PhoneSettings />} />
          <Route path="/shows/:slug" element={<ShowScreen />} />
          <Route path="/shows/:slug/episodes/:episodeId" element={<EpisodeScreen />} />
          <Route path="*" element={<Navigate to={paths.shows} replace />} />
        </Routes>
      </div>

      <MiniPlayerBar onOpen={() => setShowingNowPlaying(true)} />

      {isShowingNowPlaying && (
        <NowPlaying
          onClose={() => setShowingNowPlaying(false)}
          onGoToShow={(slug) => {
            // Close the sheet first, then navigate: the stack is behind it.
            setShowingNowPlaying(false)
            if (location.pathname !== paths.show(slug)) navigate(paths.show(slug))
          }}
        />
      )}
    </>
  )
}

function PhoneSettings() {
  return <SettingsScreen onClose={useBack(paths.shows)} />
}
