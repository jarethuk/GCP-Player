import { ChevronLeftIcon, circleIconClass, DisplayHeader } from '@gcp/web-components'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface PageHeaderProps {
  title: string
  /** The spaced line over the title. The section a page belongs to. */
  eyebrow?: string
  subtitle?: ReactNode
  /** A way back up, for the pages that are one level down. */
  back?: { to: string; label: string }
  actions?: ReactNode
}

/**
 * How the web app opens a screen: the round back button where there is one
 * to go back to, then the eyebrow, the display heading and the gradient rule.
 * A page one level down wears where it came from as its eyebrow.
 */
export function PageHeader({
  title,
  eyebrow = 'Glass Cannon Network',
  subtitle,
  back,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        {back && (
          <Link to={back.to} aria-label={`Back to ${back.label}`} className={circleIconClass}>
            <ChevronLeftIcon size={18} />
          </Link>
        )}
        <DisplayHeader eyebrow={back ? back.label : eyebrow} title={title} />
        {subtitle && <p className="mt-1 max-w-[68ch] text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
