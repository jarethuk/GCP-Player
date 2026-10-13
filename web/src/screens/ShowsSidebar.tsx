/**
 * The wide layout's leading column: every show, always there. My Shows and
 * All Shows are two sections rather than the phone's toggle — the toggle
 * exists because a phone has room for one list at a time, and vertical space
 * is the one thing a wide window has spare.
 */

import { circleIconClass, DisplayHeader, GearIcon, MetaLabel } from '@gcp/web-components'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { useServices } from '../app/hooks'
import { paths } from '../app/routes'
import { useShows } from '../app/useShows'
import { Copy } from '../copy/copy'
import type { Show } from '../data/types'
import { InstallButton } from '../ui/InstallButton'
import { SidebarShowRow, showLabel } from '../ui/ShowRows'

export function ShowsSidebar({ selectedSlug }: { selectedSlug: string | null }) {
  const { catalogue } = useServices()
  const { shows, unplayed, hasToken } = useShows()
  const location = useLocation()
  const starred = shows.filter((show) => show.isStarred)

  useEffect(() => {
    void catalogue.sync()
  }, [catalogue])

  const row = (show: Show) => (
    <li key={show.slug}>
      <Link
        to={paths.show(show.slug)}
        aria-label={showLabel(
          { show, unplayed: unplayed.get(show.slug) ?? 0, hasToken },
          'sidebar',
        )}
        aria-current={show.slug === selectedSlug ? 'page' : undefined}
        className="block rounded-[10px]"
      >
        <SidebarShowRow
          show={show}
          unplayed={unplayed.get(show.slug) ?? 0}
          hasToken={hasToken}
          selected={show.slug === selectedSlug}
        />
      </Link>
    </li>
  )

  return (
    <nav aria-label={Copy.Shows.title} className="pr-2.5 pl-0">
      <header className="flex items-start gap-3 pt-[22px] pb-2 pl-2.5">
        <DisplayHeader
          eyebrow={Copy.Shows.eyebrow}
          title={Copy.Shows.title}
          size={24}
          ruleWidth={44}
          as="h2"
        />
        <span className="flex-1" />
        {/* A sheet over the layout rather than a page in the detail column, which
            would replace whatever you were listening your way through. */}
        <InstallButton />
        <Link
          to={paths.settings}
          state={{ background: location }}
          aria-label={Copy.Common.settings}
          className={circleIconClass}
        >
          <GearIcon size={19} />
        </Link>
      </header>

      {starred.length > 0 && (
        <section className="mt-2">
          <SectionHeader text={Copy.Shows.myShows} />
          <ul className="flex flex-col gap-1.5">{starred.map(row)}</ul>
        </section>
      )}

      <section className="mt-2">
        <SectionHeader text={starred.length ? Copy.Shows.allShows : Copy.Shows.title} />
        <ul className="flex flex-col gap-1.5">{shows.map(row)}</ul>
      </section>
    </nav>
  )
}

function SectionHeader({ text }: { text: string }) {
  return (
    <h3 className="px-2.5 pt-3 pb-2">
      <MetaLabel showsTick={false}>{text}</MetaLabel>
    </h3>
  )
}
