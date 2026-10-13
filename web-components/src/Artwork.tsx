import { useState } from 'react'
import { artworkUrl } from './artworkUrl'

/**
 * Square artwork with a placeholder while it loads — list rows, the mini
 * player, the episode and Now Playing screens. Asked for at the size it's
 * drawn at, where the host can resize; the browser's own cache keeps it.
 */
export function Artwork({
  url,
  size,
  title,
  className = '',
}: {
  url: string | null | undefined
  size: number
  /** Whose artwork: its initial stands in until there is some. */
  title?: string
  className?: string
}) {
  const [loaded, setLoaded] = useState<string | null>(null)
  const radius = size / 7
  const pixels = size * Math.min(3, Math.max(2, globalThis.devicePixelRatio ?? 2))
  const src = url ? artworkUrl(url, pixels) : null

  return (
    <span
      className={`relative block shrink-0 overflow-hidden bg-surface ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {loaded !== src && (
        <span
          className="absolute inset-0 flex items-center justify-center border border-line font-display text-sky/50 uppercase select-none"
          style={{ borderRadius: radius, fontSize: size * 0.4 }}
          aria-hidden="true"
        >
          {!src && title ? title.trim().charAt(0) : null}
        </span>
      )}
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(src)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ${loaded === src ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  )
}

/** Artwork that fills whatever box it's in — the show's hero, a poster tile. */
export function WideArtwork({
  url,
  renderSize,
  className = '',
}: {
  url: string | null | undefined
  /** Longest edge to ask for, in CSS pixels. */
  renderSize: number
  className?: string
}) {
  const [loaded, setLoaded] = useState<string | null>(null)
  const src = url ? artworkUrl(url, renderSize * 2) : null
  return (
    <span className={`block overflow-hidden bg-surface ${className}`}>
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(src)}
          className={`size-full object-cover transition-opacity duration-300 ${loaded === src ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  )
}
