/**
 * An episode in a show's list: its numbers boxed, the title, the date and
 * runtime underneath, and the "…" menu.
 */

import { EllipsisCircleIcon, LockIcon } from '@gcp/web-components'
import type { ReactNode } from 'react'
import { Copy } from '../copy/copy'
import { durationText, isLocked, isPatreonExclusive, listedAt } from '../data/logic'
import type { Episode } from '../data/types'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatDate(time: number): string {
  return dateFormat.format(time)
}

/** "14 Sep 2026 · 67 min", skipping whatever is missing. */
export function dateline(episode: Episode, hasToken: boolean): string {
  const duration = durationText(episode, hasToken)
  return [formatDate(listedAt(episode, hasToken)), duration].filter(Boolean).join(' · ')
}

/**
 * Beside an episode's date: a padlock when it can't be played here, and
 * Patreon's name when it only exists there but can — so an early release reads
 * as one. Nothing for an episode anyone can play.
 */
export function PatreonMark({ episode, hasToken }: { episode: Episode; hasToken: boolean }) {
  if (isLocked(episode, hasToken)) {
    return (
      <span role="img" aria-label={Copy.Episode.a11yLocked} className="shrink-0 text-muted">
        <LockIcon size={11} />
      </span>
    )
  }
  if (isPatreonExclusive(episode)) {
    return (
      <span className="shrink-0 font-body text-[9px] font-bold tracking-[1.2px] text-sky uppercase">
        {Copy.Episode.patreonMark}
      </span>
    )
  }
  return null
}

/**
 * The season and episode numbers, boxed. An invisible two-line template —
 * the widest numbering in the show — sets every chip's size, and the real
 * numbers are centred over it: one box size down the whole list, whether or
 * not the show has seasons, and no "E10" wrapping inside a chip that looked
 * wide enough for it.
 */
export function NumberChip({
  episode,
  template,
}: {
  episode: Episode
  template: { season: string; number: string }
}) {
  const box = 'grid min-w-[34px] px-1 py-1 font-display text-[10px] leading-[13px] text-center'
  const sizer = (
    <span className="invisible col-start-1 row-start-1 flex flex-col" aria-hidden="true">
      <span>{template.season}</span>
      <span>{template.number}</span>
    </span>
  )
  if (episode.number === null) {
    return <span className={`${box} shrink-0`}>{sizer}</span>
  }
  const label =
    episode.season !== null
      ? Copy.Episode.a11ySeasonEpisode(episode.season, episode.number)
      : Copy.Episode.a11yEpisode(episode.number)
  return (
    <span
      role="img"
      aria-label={label}
      className={`${box} shrink-0 rounded-[5px] border border-line bg-sky/[0.07] text-sky`}
    >
      {sizer}
      <span
        className="col-start-1 row-start-1 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        {episode.season !== null && <span>{Copy.Episode.season(episode.season)}</span>}
        <span>{Copy.Episode.number(episode.number)}</span>
      </span>
    </span>
  )
}

export function EpisodeRow({
  episode,
  hasToken,
  template,
  menu,
  indicator,
}: {
  episode: Episode
  hasToken: boolean
  template: { season: string; number: string }
  /** The "…" menu, already wired — the row itself stays free of services. */
  menu: (face: ReactNode) => ReactNode
  /** Whether it's downloaded, after the date — likewise wired by the screen. */
  indicator?: ReactNode
}) {
  const dim = episode.isPlayed || isLocked(episode, hasToken)
  return (
    <div className="flex items-center gap-2.5 px-4 py-[11px]">
      <NumberChip episode={episode} template={template} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p
          className={`font-body text-[14px] leading-[1.3] font-semibold ${dim ? 'text-muted' : 'text-bone'}`}
        >
          {episode.title}
        </p>
        <div className="flex items-center gap-[7px]">
          <PatreonMark episode={episode} hasToken={hasToken} />
          <span className="font-body text-[11px] text-muted tabular-nums">
            {dateline(episode, hasToken)}
          </span>
          {indicator}
        </div>
      </div>
      <span className="ml-1 shrink-0">{menu(<EllipsisCircleIcon size={22} />)}</span>
    </div>
  )
}
