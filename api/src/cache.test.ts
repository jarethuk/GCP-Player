import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { noCache, publicCache, tagResponse, tags } from './cache.js'
import { setTestEnv } from './test-helpers.js'

// The middleware reads ENABLE_VERCEL_CACHE, so it needs a valid environment.
// Set here rather than relying on a local .env, which CI does not have.
setTestEnv()

const app = new Hono()
app.get('/cached', publicCache('shows'), (c) => c.json({ ok: true }))
app.get('/failing', publicCache('shows'), (c) => c.json({ error: 'nope' }, 500))
app.get('/private', noCache, (c) => c.json({ ok: true }))
app.get('/dynamic', publicCache('episodes'), (c) => {
  tagResponse(c, 'show:abc')
  return c.json({ ok: true })
})

describe('publicCache', () => {
  it('lets the edge hold a response for an hour', async () => {
    const response = await app.request('/cached')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toContain('s-maxage=3600')
    expect(response.headers.get('CDN-Cache-Control')).toContain('s-maxage=3600')
  })

  it('keeps the client revalidating, so pull-to-refresh still asks', async () => {
    const response = await app.request('/cached')
    expect(response.headers.get('Cache-Control')).toContain('max-age=0')
    expect(response.headers.get('Cache-Control')).toContain('must-revalidate')
  })

  it('serves stale while revalidating rather than waiting on the database', async () => {
    const response = await app.request('/cached')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toContain('stale-while-revalidate')
  })

  it('tags the response so a write can purge it', async () => {
    const response = await app.request('/cached')
    expect(response.headers.get('Vercel-Cache-Tag')).toBe('shows')
  })

  it('merges tags the handler could only know at runtime', async () => {
    // A show's episodes are addressable by slug and by cuid; both entries have
    // to carry the show's canonical id or purging one leaves the other stale.
    const response = await app.request('/dynamic')
    const tagged = response.headers.get('Vercel-Cache-Tag')?.split(',').sort()
    expect(tagged).toEqual(['episodes', 'show:abc'])
  })

  it('names the tags one place', () => {
    expect(tags.shows).toBe('shows')
    expect(tags.show('x')).toBe('show:x')
    // Commas are the delimiter; a tag containing one silently becomes two.
    expect(tags.show('x')).not.toContain(',')
  })

  it('never caches an error', async () => {
    // An hour of serving a blip would be worse than the blip.
    const response = await app.request('/failing')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBeNull()
    expect(response.headers.get('Vercel-Cache-Tag')).toBeNull()
  })
})

describe('noCache', () => {
  it('marks a response as never storable', async () => {
    const response = await app.request('/private')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('errors', () => {
  it('are never cached, even when thrown past the middleware', async () => {
    // An auth rejection throws before `noCache` runs, so the guarantee has to
    // live in the app's error handlers rather than in the route chain.
    const { Hono: H } = await import('hono')
    const { HTTPException } = await import('hono/http-exception')
    const guarded = new H()
    guarded.onError((error, c) => {
      c.header('Cache-Control', 'no-store')
      return c.json({ error: String(error) }, 401)
    })
    guarded.get('/x', noCache, () => {
      throw new HTTPException(401, { message: 'Unauthorized' })
    })

    const response = await guarded.request('/x')
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('with ENABLE_VERCEL_CACHE off', () => {
  // The flag is read through the validated environment, which caches after its
  // first read — so the module graph has to be rebuilt to change it.
  const load = async () => {
    vi.resetModules()
    process.env.ENABLE_VERCEL_CACHE = 'false'
    return import('./cache.js')
  }

  afterEach(() => {
    delete process.env.ENABLE_VERCEL_CACHE
    vi.resetModules()
  })

  it('stores nothing, anywhere', async () => {
    const { publicCache: uncached, tagResponse: tag } = await load()
    const off = new Hono()
    off.get('/x', uncached('shows'), (c) => {
      tag(c, 'show:abc')
      return c.json({ ok: true })
    })

    const response = await off.request('/x')

    // no-store rather than merely dropping the CDN headers: a toggle that left
    // a proxy in between holding a copy would not answer the question it is
    // there to answer.
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBeNull()
    expect(response.headers.get('CDN-Cache-Control')).toBeNull()
    // Including the one the handler set: a tag on a response nobody stored is
    // a header nobody will ever purge.
    expect(response.headers.get('Vercel-Cache-Tag')).toBeNull()
  })

  it('does not purge what was never stored', async () => {
    const invalidateByTag = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@vercel/functions', () => ({ invalidateByTag }))
    process.env.VERCEL = '1'

    const { invalidateTags } = await load()
    await invalidateTags(['shows'])

    expect(invalidateByTag).not.toHaveBeenCalled()
    delete process.env.VERCEL
  })

  it('is on when the variable is absent, so the deployed default is the cheap one', async () => {
    vi.resetModules()
    delete process.env.ENABLE_VERCEL_CACHE
    const { publicCache: cached } = await import('./cache.js')
    const on = new Hono()
    on.get('/x', cached('shows'), (c) => c.json({ ok: true }))

    const response = await on.request('/x')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toContain('s-maxage=3600')
  })
})

describe('invalidateTags', () => {
  const invalidateByTag = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    invalidateByTag.mockReset().mockResolvedValue(undefined)
    vi.doMock('@vercel/functions', () => ({ invalidateByTag }))
  })

  const load = async () => (await import('./cache.js')).invalidateTags

  it('does nothing off Vercel, where there is no CDN to talk to', async () => {
    delete process.env.VERCEL
    await (await load())(['shows'])
    expect(invalidateByTag).not.toHaveBeenCalled()
  })

  it('purges each distinct tag once', async () => {
    process.env.VERCEL = '1'
    await (await load())(['shows', 'shows', 'show:a', ''])
    expect(invalidateByTag).toHaveBeenCalledTimes(1)
    expect(invalidateByTag).toHaveBeenCalledWith(['shows', 'show:a'])
  })

  it('chunks at the 16 tags Vercel accepts per call', async () => {
    process.env.VERCEL = '1'
    await (await load())(Array.from({ length: 20 }, (_, i) => `show:${i}`))

    expect(invalidateByTag).toHaveBeenCalledTimes(2)
    expect(invalidateByTag.mock.calls[0]?.[0]).toHaveLength(16)
    expect(invalidateByTag.mock.calls[1]?.[0]).toHaveLength(4)
  })

  it('never lets a failed purge fail the write that caused it', async () => {
    // A missed purge means an edit shows up late; a thrown one loses the edit.
    process.env.VERCEL = '1'
    invalidateByTag.mockRejectedValue(new Error('CDN unreachable'))
    await expect((await load())(['shows'])).resolves.toBeUndefined()
  })
})
