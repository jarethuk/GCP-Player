import type { ReactNode } from 'react'

export type MetaTone = 'muted' | 'sky' | 'bone' | 'ember'

const tones: Record<MetaTone, string> = {
  muted: 'text-muted',
  sky: 'text-sky',
  bone: 'text-bone',
  ember: 'text-ember',
}

/**
 * The site's metadata treatment: bold uppercase, widely tracked, behind a
 * short blue tick. A show's game system, an episode's numbers, a column
 * heading — anything the site would set as a label. `MetaLabel` in the iOS app.
 */
export function MetaLabel({
  children,
  showsTick = true,
  tone = 'muted',
  lines = 1,
}: {
  children: ReactNode
  /** The tick is the site's own treatment; drop it for an eyebrow or a dense cell. */
  showsTick?: boolean
  tone?: MetaTone
  /** Systems run long, so callers with room can let them wrap. */
  lines?: 1 | 2 | 'wrap'
}) {
  const clamp = lines === 1 ? 'truncate' : lines === 2 ? 'line-clamp-2' : ''
  return (
    <span className={`flex min-w-0 items-start gap-1.5 ${tones[tone]}`}>
      {showsTick && <span className="mt-[2px] h-2.5 w-0.5 shrink-0 rounded-full bg-sky" />}
      <span className={`meta min-w-0 ${clamp}`}>{children}</span>
    </span>
  )
}
