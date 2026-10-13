/**
 * The root screen on a phone: every show, most recently published first.
 * Runs the sync as it appears. In the wide layout the same shows appear in
 * the sidebar and on the poster wall instead.
 */

import { circleIconClass, DisplayHeader, GearIcon, SegmentedPicker } from '@gcp/web-components'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useServices } from '../app/hooks'
import { paths } from '../app/routes'
import { useShows } from '../app/useShows'
import { Copy } from '../copy/copy'
import { InstallButton } from '../ui/InstallButton'
import { ShowRow, showLabel } from '../ui/ShowRows'
import { CatalogueStatus } from './CatalogueStatus'
import { useDocumentTitle } from './useDocumentTitle'

type Tab = 'myShows' | 'allShows'

const TABS = [
  { value: 'myShows', label: Copy.Shows.myShows },
  { value: 'allShows', label: Copy.Shows.allShows },
] as const

/** Kept across visits to a show and back, as the phone's @State is. */
let rememberedTab: Tab = 'myShows'

export function ShowsScreen() {
  const { catalogue } = useServices()
  const { shows, unplayed, hasToken } = useShows()
  const [tab, setTab] = useState<Tab>(rememberedTab)
  useDocumentTitle(null)

  useEffect(() => {
    void catalogue.sync()
  }, [catalogue])

  // The tabs only exist once something has been starred.
  const hasStarred = shows.some((show) => show.isStarred)
  const visible = hasStarred && tab === 'myShows' ? shows.filter((show) => show.isStarred) : shows

  return (
    <div className="min-h-dvh bg-ground-gradient bg-fixed pt-(--top-inset)">
      <header className="flex items-start gap-3 px-4 pt-2 pb-[18px]">
        <DisplayHeader eyebrow={Copy.Shows.eyebrow} title={Copy.Shows.title} />
        <span className="flex-1" />
        {/* Top-aligned with the eyebrow, not in a bar of its own. */}
        <InstallButton />
        <Link to={paths.settings} aria-label={Copy.Common.settings} className={circleIconClass}>
          <GearIcon size={19} />
        </Link>
      </header>

      {hasStarred && (
        <div className="px-4 pb-3.5">
          <SegmentedPicker
            options={TABS}
            selection={tab}
            onChange={(value) => {
              rememberedTab = value
              setTab(value)
            }}
          />
        </div>
      )}

      <ul className="flex flex-col gap-2 px-3 pb-4">
        {visible.map((show) => (
          <li key={show.slug}>
            <Link
              to={paths.show(show.slug)}
              aria-label={showLabel(
                { show, unplayed: unplayed.get(show.slug) ?? 0, hasToken },
                'row',
              )}
              className="block rounded-[10px]"
            >
              <ShowRow show={show} unplayed={unplayed.get(show.slug) ?? 0} hasToken={hasToken} />
            </Link>
          </li>
        ))}
      </ul>

      {shows.length === 0 && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center [&>*]:pointer-events-auto">
          <CatalogueStatus />
        </div>
      )}
    </div>
  )
}
