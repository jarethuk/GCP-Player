import type { ReactNode } from 'react'
import { LockIcon } from './Icons'

export type ChipTone = 'new' | 'ember' | 'sky' | 'moss' | 'neutral'

const tones: Record<ChipTone, string> = {
  // Red means one thing: something needs a person — in the apps, a show that
  // has published something you haven't heard. Solid only for that.
  new: 'bg-ember text-white border-transparent',
  ember: 'bg-ember/14 text-ember border-ember/45',
  sky: 'bg-sky/16 text-sky border-line-strong',
  moss: 'bg-moss/14 text-moss border-moss/40',
  neutral: 'bg-sky/10 text-muted border-line',
}

/**
 * The NEW chip's box: bold 9-pixel caps in a small rounded rectangle. Solid
 * ember is NEW itself; the tinted tones label a state — a sync that failed, a
 * row someone edited.
 */
export function Chip({
  children,
  tone = 'neutral',
  dot = false,
  pulsing = false,
  title,
}: {
  children: ReactNode
  tone?: ChipTone
  /** A leading dot, for a state rather than a label. */
  dot?: boolean
  /** Makes the dot breathe — for work still in progress. */
  pulsing?: boolean
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-[5px] rounded border px-[7px] py-[3px] font-body text-[9px] leading-[11px] font-bold tracking-[1.2px] whitespace-nowrap uppercase ${tones[tone]}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`size-[5px] rounded-full bg-current ${pulsing ? 'animate-pulse' : ''}`}
        />
      )}
      {children}
    </span>
  )
}

/**
 * Where the NEW chip would go when what's new can't be reached — a Patreon
 * episode with no token. The same box, drawn quiet: an outline, not the red
 * that means "go and listen".
 */
export function LockChip({ label, onArtwork = false }: { label: string; onArtwork?: boolean }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex min-h-[17px] items-center rounded border border-muted/50 px-[7px] py-[3px] text-muted ${onArtwork ? 'bg-ink-deep/80' : ''}`}
    >
      <LockIcon size={10} />
    </span>
  )
}
