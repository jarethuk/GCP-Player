import { serve } from '@hono/node-server'
import { app } from './app.js'

/**
 * Local development only — on Vercel each request enters through
 * `api/index.ts` instead.
 *
 * 7331 rather than something in the 3000s: every port below 7300 on this
 * machine is claimed by another project, and quietly stealing one from a
 * running service is worse than picking an odd number.
 */
const port = Number(process.env.PORT ?? 7331)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`GCP Player API on http://localhost:${info.port}`)
})
