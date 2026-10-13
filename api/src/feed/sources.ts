/**
 * The feeds the network lists in its subscription FAQ:
 * https://www.glasscannonnetwork.com/faq
 *
 * This is the seed list only — at runtime the ingest reads the `feed_sources`
 * table, so adding a feed or disabling a dead one needs no deploy.
 */
export interface FeedSourceSeed {
  url: string
  name: string
  /** Null for the main feed, which interleaves the whole network. */
  showTitle: string | null
  sortIndex: number
  isEnabled?: boolean
}

export const FEED_SOURCE_SEEDS: FeedSourceSeed[] = [
  // Must sort first: the network cross-posts, and the first copy seen is the
  // one that gets stored.
  {
    url: 'https://feeds.megaphone.fm/QCD8414694967',
    name: 'Glass Cannon Network',
    showTitle: null,
    sortIndex: 0,
  },

  {
    url: 'https://feeds.acast.com/public/shows/642b05579bb1730011e1efbe',
    name: 'Androids & Aliens',
    showTitle: 'Androids & Aliens',
    sortIndex: 1,
  },
  {
    url: 'https://feeds.acast.com/public/shows/63a46d7969cd8e00119d1ed4',
    name: 'Haunted City',
    showTitle: 'Haunted City',
    sortIndex: 2,
  },
  {
    url: 'https://feeds.acast.com/public/shows/63b72b25938ea90011f220c3',
    name: 'Time For Chaos',
    showTitle: 'Time For Chaos',
    sortIndex: 3,
  },
  {
    url: 'https://feeds.acast.com/public/shows/63ce99f0fcf9f40011fcacd6',
    name: 'Voyagers of the Jump',
    showTitle: 'Voyagers of the Jump',
    sortIndex: 4,
  },
  {
    url: 'https://feeds.acast.com/public/shows/63dcfcbdf1ae1f001142a944',
    name: 'Inherit the Sand',
    showTitle: 'Inherit the Sand',
    sortIndex: 5,
  },
  {
    url: 'https://feeds.acast.com/public/shows/63dba314c6c95500112357c1',
    name: 'The Game Garage',
    showTitle: 'The Game Garage',
    sortIndex: 6,
  },
  {
    url: 'https://anchor.fm/s/6c957d08/podcast/rss',
    name: 'Wicked Empire',
    showTitle: 'Wicked Empire',
    sortIndex: 7,
  },

  // Listed in the FAQ but 404s; its episodes come through the main feed anyway.
  // Seeded disabled rather than omitted, so turning it back on is a row edit.
  {
    url: 'https://anchor.fm/s/47417ac0/podcast/rss',
    name: 'Side Quest Side Sesh',
    showTitle: 'Side Quest Side Sesh',
    sortIndex: 8,
    isEnabled: false,
  },
]

/**
 * Shows that never use the pipe title format, with regexes claiming their
 * episodes. Seeded, then editable — the feed never supplies a match pattern.
 */
export const SEEDED_SHOWS = [
  {
    slug: 'strange-aeons',
    title: 'Strange Aeons',
    system: 'Pathfinder 1E',
    matchPattern: '^Strange Aeons',
  },
  { slug: 'cannon-fodder', title: 'Cannon Fodder', system: null, matchPattern: '^Cannon Fodder' },
  {
    slug: 'gcn-news-minute',
    title: 'GCN News Minute',
    system: null,
    matchPattern: '^GCN News Minutes?',
  },
  {
    slug: 'glass-cannon-radio',
    title: 'Glass Cannon Radio',
    system: null,
    matchPattern: '^Glass Cannon Radio',
  },
  {
    slug: 'the-gcn-gauntlet',
    title: 'The GCN Gauntlet',
    system: null,
    matchPattern: '^(?:The )?GCN Gauntlet',
  },
  {
    slug: 'star-wars-age-of-rebellion',
    title: 'Star Wars Age of Rebellion',
    system: 'Star Wars',
    matchPattern: '^Star Wars Age of Rebellion',
  },
] as const

/**
 * Public shows and the Patreon collections their episodes are posted into
 * first — the `show` in a patron's feed URL.
 *
 * Ingest links a collection to a show by title on its own (see
 * resolvePatreonFeeds), so this list is only strictly needed where that would
 * go wrong: "The Glass Cannon Podcast | Shadowdark" would otherwise land on
 * the one-episode show "The Glass Cannon Podcast". The rest are here so the
 * links don't depend on Patreon's titles staying as they are. Patreon-only
 * shows are not listed: ingest creates them.
 *
 * Read by ingest rather than written by the seed, because the shows it names
 * don't exist until the feeds have created them — on a fresh database, or
 * after a resync, a seed would have nothing to link.
 */
export const PATREON_SHOW_LINKS: readonly { slug: string; patreonShowId: string }[] = [
  { slug: 'blood-of-the-wild', patreonShowId: '2073551' },
  { slug: 'time-for-chaos', patreonShowId: '2073638' },
  { slug: 'we-shouldnt-be-alive', patreonShowId: '2073644' },
  { slug: 'the-glass-cannon-podcast-shadowdark', patreonShowId: '2073636' },
]
