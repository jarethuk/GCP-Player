import { describe, expect, it } from 'vitest'
import type { FeedItem } from './parse-feed.js'
import { type ExistingEpisode, type ExistingShow, type PlanFeed, planSync } from './plan.js'

let clock = 0
const item = (overrides: Partial<FeedItem> & Pick<FeedItem, 'guid' | 'rawTitle'>): FeedItem => ({
  description: null,
  audioUrl: `https://cdn.example/${overrides.guid}.mp3`,
  durationSeconds: 3600,
  publishedAt: new Date(Date.UTC(2025, 0, 1) + clock++ * 86_400_000),
  artworkUrl: null,
  videoUrl: null,
  ...overrides,
})

const mainFeed = (items: FeedItem[]): PlanFeed => ({
  name: 'Glass Cannon Network',
  showTitle: null,
  channelArtworkUrl: 'https://cdn.example/channel.jpg',
  items,
})

const showFeed = (showTitle: string, items: FeedItem[]): PlanFeed => ({
  name: showTitle,
  showTitle,
  channelArtworkUrl: null,
  items,
})

// One show, one item, one video link — the fixture the reconciling tests vary
// against. `clock` makes every item() a different date, so these are built once
// and reused rather than rebuilt per test.
const haunted: ExistingShow[] = [
  {
    id: 's1',
    title: 'Haunted City',
    matchPattern: null,
    artworkUrl: null,
    system: null,
    hash: null,
    overridden: false,
  },
]

const videoItem = item({
  guid: 'a',
  rawTitle: 'One | Haunted City S1 E1 | Blades in the Dark',
  videoUrl: 'https://youtu.be/eYkJB2rjUNo',
})

const videoFeed = mainFeed([videoItem])

/** The row `videoFeed`'s item would have been ingested as, before any drift. */
const storedEpisode = (overrides: Partial<ExistingEpisode> = {}): ExistingEpisode => ({
  id: 'ep-a',
  guid: 'a',
  title: 'One',
  showId: 's1',
  number: 1,
  numberIsDerived: false,
  videoUrl: 'https://youtu.be/eYkJB2rjUNo',
  hash: null,
  overridden: false,
  ...overrides,
})

describe('planSync', () => {
  it('plans a show and its episodes from the main feed', () => {
    const plan = planSync(
      [
        mainFeed([
          item({
            guid: 'a',
            rawTitle: "Shaggy's Fight | Blood of the Wild S1 E38 | Pathfinder 2E",
          }),
        ]),
      ],
      [],
      [],
    )

    expect(plan.shows).toHaveLength(1)
    expect(plan.shows[0]).toMatchObject({
      slug: 'blood-of-the-wild',
      title: 'Blood of the Wild',
      system: 'Pathfinder 2E',
      // No item artwork, so the channel image stands in rather than nothing.
      artworkUrl: 'https://cdn.example/channel.jpg',
    })
    expect(plan.episodes).toHaveLength(1)
    expect(plan.episodes[0]).toMatchObject({
      guid: 'a',
      title: "Shaggy's Fight",
      showTitle: 'Blood of the Wild',
      season: 1,
      number: 38,
    })
  })

  it('never re-plans an episode already stored', () => {
    // Ingest is additive; this is what makes running it twice a no-op.
    const feed = mainFeed([
      item({ guid: 'a', rawTitle: 'One | Haunted City S1 E1 | Blades in the Dark' }),
    ])
    const existingShows: ExistingShow[] = [
      {
        id: 's1',
        title: 'Haunted City',
        matchPattern: null,
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]
    const existingEpisodes: ExistingEpisode[] = [
      {
        id: 'ep-a',
        guid: 'a',
        title: 'One',
        showId: 's1',
        number: null,
        numberIsDerived: false,
        videoUrl: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync([feed], existingShows, existingEpisodes)

    expect(plan.episodes).toEqual([])
    expect(plan.shows).toEqual([])
  })

  it('skips a cross-post that another feed already carried in the same run', () => {
    // The network publishes all 45 Haunted City episodes into both the main
    // feed and Haunted City's own, under different guids.
    const plan = planSync(
      [
        mainFeed([
          item({
            guid: 'main-1',
            rawTitle: 'Tsunami of Evil | Haunted City S2 E20 | Blades in the Dark',
          }),
        ]),
        showFeed('Haunted City', [
          item({
            guid: 'acast-1',
            rawTitle: 'Tsunami of Evil | Haunted City S2 E20 | Blades in the Dark',
          }),
        ]),
      ],
      [],
      [],
    )

    expect(plan.episodes).toHaveLength(1)
    expect(plan.episodes[0]?.guid).toBe('main-1')
    expect(plan.duplicatesSkipped).toBe(1)
  })

  it('skips a cross-post whose twin is already in the database', () => {
    // The case per-run state alone would miss: the main feed 404s on one run,
    // the per-show feed inserts its copy, and the main feed succeeds later.
    // Without a database-seeded key set both copies end up stored, and additive
    // ingest has no way to repair that.
    const existingShows: ExistingShow[] = [
      {
        id: 's1',
        title: 'Haunted City',
        matchPattern: null,
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]
    const existingEpisodes: ExistingEpisode[] = [
      {
        id: 'ep-acast-1',
        guid: 'acast-1',
        title: 'Tsunami of Evil',
        showId: 's1',
        number: null,
        numberIsDerived: false,
        videoUrl: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync(
      [
        mainFeed([
          item({
            guid: 'main-1',
            rawTitle: 'Tsunami of Evil | Haunted City S2 E20 | Blades in the Dark',
          }),
        ]),
      ],
      existingShows,
      existingEpisodes,
    )

    expect(plan.episodes).toEqual([])
    expect(plan.duplicatesSkipped).toBe(1)
  })

  it('keeps an unattributable episode and counts it', () => {
    const plan = planSync(
      [mainFeed([item({ guid: 'x', rawTitle: 'Some Brand New Thing We Have Never Seen' })])],
      [],
      [],
    )

    expect(plan.itemsUnattributed).toBe(1)
    expect(plan.episodes).toHaveLength(1)
    expect(plan.episodes[0]?.showTitle).toBeNull()
  })

  it('does not de-duplicate unattributed episodes', () => {
    // Two unattributed items with the same title are not knowably the same
    // episode, and collapsing them would lose one for good.
    const plan = planSync(
      [
        mainFeed([
          item({ guid: 'x', rawTitle: 'Bonus Content' }),
          item({ guid: 'y', rawTitle: 'Bonus Content' }),
        ]),
      ],
      [],
      [],
    )

    expect(plan.episodes).toHaveLength(2)
    expect(plan.duplicatesSkipped).toBe(0)
  })

  it('folds a per-show feed onto the existing show rather than a near-duplicate', () => {
    const existingShows: ExistingShow[] = [
      {
        id: 's1',
        title: 'Wicked Empire',
        matchPattern: null,
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync(
      [
        showFeed('Wicked Empire', [
          item({ guid: 'w1', rawTitle: 'Wicked Empire S1 | E10 - The Temple' }),
        ]),
      ],
      existingShows,
      [],
    )

    expect(plan.shows).toEqual([])
    expect(plan.episodes[0]).toMatchObject({
      showTitle: 'Wicked Empire',
      title: 'The Temple',
      season: 1,
      number: 10,
    })
  })

  it('attributes a pipeless title through a stored match pattern', () => {
    const existingShows: ExistingShow[] = [
      {
        id: 's1',
        title: 'GCN News Minute',
        matchPattern: '^GCN News Minutes?',
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync(
      [mainFeed([item({ guid: 'n1', rawTitle: 'GCN News Minutes 12/9/25' })])],
      existingShows,
      [],
    )

    expect(plan.itemsUnattributed).toBe(0)
    expect(plan.episodes[0]).toMatchObject({ showTitle: 'GCN News Minute', title: '12/9/25' })
  })

  it('takes a new show’s artwork from its newest item that has any', () => {
    const plan = planSync(
      [
        mainFeed([
          item({
            guid: 'a',
            rawTitle: 'One | Time For Chaos S1 E1 | Call of Cthulhu',
            artworkUrl: 'https://cdn.example/old.jpg',
          }),
          item({
            guid: 'b',
            rawTitle: 'Two | Time For Chaos S1 E2 | Call of Cthulhu',
            artworkUrl: 'https://cdn.example/new.jpg',
          }),
          item({ guid: 'c', rawTitle: 'Three | Time For Chaos S1 E3 | Call of Cthulhu' }),
        ]),
      ],
      [],
      [],
    )

    // The last item carries none, and must not blank what the previous one set.
    expect(plan.shows[0]?.artworkUrl).toBe('https://cdn.example/new.jpg')
  })
})

describe('planSync show updates', () => {
  // A seeded show — title and match pattern only — has no artwork until its
  // episodes turn up.
  const seeded: ExistingShow[] = [
    {
      id: 'seed_1',
      title: 'GCN News Minute',
      matchPattern: '^GCN News Minutes?',
      artworkUrl: null,
      system: null,
      hash: null,
      overridden: false,
    },
  ]

  const newsItem = (guid: string, artworkUrl: string | null = null) =>
    item({ guid, rawTitle: `GCN News Minutes 12/9/25 ${guid}`, artworkUrl })

  it('completes a blank on an existing show from its episodes', () => {
    const plan = planSync([mainFeed([newsItem('n1', 'https://cdn.example/news.jpg')])], seeded, [])

    expect(plan.shows).toEqual([])
    expect(plan.showUpdates).toHaveLength(1)
    expect(plan.showUpdates[0]).toMatchObject({
      id: 'seed_1',
      system: null,
      artworkUrl: 'https://cdn.example/news.jpg',
    })
  })

  // This is the change of behaviour. Ingest used to fill only nulls, because
  // never overwriting was the only thing protecting an edit; `overridden` now
  // does that job explicitly, which frees the feed to correct its own artwork.
  it('replaces artwork the feed has changed', () => {
    const withArtwork: ExistingShow[] = [
      { ...(seeded[0] as ExistingShow), artworkUrl: 'https://cdn.example/old.jpg' },
    ]

    const plan = planSync(
      [mainFeed([newsItem('n1', 'https://cdn.example/new.jpg')])],
      withArtwork,
      [],
    )

    expect(plan.showUpdates[0]?.artworkUrl).toBe('https://cdn.example/new.jpg')
  })

  it('keeps an edited value against a feed that would change it', () => {
    const edited: ExistingShow[] = [
      {
        ...(seeded[0] as ExistingShow),
        artworkUrl: 'https://cdn.example/chosen.jpg',
        overridden: true,
      },
    ]

    const plan = planSync([mainFeed([newsItem('n1', 'https://cdn.example/feed.jpg')])], edited, [])

    expect(plan.showUpdates).toEqual([])
    expect(plan.overriddenSkipped).toBe(1)
  })

  // Overwriting with the null would strip a show of artwork it already has the
  // moment its recent items stop carrying any.
  it('leaves a field alone when the feed says nothing about it', () => {
    const withArtwork: ExistingShow[] = [
      { ...(seeded[0] as ExistingShow), artworkUrl: 'https://cdn.example/kept.jpg' },
    ]

    const plan = planSync([mainFeed([newsItem('n1', null)])], withArtwork, [])

    expect(plan.showUpdates[0]?.artworkUrl).toBe('https://cdn.example/kept.jpg')
  })

  it('prefers real episode artwork over the channel image', () => {
    const plan = planSync(
      [
        {
          name: 'Glass Cannon Network',
          showTitle: null,
          channelArtworkUrl: 'https://cdn.example/channel.jpg',
          items: [
            newsItem('n1', 'https://cdn.example/news.jpg'),
            // Carries none, and must not drag the show back to the channel image.
            newsItem('n2'),
          ],
        },
      ],
      seeded,
      [],
    )

    expect(plan.showUpdates[0]?.artworkUrl).toBe('https://cdn.example/news.jpg')
  })
})

describe('planSync derived numbers', () => {
  const unnumbered = (guid: string, rawTitle: string) => item({ guid, rawTitle })

  it('numbers a show the feed never numbers, in release order', () => {
    // Cannon Fodder, GCN News Minute and the live shows publish no numbers at
    // all, which leaves their rows without the chip every other show has.
    const existing: ExistingShow[] = [
      {
        id: 's1',
        title: 'Cannon Fodder',
        matchPattern: '^Cannon Fodder',
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync(
      [
        mainFeed([
          // Deliberately newest-first in the feed: release date decides, not
          // the order items happen to appear in.
          {
            ...unnumbered('c2', 'Cannon Fodder Week Two'),
            publishedAt: new Date('2026-02-01T00:00:00Z'),
          },
          {
            ...unnumbered('c1', 'Cannon Fodder Week One'),
            publishedAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
      ],
      existing,
      [],
    )

    const byGuid = new Map(plan.episodes.map((e) => [e.guid, e]))
    expect(byGuid.get('c1')?.number).toBe(1)
    expect(byGuid.get('c2')?.number).toBe(2)
    expect(byGuid.get('c1')?.numberIsDerived).toBe(true)
    expect(plan.numbersDerived).toBe(2)
  })

  it('continues from the highest number it already derived', () => {
    // Additive: a later run appends rather than renumbering what is already on
    // people's phones.
    const existing: ExistingShow[] = [
      {
        id: 's1',
        title: 'Cannon Fodder',
        matchPattern: null,
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]
    const stored: ExistingEpisode[] = [
      {
        id: 'ep-c1',
        guid: 'c1',
        title: 'Week One',
        showId: 's1',
        number: 1,
        numberIsDerived: true,
        videoUrl: null,
        hash: null,
        overridden: false,
      },
      {
        id: 'ep-c2',
        guid: 'c2',
        title: 'Week Two',
        showId: 's1',
        number: 2,
        numberIsDerived: true,
        videoUrl: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync(
      [mainFeed([unnumbered('c3', 'Cannon Fodder Week Three')])],
      existing,
      stored,
    )

    expect(plan.episodes[0]?.number).toBe(3)
  })

  it('leaves an announcement inside a numbered show alone', () => {
    // "Where Did Glass Cannon Network Presents Go?" has no number because it
    // isn't an episode. Numbering it files it in the sequence as though it were.
    const existing: ExistingShow[] = [
      {
        id: 's1',
        title: 'Androids & Aliens',
        matchPattern: null,
        artworkUrl: null,
        system: null,
        hash: null,
        overridden: false,
      },
    ]
    const stored: ExistingEpisode[] = [
      {
        id: 'ep-a1',
        guid: 'a1',
        title: 'One',
        showId: 's1',
        number: 155,
        numberIsDerived: false,
        videoUrl: null,
        hash: null,
        overridden: false,
      },
    ]

    const plan = planSync(
      [
        showFeed('Androids & Aliens', [
          unnumbered('a2', 'Where Did Glass Cannon Network Presents Go?'),
        ]),
      ],
      existing,
      stored,
    )

    expect(plan.episodes[0]?.number).toBeNull()
    expect(plan.numbersDerived).toBe(0)
  })

  it('leaves a show alone when the feed numbers it in the same run', () => {
    // The first sync of a numbered show has nothing stored to learn that from.
    const plan = planSync(
      [
        mainFeed([
          item({ guid: 'b1', rawTitle: 'One | Blood of the Wild S1 E1 | Pathfinder 2E' }),
          unnumbered('b2', 'Blood of the Wild Announcement'),
        ]),
      ],
      [],
      [],
    )

    const announcement = plan.episodes.find((e) => e.guid === 'b2')
    expect(announcement?.number).toBeNull()
    expect(plan.numbersDerived).toBe(0)
  })

  it('never numbers an unattributed episode', () => {
    // There is no sequence for it to belong to.
    const plan = planSync([mainFeed([unnumbered('x', 'Some Unknown Thing')])], [], [])

    expect(plan.episodes[0]?.number).toBeNull()
    expect(plan.numbersDerived).toBe(0)
  })

  describe('the video version', () => {
    it('carries it onto a new episode', () => {
      const feed = mainFeed([
        item({
          guid: 'a',
          rawTitle: 'One | Haunted City S1 E1 | Blades in the Dark',
          videoUrl: 'https://youtu.be/eYkJB2rjUNo',
        }),
      ])

      const plan = planSync([feed], [], [])

      expect(plan.episodes[0]?.videoUrl).toBe('https://youtu.be/eYkJB2rjUNo')
    })

    // The column was added after the catalogue was built, so every stored row
    // starts with a null hash and reads as changed once. This is the run that
    // finally gives the ~750 already-stored episodes the link their feed item
    // has carried all along.
    it('reaches an episode stored before the column existed', () => {
      const plan = planSync([videoFeed], haunted, [storedEpisode({ hash: null, videoUrl: null })])

      expect(plan.episodeUpdates).toHaveLength(1)
      expect(plan.episodeUpdates[0]).toMatchObject({
        id: 'ep-a',
        videoUrl: 'https://youtu.be/eYkJB2rjUNo',
      })
    })
  })

  describe('reconciling against what is stored', () => {
    // The property the whole sync contract rests on. Get this wrong and every
    // phone re-downloads the catalogue every night.
    it('plans nothing at all on a second run over an unchanged feed', () => {
      const first = planSync([videoFeed], haunted, [])
      const inserted = first.episodes[0]

      const second = planSync([videoFeed], haunted, [
        storedEpisode({ hash: inserted?.hash ?? null, videoUrl: inserted?.videoUrl ?? null }),
      ])

      expect(second.episodes).toEqual([])
      expect(second.episodeUpdates).toEqual([])
    })

    it('updates an episode the feed has edited since it was ingested', () => {
      const first = planSync([videoFeed], haunted, [])
      const stored = storedEpisode({
        hash: first.episodes[0]?.hash ?? null,
        videoUrl: first.episodes[0]?.videoUrl ?? null,
      })

      const retitled = mainFeed([
        item({
          guid: 'a',
          rawTitle: 'One, Corrected | Haunted City S1 E1 | Blades in the Dark',
          videoUrl: 'https://youtu.be/eYkJB2rjUNo',
        }),
      ])

      const plan = planSync([retitled], haunted, [stored])

      expect(plan.episodeUpdates).toHaveLength(1)
      expect(plan.episodeUpdates[0]?.title).toBe('One, Corrected')
      // An update is not an insert: the row keeps its identity.
      expect(plan.episodes).toEqual([])
    })

    it('leaves an overridden episode alone however far the feed has moved', () => {
      const retitled = mainFeed([
        item({
          guid: 'a',
          rawTitle: 'Something Else Entirely | Haunted City S1 E9 | Blades in the Dark',
          videoUrl: 'https://youtu.be/different',
        }),
      ])

      const plan = planSync([retitled], haunted, [
        storedEpisode({ hash: 'stale', overridden: true }),
      ])

      expect(plan.episodeUpdates).toEqual([])
      expect(plan.overriddenSkipped).toBe(1)
    })

    // A tombstone's hash is never written, so it never matches. Planning it
    // would re-mark its show as changed for every client on every run.
    it('neither updates nor re-inserts a deleted episode', () => {
      const plan = planSync([videoFeed], haunted, [storedEpisode({ hash: null, deleted: true })])

      expect(plan.episodeUpdates).toEqual([])
      expect(plan.episodes).toEqual([])
    })

    it('leaves an overridden show alone', () => {
      const overridden: ExistingShow[] = [{ ...(haunted[0] as ExistingShow), overridden: true }]

      const plan = planSync([videoFeed], overridden, [])

      expect(plan.showUpdates).toEqual([])
      expect(plan.overriddenSkipped).toBe(1)
    })

    // A derived number is not in the feed, so a reconciling run has nothing to
    // put back if it overwrites one. Every unnumbered show in the catalogue
    // would lose its numbering on the first run after this shipped.
    it('keeps a derived number that the feed still does not supply', () => {
      const feed = mainFeed([item({ guid: 'c1', rawTitle: 'Cannon Fodder Week One' })])
      const shows: ExistingShow[] = [
        {
          id: 's2',
          title: 'Cannon Fodder',
          matchPattern: null,
          artworkUrl: null,
          system: null,
          hash: null,
          overridden: false,
        },
      ]
      const stored: ExistingEpisode[] = [
        {
          id: 'ep-c1',
          guid: 'c1',
          title: 'Week One',
          showId: 's2',
          number: 7,
          numberIsDerived: true,
          videoUrl: null,
          hash: null,
          overridden: false,
        },
      ]

      const plan = planSync([feed], shows, stored)

      expect(plan.episodeUpdates[0]?.number).toBe(7)
      expect(plan.episodeUpdates[0]?.numberIsDerived).toBe(true)
    })

    it('takes a number the feed has started supplying', () => {
      const feed = mainFeed([
        item({ guid: 'c1', rawTitle: 'Week One | Cannon Fodder S1 E3 | Pathfinder 2E' }),
      ])
      const shows: ExistingShow[] = [
        {
          id: 's2',
          title: 'Cannon Fodder',
          matchPattern: null,
          artworkUrl: null,
          system: null,
          hash: null,
          overridden: false,
        },
      ]
      const stored: ExistingEpisode[] = [
        {
          id: 'ep-c1',
          guid: 'c1',
          title: 'Week One',
          showId: 's2',
          number: 7,
          numberIsDerived: true,
          videoUrl: null,
          hash: null,
          overridden: false,
        },
      ]

      const plan = planSync([feed], shows, stored)

      expect(plan.episodeUpdates[0]?.number).toBe(3)
      expect(plan.episodeUpdates[0]?.numberIsDerived).toBe(false)
    })
  })
})
