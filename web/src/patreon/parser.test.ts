import { parsePatreonFeed, postIdFromLink, tokenFromFeedLink } from './parser'

const token = 'abcDEF123_-abcDEF123'

describe('tokenFromFeedLink', () => {
  it('reads the auth from the link Patreon hands out', () => {
    expect(
      tokenFromFeedLink(`https://www.patreon.com/rss/glasscannon?auth=${token}&show=2073638`),
    ).toBe(token)
    expect(tokenFromFeedLink(`  https://www.patreon.com/rss/glasscannon?auth=${token}\n`)).toBe(
      token,
    )
  })

  it("reads it from a single episode's audio URL", () => {
    expect(tokenFromFeedLink(`https://www.patreon.com/api/rss/u/${token}/e/1.mp3?sig=x`)).toBe(
      token,
    )
  })

  it('refuses anything else', () => {
    expect(tokenFromFeedLink('not a link')).toBeNull()
    expect(tokenFromFeedLink(`https://example.com/rss?auth=${token}`)).toBeNull()
    expect(tokenFromFeedLink('https://www.patreon.com/rss/glasscannon?auth=short')).toBeNull()
  })
})

describe('the feed', () => {
  it('takes the post id from the link, not the Supercast guid', () => {
    expect(
      postIdFromLink('https://www.patreon.com/glasscannon/posts/war-breaks-out-154017528'),
    ).toBe('154017528')
    expect(postIdFromLink('https://www.patreon.com/posts/154017528?utm=x')).toBe('154017528')
  })

  it('reads each item down to its audio and runtime', () => {
    const xml = `<?xml version="1.0"?>
      <rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
        <item>
          <guid>https://supercast.com/episodes/abc</guid>
          <link>https://www.patreon.com/glasscannon/posts/the-hot-zone-111</link>
          <enclosure url="https://www.patreon.com/api/rss/u/t/e/111.mp3" type="audio/mpeg"/>
          <itunes:duration>1:12:33</itunes:duration>
        </item>
        <item>
          <guid>222</guid>
          <enclosure url="https://www.patreon.com/api/rss/u/t/e/222.mp3"/>
          <itunes:duration>4353</itunes:duration>
        </item>
        <item><link>https://www.patreon.com/posts/no-audio-333</link></item>
      </channel></rss>`
    const items = parsePatreonFeed(xml)
    expect([...items.keys()]).toEqual(['111', '222'])
    expect(items.get('111')).toEqual({
      url: 'https://www.patreon.com/api/rss/u/t/e/111.mp3',
      durationSeconds: 4353,
    })
  })
})
