import styles from './VideoLink.module.css'

export interface VideoLinkProps {
  /** The episode's video version. Null on roughly half the catalogue. */
  url: string | null
}

/**
 * A mark on the rows that have a video version, which is also the quickest way
 * to check that one points where it should.
 *
 * A link rather than a decoration: the value is editable now, so the question
 * this page gets asked is less "does it have a video" than "is that the right
 * video", and only opening it answers that. Rows without one render nothing at
 * all — an empty column reads as "no video" far faster than a greyed-out icon
 * repeated six hundred times.
 *
 * Drawn inline rather than pulled from an icon set: it is one glyph, and the
 * dashboard has no icon dependency to justify for it. Deliberately a generic
 * play mark and not YouTube's own — this is a row in an editing tool, not an
 * endorsement, and the brand has rules about its mark that are not worth
 * inheriting for something this small.
 */
export function VideoLink({ url }: VideoLinkProps) {
  if (!url) return null

  return (
    <a
      className={styles.link}
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={`Video version — ${url}`}
      // The row itself is not clickable here, but this sits inside cells that
      // may gain a click later; stopping it now costs nothing.
      onClick={(event) => event.stopPropagation()}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
        <rect x="1" y="3" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.6 6.1 10.3 8l-3.7 1.9V6.1Z" fill="currentColor" />
      </svg>
      {/* Real content rather than an aria-label: a link whose only child is a
          decorative glyph has nothing for a screen reader to announce, and the
          text is what a reader actually lands on. */}
      <span className={styles.label}>Open this episode&rsquo;s video version</span>
    </a>
  )
}
