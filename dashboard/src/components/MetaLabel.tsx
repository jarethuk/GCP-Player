import { MetaLabel as SharedMetaLabel } from '@gcp/web-components'
import type { ReactNode } from 'react'

export interface MetaLabelProps {
  children: ReactNode
  /** The tick is the site's own treatment; drop it inside a dense table cell. */
  tick?: boolean
  tone?: 'muted' | 'sky' | 'bone' | 'ember'
}

/**
 * The site's metadata treatment, as the web app and the phones draw it. Allowed
 * to wrap: a slug or a system in a narrow column should read, not ellipsise.
 */
export function MetaLabel({ children, tick = true, tone = 'muted' }: MetaLabelProps) {
  return (
    <SharedMetaLabel showsTick={tick} tone={tone} lines="wrap">
      {children}
    </SharedMetaLabel>
  )
}
