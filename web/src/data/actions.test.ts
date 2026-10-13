import { episode, freshLibrary, show } from '../test/fixtures'
import { markAllPreviousPlayed, markPlayed, nextEpisodeAfter, positionInShow } from './actions'

async function libraryWith(episodes: ReturnType<typeof episode>[]) {
  const library = await freshLibrary()
  await library.write({ putShows: [show()], putEpisodes: episodes })
  return library
}

describe('actions', () => {
  const one = episode({ guid: 'one', publishedAt: 1 })
  const locked = episode({ guid: 'locked', publishedAt: 2, audioUrl: null, patreonPostId: '9' })
  const three = episode({ guid: 'three', publishedAt: 3 })

  it('steps over a padlocked episode to the next that plays', async () => {
    const library = await libraryWith([one, locked, three])
    expect(nextEpisodeAfter(library, 'one')).toBe('three')
    expect(nextEpisodeAfter(library, 'three')).toBeNull()
  })

  it('plays it in order once there is a token', async () => {
    const library = await libraryWith([one, locked, three])
    await library.setMeta('patreonCredential', { token: 'x'.repeat(20), updatedAt: 1 })
    expect(nextEpisodeAfter(library, 'one')).toBe('locked')
  })

  it('says where an episode sits in its show', async () => {
    const library = await libraryWith([one, locked, three])
    expect(positionInShow(library, 'three')).toEqual({ index: 3, total: 3 })
  })

  it('marks played from the start, and everything before', async () => {
    const library = await libraryWith([one, locked, { ...three, positionSeconds: 300 }])
    await markPlayed(library, 'three')
    expect(library.getSnapshot().episodes.get('three')).toMatchObject({
      isPlayed: true,
      positionSeconds: 0,
    })
    await markAllPreviousPlayed(library, 'locked')
    expect(library.getSnapshot().episodes.get('one')?.isPlayed).toBe(true)
  })
})
