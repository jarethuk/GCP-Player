import { MetaLabel, EmptyState as SharedEmptyState, Spinner } from '@gcp/web-components'
import type { ReactNode } from 'react'
import { Button } from './Button.js'

/** Work in progress, when there is nothing yet to show around it — the apps' "Loading shows". */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3.5 px-6 py-10"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <MetaLabel showsTick={false}>{label}</MetaLabel>
    </div>
  )
}

/** Rows that aren't there yet, at the size they will be. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-px" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        // The index is the identity here: these are placeholders with nothing
        // to key on, and they neither reorder nor outlive the load.
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        <div key={index} className="h-[52px] animate-pulse bg-sky/[0.06]" />
      ))}
    </div>
  )
}

export interface EmptyStateProps {
  title: string
  detail?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, detail, action }: EmptyStateProps) {
  return (
    <div className="py-10">
      <SharedEmptyState title={title} description={detail} action={action} />
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  detail?: ReactNode
  onRetry?: () => void
}

/**
 * A request that didn't land. Always offers the retry: most failures here are
 * a laptop waking up, and re-running the query is the whole fix.
 */
export function ErrorState({ title = 'That did not load', detail, onRetry }: ErrorStateProps) {
  return (
    <div className="py-10" role="alert">
      <SharedEmptyState
        tone="ember"
        title={title}
        description={detail}
        action={
          onRetry && (
            <Button size="small" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    </div>
  )
}
