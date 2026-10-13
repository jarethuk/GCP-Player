/**
 * What the wide layout's detail column shows before a show is picked: every
 * cover at the size it was drawn at, rather than an empty column saying
 * "Select a show". Tiles are covers because that is how anyone who listens to
 * this network recognises a show.
 */

import { DisplayHeader } from '@gcp/web-components'
import { Link } from 'react-router'
import { paths } from '../app/routes'
import { useShows } from '../app/useShows'
import { Copy } from '../copy/copy'
import { ShowTile, showLabel } from '../ui/ShowRows'
import { CatalogueStatus } from './CatalogueStatus'
import { useDocumentTitle } from './useDocumentTitle'

export function ShowsGrid() {
  const { shows, unplayed, hasToken } = useShows()
  useDocumentTitle(null)
  return (
    <div className="min-h-full bg-ground-gradient">
      <header className="px-5 pt-5 pb-6">
        <DisplayHeader eyebrow={Copy.Shows.eyebrow} title={Copy.Shows.gridTitle} />
      </header>
      {/* Five across a big landscape column, two across a narrow one, never so small the title stops reading. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4 px-5 pb-7">
        {shows.map((show) => (
          <li key={show.slug}>
            <Link
              to={paths.show(show.slug)}
              aria-label={showLabel(
                { show, unplayed: unplayed.get(show.slug) ?? 0, hasToken },
                'tile',
              )}
              className="block rounded-xl transition-transform duration-200 hover:-translate-y-1 hover:scale-[1.02]"
            >
              <ShowTile show={show} unplayed={unplayed.get(show.slug) ?? 0} hasToken={hasToken} />
            </Link>
          </li>
        ))}
      </ul>
      {shows.length === 0 && (
        <div className="flex justify-center pt-24">
          <CatalogueStatus />
        </div>
      )}
    </div>
  )
}
