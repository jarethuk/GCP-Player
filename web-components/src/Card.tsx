import type { HTMLAttributes, ReactNode } from 'react'

/** A card on the ground: the apps' surface with the site's hairline, like a show's row. */
export const cardClass = 'rounded-[10px] border border-line bg-surface'

export function Card({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`${cardClass} ${className}`} {...props}>
      {children}
    </section>
  )
}
