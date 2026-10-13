import { describe, expect, it } from 'vitest'
import type { FeedItem } from './parse-feed.js'
import { parsePatreonCollectionTitle, parsePatreonTitle } from './parse-title.js'
import {
  type PatreonCollection,
  parsePatreonCollections,
  parsePatreonPosts,
  resolvePatreonFeeds,
} from './patreon.js'
import { type ExistingEpisode, type ExistingShow, type PlanFeed, planSync } from './plan.js'

describe('parsePatreonTitle', () => {
  it('keeps the episode name whole and reads the number off the system segment', () => {
    expect(parsePatreonTitle('So Wet | Shadowdark RPG Episode 44', 'Shadowdark')).toMatchObject({
      episodeTitle: 'So Wet',
      season: null,
      number: 44,
    })
    expect(
      parsePatreonTitle('Inner Circle | Call of Cthulhu S4 E10', 'Time For Chaos'),
    ).toMatchObject({ episodeTitle: 'Inner Circle', season: 4, number: 10 })
  })

  it('reads the season-first shape', () => {
    expect(parsePatreonTitle('S3 | E50 – Castle Grimgorge', 'Blood of the Wild')).toMatchObject({
      episodeTitle: 'Castle Grimgorge',
      showTitle: 'Blood of the Wild',
      season: 3,
      number: 50,
    })
  })

  it('reads a chapter as the episode number', () => {
    expect(
      parsePatreonTitle('Erthad Celyn | The One Ring RPG Chapter 12', 'The Secret Fire'),
    ).toMatchObject({ episodeTitle: 'Erthad Celyn', number: 12 })
  })

  it('never reads a year as an episode number', () => {
    expect(parsePatreonTitle('2023 Holiday Special', 'Blood of the Wild')).toMatchObject({
      episodeTitle: '2023 Holiday Special',
      number: null,
    })
  })

  it('always files the post under the collection’s show', () => {
    expect(
      parsePatreonTitle('Kings of Men | The One Ring RPG Prologue', 'The Secret Fire'),
    ).toMatchObject({ episodeTitle: 'Kings of Men', showTitle: 'The Secret Fire', number: null })
  })
})

describe('parsePatreonCollectionTitle', () => {
  it('splits a collection into its show and its system', () => {
    expect(
      parsePatreonCollectionTitle('Legacy of the Ancients | Rise of the Runelords | Pathfinder 1E'),
    ).toEqual({
      showTitle: 'Legacy of the Ancients',
      system: 'Rise of the Runelords | Pathfinder 1E',
    })
    expect(parsePatreonCollectionTitle('Just a Show')).toEqual({
      showTitle: 'Just a Show',
      system: null,
    })
  })
})

describe('parsePatreonCollections', () => {
  it('reads the podcast sections of the launcher feed and nothing else', () => {
    const body = {
      data: [
        {
          type: 'launcher-feed-section',
          attributes: { header: { title: 'Featured' }, section_type_id: 'creator_selected' },
        },
        {
          type: 'launcher-feed-section',
          attributes: {
            section_type_id: 'posts_by_podcast',
            header: {
              title: 'The Secret Fire | The One Ring RPG',
              image_url: 'https://c10.patreonusercontent.com/x/1.jpg?token-hash=a&token-time=1',
              navigation: {
                destination: {
                  internal_destination: 'collection/2224146',
                  url: 'https://www.patreon.com/collection/2224146',
                },
              },
            },
          },
        },
      ],
    }

    expect(parsePatreonCollections(body)).toEqual([
      {
        id: '2224146',
        title: 'The Secret Fire | The One Ring RPG',
        artworkUrl: 'https://c10.patreonusercontent.com/x/1.jpg?token-hash=a&token-time=1',
      },
    ])
  })

  it('throws on a shape it does not recognise, so the run reports it', () => {
    expect(() => parsePatreonCollections({ errors: [] })).toThrow()
  })
})

describe('parsePatreonPosts', () => {
  const body = {
    data: [
      {
        id: '168967576',
        type: 'post',
        attributes: {
          title: 'Erthad Celyn | The One Ring RPG Chapter 12',
          published_at: '2026-09-17T04:00:03.000+00:00',
          post_type: 'podcast',
        },
        relationships: { audio: { data: { id: '741279110', type: 'media' } } },
      },
      {
        id: '1',
        type: 'post',
        attributes: { title: 'Schedule update', published_at: '2026-09-18T04:00:00.000+00:00' },
        relationships: { audio: { data: null } },
      },
    ],
    included: [{ id: '741279110', type: 'media', attributes: { metadata: { duration_s: 5961 } } }],
    meta: { pagination: { total: 2, cursors: { next: 'abc' } } },
  }

  it('turns a post with audio into an episode with no public audio', () => {
    const { items, next } = parsePatreonPosts(body)

    expect(items).toEqual([
      {
        guid: 'patreon:168967576',
        patreonPostId: '168967576',
        rawTitle: 'Erthad Celyn | The One Ring RPG Chapter 12',
        description: null,
        audioUrl: null,
        durationSeconds: 5961,
        publishedAt: new Date('2026-09-17T04:00:03.000Z'),
        artworkUrl: null,
        videoUrl: null,
      },
    ])
    expect(next).toBe('abc')
  })
})

// ─── Resolving collections to shows ──────────────────────────────────────────

type StoredShow = Parameters<typeof resolvePatreonFeeds>[1][number]

const storedShow = (
  overrides: Partial<StoredShow> & Pick<StoredShow, 'id' | 'title'>,
): StoredShow => ({
  slug: overrides.title.toLowerCase().replace(/\W+/g, '-'),
  matchPattern: null,
  artworkUrl: null,
  system: null,
  hash: null,
  overridden: false,
  isPublic: true,
  patreonShowId: null,
  deletedAt: null,
  ...overrides,
})

const collection = (
  id: string,
  title: string,
): { collection: PatreonCollection; items: FeedItem[] } => ({
  collection: { id, title, artworkUrl: null },
  items: [],
})

describe('resolvePatreonFeeds', () => {
  it('files a collection under the show already linked to it', () => {
    const shows = [storedShow({ id: 's1', title: 'Blood of the Wild', patreonShowId: '2073551' })]
    const { feeds, links } = resolvePatreonFeeds(
      [collection('2073551', 'Blood of the Wild | Quest For the Frozen Flame | Pathfinder 2E')],
      shows,
      [],
    )

    expect(feeds[0]).toMatchObject({ showTitle: 'Blood of the Wild', patreonShowId: '2073551' })
    expect(links).toEqual([])
  })

  it('links a known collection to its show by slug, whatever its title says', () => {
    const shows = [
      storedShow({ id: 'gcp', title: 'The Glass Cannon Podcast' }),
      storedShow({
        id: 'sd',
        title: 'The Glass Cannon Podcast Shadowdark',
        slug: 'the-glass-cannon-podcast-shadowdark',
      }),
    ]
    const { feeds, links } = resolvePatreonFeeds(
      [collection('2073636', 'The Glass Cannon Podcast | Shadowdark')],
      shows,
      [{ slug: 'the-glass-cannon-podcast-shadowdark', patreonShowId: '2073636' }],
    )

    expect(feeds[0]?.showTitle).toBe('The Glass Cannon Podcast Shadowdark')
    expect(links).toEqual([{ showId: 'sd', patreonShowId: '2073636' }])
  })

  it('sits a known collection out until its show exists, rather than guessing', () => {
    const { feeds, skipped } = resolvePatreonFeeds(
      [collection('2073636', 'The Glass Cannon Podcast | Shadowdark')],
      [storedShow({ id: 'gcp', title: 'The Glass Cannon Podcast' })],
      [{ slug: 'the-glass-cannon-podcast-shadowdark', patreonShowId: '2073636' }],
    )

    expect(feeds).toEqual([])
    expect(skipped).toEqual(['Patreon: The Glass Cannon Podcast | Shadowdark'])
  })

  it('links a show by title when nothing else claims the collection', () => {
    const { links } = resolvePatreonFeeds(
      [collection('2073638', 'Time For Chaos | Masks of Nyarlathotep | Call of Cthulhu')],
      [storedShow({ id: 'tfc', title: 'Time For Chaos' })],
      [],
    )
    expect(links).toEqual([{ showId: 'tfc', patreonShowId: '2073638' }])
  })

  it('never moves a show already linked to a different collection', () => {
    const { feeds, skipped } = resolvePatreonFeeds(
      [collection('999', 'Time For Chaos | Something Else')],
      [storedShow({ id: 'tfc', title: 'Time For Chaos', patreonShowId: '2073638' })],
      [],
    )
    expect(feeds).toEqual([])
    expect(skipped).toHaveLength(1)
  })

  it('leaves a collection with no show for the plan to create', () => {
    const { feeds, links } = resolvePatreonFeeds(
      [collection('2224146', 'The Secret Fire | The One Ring RPG')],
      [],
      [],
    )
    expect(feeds[0]).toMatchObject({
      showTitle: 'The Secret Fire',
      fallbackSystem: 'The One Ring RPG',
      patreonShowId: '2224146',
    })
    expect(links).toEqual([])
  })
})

// ─── Planning ────────────────────────────────────────────────────────────────

let clock = 0
const post = (id: string, rawTitle: string, overrides: Partial<FeedItem> = {}): FeedItem => ({
  guid: `patreon:${id}`,
  patreonPostId: id,
  rawTitle,
  description: null,
  audioUrl: null,
  durationSeconds: 3600,
  publishedAt: new Date(Date.UTC(2026, 0, 1) + clock++ * 86_400_000),
  artworkUrl: null,
  videoUrl: null,
  ...overrides,
})

const rss = (guid: string, rawTitle: string, overrides: Partial<FeedItem> = {}): FeedItem => ({
  guid,
  rawTitle,
  description: 'From the public feed',
  audioUrl: `https://cdn.example/${guid}.mp3`,
  durationSeconds: 3700,
  publishedAt: new Date(Date.UTC(2026, 5, 1) + clock++ * 86_400_000),
  artworkUrl: null,
  videoUrl: null,
  ...overrides,
})

const mainFeed = (items: FeedItem[]): PlanFeed => ({
  name: 'Glass Cannon Network',
  showTitle: null,
  channelArtworkUrl: null,
  items,
})

const patreonFeed = (
  showTitle: string,
  patreonShowId: string,
  items: FeedItem[],
  extra: Partial<PlanFeed> = {},
): PlanFeed => ({
  name: `Patreon: ${showTitle}`,
  showTitle,
  channelArtworkUrl: null,
  patreonShowId,
  items,
  ...extra,
})

const shadowdark: ExistingShow = {
  id: 'sd',
  title: 'The Glass Cannon Podcast Shadowdark',
  matchPattern: null,
  artworkUrl: 'https://cdn.example/shadowdark.jpg',
  system: 'Shadowdark RPG',
  hash: null,
  overridden: false,
}

describe('planSync with Patreon', () => {
  it('creates a Patreon-only show as not public, with episodes that have no audio', () => {
    const signed = 'https://c10.patreonusercontent.com/a/1.jpg?token-hash=x&token-time=1'
    const plan = planSync(
      [
        patreonFeed(
          'The Secret Fire',
          '2224146',
          [post('161965461', 'Kings of Men | The One Ring RPG Prologue')],
          { channelArtworkUrl: signed, fallbackSystem: 'The One Ring RPG' },
        ),
      ],
      [],
      [],
    )

    expect(plan.shows).toEqual([
      expect.objectContaining({
        title: 'The Secret Fire',
        system: 'The One Ring RPG',
        artworkUrl: signed,
        isPublic: false,
        patreonShowId: '2224146',
      }),
    ])
    expect(plan.episodes).toEqual([
      expect.objectContaining({
        guid: 'patreon:161965461',
        patreonPostId: '161965461',
        audioUrl: null,
        title: 'Kings of Men',
        showTitle: 'The Secret Fire',
      }),
    ])
  })

  it('skips a Patreon post of an episode the public feed already carries', () => {
    const stored: ExistingEpisode = {
      id: 'ep-44',
      guid: 'megaphone-44',
      title: 'So Wet',
      showId: 'sd',
      number: 44,
      numberIsDerived: false,
      videoUrl: null,
      hash: 'h',
      overridden: false,
    }
    const plan = planSync(
      [
        patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
          post('169807446', 'So Wet | Shadowdark RPG Episode 44'),
        ]),
      ],
      [shadowdark],
      [stored],
    )

    expect(plan.episodes).toEqual([])
    expect(plan.duplicatesSkipped).toBe(1)
  })

  describe('the ad-free copy of a public episode', () => {
    const publicItem = rss(
      'mega-44',
      'So Wet | The Glass Cannon Podcast Shadowdark E44 | Shadowdark RPG',
    )

    it('links the public episode to its Patreon post', () => {
      const plan = planSync(
        [
          mainFeed([publicItem]),
          patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
            post('169807446', 'So Wet | Shadowdark RPG Episode 44'),
          ]),
        ],
        [shadowdark],
        [],
      )

      expect(plan.episodes).toEqual([
        expect.objectContaining({ guid: 'mega-44', patreonPostId: '169807446' }),
      ])
      expect(plan.duplicatesSkipped).toBe(1)
    })

    it('carries the date Patreon published it, for a patron to list it by', () => {
      const early = new Date('2026-01-21T05:05:00Z')
      const plan = planSync(
        [
          mainFeed([publicItem]),
          patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
            post('169807446', 'So Wet | Shadowdark RPG Episode 44', { publishedAt: early }),
          ]),
        ],
        [shadowdark],
        [],
      )
      expect(plan.episodes[0]).toMatchObject({
        publishedAt: publicItem.publishedAt,
        patreonPublishedAt: early,
      })
    })

    it('links neither when two posts share the title', () => {
      const plan = planSync(
        [
          mainFeed([publicItem]),
          patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
            post('1', 'So Wet | Shadowdark RPG Episode 44'),
            post('2', 'So Wet | Shadowdark RPG Episode 44'),
          ]),
        ],
        [shadowdark],
        [],
      )
      expect(plan.episodes.find((e) => e.guid === 'mega-44')?.patreonPostId).toBeNull()
    })

    it('never gives a public row a post another row already holds', () => {
      const early: ExistingEpisode = {
        id: 'ep-early',
        guid: 'patreon:169807446',
        patreonPostId: '169807446',
        title: 'Something Else',
        showId: 'sd',
        number: 44,
        numberIsDerived: false,
        videoUrl: null,
        hash: 'h',
        overridden: false,
        hasPublicAudio: false,
      }
      const plan = planSync(
        [
          mainFeed([publicItem]),
          patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
            post('169807446', 'So Wet | Shadowdark RPG Episode 44'),
          ]),
        ],
        [shadowdark],
        [early],
      )
      expect(plan.episodes.find((e) => e.guid === 'mega-44')?.patreonPostId).toBeNull()
    })
  })

  it('keeps every Patreon post, however many share a title', () => {
    const plan = planSync(
      [
        patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
          post('1', 'After Dark Bonus Content | Shadowdark RPG Episode 43'),
          post('2', 'After Dark Bonus Content | Shadowdark RPG Episode 44'),
        ]),
      ],
      [shadowdark],
      [],
    )

    expect(plan.episodes.map((e) => [e.title, e.number])).toEqual([
      ['After Dark Bonus Content', 43],
      ['After Dark Bonus Content', 44],
    ])
  })

  it('never lets a Patreon post keep out the public copy that follows it', () => {
    const plan = planSync(
      [
        mainFeed([
          rss('mega-45', 'Next One | The Glass Cannon Podcast Shadowdark E45 | Shadowdark RPG'),
        ]),
        patreonFeed('The Glass Cannon Podcast Shadowdark', '2073636', [
          post('3', 'Next One | Shadowdark RPG Episode 45'),
        ]),
      ],
      [shadowdark],
      [],
    )

    expect(plan.episodes).toEqual([
      expect.objectContaining({ guid: 'mega-45', audioUrl: 'https://cdn.example/mega-45.mp3' }),
    ])
    expect(plan.duplicatesSkipped).toBe(1)
  })

  describe('an early release reaching the public feed', () => {
    // The row a first run made of the Patreon post, before the public feed had it.
    const early = (hash: string | null, hasPublicAudio: boolean): ExistingEpisode => ({
      id: 'ep-early',
      guid: 'patreon:168443753',
      patreonPostId: '168443753',
      title: 'Castle Grimgorge',
      showId: 'botw',
      number: 50,
      numberIsDerived: false,
      videoUrl: null,
      hash,
      overridden: false,
      hasPublicAudio,
    })
    const botw: ExistingShow = {
      id: 'botw',
      title: 'Blood of the Wild',
      matchPattern: null,
      artworkUrl: 'https://cdn.example/botw.jpg',
      system: 'Pathfinder 2E',
      hash: null,
      overridden: false,
    }
    const feeds = [
      mainFeed([rss('mega-s3e50', 'Castle Grimgorge | Blood of the Wild S3 E50 | Pathfinder 2E')]),
      patreonFeed('Blood of the Wild', '2073551', [
        post('168443753', 'S3 | E50 – Castle Grimgorge'),
      ]),
    ]

    it('turns the Patreon row into the public episode, in place', () => {
      const plan = planSync(feeds, [botw], [early('stale', false)])
      const patreonPost = feeds[1]?.items[0]

      // No second row: the phones keep the guid they already hold, and the
      // episode simply becomes playable.
      expect(plan.episodes).toEqual([])
      expect(plan.episodeUpdates).toEqual([
        expect.objectContaining({
          id: 'ep-early',
          audioUrl: 'https://cdn.example/mega-s3e50.mp3',
          description: 'From the public feed',
          patreonPostId: '168443753',
          // The public date to everyone, and Patreon's kept for patrons.
          publishedAt: feeds[0]?.items[0]?.publishedAt,
          patreonPublishedAt: patreonPost?.publishedAt,
          showTitle: 'Blood of the Wild',
        }),
      ])
    })

    it('writes nothing on the runs after, and the Patreon post never takes it back', () => {
      const first = planSync(feeds, [botw], [early('stale', false)])
      const promoted = first.episodeUpdates[0]?.hash ?? ''

      const second = planSync(feeds, [botw], [early(promoted, true)])
      expect(second.episodeUpdates).toEqual([])
      expect(second.episodes).toEqual([])

      // Even when the public feed fails and Patreon is all that is read.
      const patreonOnly = planSync(feeds.slice(1), [botw], [early(promoted, true)])
      expect(patreonOnly.episodeUpdates).toEqual([])
    })
  })

  it('writes nothing when Patreon has not changed', () => {
    const feeds = [
      patreonFeed(
        'The Secret Fire',
        '2224146',
        [post('10', 'Gwendaith | The One Ring RPG Chapter 4')],
        {
          fallbackSystem: 'The One Ring RPG',
        },
      ),
    ]
    const first = planSync(feeds, [], [])
    const created = first.shows[0]
    const episode = first.episodes[0]
    if (!created || !episode) throw new Error('expected a show and an episode')

    const second = planSync(
      feeds,
      [
        {
          id: 'tsf',
          title: created.title,
          matchPattern: null,
          artworkUrl: created.artworkUrl,
          system: created.system,
          hash: created.hash,
          overridden: false,
          isPublic: false,
        },
      ],
      [
        {
          id: 'e',
          guid: episode.guid,
          title: episode.title,
          showId: 'tsf',
          number: episode.number,
          numberIsDerived: episode.numberIsDerived,
          videoUrl: null,
          hash: episode.hash,
          overridden: false,
          patreonPostId: episode.patreonPostId,
          hasPublicAudio: false,
        },
      ],
    )

    expect(second.showUpdates).toEqual([])
    expect(second.episodeUpdates).toEqual([])
    expect(second.episodes).toEqual([])
  })

  it('makes a Patreon-only show public once a public feed carries it', () => {
    const plan = planSync(
      [mainFeed([rss('m1', 'Bob and Weave | Legacy of the Ancients S5 E57 | Pathfinder 1E')])],
      [
        {
          id: 'lota',
          title: 'Legacy of the Ancients',
          matchPattern: null,
          artworkUrl: null,
          system: 'Pathfinder 1E',
          hash: null,
          overridden: false,
          isPublic: false,
        },
      ],
      [],
    )
    expect(plan.showUpdates).toEqual([expect.objectContaining({ id: 'lota', isPublic: true })])
  })

  it('takes Patreon’s freshly signed artwork over the one that is expiring', () => {
    const old = 'https://c10.patreonusercontent.com/a/1.jpg?token-hash=old&token-time=1'
    const fresh = 'https://c10.patreonusercontent.com/a/1.jpg?token-hash=new&token-time=2'
    const plan = planSync(
      [patreonFeed('The Secret Fire', '2224146', [], { channelArtworkUrl: fresh })],
      [
        {
          id: 'tsf',
          title: 'The Secret Fire',
          matchPattern: null,
          artworkUrl: old,
          system: 'The One Ring RPG',
          hash: 'h',
          overridden: false,
          isPublic: false,
        },
      ],
      [],
    )
    // No items, so the show never entered the plan at all — Patreon has to
    // have posted something for a run to have an opinion about the show.
    expect(plan.showUpdates).toEqual([])

    const withPost = planSync(
      [
        patreonFeed(
          'The Secret Fire',
          '2224146',
          [post('11', 'In the Tomb | The One Ring RPG Chapter 5')],
          {
            channelArtworkUrl: fresh,
          },
        ),
      ],
      [
        {
          id: 'tsf',
          title: 'The Secret Fire',
          matchPattern: null,
          artworkUrl: old,
          system: 'The One Ring RPG',
          hash: 'h',
          overridden: false,
          isPublic: false,
        },
      ],
      [],
    )
    expect(withPost.showUpdates).toEqual([
      expect.objectContaining({ id: 'tsf', artworkUrl: fresh, isPublic: false }),
    ])
  })
})
