import { describe, expect, it } from 'vitest'
import {
  parseDurationSeconds,
  parseFeedTitle,
  parseFeedTitleInShow,
  slugifyShowTitle,
} from './parse-title.js'

describe('parseFeedTitle', () => {
  it('splits the three-segment house format', () => {
    const result = parseFeedTitle(
      "Shaggy's Fight | Blood of the Wild S1 E38 | Pathfinder 2E Quest for the Frozen Flame",
    )

    expect(result).toEqual({
      episodeTitle: "Shaggy's Fight",
      showTitle: 'Blood of the Wild',
      system: 'Pathfinder 2E Quest for the Frozen Flame',
      season: 1,
      number: 38,
      part: null,
      confidence: 'exact',
    })
  })

  it('handles an episode number with no season', () => {
    const result = parseFeedTitle("The Hot Zone | We Shouldn't Be Alive E14 | Twilight: 2000")

    expect(result.showTitle).toBe("We Shouldn't Be Alive")
    expect(result.season).toBeNull()
    expect(result.number).toBe(14)
    expect(result.system).toBe('Twilight: 2000')
  })

  it('takes a part suffix off the show name, not into it', () => {
    const result = parseFeedTitle(
      'Ranger Things | The Glass Cannon Podcast Giantslayer E100 Part 1 | Pathfinder 1E',
    )

    expect(result.showTitle).toBe('The Glass Cannon Podcast Giantslayer')
    expect(result.number).toBe(100)
    expect(result.part).toBe(1)
  })

  it('files every part of a release under one show', () => {
    const showOf = (part: number) =>
      parseFeedTitle(
        `Viva Lost Magus | The Glass Cannon Podcast Giantslayer E200 Part ${part} | Pathfinder 1E`,
      ).showTitle

    expect([showOf(1), showOf(2), showOf(3)]).toEqual([
      'The Glass Cannon Podcast Giantslayer',
      'The Glass Cannon Podcast Giantslayer',
      'The Glass Cannon Podcast Giantslayer',
    ])
  })

  it('marks the part in the episode title, which is otherwise identical across parts', () => {
    const result = parseFeedTitle(
      'Ranger Things | The Glass Cannon Podcast Giantslayer E100 Part 2 | Pathfinder 1E',
    )

    expect(result.episodeTitle).toBe('Ranger Things (Part 2)')
  })

  it('handles a part with no episode number, as the live shows publish', () => {
    const result = parseFeedTitle('The Ascent | Glass Cannon Live! Ascension Part 13 | Pathfinder')

    expect(result.showTitle).toBe('Glass Cannon Live! Ascension')
    expect(result.part).toBe(13)
    expect(result.number).toBeNull()
    expect(result.episodeTitle).toBe('The Ascent (Part 13)')
  })

  it('leaves a show whose name merely contains the word part alone', () => {
    const result = parseFeedTitle('One | Parts Unknown E4 | Some System')

    expect(result.showTitle).toBe('Parts Unknown')
    expect(result.part).toBeNull()
    expect(result.episodeTitle).toBe('One')
  })

  it('keeps a campaign suffix as part of the show name', () => {
    const result = parseFeedTitle(
      'Trial By Combat | The Glass Cannon Podcast Shadowdark E42 | Shadowdark RPG',
    )

    expect(result.showTitle).toBe('The Glass Cannon Podcast Shadowdark')
    expect(result.number).toBe(42)
  })

  it('reads a multi-season show', () => {
    const result = parseFeedTitle(
      'Haunters of the Dark | Time For Chaos S4 E9 | Call of Cthulhu Masks of Nyarlathotep',
    )

    expect(result.season).toBe(4)
    expect(result.number).toBe(9)
  })

  it('accepts spelled-out numbering', () => {
    const result = parseFeedTitle('Pilot | Some Show Season 2 Episode 7 | Some System')

    expect(result.showTitle).toBe('Some Show')
    expect(result.season).toBe(2)
    expect(result.number).toBe(7)
  })

  it('tolerates a missing system segment', () => {
    const result = parseFeedTitle('An Interlude | Blood of the Wild E39')

    expect(result.showTitle).toBe('Blood of the Wild')
    expect(result.system).toBeNull()
    expect(result.number).toBe(39)
  })

  it('collapses stray whitespace around separators', () => {
    const result = parseFeedTitle('  Cold   Open |   Blood of the Wild   E40  |  Pathfinder 2E ')

    expect(result.episodeTitle).toBe('Cold Open')
    expect(result.showTitle).toBe('Blood of the Wild')
    expect(result.system).toBe('Pathfinder 2E')
  })

  it('attributes a pipe-less title by known-show prefix', () => {
    const result = parseFeedTitle('GCN News Minute September 7, 2026', {
      knownShows: ['GCN News Minute', 'Blood of the Wild'],
    })

    expect(result.showTitle).toBe('GCN News Minute')
    expect(result.episodeTitle).toBe('September 7, 2026')
    expect(result.confidence).toBe('prefix')
  })

  it('prefers the longest matching known show', () => {
    const result = parseFeedTitle('The Glass Cannon Podcast Shadowdark E43', {
      knownShows: ['The Glass Cannon Podcast', 'The Glass Cannon Podcast Shadowdark'],
    })

    expect(result.showTitle).toBe('The Glass Cannon Podcast Shadowdark')
  })

  it('does not match a known show across a word boundary', () => {
    const result = parseFeedTitle('Blood of the Wilderness Special', {
      knownShows: ['Blood of the Wild'],
    })

    expect(result.showTitle).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('leaves an unrecognisable title unattributed rather than guessing', () => {
    const result = parseFeedTitle('A Very Special Announcement')

    expect(result).toEqual({
      episodeTitle: 'A Very Special Announcement',
      showTitle: null,
      system: null,
      season: null,
      number: null,
      part: null,
      confidence: 'none',
    })
  })
})

describe('parseFeedTitle with matchPattern', () => {
  const shows = [
    { title: 'Strange Aeons', matchPattern: '^Strange Aeons' },
    { title: 'Glass Cannon Radio', matchPattern: '^Glass Cannon Radio' },
    { title: 'Cannon Fodder', matchPattern: '^Cannon Fodder' },
    { title: 'GCN News Minute', matchPattern: '^GCN News Minutes?' },
    { title: 'The GCN Gauntlet', matchPattern: '^(?:The )?GCN Gauntlet' },
  ]

  it('attributes a show that never publishes in the pipe format', () => {
    const result = parseFeedTitle('Strange Aeons Episode 10 – Flashbacks and Handouts', {
      knownShows: shows,
    })

    expect(result.showTitle).toBe('Strange Aeons')
    expect(result.number).toBe(10)
    expect(result.episodeTitle).toBe('Flashbacks and Handouts')
    expect(result.confidence).toBe('prefix')
  })

  it('reads a #-style episode number', () => {
    const result = parseFeedTitle('Glass Cannon Radio #13 – Adolescence / Online Toxicity', {
      knownShows: shows,
    })

    expect(result.showTitle).toBe('Glass Cannon Radio')
    expect(result.number).toBe(13)
    expect(result.episodeTitle).toBe('Adolescence / Online Toxicity')
  })

  it('keeps a date as the episode title when there is no numbering', () => {
    const result = parseFeedTitle('Cannon Fodder 10/25/23', { knownShows: shows })

    expect(result.showTitle).toBe('Cannon Fodder')
    expect(result.number).toBeNull()
    expect(result.episodeTitle).toBe('10/25/23')
  })

  it('absorbs a spelling variant the pattern allows for', () => {
    expect(parseFeedTitle('GCN News Minute May 4, 2026', { knownShows: shows }).showTitle).toBe(
      'GCN News Minute',
    )
    expect(
      parseFeedTitle('GCN News Minutes January 12, 2026', { knownShows: shows }).showTitle,
    ).toBe('GCN News Minute')
  })

  it('files under the show title, not the text the pattern matched', () => {
    const result = parseFeedTitle('The GCN Gauntlet – Ghost Mortem', { knownShows: shows })

    expect(result.showTitle).toBe('The GCN Gauntlet')
    expect(result.episodeTitle).toBe('Ghost Mortem')
  })

  it('lets a pattern win over a prefix guess', () => {
    const result = parseFeedTitle('Strange Aeons Episode 4 – Whatever', {
      knownShows: [{ title: 'Strange', matchPattern: null }, ...shows],
    })

    expect(result.showTitle).toBe('Strange Aeons')
  })

  it('only matches a pattern anchored at the start of the title', () => {
    const result = parseFeedTitle('A Retrospective on Strange Aeons', { knownShows: shows })

    expect(result.showTitle).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('skips a broken pattern rather than throwing the sync over', () => {
    const result = parseFeedTitle('Cannon Fodder 5/3/23', {
      knownShows: [{ title: 'Bad', matchPattern: '([' }, ...shows],
    })

    expect(result.showTitle).toBe('Cannon Fodder')
  })

  it('still accepts plain strings, which carry no pattern', () => {
    const result = parseFeedTitle('Blood of the Wild Bonus Scene', {
      knownShows: ['Blood of the Wild'],
    })

    expect(result.showTitle).toBe('Blood of the Wild')
    expect(result.episodeTitle).toBe('Bonus Scene')
  })

  it('leaves a genuine one-off unattributed', () => {
    const result = parseFeedTitle('State of the Naish 2026', { knownShows: shows })

    expect(result.showTitle).toBeNull()
    expect(result.confidence).toBe('none')
  })
})

describe('slugifyShowTitle', () => {
  it('produces a stable url-safe key', () => {
    expect(slugifyShowTitle('Blood of the Wild')).toBe('blood-of-the-wild')
    expect(slugifyShowTitle("We Shouldn't Be Alive")).toBe('we-shouldnt-be-alive')
    expect(slugifyShowTitle('Time For Chaos  ')).toBe('time-for-chaos')
  })
})

describe('parseDurationSeconds', () => {
  it('reads every shape itunes:duration comes in', () => {
    expect(parseDurationSeconds('02:43:11')).toBe(9791)
    expect(parseDurationSeconds('43:11')).toBe(2591)
    expect(parseDurationSeconds('9791')).toBe(9791)
  })

  it('returns null for junk', () => {
    expect(parseDurationSeconds(null)).toBeNull()
    expect(parseDurationSeconds('')).toBeNull()
    expect(parseDurationSeconds('an hour or so')).toBeNull()
    expect(parseDurationSeconds('1:2:3:4')).toBeNull()
  })
})

describe('parseFeedTitleInShow', () => {
  it('keeps the configured spelling when the feed does use the house format', () => {
    // So a per-show feed's copies land on the same show row as the main feed's.
    const result = parseFeedTitleInShow(
      'Tsunami of Evil | haunted city S2 E20 | Blades in the Dark',
      'Haunted City',
    )

    expect(result.showTitle).toBe('Haunted City')
    expect(result.episodeTitle).toBe('Tsunami of Evil')
    expect(result.season).toBe(2)
    expect(result.number).toBe(20)
    expect(result.system).toBe('Blades in the Dark')
  })

  it('treats a pipe that is not the house format as punctuation', () => {
    // "Wicked Empire S1 | E10 - The Temple": the pipe separates the season from
    // the episode number, not the episode from the show.
    const result = parseFeedTitleInShow('Wicked Empire S1 | E10 - The Temple', 'Wicked Empire')

    expect(result.showTitle).toBe('Wicked Empire')
    expect(result.episodeTitle).toBe('The Temple')
    expect(result.season).toBe(1)
    expect(result.number).toBe(10)
  })

  it('reads a bare leading number, which the general parser must not', () => {
    const result = parseFeedTitleInShow(
      'Androids & Aliens 155 - For Everyone But You',
      'Androids & Aliens',
    )

    expect(result.showTitle).toBe('Androids & Aliens')
    expect(result.episodeTitle).toBe('For Everyone But You')
    expect(result.number).toBe(155)
  })

  it('synthesises a title for a numbered episode with no subtitle', () => {
    const result = parseFeedTitleInShow('Time For Chaos 12', 'Time For Chaos')

    expect(result.episodeTitle).toBe('Episode 12')
    expect(result.number).toBe(12)
  })

  it('keeps the published title when it is only the show name', () => {
    const result = parseFeedTitleInShow('The Game Garage', 'The Game Garage')

    expect(result.showTitle).toBe('The Game Garage')
    expect(result.episodeTitle).toBe('The Game Garage')
    expect(result.number).toBeNull()
  })
})
