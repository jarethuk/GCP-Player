/**
 * A single show: full-bleed hero artwork carrying its name, an Unplayed /
 * Played filter, and the episodes in listening order.
 *
 * In the wide layout the hero grows and the play-next button joins it, and the
 * list stops at a 760-pixel measure and centres: a title set across 900
 * pixels is unreadable.
 */

import {
  CheckCircleIcon,
  ChevronLeftIcon,
  CircleIcon,
  EmptyState,
  GlassIconButton,
  MetaLabel,
  PlayIcon,
  SegmentedPicker,
  StarIcon,
  WideArtwork,
} from '@gcp/web-components'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useHasToken, useIsWide, usePlayerState, useServices, useSnapshot } from '../app/hooks'
import { paths } from '../app/routes'
import { Copy } from '../copy/copy'
import { setStarred } from '../data/actions'
import { chipTemplate, inListeningOrder, nextUnplayed } from '../data/logic'
import type { Episode, Show } from '../data/types'
import { DownloadIndicator } from '../ui/DownloadIndicator'
import { EpisodeActionsMenu } from '../ui/EpisodeActionsMenu'
import { EpisodeRow } from '../ui/EpisodeRow'
import { MissingScreen } from './MissingScreen'
import { useBack } from './navigation'
import { useDocumentTitle } from './useDocumentTitle'
import { useScrolledPast } from './useScrolledPast'

type Filter = 'unplayed' | 'played'

const FILTERS = [
  { value: 'unplayed', label: Copy.Show.unplayed },
  { value: 'played', label: Copy.Show.played },
] as const

export function ShowScreen() {
  const { slug = '' } = useParams()
  const show = useSnapshot().shows.get(slug)
  useDocumentTitle(show?.title ?? null)
  if (!show) return <MissingScreen />
  // Keyed, so the filter starts over for each show as a new view would.
  return <ShowContent key={show.slug} show={show} />
}

function ShowContent({ show }: { show: Show }) {
  const { library } = useServices()
  const isWide = useIsWide()
  const hasToken = useHasToken()
  const back = useBack(paths.shows)
  const all = useSnapshot().episodesByShow.get(show.slug)
  const [filter, setFilter] = useState<Filter>('unplayed')
  const [sentinel, scrolledPast] = useScrolledPast<HTMLDivElement>()

  const allEpisodes = useMemo(() => all ?? [], [all])
  const ordered = useMemo(() => inListeningOrder(allEpisodes, hasToken), [allEpisodes, hasToken])
  const episodes = ordered.filter((episode) => (filter === 'played') === episode.isPlayed)
  // From every episode, not the filtered list, or the chips would resize as
  // you flip between played and unplayed.
  const template = useMemo(() => chipTemplate(allEpisodes), [allEpisodes])
  const next = isWide ? nextUnplayed(allEpisodes, hasToken) : null
  const heroHeight = isWide ? 380 : 320

  return (
    <div className="min-h-full bg-ink">
      {/* The bar: glass buttons over the artwork, a ground behind them once it has scrolled away. */}
      <div className="sticky top-0 z-20 h-0">
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--top-inset)+72px)] bg-linear-to-b from-ink via-ink/85 to-transparent transition-opacity duration-200 ${scrolledPast ? 'opacity-100' : 'opacity-0'}`}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[calc(var(--top-inset)+6px)]">
          {isWide ? (
            <span />
          ) : (
            <GlassIconButton onClick={back} aria-label={Copy.Common.back} className="text-sky">
              <ChevronLeftIcon size={20} />
            </GlassIconButton>
          )}
          <GlassIconButton
            onClick={() => void setStarred(library, show.slug, !show.isStarred)}
            aria-label={show.isStarred ? Copy.Show.removeFromMyShows : Copy.Show.addToMyShows}
            aria-pressed={show.isStarred}
            className={show.isStarred ? 'text-sky' : 'text-bone'}
          >
            <StarIcon size={21} filled={show.isStarred} />
          </GlassIconButton>
        </div>
      </div>

      <header className="relative overflow-hidden" style={{ height: heroHeight }}>
        <WideArtwork
          url={show.artworkUrl}
          renderSize={isWide ? 900 : 440}
          className="absolute inset-0"
        />
        <span className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(3_37_63/0.05)_0%,rgb(3_37_63/0.72)_62%,#03253f_97%)]" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pb-3">
            <h1 className="line-clamp-3 font-display text-[26px] leading-[1.15] text-bone uppercase">
              {show.title}
            </h1>
            {show.system && <MetaLabel lines={2}>{show.system}</MetaLabel>}
          </div>
          {next && <PlayNextButton episode={next} />}
        </div>
        {/* Out of view once the hero is about to pass under the bar. */}
        <div ref={sentinel} className="absolute inset-x-0 bottom-16 h-px" />
      </header>

      <div className="mx-auto w-full" style={isWide ? { maxWidth: 760 } : undefined}>
        <div className="px-3.5 py-3">
          <SegmentedPicker options={FILTERS} selection={filter} onChange={setFilter} />
        </div>

        {episodes.length === 0 && (
          <div className="pt-10 pb-6">
            <EmptyState
              icon={
                filter === 'unplayed' ? <CheckCircleIcon size={44} /> : <CircleIcon size={44} />
              }
              title={filter === 'unplayed' ? Copy.Show.allCaughtUp : Copy.Show.nothingPlayed}
            />
          </div>
        )}

        <ul className="pb-4">
          {episodes.map((episode) => (
            <li key={episode.guid} className="relative transition-colors hover:bg-sky/[0.04]">
              <Link
                to={paths.episode(show.slug, episode.id)}
                aria-label={episode.title}
                className="absolute inset-0 z-0"
              />
              <div className="pointer-events-none relative">
                <EpisodeRow
                  episode={episode}
                  hasToken={hasToken}
                  template={template}
                  indicator={<DownloadIndicator episode={episode} />}
                  menu={(face) => (
                    <EpisodeActionsMenu
                      episode={episode}
                      className="pointer-events-auto flex size-9 items-center justify-center rounded-full text-muted hover:text-bone"
                    >
                      {face}
                    </EpisodeActionsMenu>
                  )}
                />
              </div>
              <div className="mx-4 h-px bg-line" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * What you opened the show to do, where there's width for it. On a phone the
 * first unplayed row is right under the title anyway; on a wide screen the
 * list can be sixty rows long before it reaches one.
 */
function PlayNextButton({ episode }: { episode: Episode }) {
  const { player } = useServices()
  usePlayerState()
  return (
    <button
      type="button"
      onClick={() => player.play(episode.guid)}
      aria-label={Copy.Show.a11yPlayEpisode(episode.title)}
      className="mr-4 mb-3 flex shrink-0 items-center gap-2 rounded-lg bg-accent-gradient px-[18px] py-3 font-body text-[11px] font-bold tracking-[1.6px] text-ink-deep uppercase transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgb(0_84_142/0.5)]"
    >
      <PlayIcon size={12} />
      {Copy.Show.playNextUnplayed}
    </button>
  )
}
