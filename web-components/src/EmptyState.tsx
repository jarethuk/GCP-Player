import type { ReactNode } from 'react'

/** SwiftUI's ContentUnavailableView: a large glyph, a title, a line of why, and what to do. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'bone',
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  /** Ember for something that failed. */
  tone?: 'bone' | 'ember'
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 text-center">
      {icon && <div className="mb-1.5 text-muted">{icon}</div>}
      <p
        className={`font-body text-[22px] font-bold ${tone === 'ember' ? 'text-ember' : 'text-bone'}`}
      >
        {title}
      </p>
      {description && (
        <p className="max-w-[48ch] font-body text-[15px] text-muted">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
