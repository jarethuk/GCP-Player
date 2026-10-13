/**
 * Everything the dashboard prints that isn't already a string.
 *
 * `en-GB` throughout, deliberately not the browser's locale: this is an
 * internal tool for one network, and a date that reads 03/04 in one person's
 * browser and 04/03 in another's is a bug waiting for an argument.
 */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return DATE.format(new Date(iso))
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return DATE_TIME.format(new Date(iso))
}

/** `2h 41m`, `48m`, or `1h`. Never `60m`, `2h 60m` or `1h 0m`. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'

  // Round to whole minutes first, then split. Splitting first and rounding the
  // remainder lets 59m40s round to 60 minutes inside a zero-hour duration,
  // which is how this printed "60m" for an hour-long episode.
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** `1,279` — every count in this app is small enough to read at a glance. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-GB')
}

/**
 * `S1 E38`, `E12`, or `—`.
 *
 * Most of the network's shows publish no numbers at all, so the API derives
 * them from release order. A derived number is printed the same but marked by
 * its caller — the chip has to be the same size either way, or a list mixes
 * two row heights.
 */
export function formatNumbering(season: number | null, number: number | null): string {
  if (season === null && number === null) return '—'
  if (season === null) return `E${number}`
  if (number === null) return `S${season}`
  return `S${season} E${number}`
}

/**
 * How long a sync took. Sub-second runs are the norm for an unchanged
 * catalogue, so this says `0.4s` rather than rounding them to nothing.
 */
export function formatElapsed(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '—'

  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

/**
 * A title into the slug the API wants: lowercase, ASCII, hyphens.
 *
 * Only a starting point — the field stays editable, because a slug is part of
 * a URL the phone apps key on, and renaming one is a decision rather than a
 * derivation.
 */
export function toSlug(title: string): string {
  return (
    title
      .normalize('NFD')
      // Strip the accents NFD just separated out.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  )
}

/**
 * A numeric form field to what goes on the wire. An empty box means "no
 * value", which is `null`.
 *
 * Two of them, because zero means different things in different columns. A
 * season or a runtime of zero is a typo; an episode *numbered* zero is real —
 * the network numbers its character-creation episodes E0, and four of them are
 * in the catalogue: Gatewalkers, Shadowdark, Get in the Trunk and Inherit the
 * Sand. Folding 0 into `null` did not merely refuse the edit, it silently
 * wiped the number off an episode that had one.
 */
export function positiveOrNull(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function numberOrNull(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
