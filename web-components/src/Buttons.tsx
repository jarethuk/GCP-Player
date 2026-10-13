import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { PauseIcon, PlayIcon, SkipIcon } from './Icons'
import { Spinner } from './Spinner'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet'

const variants: Record<ButtonVariant, string> = {
  // The gradient marks the thing a screen is for: in the apps, what plays.
  primary:
    'bg-accent-gradient text-ink-deep hover:brightness-110 active:scale-[0.99] disabled:hover:brightness-100',
  // The outlined secondary style: an alternative, not the point.
  secondary: 'border border-line text-sky hover:bg-sky/5 disabled:hover:bg-transparent',
  // Red means this destroys something.
  danger: 'border border-ember/50 text-ember hover:bg-ember/10 disabled:hover:bg-transparent',
  // Row-level actions, where anything louder would out-shout the row.
  quiet: 'text-muted hover:bg-sky/10 hover:text-bone disabled:hover:bg-transparent',
}

/**
 * The apps' rectangular button — Play on an episode, Play Next Episode, Watch
 * on YouTube: bold, widely tracked caps in an 8-pixel rounded box.
 */
export function Button({
  variant = 'secondary',
  size = 'default',
  full = false,
  busy = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps & {
  variant?: ButtonVariant
  size?: 'default' | 'small'
  /** Fills its container. */
  full?: boolean
  /** A spinner beside the label, and no second press. */
  busy?: boolean
  children: ReactNode
}) {
  const sizing =
    size === 'small'
      ? 'gap-1.5 px-3 py-[7px] text-[10px] tracking-[1.4px]'
      : 'gap-2 px-[18px] py-[12px] text-[11px] tracking-[1.8px]'
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center rounded-lg font-body leading-none font-bold whitespace-nowrap uppercase transition-[filter,background-color,color,transform] disabled:cursor-not-allowed disabled:opacity-45 ${sizing} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {busy && <Spinner size={size === 'small' ? 12 : 14} className="text-current" />}
      {children}
    </button>
  )
}

/**
 * The system's capsule button at its regular size — Settings' Paste and Save,
 * side by side and the same size as each other.
 */
export function PillButton({
  tone = 'filled',
  className = '',
  children,
  ...props
}: ButtonProps & { tone?: 'filled' | 'tinted'; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 font-body text-[15px] font-semibold transition-[filter,opacity] hover:brightness-110 disabled:opacity-45 disabled:hover:brightness-100 ${tone === 'filled' ? 'bg-sky text-ink-deep' : 'bg-sky/20 text-sky'} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export const circleIconClass =
  'flex size-[38px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-sky transition-[filter] hover:brightness-125 disabled:opacity-50'

/**
 * The app's round icon control: a sky glyph on a surface disc with a hairline
 * edge. Screens that carry their own header use these, so the controls belong
 * to the page rather than a bar above it. `circleIconClass` dresses a link the same way.
 */
export function CircleIconButton({
  children,
  className = '',
  ...props
}: ButtonProps & { children: ReactNode }) {
  return (
    <button type="button" className={`${circleIconClass} ${className}`} {...props}>
      {children}
    </button>
  )
}

/** iOS 26's glass bar button: over artwork, and at the top of a pushed screen. */
export function GlassIconButton({
  children,
  className = '',
  ...props
}: ButtonProps & { children: ReactNode }) {
  return (
    <button
      type="button"
      className={`glass flex size-11 shrink-0 items-center justify-center rounded-full transition-[filter] hover:brightness-125 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** The network's round button: it marks the thing that plays. */
export function GradientPlayButton({
  isPlaying,
  size = 62,
  playLabel,
  pauseLabel,
  onClick,
}: {
  isPlaying: boolean
  size?: number
  playLabel: string
  pauseLabel: string
  onClick: () => void
}) {
  const glyph = size * 0.32
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPlaying ? pauseLabel : playLabel}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-gradient text-ink-deep transition-transform active:scale-95"
      style={{
        width: size,
        height: size,
        boxShadow: `0 ${size > 40 ? 6 : 3}px ${size > 40 ? 24 : 12}px rgb(0 84 142 / 0.55)`,
      }}
    >
      {isPlaying ? (
        <PauseIcon size={glyph} />
      ) : (
        // Optical centring: the triangle's mass sits left of its box.
        <PlayIcon size={glyph} style={{ marginLeft: size * 0.025 }} />
      )}
    </button>
  )
}

/** A round, outlined transport control — the 15/30 second skips. */
export function SkipButton({
  seconds,
  forward,
  label,
  onClick,
}: {
  seconds: number
  forward: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-bone/35 text-bone transition-transform active:scale-95"
    >
      <SkipIcon seconds={seconds} forward={forward} size={22} />
    </button>
  )
}

/**
 * The outlined secondary style at the size the players use it — Play Next
 * Episode, Watch on YouTube.
 */
export function OutlineButton({
  children,
  className = '',
  ...props
}: ButtonProps & { children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-center gap-[7px] rounded-lg border border-line py-[11px] font-body text-[10px] font-bold tracking-[1.8px] text-sky uppercase transition-colors hover:bg-sky/5 disabled:text-muted/50 disabled:hover:bg-transparent ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
