import { PatreonError, PatreonFeeds } from './feeds'

const feed = (postIds: string[]) =>
  `<rss><channel>${postIds
    .map(
      (id) =>
        `<item><link>https://www.patreon.com/posts/x-${id}</link><enclosure url="https://a/${id}.mp3"/></item>`,
    )
    .join('')}</channel></rss>`

function fetcher(bodies: (string | number)[]) {
  const calls: string[] = []
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const body = bodies.shift() ?? 500
    return typeof body === 'number'
      ? new Response('', { status: body })
      : new Response(body, { status: 200 })
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('PatreonFeeds', () => {
  it('asks through this origin, with the token and the show', async () => {
    const { fn, calls } = fetcher([feed(['1'])])
    const feeds = new PatreonFeeds('/patreon/rss', fn)
    await expect(feeds.audio('tok', '42', '1')).resolves.toMatchObject({ url: 'https://a/1.mp3' })
    expect(calls).toEqual(['/patreon/rss?auth=tok&show=42'])
  })

  it('keeps a feed, and fetches again for a post it has not got', async () => {
    vi.useFakeTimers()
    const { fn, calls } = fetcher([feed(['1']), feed(['1', '2'])])
    const feeds = new PatreonFeeds('/p', fn)
    await feeds.audio('tok', '42', '1')
    await feeds.audio('tok', '42', '1')
    expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(10_000)
    await expect(feeds.audio('tok', '42', '2')).resolves.toMatchObject({ url: 'https://a/2.mp3' })
    expect(calls).toHaveLength(2)
    vi.useRealTimers()
  })

  it('says why Patreon refused', async () => {
    const { fn } = fetcher([403])
    const feeds = new PatreonFeeds('/p', fn)
    const failure = await feeds.check('tok', '42').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PatreonError)
    expect((failure as PatreonError).kind).toBe('rejected')
  })
})
