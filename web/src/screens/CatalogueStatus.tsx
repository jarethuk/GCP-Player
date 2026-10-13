import { EmptyState, MetaLabel, Spinner, WifiSlashIcon } from '@gcp/web-components'
import { useCatalogueState } from '../app/hooks'
import { Copy } from '../copy/copy'

/**
 * What an empty shows list says: loading, or why it couldn't. Only ever seen
 * before the first sync succeeds — after that the library is never empty.
 */
export function CatalogueStatus() {
  const { isSyncing, syncError } = useCatalogueState()
  if (isSyncing) {
    return (
      <div className="flex flex-col items-center gap-3.5" role="status">
        <Spinner />
        <MetaLabel showsTick={false}>{Copy.Shows.loading}</MetaLabel>
      </div>
    )
  }
  if (syncError) {
    return (
      <EmptyState
        icon={<WifiSlashIcon size={44} />}
        title={Copy.Shows.loadFailed}
        description={syncError}
      />
    )
  }
  return null
}
