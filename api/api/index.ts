import { getRequestListener } from '@hono/node-server'
import { app } from '../src/app.js'

/**
 * The Vercel entrypoint.
 *
 * The doubled path (`api/api/index.ts` from the repo root) is not a mistake:
 * Vercel discovers serverless functions in a directory named `api/`, and this
 * project's own root directory is also called `api`. Set the Vercel project's
 * Root Directory to `api` and this file becomes `/api/index`, which the rewrite
 * in vercel.json points everything at.
 *
 * Node, not Edge: Prisma's query compiler and node-postgres both need it. That
 * is also why this is not `handle` from `hono/vercel`, which is the Edge
 * adapter — it passes its argument straight to `app.fetch` as a Web `Request`.
 * On the Node runtime Vercel calls the default export with an
 * `(IncomingMessage, ServerResponse)` pair, so the first `c.req.header()` dies
 * with "this.raw.headers.get is not a function" and the function hangs until it
 * times out, because nothing ever writes a response. A request listener is the
 * Node-shaped adapter; `@hono/node-server/vercel` was exactly this line before
 * v2 dropped the export.
 */
export const config = { runtime: 'nodejs' }

export default getRequestListener(app.fetch)
