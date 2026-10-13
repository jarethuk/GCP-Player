/**
 * Whether an episode is on this device: a ring that fills while it downloads,
 * the filled arrow once it has, nothing (or "Streaming", with a label) when it
 * hasn't. The web's version of DownloadIndicator in iOS/GCP Player/Theme.swift.
 */

import { DownloadedIcon, WifiIcon } from '@gcp/web-components'
import { useDownloadProgress } from '../app/hooks'
import { Copy } from '../copy/copy'
import { isDownloaded } from '../data/logic'
import type { Episode } from '../data/types'

const labelClass = 'font-body text-[9.5px] font-bold tracking-[1.4px] uppercase'

export function DownloadIndicator({
  episode,
  showsLabel = false,
}: {
  episode: Episode
  showsLabel?: boolean
}) {
  const fraction = useDownloadProgress(episode.guid)

  if (fraction !== undefined) {
    const percent = Math.round(fraction * 100)
    return (
      <span
        role="img"
        aria-label={Copy.Download.a11yProgress(percent)}
        className="flex shrink-0 items-center gap-1.5"
      >
        <ProgressRing fraction={fraction} />
        {showsLabel && (
          <span className={`${labelClass} text-muted`} aria-hidden="true">
            {Copy.Download.progress(percent)}
          </span>
        )}
      </span>
    )
  }

  if (isDownloaded(episode)) {
    return (
      <span
        role="img"
        aria-label={Copy.Download.a11yDownloaded}
        className="flex shrink-0 items-center gap-1.5 text-sky"
      >
        <DownloadedIcon size={13} />
        {showsLabel && (
          <span className={labelClass} aria-hidden="true">
            {Copy.Download.downloaded}
          </span>
        )}
      </span>
    )
  }

  if (!showsLabel) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-muted">
      <WifiIcon size={12} />
      <span className={labelClass}>{Copy.Download.streaming}</span>
    </span>
  )
}

/** A ring rather than a spinner: the file is big enough that "how far" is the useful part. */
function ProgressRing({ fraction }: { fraction: number }) {
  const radius = 6
  const circumference = 2 * Math.PI * radius
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" className="-rotate-90">
      <circle
        cx={7}
        cy={7}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-sky/25"
      />
      <circle
        cx={7}
        cy={7}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(fraction, 0.02))}
        className="text-sky transition-[stroke-dashoffset] duration-250 ease-out"
      />
    </svg>
  )
}
