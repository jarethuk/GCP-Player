import { createHash } from 'node:crypto'

/** What a hashed field may be. Dates are hashed by their instant, not their text. */
export type Hashable = string | number | boolean | Date | null

/**
 * A fingerprint of the row the feed says should exist.
 *
 * Ingest used to be insert-only, so "has this changed?" never had to be asked:
 * a guid already stored was skipped and that was the end of it. It now
 * reconciles, and this is how it tells a genuine change from the 1,300 rows
 * that are the same as they were yesterday. Only a differing hash writes, so an
 * unchanged catalogue still moves no `updatedAt` and still produces an empty
 * delta — which is the property the whole sync contract rests on.
 *
 * **It covers the row as sync intends to leave it, not the raw feed item.**
 * That distinction is what keeps it stable. Several fields fall back to the
 * stored value when the feed carries nothing — a show whose items have stopped
 * supplying artwork keeps the artwork it has — and hashing the fallback rather
 * than the absence means a quiet feed reads as "no change" instead of flapping
 * the row between a value and null on alternate runs.
 *
 * JSON does the encoding, so the field list is unambiguous for free: `null`,
 * `"null"` and `0` are three different documents, and no title or URL can run
 * into its neighbour. Order is part of the input — these arrays are written out
 * field by field at the call site and must stay in step with the columns.
 */
export function fingerprint(fields: readonly Hashable[]): string {
  const encoded = JSON.stringify(
    fields.map((value) => (value instanceof Date ? { t: value.getTime() } : value)),
  )

  // Truncated to 128 bits. This is a change detector, not a security boundary:
  // the input is a public podcast feed, nobody is trying to forge a collision,
  // and a 32-character column is cheaper to store and to compare 1,300 times a
  // night than a full digest.
  return createHash('sha256').update(encoded).digest('hex').slice(0, 32)
}
