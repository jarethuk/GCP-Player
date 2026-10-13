import type { Library } from '../data/library'
import type { Episode } from '../data/types'
import { PatreonFeeds } from '../patreon/feeds'
import { episode, freshLibrary, show } from '../test/fixtures'
import { AUDIO_CACHE, Downloads, MAXIMUM_AGE_MS } from './downloads'

/** Cache Storage in memory: jsdom has none. Reading a put's body is what drives the download. */
class FakeCaches {
  readonly entries = new Map<string, { body: ArrayBuffer; type: string }>()

  async open(name: string): Promise<Cache> {
    expect(name).toBe(AUDIO_CACHE)
    const entries = this.entries
    const url = (request: RequestInfo | URL) =>
      typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
    return {
      async put(request: RequestInfo | URL, response: Response) {
        const body = await response.arrayBuffer()
        entries.set(url(request), { body, type: response.headers.get('Content-Type') ?? '' })
      },
      async match(request: RequestInfo | URL) {
        const entry = entries.get(url(request))
        return entry
          ? new Response(entry.body, { headers: { 'Content-Type': entry.type } })
          : undefined
      },
      async delete(request: RequestInfo | URL) {
        return entries.delete(url(request))
      },
      async keys() {
        return [...entries.keys()].map((key) => new Request(key))
      },
    } as unknown as Cache
  }

  async delete(): Promise<boolean> {
    this.entries.clear()
    return true
  }
}

/** Answers each URL with its body, or fails it as a CORS refusal would. */
function audioServer(files: Record<string, string | 'refuse'>) {
  const asked: string[] = []
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input)
    asked.push(url)
    const body = files[url]
    if (body === undefined) return new Response('', { status: 404 })
    if (body === 'refuse') throw new TypeError('Failed to fetch')
    return new Response(body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(body.length) },
    })
  }) as typeof fetch
  return { fetcher, asked }
}

const settings = {
  downloadOverWiFiOnly: true,
  autoDownloadCurrentEpisode: true,
  autoDownloadNextEpisode: true,
}

async function setUp(
  episodes: Episode[],
  files: Record<string, string | 'refuse'>,
  feeds = new PatreonFeeds(
    '/patreon/rss',
    (async () => new Response('', { status: 500 })) as typeof fetch,
  ),
) {
  const library: Library = await freshLibrary()
  await library.write({ putShows: [show({ patreonShowId: '42' })], putEpisodes: episodes })
  const caches = new FakeCaches()
  const server = audioServer(files)
  const downloads = new Downloads(
    library,
    feeds,
    (key) => settings[key],
    caches as unknown as CacheStorage,
    server.fetcher,
  )
  return { library, caches, server, downloads }
}

/** Until the download in flight has landed. */
async function settled(downloads: Downloads, guid: string) {
  await vi.waitFor(() => expect(downloads.isDownloading(guid)).toBe(false))
}

describe('Downloads', () => {
  beforeAll(() => {
    // jsdom's own wants jsdom's Blob, not the one Response.blob() makes.
    URL.createObjectURL = () => 'blob:fake'
    URL.revokeObjectURL = () => {}
  })

  it('keeps the file and marks the episode, reporting progress on the way', async () => {
    const { library, caches, downloads } = await setUp([episode({ guid: 'a' })], {
      'https://audio.example/episode.mp3': 'mp3 bytes',
    })
    const seen: number[] = []
    downloads.subscribe(() => {
      const fraction = downloads.getProgress().get('a')
      if (fraction !== undefined) seen.push(fraction)
    })

    downloads.download('a', { manual: true })
    expect(downloads.isDownloading('a')).toBe(true)
    await settled(downloads, 'a')

    const stored = library.getSnapshot().episodes.get('a')
    expect(stored?.downloadedAt).toBeTypeOf('number')
    expect(stored?.downloadIsManual).toBe(true)
    expect(seen.at(-1)).toBe(1)
    expect([...caches.entries.values()][0]?.type).toBe('audio/mpeg')
    await expect(downloads.localUrl(stored as Episode)).resolves.toMatch(/^blob:/)
  })

  it('downloads a heard episode only when asked by hand', async () => {
    const { library, server, downloads } = await setUp([episode({ guid: 'a', isPlayed: true })], {
      'https://audio.example/episode.mp3': 'mp3',
    })
    downloads.download('a')
    expect(server.asked).toEqual([])
    downloads.download('a', { manual: true })
    await settled(downloads, 'a')
    expect(library.getSnapshot().episodes.get('a')?.downloadedAt).toBeTypeOf('number')
  })

  it('falls back to the public copy when Patreon won’t let the browser read its file', async () => {
    const feed = `<rss><channel><item><link>https://www.patreon.com/posts/x-7</link><enclosure url="https://patreon.example/7.mp3"/></item></channel></rss>`
    const feeds = new PatreonFeeds('/patreon/rss', (async () => new Response(feed)) as typeof fetch)
    const { library, server, downloads } = await setUp(
      [episode({ guid: 'a', patreonPostId: '7' })],
      { 'https://patreon.example/7.mp3': 'refuse', 'https://audio.example/episode.mp3': 'mp3' },
      feeds,
    )
    await library.setMeta('patreonCredential', { token: 'tok', updatedAt: 0 })

    downloads.download('a', { manual: true })
    await settled(downloads, 'a')

    expect(server.asked).toEqual([
      'https://patreon.example/7.mp3',
      'https://audio.example/episode.mp3',
    ])
    expect(library.getSnapshot().episodes.get('a')?.downloadedAt).toBeTypeOf('number')
  })

  it('lets the file go once the episode is marked played', async () => {
    const { library, caches } = await setUp([episode({ guid: 'a', downloadedAt: Date.now() })], {})
    await (await caches.open(AUDIO_CACHE)).put(
      new URL('/offline-audio/a', location.origin).href,
      new Response('mp3'),
    )
    await library.updateEpisode('a', { isPlayed: true })
    await vi.waitFor(() => expect(caches.entries.size).toBe(0))
    expect(library.getSnapshot().episodes.get('a')?.downloadedAt).toBeNull()
  })

  it('puts the row right when the browser has evicted the file', async () => {
    const { library, downloads } = await setUp(
      [episode({ guid: 'a', downloadedAt: Date.now() })],
      {},
    )
    await expect(
      downloads.localUrl(library.getSnapshot().episodes.get('a') as Episode),
    ).resolves.toBeNull()
    expect(library.getSnapshot().episodes.get('a')?.downloadedAt).toBeNull()
  })

  it('sweeps what was heard, what is a week old and what nothing claims', async () => {
    const now = Date.now()
    const { library, caches, downloads } = await setUp(
      [
        episode({ guid: 'fresh', downloadedAt: now }),
        episode({ guid: 'heard', downloadedAt: now, isPlayed: true }),
        episode({ guid: 'kept', downloadedAt: now, isPlayed: true, downloadIsManual: true }),
        episode({ guid: 'old', downloadedAt: now - MAXIMUM_AGE_MS - 1 }),
      ],
      {},
    )
    const cache = await caches.open(AUDIO_CACHE)
    for (const guid of ['fresh', 'heard', 'kept', 'old', 'orphan']) {
      await cache.put(new URL(`/offline-audio/${guid}`, location.origin).href, new Response('x'))
    }

    await downloads.purgeExpired(now)
    await vi.waitFor(() => expect(caches.entries.size).toBe(2))

    expect([...caches.entries.keys()].map((key) => key.split('/').at(-1)).sort()).toEqual([
      'fresh',
      'kept',
    ])
    const episodes = library.getSnapshot().episodes
    expect(episodes.get('heard')?.downloadedAt).toBeNull()
    expect(episodes.get('old')?.downloadedAt).toBeNull()
    expect(episodes.get('kept')?.downloadedAt).toBe(now)
  })
})
