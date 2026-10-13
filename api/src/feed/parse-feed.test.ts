import { describe, expect, it } from 'vitest'
import { parseFeed } from './parse-feed.js'

const feed = (items: string, channelExtra = '') => `<?xml version="1.0"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>The Glass Cannon Network</title>
    ${channelExtra}
    ${items}
  </channel>
</rss>`

const item = `
  <item>
    <title>Shaggy's Fight | Blood of the Wild S1 E38 | Pathfinder 2E</title>
    <guid isPermaLink="false">abc-123</guid>
    <pubDate>Mon, 15 Sep 2025 10:00:00 -0000</pubDate>
    <enclosure url="https://cdn.example/ep38.mp3" type="audio/mpeg" length="1"/>
    <itunes:duration>01:52:30</itunes:duration>
    <itunes:image href="https://cdn.example/ep38.jpg"/>
    <description>Short</description>
    <content:encoded><![CDATA[<p>The long one</p>]]></content:encoded>
  </item>`

describe('parseFeed', () => {
  it('maps an item onto the fields we store', () => {
    const { items } = parseFeed(feed(item))

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      guid: 'abc-123',
      rawTitle: "Shaggy's Fight | Blood of the Wild S1 E38 | Pathfinder 2E",
      audioUrl: 'https://cdn.example/ep38.mp3',
      durationSeconds: 6750,
      artworkUrl: 'https://cdn.example/ep38.jpg',
    })
    expect(items[0]?.publishedAt.toISOString()).toBe('2025-09-15T10:00:00.000Z')
  })

  it('prefers content:encoded over description', () => {
    const { items } = parseFeed(feed(item))
    expect(items[0]?.description).toBe('<p>The long one</p>')
  })

  it('falls back to the audio URL when an item has no guid', () => {
    const noGuid = item.replace(/<guid[^>]*>.*<\/guid>/, '')
    const { items } = parseFeed(feed(noGuid))
    expect(items[0]?.guid).toBe('https://cdn.example/ep38.mp3')
  })

  it('counts unusable items rather than dropping them silently', () => {
    // A format change should surface as a number, not as missing episodes.
    const broken = `<item><title>No enclosure, no date</title></item>`
    const { items, skipped } = parseFeed(feed(item + broken))
    expect(items).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('reads the channel artwork for shows whose items carry none', () => {
    const { channelArtworkUrl } = parseFeed(
      feed(item, '<itunes:image href="https://cdn.example/channel.jpg"/>'),
    )
    expect(channelArtworkUrl).toBe('https://cdn.example/channel.jpg')
  })

  describe('the video version', () => {
    // The Acast per-show feeds: the item's canonical link *is* the video.
    it('reads it from <link>', () => {
      const withLink = item.replace(
        '<description>Short</description>',
        '<link>https://youtu.be/eYkJB2rjUNo</link><description>Short</description>',
      )
      expect(parseFeed(feed(withLink)).items[0]?.videoUrl).toBe('https://youtu.be/eYkJB2rjUNo')
    })

    // The main Megaphone feed: prose, and the URL comes wrapped in word joiners
    // (U+2060) that a laxer pattern would swallow into the video id.
    it('reads it out of the description prose, word joiners and all', () => {
      const prose = item.replace(
        '<content:encoded><![CDATA[<p>The long one</p>]]></content:encoded>',
        '<content:encoded><![CDATA[<p>Watch the video here: \u2060https://youtu.be/vS6wh3adOl8\u2060</p>]]></content:encoded>',
      )
      expect(parseFeed(feed(prose)).items[0]?.videoUrl).toBe('https://youtu.be/vS6wh3adOl8')
    })

    it('accepts the /watch and /live forms too', () => {
      const live = item.replace(
        '<description>Short</description>',
        '<description>https://www.youtube.com/live/abcDEF12345</description>',
      )
      expect(parseFeed(feed(live)).items[0]?.videoUrl).toBe(
        'https://www.youtube.com/live/abcDEF12345',
      )
    })

    // 179 items link the channel. A channel is not a video version of anything,
    // and treating it as one would give most of the catalogue the same URL.
    it('ignores a link to the channel', () => {
      const channel = item.replace(
        '<description>Short</description>',
        '<description>Subscribe at http://youtube.com/theglasscannon</description>',
      )
      expect(parseFeed(feed(channel)).items[0]?.videoUrl).toBeNull()
    })

    it('is null when the item mentions no video', () => {
      expect(parseFeed(feed(item)).items[0]?.videoUrl).toBeNull()
    })
  })

  it('refuses a body that is not an RSS feed', () => {
    expect(() => parseFeed('<html><body>404</body></html>')).toThrow(/no <channel>/)
  })
})
