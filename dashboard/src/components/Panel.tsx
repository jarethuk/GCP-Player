import { Card } from '@gcp/web-components'
import type { ReactNode } from 'react'

export interface PanelProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Sits at the right of the header — the panel's own action. */
  action?: ReactNode
  /** Drops the body padding, for a panel wrapping a table or a list. */
  flush?: boolean
  children: ReactNode
}

/** A card on the ground: the apps' surface and hairline, like a show's row. */
export function Panel({ title, subtitle, action, flush = false, children }: PanelProps) {
  return (
    <Card className="overflow-hidden">
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2>{title}</h2>}
            {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </Card>
  )
}
