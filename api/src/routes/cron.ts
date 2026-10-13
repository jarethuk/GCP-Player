import { Hono } from 'hono'
import { requireCronSecret } from '../auth.js'
import { noCache } from '../cache.js'
import { runSync } from '../feed/sync.js'

export const cron = new Hono()

/**
 * Reads the feeds and inserts what is new.
 *
 * GET because that is how Vercel Cron invokes a route. Safe to call by hand and
 * safe to call twice: ingest is additive, so a second run against an unchanged
 * catalogue writes nothing.
 */
cron.get('/sync', requireCronSecret, noCache, async (c) => {
  const result = await runSync()
  return c.json(result)
})
