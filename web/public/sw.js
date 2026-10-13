/**
 * GCN Player's service worker: what makes the web app installable, and lets
 * it open with no connection. The catalogue and what you've played live in
 * IndexedDB already; this keeps the page and its scripts.
 *
 *   Pages        network first, the cached app shell when offline. Every
 *                route is the same index.html, so one copy covers them all.
 *   /assets/     cache first: Vite names them by content hash, so a cached
 *                file is never stale.
 *
 * Each fresh copy of the page also tidies /assets/: what it references (and
 * what its stylesheets reference — the fonts) is fetched if missing, so the
 * new build opens offline from then on, and whatever only older builds
 * referenced is deleted. Without that, every deploy would leave its files
 * behind in every installed copy for good.
 *   Everything else (the Patreon feed, the API, YouTube, artwork) goes
 *   straight to the network, untouched.
 *
 * Downloaded episodes are in a cache of their own, which the page reads and
 * writes directly (src/downloads/downloads.ts). A new version of this worker
 * clears out its old caches, and must leave that one alone.
 */

const CACHE = 'gcp-player-v1'
const AUDIO_CACHE = 'gcp-player-audio'
const SHELL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']))
      .then(() => caches.match(SHELL))
      .then((shell) => shell?.text())
      .then((html) => html && tidyAssets(html))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== AUDIO_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(keepShell(response.clone()))
          return response
        })
        .catch(() => caches.match(SHELL).then((cached) => cached ?? Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              void caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})

/** Keeps a fresh copy of the page, then brings /assets/ in line with it. */
async function keepShell(response) {
  const html = await response.clone().text()
  await (await caches.open(CACHE)).put(SHELL, response)
  await tidyAssets(html)
}

/**
 * Caches every asset the page needs and deletes every other one. Does nothing
 * for a page that references no /assets/ at all — the dev server's, or an
 * error page that slipped through — rather than emptying the cache.
 */
async function tidyAssets(html) {
  const cache = await caches.open(CACHE)
  const live = new Set(assetPaths(html))
  if (!live.size) return

  // The fonts are named in the stylesheet, not the page.
  for (const path of [...live].filter((path) => path.endsWith('.css'))) {
    const css = await cachedOrFetched(cache, path)
    if (css) for (const font of assetPaths(await css.text())) live.add(font)
  }
  await Promise.all([...live].map((path) => cachedOrFetched(cache, path)))

  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    if (path.startsWith('/assets/') && !live.has(path)) await cache.delete(request)
  }
}

/** `/assets/…` paths in a page or a stylesheet. */
function assetPaths(text) {
  return [...text.matchAll(/\/assets\/[^"'()\s]+/g)].map((match) => match[0])
}

/** The cached copy, or a fresh one cached on the way. undefined offline. */
async function cachedOrFetched(cache, path) {
  const cached = await cache.match(path, { ignoreVary: true })
  if (cached) return cached
  try {
    const response = await fetch(path)
    if (!response.ok) return undefined
    await cache.put(path, response.clone())
    return response
  } catch {
    return undefined
  }
}
