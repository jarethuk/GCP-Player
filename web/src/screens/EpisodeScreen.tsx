/**
 * Details for a single episode. One column on a phone; in the wide layout the
 * cover and controls in a rail on the left and the description beside it —
 * or, when the pane is too narrow for both (a portrait tablet), the rail
 * centred with the title and description under it.
 */

import {
  Artwork,
  ChevronLeftIcon,
  EllipsisCircleIcon,
  GlassIconButton,
  LockIcon,
  MetaLabel,
  PauseIcon,
  PlayIcon,
  Spinner,
} from '@gcp/web-components'
import { useParams } from 'react-router'
import { useHasToken, useIsWide, usePlayerState, useServices, useSnapshot } from '../app/hooks'
import { paths } from '../app/routes'
import { Copy } from '../copy/copy'
import { durationText, isLocked, plainDescription } from '../data/logic'
import type { Episode, Show } from '../data/types'
import { DownloadIndicator } from '../ui/DownloadIndicator'
import { EpisodeActionsMenu } from '../ui/EpisodeActionsMenu'
import { PatreonMark } from '../ui/EpisodeRow'
import { WatchOnYouTubeButton } from '../ui/WatchOnYouTube'
import { MissingScreen } from './MissingScreen'
import { useBack } from './navigation'
import { useDocumentTitle } from './useDocumentTitle'
import { useScrolledPast } from './useScrolledPast'

export function EpisodeScreen() {
  const { slug = '', episodeId = '' } = useParams()
  const snapshot = useSnapshot()
  const show = snapshot.shows.get(slug)
  const episode = snapshot.episodesByShow.get(slug)?.find((candidate) => candidate.id === episodeId)
  useDocumentTitle(episode?.title ?? null)
  if (!episode) return <MissingScreen />
  return <EpisodeContent episode={episode} show={show} />
}

function EpisodeContent({ episode, show }: { episode: Episode; show: Show | undefined }) {
  const isWide = useIsWide()
  const back = useBack(show ? paths.show(show.slug) : paths.shows)
  const [sentinel, scrolledPast] = useScrolledPast<HTMLDivElement>()
  const art = episode.artworkUrl ?? show?.artworkUrl

  return (
    <div className="@container min-h-full bg-ink">
      <nav
        className={`sticky top-0 z-20 flex items-center justify-between px-4 pt-[calc(var(--top-inset)+6px)] pb-2 transition-colors duration-200 ${scrolledPast ? 'bg-ink/85 backdrop-blur-xl' : 'bg-ink'}`}
      >
        <GlassIconButton onClick={back} aria-label={Copy.Common.back} className="text-sky">
          <ChevronLeftIcon size={20} />
        </GlassIconButton>
        <h1 className="font-body text-[17px] font-semibold text-bone">{Copy.Episode.title}</h1>
        <EpisodeActionsMenu
          episode={episode}
          className="glass flex size-11 items-center justify-center rounded-full text-bone transition-[filter] hover:brightness-125"
        >
          <EllipsisCircleIcon size={23} />
        </EpisodeActionsMenu>
      </nav>
      <div ref={sentinel} className="h-px" />

      <div className="mx-auto w-full p-4" style={isWide ? { maxWidth: 900 } : undefined}>
        {isWide ? (
          <div className="flex flex-col gap-6 @min-[640px]:flex-row @min-[640px]:items-start @min-[640px]:gap-[30px]">
            <div className="flex w-[280px] shrink-0 flex-col gap-3.5 self-center text-center @min-[640px]:self-auto @min-[640px]:text-left">
              <Artwork url={art} size={280} />
              <PlayControl episode={episode} show={show} />
              <WatchOnYouTubeButton episode={episode} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <TitleBlock episode={episode} show={show} />
              <Description episode={episode} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <Artwork url={art} size={200} />
            </div>
            <TitleBlock episode={episode} show={show} />
            <PlayControl episode={episode} show={show} />
            {/* Renders nothing when the network never filmed this one. */}
            <WatchOnYouTubeButton episode={episode} />
            <Description episode={episode} />
          </div>
        )}
      </div>
    </div>
  )
}

function TitleBlock({ episode, show }: { episode: Episode; show: Show | undefined }) {
  const hasToken = useHasToken()
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="font-display text-[22px] leading-[1.2] text-bone uppercase">
        {episode.title}
      </h2>
      <div className="flex items-start gap-2.5">
        <MetaLabel
          lines={2}
        >{`${show?.title ?? Copy.Episode.unknownShow} · ${durationText(episode, hasToken)}`}</MetaLabel>
        <PatreonMark episode={episode} hasToken={hasToken} />
        <DownloadIndicator episode={episode} />
      </div>
    </div>
  )
}

function PlayControl({ episode, show }: { episode: Episode; show: Show | undefined }) {
  const hasToken = useHasToken()
  const { player } = useServices()
  const state = usePlayerState()

  if (isLocked(episode, hasToken)) {
    // In place of Play, for an episode only Patreon has: what it is, and where
    // to go to fix that.
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-center gap-2 rounded-lg border border-line py-[13px] font-body text-[11px] font-bold tracking-[1.8px] text-muted uppercase">
          <LockIcon size={13} />
          {Copy.Episode.lockedTitle}
        </div>
        <p className="font-body text-[12px] leading-snug text-muted">
          {show?.isPublic === false
            ? Copy.Episode.lockedPatreonOnlyShow
            : Copy.Episode.lockedEarlyRelease}
        </p>
      </div>
    )
  }

  const isCurrent = state.currentGuid === episode.guid
  const isPlayingThis = isCurrent && state.isPlaying
  // Asking Patreon for the audio.
  const isPreparingThis = isCurrent && state.isPreparing
  const label = isPreparingThis
    ? Copy.Episode.loading
    : isPlayingThis
      ? Copy.Episode.pause
      : Copy.Episode.play

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => (isCurrent ? player.togglePlayPause() : player.play(episode.guid))}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-gradient py-[13px] font-body text-[11px] font-bold tracking-[1.8px] text-ink-deep uppercase transition-[filter,transform] hover:brightness-110 active:scale-[0.99]"
      >
        {isPreparingThis ? (
          <Spinner size={14} className="text-ink-deep" />
        ) : isPlayingThis ? (
          <PauseIcon size={13} />
        ) : (
          <PlayIcon size={13} />
        )}
        {label}
      </button>
      {isCurrent && state.playbackError && (
        <p className="font-body text-[12px] text-ember" role="alert">
          {state.playbackError}
        </p>
      )}
    </div>
  )
}

function Description({ episode }: { episode: Episode }) {
  const text = plainDescription(episode)
  if (!text) return null
  return <p className="font-body text-[14px] leading-[1.6] text-muted">{text}</p>
}
