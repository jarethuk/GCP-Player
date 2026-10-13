import { Chip } from '@gcp/web-components'
import type { ReactNode } from 'react'
import type { SyncStatus } from '../api/types.js'

export type BadgeTone = 'neutral' | 'sky' | 'ember' | 'moss'

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** A leading dot, for a state rather than a label. */
  dot?: boolean
  /** Makes the dot breathe — for work still in progress. */
  pulsing?: boolean
  /** Hover text, for a badge whose four letters can't carry the whole meaning. */
  title?: string
}

/** The apps' NEW chip box, tinted to say a state rather than "go and listen". */
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  pulsing = false,
  title,
}: BadgeProps) {
  return (
    <Chip tone={tone} dot={dot} pulsing={pulsing} {...(title ? { title } : {})}>
      {children}
    </Chip>
  )
}

/**
 * A row ingest no longer touches, because someone edited it.
 *
 * Neutral rather than ember: this is a deliberate state, not something that
 * needs a person — red in this app means only the second thing. But it does
 * need saying on the row itself, because the surprising part is invisible.
 * The feed can change underneath an overridden show for months and nothing
 * here will move, and without the badge that reads as a broken sync.
 */
export function OverriddenBadge() {
  return (
    <Badge tone="neutral" title="Edited here, so feed syncs no longer update it">
      Edited
    </Badge>
  )
}

/** A sync run's outcome, in the one place the three states are spelled out. */
export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  if (status === 'RUNNING') {
    return (
      <Badge tone="sky" dot pulsing>
        Running
      </Badge>
    )
  }
  if (status === 'FAILED') {
    return (
      <Badge tone="ember" dot>
        Failed
      </Badge>
    )
  }
  return (
    <Badge tone="moss" dot>
      Succeeded
    </Badge>
  )
}
