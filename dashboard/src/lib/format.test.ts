import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatElapsed,
  formatNumbering,
  numberOrNull,
  positiveOrNull,
  toSlug,
} from './format.js'

describe('formatDuration', () => {
  it('leaves the hour off a short episode', () => {
    expect(formatDuration(2880)).toBe('48m')
  })

  it('reads hours and minutes for a normal one', () => {
    expect(formatDuration(9660)).toBe('2h 41m')
  })

  it('never says 60 minutes', () => {
    // Both of these round to a whole hour, and "60m" / "2h 60m" are not
    // durations. This is what the page was printing for an hour-long episode.
    expect(formatDuration(3599)).toBe('1h')
    expect(formatDuration(10780)).toBe('3h')
  })

  it('leaves the minutes off a whole number of hours', () => {
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(7200)).toBe('2h')
  })

  it('says nothing rather than zero for a missing duration', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('—')
  })
})

describe('formatNumbering', () => {
  it('reads both when the feed published both', () => {
    expect(formatNumbering(1, 38)).toBe('S1 E38')
  })

  it('drops the season for a show that has none', () => {
    // Most of the network's shows number episodes straight through.
    expect(formatNumbering(null, 155)).toBe('E155')
  })

  it('says nothing when there is no numbering at all', () => {
    expect(formatNumbering(null, null)).toBe('—')
  })

  it('prints a real E0 rather than reading zero as missing', () => {
    // The network numbers its character-creation episodes E0, and four of them
    // are in the catalogue: Gatewalkers, Shadowdark, Get in the Trunk and
    // Inherit the Sand. Zero is a number here, not an absence.
    expect(formatNumbering(null, 0)).toBe('E0')
    expect(formatNumbering(1, 0)).toBe('S1 E0')
  })
})

describe('formatElapsed', () => {
  it('keeps the milliseconds on a run that wrote nothing', () => {
    // A daily re-ingest of an unchanged catalogue is the common case, and
    // rounding it to "0s" hides that it ran at all.
    expect(formatElapsed('2026-09-18T12:10:11.878Z', '2026-09-18T12:10:12.263Z')).toBe('385ms')
  })

  it('reads seconds for a real run', () => {
    expect(formatElapsed('2026-09-18T12:10:11.000Z', '2026-09-18T12:10:15.400Z')).toBe('4.4s')
  })

  it('says nothing for a run still going', () => {
    expect(formatElapsed('2026-09-18T12:10:11.000Z', null)).toBe('—')
  })
})

describe('toSlug', () => {
  it('matches the slugs already in the catalogue', () => {
    expect(toSlug('Haunted City')).toBe('haunted-city')
    expect(toSlug('Androids & Aliens')).toBe('androids-and-aliens')
  })

  it('folds accents rather than dropping the letter', () => {
    expect(toSlug('Café Chronicles')).toBe('cafe-chronicles')
  })

  it('leaves no leading or trailing hyphen', () => {
    expect(toSlug('  — Strange Aeons —  ')).toBe('strange-aeons')
  })

  it('stays inside the length the API accepts', () => {
    expect(toSlug('a'.repeat(200))).toHaveLength(80)
  })
})

describe('the numeric field parsers', () => {
  it('read an empty box as no value rather than as zero', () => {
    for (const empty of ['', '   ']) {
      expect(numberOrNull(empty)).toBeNull()
      expect(positiveOrNull(empty)).toBeNull()
    }
  })

  it('never lets a half-typed field become NaN', () => {
    expect(numberOrNull('-')).toBeNull()
    expect(numberOrNull('e')).toBeNull()
  })

  it('keeps a real episode number of zero', () => {
    // This is the whole point of the two parsers: folding 0 into null did not
    // refuse the edit, it silently wiped the number off a Session Zero episode.
    expect(numberOrNull('0')).toBe(0)
  })

  it('still treats a season or a runtime of zero as a typo', () => {
    expect(positiveOrNull('0')).toBeNull()
  })

  it('refuses a negative in either', () => {
    expect(numberOrNull('-1')).toBeNull()
    expect(positiveOrNull('-1')).toBeNull()
  })
})
