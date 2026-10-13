/**
 * The full player: a sheet up from the bottom on a phone, a centred dialog in
 * the wide layout — the two ways iOS presents the same sheet.
 */

import { Artwork, ChevronRightIcon, MetaLabel, OutlineButton } from '@gcp/web-components'
import { type PointerEvent, useRef, useState } from 'react'
import { useIsWide, usePlayerState, useServices } from '../app/hooks'
import { Copy } from '../copy/copy'
import { DownloadIndicator } from '../ui/DownloadIndicator'
import { GradientPlayButton, Modal, SkipButton } from '../ui/Localized'
import { WatchOnYouTubeButton } from '../ui/WatchOnYouTube'
import { useCurrentEpisode } from './useCurrentEpisode'

export function NowPlaying({
  onClose,
  onGoToShow,
}: {
  onClose: () => void
  onGoToShow: (slug: string) => void
}) {
  const isWide = useIsWide()
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)

  if (isWide) {
    return (
      <Modal onDismiss={onClose} label={Copy.Player.playing} placement="center">
        <div className="relative flex h-[min(700px,calc(100dvh-48px))] w-[min(540px,100%)] animate-dialog-in overflow-y-auto rounded-[34px] border border-sky/15 bg-ground-gradient shadow-[0_30px_80px_rgb(0_0_0/0.55)]">
          <NowPlayingContent onGoToShow={onGoToShow} />
        </div>
      </Modal>
    )
  }

  // Dragged down from anywhere that isn't a control, it follows the finger and
  // lets go past a quarter of its height.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, a')) return
    start.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current !== null) setDrag(Math.max(0, event.clientY - start.current))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    start.current = null
    if (drag > event.currentTarget.offsetHeight / 4) onClose()
    else setDrag(0)
  }

  return (
    <Modal onDismiss={onClose} label={Copy.Player.playing} placement="bottom">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative flex h-[calc(100dvh-max(env(safe-area-inset-top),12px)-10px)] w-full touch-none animate-sheet-up flex-col overflow-y-auto rounded-t-[38px] border-t border-sky/15 bg-ground-gradient shadow-[0_-10px_40px_rgb(0_0_0/0.4)] ${drag ? '' : 'transition-transform duration-300'}`}
        style={{ transform: `translateY(${drag}px)` }}
      >
        <span
          className="absolute top-2 left-1/2 h-[5px] w-9 -translate-x-1/2 rounded-full bg-bone/25"
          aria-hidden="true"
        />
        <NowPlayingContent onGoToShow={onGoToShow} />
      </div>
    </Modal>
  )
}

function NowPlayingContent({ onGoToShow }: { onGoToShow: (slug: string) => void }) {
  const { player } = useServices()
  const state = usePlayerState()
  const { episode, show, position, nextGuid } = useCurrentEpisode()
  // While the thumb is held, the screen shows where it is — not the player's
  // position, which would yank it back twice a second.
  const [scrubTime, setScrubTime] = useState<number | null>(null)

  const displayTime = scrubTime ?? state.currentTime
  const duration = Math.max(state.duration, 1)
  const hours = state.duration >= 3600

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-[22px] px-[26px] py-5 pb-[max(20px,env(safe-area-inset-bottom))]">
      <span className="shadow-[0_14px_44px_rgb(0_0_0/0.55)]" style={{ borderRadius: 250 / 7 }}>
        <Artwork url={episode?.artworkUrl ?? show?.artworkUrl} size={250} />
      </span>

      <div className="flex w-full flex-col items-center gap-1.5 text-center">
        <h2 className="font-display text-[21px] leading-[1.2] text-bone uppercase">
          {episode?.title ?? Copy.Player.nothingPlaying}
        </h2>
        {show && (
          <button
            type="button"
            onClick={() => onGoToShow(show.slug)}
            aria-label={Copy.Player.a11yGoToShow(show.title)}
            className="flex items-center gap-[5px] text-sky hover:brightness-125"
          >
            <MetaLabel showsTick={false} tone="sky">
              {show.title}
            </MetaLabel>
            <ChevronRightIcon size={8} />
          </button>
        )}
        {position && (
          <span className="pt-0.5">
            <span aria-hidden="true">
              <MetaLabel showsTick={false}>
                {Copy.Player.positionInShow(position.index, position.total)}
              </MetaLabel>
            </span>
            <span className="sr-only">
              {Copy.Player.a11yPositionInShow(position.index, position.total)}
            </span>
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-1">
        <input
          type="range"
          className="scrubber"
          min={0}
          max={duration}
          step={1}
          value={Math.min(displayTime, duration)}
          aria-label={Copy.Player.playing}
          aria-valuetext={timeText(displayTime, hours)}
          style={
            {
              '--fill': `${(Math.min(displayTime, duration) / duration) * 100}%`,
            } as React.CSSProperties
          }
          onChange={(event) => setScrubTime(Number(event.target.value))}
          // Seek once, when the thumb is let go.
          onPointerUp={() => {
            if (scrubTime !== null) player.seek(scrubTime)
            setScrubTime(null)
          }}
          onKeyUp={() => {
            if (scrubTime !== null) player.seek(scrubTime)
            setScrubTime(null)
          }}
        />
        <div className="flex justify-between font-[system-ui] text-[11px] font-semibold text-muted tabular-nums">
          <span>{timeText(displayTime, hours)}</span>
          <span>−{timeText(Math.max(0, state.duration - displayTime), hours)}</span>
        </div>
      </div>

      {/* The gradient lands here and nowhere else on the screen: it marks the thing that plays. */}
      <div className="flex items-center gap-[30px]">
        <SkipButton seconds={15} forward={false} onClick={() => player.skip(-15)} />
        <GradientPlayButton isPlaying={state.isPlaying} onClick={() => player.togglePlayPause()} />
        <SkipButton seconds={30} forward onClick={() => player.skip(30)} />
      </div>

      <div className="flex w-full flex-col gap-3">
        {/* Marks the current episode played and starts the show's next. */}
        <OutlineButton onClick={() => player.playNext()} disabled={!nextGuid}>
          {Copy.Player.playNextEpisode}
        </OutlineButton>
        {episode && <WatchOnYouTubeButton episode={episode} />}
        {/* Down here on its own line: beside the "x of y" counter it read as a
            count of episodes being downloaded. */}
        {episode && (
          <div className="flex justify-center">
            <DownloadIndicator episode={episode} showsLabel />
          </div>
        )}
        {state.playbackError && (
          <p className="text-center font-body text-[12px] text-ember" role="alert">
            {state.playbackError}
          </p>
        )}
      </div>
    </div>
  )
}

/** 754 → "12:34"; with an hour or more in the episode, "0:12:34". */
export function timeText(seconds: number, hours: boolean): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return hours ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
