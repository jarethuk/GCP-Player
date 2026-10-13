/**
 * The handful of glyphs the app uses, drawn to stand in for the SF Symbols the
 * iOS app names — `play.fill`, `gearshape.fill`, `gobackward.15` and so on.
 * Each takes the current text colour and a pixel size.
 */

import type { ReactNode, SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

function Icon({ size = 16, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5.05 4.6v14.8a1.2 1.2 0 0 0 1.82 1.03l12.1-7.4a1.2 1.2 0 0 0 0-2.06L6.87 3.57A1.2 1.2 0 0 0 5.05 4.6z" />
  </Icon>
)

export const PauseIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5.5" y="3.5" width="4.6" height="17" rx="1.3" />
    <rect x="13.9" y="3.5" width="4.6" height="17" rx="1.3" />
  </Icon>
)

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 4.5 7.5 12l7.5 7.5" {...stroke} strokeWidth={2.4} />
  </Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 4.5 16.5 12 9 19.5" {...stroke} strokeWidth={3} />
  </Icon>
)

export const GearIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      fillRule="evenodd"
      d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61zM12 15.4a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8z"
    />
  </Icon>
)

export const EllipsisIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </Icon>
)

export const EllipsisCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9.6" {...stroke} strokeWidth={1.7} />
    <circle cx="7.7" cy="12" r="1.45" />
    <circle cx="12" cy="12" r="1.45" />
    <circle cx="16.3" cy="12" r="1.45" />
  </Icon>
)

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7.4 10.5V7.6a4.6 4.6 0 0 1 9.2 0v2.9" {...stroke} strokeWidth={2.4} />
    <rect x="4.6" y="10" width="14.8" height="11.5" rx="2.6" />
  </Icon>
)

export const StarIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props}>
    <path
      d="M12 2.9l2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
  </Icon>
)

/** `gobackward.15` / `goforward.30`: an open circle with an arrow, and the seconds inside. */
export const SkipIcon = ({
  seconds,
  forward,
  ...props
}: IconProps & { seconds: number; forward: boolean }) => (
  <Icon {...props}>
    <g transform={forward ? 'matrix(-1 0 0 1 24 0)' : undefined}>
      <path d="M12 3.6a8.4 8.4 0 1 1-7.6 4.8" {...stroke} strokeWidth={1.9} />
      <path d="M14.4 1.2 11.6 3.6l2.8 2.4" {...stroke} strokeWidth={1.9} />
    </g>
    <text
      x="12"
      y="15.6"
      textAnchor="middle"
      fontSize="8.2"
      fontWeight="700"
      fontFamily="Open Sans, system-ui, sans-serif"
    >
      {seconds}
    </text>
  </Icon>
)

export const PlayRectangleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      fillRule="evenodd"
      d="M5 4.5h14A3 3 0 0 1 22 7.5v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3zm5 4.1v6.8l5.6-3.4z"
    />
  </Icon>
)

export const CheckCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9.4" {...stroke} strokeWidth={1.7} />
    <path d="m7.9 12.3 2.8 2.8 5.4-6" {...stroke} strokeWidth={1.8} />
  </Icon>
)

export const CircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9.4" {...stroke} strokeWidth={1.7} />
  </Icon>
)

/** `text.badge.checkmark`. */
export const ChecklistIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="6" cy="7" r="4" />
    <path
      d="m4.3 7.1 1.2 1.2 2.3-2.5"
      {...stroke}
      stroke="var(--color-ink-deep)"
      strokeWidth={1.4}
    />
    <path d="M12.5 7h9M3 13.5h18.5M3 19h18.5" {...stroke} strokeWidth={1.8} />
  </Icon>
)

/** `checkmark.seal.fill`: a twelve-lobed seal with a check through it. */
export const CheckSealIcon = (props: IconProps) => {
  const points: string[] = []
  for (let i = 0; i < 24; i += 1) {
    const angle = (Math.PI * i) / 12 - Math.PI / 2
    const radius = i % 2 === 0 ? 10.6 : 8.7
    points.push(
      `${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return (
    <Icon {...props}>
      <polygon
        points={points.join(' ')}
        strokeLinejoin="round"
        stroke="currentColor"
        strokeWidth={1.4}
      />
      <path
        d="m7.9 12.2 2.8 2.8 5.4-6"
        {...stroke}
        stroke="var(--color-ink-deep)"
        strokeWidth={2.1}
      />
    </Icon>
  )
}

export const WifiSlashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      d="M2.5 9.2a14 14 0 0 1 19 0M5.8 12.6a9.2 9.2 0 0 1 12.4 0M9.1 16a4.4 4.4 0 0 1 5.8 0"
      {...stroke}
      strokeWidth={1.9}
    />
    <circle cx="12" cy="19.3" r="1.5" />
    <path d="M4 3.5 20 20.5" {...stroke} strokeWidth={1.9} />
  </Icon>
)

export const RefreshIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19.4 12.6A7.5 7.5 0 1 1 17 6.7" {...stroke} strokeWidth={2} />
    <path d="M17.9 2.9 17.3 7.2l-4.3-.3" {...stroke} strokeWidth={2} />
  </Icon>
)

export const PasteIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5" y="4.5" width="14" height="17" rx="2.4" {...stroke} strokeWidth={1.8} />
    <rect x="8.5" y="2.5" width="7" height="4" rx="1.2" />
  </Icon>
)

export const CheckmarkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 12.6 4.6 4.6L19.2 7" {...stroke} strokeWidth={2.4} />
  </Icon>
)

/** `square.grid.2x2.fill`: a catalogue of things. */
export const GridIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="3" width="8" height="8" rx="2.2" />
    <rect x="13" y="3" width="8" height="8" rx="2.2" />
    <rect x="3" y="13" width="8" height="8" rx="2.2" />
    <rect x="13" y="13" width="8" height="8" rx="2.2" />
  </Icon>
)

/** `tray.fill`: things waiting for somebody. */
export const TrayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      fillRule="evenodd"
      d="M6.3 4h11.4a2 2 0 0 1 1.8 1.1l2.3 4.8c.1.3.2.6.2.9V17a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-6.2c0-.3.1-.6.2-.9l2.3-4.8A2 2 0 0 1 6.3 4zm-.4 6.5h3.3a1 1 0 0 1 1 .8 1.8 1.8 0 0 0 3.6 0 1 1 0 0 1 1-.8h3.3l-1.9-4H7.8z"
    />
  </Icon>
)

/** `person.2.fill`. */
export const PeopleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.6" />
    <path d="M2 19.2c0-3.4 3.1-5.7 7-5.7s7 2.3 7 5.7c0 .5-.4.8-.9.8H2.9a.9.9 0 0 1-.9-.8z" />
    <circle cx="17" cy="8.6" r="2.8" />
    <path d="M17.9 13.6c2.4.4 4.1 2.2 4.1 4.6 0 .5-.4.8-.9.8h-3.3c.2-.3.2-.6.2-1 0-1.7-.7-3.2-1.9-4.3z" />
  </Icon>
)

/** `square.and.arrow.down`: put this app on the device. */
export const InstallIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3v11.5M7.5 10l4.5 4.5 4.5-4.5" {...stroke} strokeWidth={2.2} />
    <path
      d="M4.5 14.5v3.3a2.2 2.2 0 0 0 2.2 2.2h10.6a2.2 2.2 0 0 0 2.2-2.2v-3.3"
      {...stroke}
      strokeWidth={2}
    />
  </Icon>
)

/** `arrow.down.circle`: download this episode. */
export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9.2" {...stroke} strokeWidth={1.8} />
    <path d="M12 7.2v9M8.3 12.6 12 16.3l3.7-3.7" {...stroke} strokeWidth={1.9} />
  </Icon>
)

/** `arrow.down.circle.fill`: this episode is on the device. */
export const DownloadedIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      fillRule="evenodd"
      d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm.9 5.2a.9.9 0 0 0-1.8 0v6.9l-2.2-2.2a.9.9 0 1 0-1.3 1.3l3.8 3.8a.9.9 0 0 0 1.3 0l3.8-3.8a.9.9 0 1 0-1.3-1.3l-2.3 2.2z"
    />
  </Icon>
)

/** `trash`: remove a download. */
export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      d="M4 6.5h16M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.2 6.5l.9 12.6c.1 1.2 1 2.1 2.2 2.1h5.4c1.2 0 2.1-.9 2.2-2.1l.9-12.6M10 10.5v6.5M14 10.5v6.5"
      {...stroke}
      strokeWidth={1.8}
    />
  </Icon>
)

/** `wifi`: streaming rather than playing from the device. */
export const WifiIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      d="M2.5 9.2a14 14 0 0 1 19 0M5.8 12.6a9.2 9.2 0 0 1 12.4 0M9.1 16a4.4 4.4 0 0 1 5.8 0"
      {...stroke}
      strokeWidth={1.9}
    />
    <circle cx="12" cy="19.3" r="1.5" />
  </Icon>
)
