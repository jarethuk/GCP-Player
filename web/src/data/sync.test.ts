import { episodeDTO, FakeCatalogue, freshLibrary, showDTO } from '../test/fixtures'
import { clearAndResync, sync } from './sync'

describe('sync', () => {
  it('fetches the whole catalogue on a first visit', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('blood-of-the-wild'), showDTO('time-for-chaos')]
    api.episodes.set('blood-of-the-wild', {
      syncedAt: '2026-09-02T00:00:00.000Z',
      fullResync: true,
      episodes: [episodeDTO('a'), episodeDTO('b', { publishedAt: '2026-09-05T00:00:00.000Z' })],
    })

    const result = await sync(library, api)

    expect(result).toMatchObject({ showsCreated: 2, showsChecked: 2, episodesCreated: 2 })
    expect(api.calls).toEqual([
      'shows since=null',
      'blood-of-the-wild since=null',
      'time-for-chaos since=null',
    ])
    const snapshot = library.getSnapshot()
    expect(snapshot.episodesByShow.get('blood-of-the-wild')).toHaveLength(2)
    expect(snapshot.shows.get('blood-of-the-wild')).toMatchObject({
      episodesSyncedAt: '2026-09-02T00:00:00.000Z',
      latestEpisodeAt: Date.parse('2026-09-05T00:00:00.000Z'),
    })
    expect(await library.getMeta('showsSyncedAt')).toBe('2026-09-01T00:00:00.000Z')
    expect(await library.getMeta('catalogueIncludesPatreon')).toBe(true)
  })

  it('asks only about the shows that changed, from their own cursors', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one'), showDTO('two')]
    await sync(library, api)

    api.calls = []
    api.shows = { syncedAt: '2026-09-03T00:00:00.000Z', fullResync: false, shows: [showDTO('two')] }
    const result = await sync(library, api)

    expect(result.showsChecked).toBe(1)
    expect(api.calls).toEqual([
      'shows since=2026-09-01T00:00:00.000Z',
      'two since=2026-09-01T00:00:00.000Z',
    ])
  })

  it('never touches what this browser owns', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one')]
    api.episodes.set('one', { syncedAt: 'c1', fullResync: true, episodes: [episodeDTO('a')] })
    await sync(library, api)
    await library.updateEpisode('a', { isPlayed: true, positionSeconds: 120 })
    await library.updateShow('one', { isStarred: true })

    api.shows = { syncedAt: 'c2', fullResync: false, shows: [showDTO('one', { title: 'Renamed' })] }
    api.episodes.set('one', {
      syncedAt: 'c3',
      fullResync: false,
      episodes: [episodeDTO('a', { title: 'Retitled' })],
    })
    await sync(library, api)

    const snapshot = library.getSnapshot()
    expect(snapshot.shows.get('one')).toMatchObject({ title: 'Renamed', isStarred: true })
    expect(snapshot.episodes.get('a')).toMatchObject({
      title: 'Retitled',
      isPlayed: true,
      positionSeconds: 120,
    })
  })

  it('deletes tombstones, and recomputes the newest episode without them', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one'), showDTO('gone')]
    api.episodes.set('one', {
      syncedAt: 'c1',
      fullResync: true,
      episodes: [
        episodeDTO('old', { publishedAt: '2026-01-01T00:00:00.000Z' }),
        episodeDTO('new', { publishedAt: '2026-09-01T00:00:00.000Z' }),
      ],
    })
    await sync(library, api)

    api.shows = {
      syncedAt: 'c2',
      fullResync: false,
      shows: [showDTO('one'), showDTO('gone', { deletedAt: '2026-09-02T00:00:00.000Z' })],
    }
    api.episodes.set('one', {
      syncedAt: 'c3',
      fullResync: false,
      episodes: [episodeDTO('new', { deletedAt: '2026-09-02T00:00:00.000Z' })],
    })
    const result = await sync(library, api)

    expect(result).toMatchObject({ showsRemoved: 1, episodesRemoved: 1 })
    const snapshot = library.getSnapshot()
    expect(snapshot.shows.has('gone')).toBe(false)
    expect([...snapshot.episodes.keys()]).toEqual(['old'])
    expect(snapshot.shows.get('one')?.latestAnyEpisodeAt).toBe(
      Date.parse('2026-01-01T00:00:00.000Z'),
    )
  })

  it("keeps a failed show's cursor, so the next sync asks for the same window", async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one')]
    api.episodes.set('one', new Error('offline'))

    const result = await sync(library, api)

    expect(result.failedShows).toEqual(['one'])
    expect(library.getSnapshot().shows.get('one')?.episodesSyncedAt).toBeNull()
    // Not marked, so the next sync starts every cursor over.
    expect(await library.getMeta('catalogueIncludesPatreon')).toBeUndefined()
  })

  it('tracks the newest public episode apart from the newest of all', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one', { patreonShowId: '123' })]
    api.episodes.set('one', {
      syncedAt: 'c1',
      fullResync: true,
      episodes: [
        episodeDTO('public', { publishedAt: '2026-09-01T00:00:00.000Z' }),
        episodeDTO('patreon:9', {
          audioUrl: null,
          patreonPostId: '9',
          publishedAt: '2026-09-10T00:00:00.000Z',
          patreonPublishedAt: '2026-09-10T00:00:00.000Z',
        }),
      ],
    })
    await sync(library, api)

    expect(library.getSnapshot().shows.get('one')).toMatchObject({
      patreonShowId: '123',
      latestPublicEpisodeAt: Date.parse('2026-09-01T00:00:00.000Z'),
      latestAnyEpisodeAt: Date.parse('2026-09-10T00:00:00.000Z'),
      latestEpisodeAt: Date.parse('2026-09-10T00:00:00.000Z'),
    })
    expect(library.getSnapshot().episodes.get('patreon:9')).toMatchObject({
      audioUrl: null,
      patreonPostId: '9',
    })
  })

  it('clears everything and fetches it again', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one')]
    api.episodes.set('one', { syncedAt: 'c1', fullResync: true, episodes: [episodeDTO('a')] })
    await sync(library, api)
    await library.updateEpisode('a', { isPlayed: true })

    api.calls = []
    await clearAndResync(library, api)

    expect(api.calls[0]).toBe('shows since=null')
    expect(library.getSnapshot().episodes.get('a')?.isPlayed).toBe(false)
  })

  it('persists, so a reopened library has the same rows', async () => {
    const library = await freshLibrary()
    const api = new FakeCatalogue()
    api.shows.shows = [showDTO('one')]
    api.episodes.set('one', { syncedAt: 'c1', fullResync: true, episodes: [episodeDTO('a')] })
    await sync(library, api)
    await library.flushed()

    const { Library } = await import('./library')
    const reopened = await Library.open(library.db)
    expect(
      reopened
        .getSnapshot()
        .episodesByShow.get('one')
        ?.map((e) => e.guid),
    ).toEqual(['a'])
  })
})
