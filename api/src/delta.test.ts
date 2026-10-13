import { describe, expect, it, vi } from 'vitest'
import { deltaEnvelope } from './delta.js'

const at = (iso: string) => ({ updatedAt: new Date(iso) })
const newest = (iso: string | null) => vi.fn().mockResolvedValue(iso ? new Date(iso) : null)

describe('deltaEnvelope', () => {
  it('takes the cursor from the newest row, not from the clock', async () => {
    // A write committing between "newest row" and "now" must still be picked
    // up by the next request.
    const max = newest('2026-01-03T00:00:00.000Z')
    const result = await deltaEnvelope(
      [at('2026-01-01T00:00:00.000Z'), at('2026-01-03T00:00:00.000Z')],
      undefined,
      max,
    )

    expect(result.syncedAt).toBe('2026-01-03T00:00:00.000Z')
    // Rows are ordered ascending and unpaginated, so the last row already is
    // the collection maximum — no need to ask the database twice.
    expect(max).not.toHaveBeenCalled()
  })

  it('advances an empty response to the collection maximum', async () => {
    // This is what makes the cache work: every client ends up asking for the
    // same URL rather than each keeping its own slightly different cursor.
    const result = await deltaEnvelope(
      [],
      new Date('2026-01-01T00:00:00.000Z'),
      newest('2026-01-03T00:00:00.000Z'),
    )

    expect(result.syncedAt).toBe('2026-01-03T00:00:00.000Z')
  })

  it('gives an empty collection a stable cursor', async () => {
    const result = await deltaEnvelope([], undefined, newest(null))
    expect(result.syncedAt).toBe('1970-01-01T00:00:00.000Z')
  })

  it('holds a cursor still rather than moving it backwards', async () => {
    const since = new Date('2026-06-01T00:00:00.000Z')
    const result = await deltaEnvelope([], since, newest('2026-01-01T00:00:00.000Z'))
    expect(result.syncedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('flags a full fetch only when no cursor was given', async () => {
    expect((await deltaEnvelope([], undefined, newest(null))).fullResync).toBe(true)
    expect((await deltaEnvelope([], new Date(), newest(null))).fullResync).toBe(false)
  })
})
