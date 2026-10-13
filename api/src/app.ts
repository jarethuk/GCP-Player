import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import type { AppEnv } from './auth.js'
import { admin } from './routes/admin.js'
import { auth } from './routes/auth.js'
import { cron } from './routes/cron.js'
import { episodes } from './routes/episodes.js'
import { shows } from './routes/shows.js'
import { staff } from './routes/staff.js'

export const app = new Hono<AppEnv>()

app.use('*', logger())
// The catalogue is public and read-only without a session, and the clients are
// native apps plus the dashboard — which authenticates with a bearer token it
// holds itself, not a cookie. Nothing is sent ambiently by a browser, so an
// origin allow-list would only be restating what the token already decides,
// and CSRF has nothing to ride on.
app.use('*', cors())

// The root, not /health: the root is what a browser, an uptime monitor or a
// hand-typed URL reaches first, and a 404 there reads like a broken deployment
// even when every other route is fine.
app.get('/', (c) => c.json({ ok: true }))

app.route('/shows', shows)
app.route('/episodes', episodes)
app.route('/cron', cron)
app.route('/admin', admin)
app.route('/auth', auth)
app.route('/staff', staff)

// Errors are never cacheable, and they are the one path that skips the route
// middleware entirely — an auth rejection throws before `noCache` can run. An
// hour of edge-cached 401s or 500s would be far worse than the blip itself.
app.notFound((c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ error: 'Not found' }, 404)
})

app.onError((error, c) => {
  c.header('Cache-Control', 'no-store')

  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }
  // Don't leak a stack or a connection string to the caller; the platform log
  // keeps the detail.
  console.error(error)
  return c.json({ error: 'Internal server error' }, 500)
})
