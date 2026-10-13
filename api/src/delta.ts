import { z } from 'zod'

/**
 * The `?since=` half of the sync contract.
 *
 * A client stores the `syncedAt` from its last response and passes it back.
 * Rows come back when `updatedAt > since`, strictly.
 */
export const sinceQuery = z.object({
  since: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('ISO-8601 timestamp from a previous response’s syncedAt'),
})

/** What an empty collection reports, so even "nothing here" is a stable cursor. */
const EPOCH = new Date(0)

export interface DeltaEnvelope {
  /** Pass back as `?since=` next time. */
  syncedAt: string
  /**
   * True when this response is a complete picture rather than a delta, so the
   * client should drop anything it holds that is absent here.
   */
  fullResync: boolean
}

interface Timestamped {
  updatedAt: Date
}

/**
 * Builds the response envelope.
 *
 * `syncedAt` is the highest `updatedAt` in the **whole collection**, not the
 * highest in this response, and never the server's clock. Two reasons, and the
 * second is the one that pays for the extra query:
 *
 *  - **Correctness.** Using `now()` drops writes: a transaction that starts
 *    before the response but commits after it carries an `updatedAt` below the
 *    reading the client was given, so the client never asks for it again.
 *  - **Cacheability.** Every client converges on the same cursor, so they all
 *    request the same handful of URLs and the CDN can actually serve them. If
 *    an empty response echoed back whatever cursor the caller happened to hold,
 *    each client would keep its own slightly different value for ever and every
 *    request would be a unique cache key — a cache that is never hit twice.
 *
 * Rows are ordered ascending and nothing is paginated, so when any came back
 * the last one already *is* the collection maximum and `newest` is skipped.
 * Tombstones count toward it: a cursor that couldn't advance past a deletion
 * would replay it on every sync.
 */
export async function deltaEnvelope<T extends Timestamped>(
  rows: T[],
  since: Date | undefined,
  newest: () => Promise<Date | null>,
): Promise<DeltaEnvelope> {
  const last = rows.at(-1)
  const max = last ? last.updatedAt : ((await newest()) ?? since ?? EPOCH)

  return {
    // Never backwards: a caller asking with a cursor from the future of this
    // collection keeps it rather than being sent round the loop again.
    syncedAt: new Date(Math.max(max.getTime(), since?.getTime() ?? 0)).toISOString(),
    fullResync: since === undefined,
  }
}
