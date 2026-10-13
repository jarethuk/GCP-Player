import { EmptyState, MetaLabel, Spinner } from '@gcp/web-components'
import { Link } from 'react-router'
import { useCatalogueState } from '../app/hooks'
import { paths } from '../app/routes'
import { Copy } from '../copy/copy'

/**
 * A show or episode the library hasn't got: still arriving on a first visit to
 * a shared link, or gone from the catalogue.
 */
export function MissingScreen() {
  const { isSyncing } = useCatalogueState()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-6">
      {isSyncing ? (
        <>
          <Spinner />
          <MetaLabel showsTick={false}>{Copy.Shows.loading}</MetaLabel>
        </>
      ) : (
        <>
          <EmptyState icon={null} title={Copy.Errors.showGone} />
          <Link
            to={paths.shows}
            className="font-body text-[15px] font-semibold text-sky hover:underline"
          >
            {Copy.Shows.allShows}
          </Link>
        </>
      )}
    </div>
  )
}
