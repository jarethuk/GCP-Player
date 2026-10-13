/**
 * A show, three ways: the phone's card, the sidebar's row and the poster
 * wall's tile. Each takes what it draws as props, so the rules for NEW and the
 * padlock are asked in one place — data/logic.ts — and the stories can draw
 * any state without a database.
 */

import { Artwork, MetaLabel, WideArtwork } from '@gcp/web-components'
import { Copy } from '../copy/copy'
import { hasLockedNewEpisode, hasNewEpisode } from '../data/logic'
import type { Show } from '../data/types'
import { NewChip, PatreonLockChip } from './Localized'

export interface ShowRowProps {
  show: Show
  unplayed: number
  hasToken: boolean
  /** For the stories; the screens leave it as now. */
  now?: number
}

function useFlags({ show, unplayed, hasToken, now }: ShowRowProps) {
  const isNew = hasNewEpisode(show, unplayed, hasToken, now)
  const isLockedNew = hasLockedNewEpisode(show, unplayed, hasToken, now)
  return { isNew, isLockedNew }
}

/**
 * What a screen reader says for a show's link: the counts are gone from the
 * rows, but it has room for them. The rows themselves are drawn aria-hidden.
 */
export function showLabel(
  { show, unplayed, hasToken, now }: ShowRowProps,
  variant: 'row' | 'sidebar' | 'tile',
): string {
  const isNew = hasNewEpisode(show, unplayed, hasToken, now)
  const isLockedNew = hasLockedNewEpisode(show, unplayed, hasToken, now)
  if (variant === 'sidebar') {
    return isNew ? `${show.title}, ${Copy.Shows.a11yNewEpisodeUnplayed(unplayed)}` : show.title
  }
  return [
    show.title,
    show.system,
    isNew &&
      (variant === 'row' ? Copy.Shows.a11yNewEpisodeUnplayed(unplayed) : Copy.Shows.a11yNewEpisode),
    isLockedNew && Copy.Shows.a11yLockedNew,
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * One show on the phone: cover, name in display caps, and its game system the
 * way the site sets metadata. A show with something new carries a red rail.
 */
export function ShowRow(props: ShowRowProps) {
  const { show } = props
  const { isNew, isLockedNew } = useFlags(props)
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-[10px] border border-line bg-surface py-[9px] pr-[11px] transition-[filter] hover:brightness-110 ${isNew ? 'pl-2' : 'pl-[11px]'}`}
    >
      {isNew && <span className="absolute inset-y-0 left-0 w-[3px] bg-ember" />}
      <Artwork url={show.artworkUrl} size={56} />
      <div className="flex min-w-0 flex-1 flex-col gap-1" aria-hidden="true">
        <p className="line-clamp-2 font-display text-[14px] leading-[1.2] text-bone uppercase">
          {show.title}
        </p>
        {show.system && <MetaLabel lines={2}>{show.system}</MetaLabel>}
      </div>
      <div className="ml-2 shrink-0" aria-hidden="true">
        {isNew ? <NewChip /> : isLockedNew ? <PatreonLockChip /> : null}
      </div>
    </div>
  )
}

/**
 * A show in the sidebar: cover, title and system. The phone's card would say
 * "separate object", and in a sidebar the selection does that job — so the
 * card goes and the rail stays, always there and clear when there's nothing
 * new, so no cover moves beside it.
 */
export function SidebarShowRow(props: ShowRowProps & { selected: boolean }) {
  const { show, selected } = props
  const { isNew, isLockedNew } = useFlags(props)
  return (
    <div
      className={`flex items-center gap-[7px] rounded-[10px] py-[5px] pr-2.5 transition-colors ${selected ? 'bg-sky/15' : 'hover:bg-sky/5'}`}
    >
      <span
        className={`h-[34px] w-[3px] shrink-0 rounded-full ${isNew ? 'bg-ember' : 'bg-transparent'}`}
      />
      <Artwork url={show.artworkUrl} size={40} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden="true">
        <p className="line-clamp-2 font-display text-[11px] leading-[1.25] text-bone uppercase">
          {show.title}
        </p>
        {show.system && <p className="truncate font-body text-[10px] text-muted">{show.system}</p>}
      </div>
      {/* The sidebar marks NEW with its rail alone; the padlock takes the trailing edge. */}
      {isLockedNew && (
        <span className="ml-1 shrink-0" aria-hidden="true">
          <PatreonLockChip />
        </span>
      )}
    </div>
  )
}

/** One cover on the poster wall, with the show's name over it. */
export function ShowTile(props: ShowRowProps) {
  const { show } = props
  const { isNew, isLockedNew } = useFlags(props)
  return (
    <div className="flex flex-col">
      <div
        className={`relative aspect-square overflow-hidden rounded-xl border ${isNew ? 'border-ember/65' : 'border-line'}`}
        aria-hidden="true"
      >
        <WideArtwork url={show.artworkUrl} renderSize={260} className="absolute inset-0" />
        {/* The same scrim as the show's hero, so a tile and the page it opens read as one. */}
        <span className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-ink-deep/92" />
        <p className="absolute bottom-0 left-0 line-clamp-2 p-2.5 font-display text-[13px] leading-[1.25] text-bone uppercase [text-shadow:0_2px_6px_rgb(0_0_0/0.6)]">
          {show.title}
        </p>
        <span className="absolute top-2 right-2">
          {isNew ? <NewChip /> : isLockedNew ? <PatreonLockChip onArtwork /> : null}
        </span>
      </div>
      {show.system && (
        <span className="mt-2 px-0.5" aria-hidden="true">
          <MetaLabel>{show.system}</MetaLabel>
        </span>
      )}
    </div>
  )
}
