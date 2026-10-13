import { episode, show } from '../test/fixtures'
import {
  chipTemplate,
  effectiveDurationSeconds,
  hasLockedNewEpisode,
  hasNewEpisode,
  inListeningOrder,
  isLocked,
  listedAt,
  nextUnplayed,
  plainDescription,
  RECENT_WINDOW_MS,
  unplayedCount,
} from './logic'

const now = Date.parse('2026-09-20T00:00:00Z')
const recent = now - RECENT_WINDOW_MS / 2
const old = now - RECENT_WINDOW_MS * 2

describe('episodes', () => {
  const early = episode({
    audioUrl: null,
    patreonPostId: '9',
    publishedAt: Date.parse('2026-12-01T00:00:00Z'),
    patreonPublishedAt: Date.parse('2026-06-01T00:00:00Z'),
    durationSeconds: 4000,
    patreonDurationSeconds: 3500,
  })

  it('lists a patron by Patreon date, and anyone else by the public one', () => {
    expect(listedAt(early, true)).toBe(Date.parse('2026-06-01T00:00:00Z'))
    expect(listedAt(early, false)).toBe(Date.parse('2026-12-01T00:00:00Z'))
  })

  it("padlocks what only Patreon has, until there's a token", () => {
    expect(isLocked(early, false)).toBe(true)
    expect(isLocked(early, true)).toBe(false)
    expect(isLocked(episode(), false)).toBe(false)
  })

  it("uses Patreon's runtime where Patreon's copy plays", () => {
    expect(effectiveDurationSeconds(early, true)).toBe(3500)
    expect(effectiveDurationSeconds(early, false)).toBe(4000)
  })

  it('orders oldest first and finds the next unheard one that plays', () => {
    const a = episode({ guid: 'a', publishedAt: 1, isPlayed: true })
    const b = episode({ guid: 'b', publishedAt: 2 })
    const locked = episode({ guid: 'c', publishedAt: 0, audioUrl: null, patreonPostId: '1' })
    expect(inListeningOrder([b, a], false).map((e) => e.guid)).toEqual(['a', 'b'])
    expect(nextUnplayed([a, b, locked], false)?.guid).toBe('b')
    expect(nextUnplayed([a, b, locked], true)?.guid).toBe('c')
  })

  it('strips the HTML from a description', () => {
    expect(
      plainDescription(episode({ description: '<p>Rolls &amp; dice&nbsp;&#8212;</p>\n<b>ok</b>' })),
    ).toBe('Rolls & dice — ok')
    expect(plainDescription(episode({ description: '<br/>' }))).toBeNull()
  })

  it('reserves the widest numbering in a show', () => {
    expect(chipTemplate([episode({ number: 7 }), episode({ number: 152, season: 2 })])).toEqual({
      season: 'S0',
      number: 'E000',
    })
    expect(chipTemplate([])).toEqual({ season: 'S0', number: 'E0' })
  })
})

describe('shows', () => {
  it('only counts what plays here as unplayed', () => {
    const episodes = [
      episode({ guid: 'a' }),
      episode({ guid: 'b', isPlayed: true }),
      episode({ guid: 'c', audioUrl: null, patreonPostId: '1' }),
    ]
    expect(unplayedCount(episodes, false)).toBe(1)
    expect(unplayedCount(episodes, true)).toBe(2)
  })

  it('is NEW when something recent is unheard', () => {
    const recentShow = show({ latestPublicEpisodeAt: recent, latestAnyEpisodeAt: recent })
    expect(hasNewEpisode(recentShow, 1, false, now)).toBe(true)
    expect(hasNewEpisode(recentShow, 0, false, now)).toBe(false)
    expect(hasNewEpisode(show({ latestPublicEpisodeAt: old }), 1, false, now)).toBe(false)
  })

  it("wears a padlock for Patreon's news without a token, and NEW with one", () => {
    const earlyRelease = show({ latestPublicEpisodeAt: old, latestAnyEpisodeAt: recent })
    expect(hasNewEpisode(earlyRelease, 1, false, now)).toBe(false)
    expect(hasLockedNewEpisode(earlyRelease, 1, false, now)).toBe(true)
    expect(hasNewEpisode(earlyRelease, 1, true, now)).toBe(true)
    expect(hasLockedNewEpisode(earlyRelease, 1, true, now)).toBe(false)
  })

  it('always padlocks a Patreon-only show without a token', () => {
    const patreonOnly = show({ isPublic: false, latestAnyEpisodeAt: old })
    expect(hasLockedNewEpisode(patreonOnly, 0, false, now)).toBe(true)
    expect(hasLockedNewEpisode(patreonOnly, 0, true, now)).toBe(false)
  })
})
