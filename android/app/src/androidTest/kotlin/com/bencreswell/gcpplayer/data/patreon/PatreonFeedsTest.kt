package com.bencreswell.gcpplayer.data.patreon

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Reading a patron's feed, and a pasted link. Instrumented because both lean
 * on the platform — `XmlPullParser` and `Uri` — that a plain JVM test would
 * have to stub out.
 */
@RunWith(AndroidJUnit4::class)
class PatreonFeedsTest {

    /**
     * Two items the shape of the real feed: one posted on Patreon, whose guid
     * is its post id, and one from the back catalogue imported from Supercast,
     * whose guid is Supercast's URL. The link is the post id in both.
     */
    private val feed = """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>We Shouldn't Be Alive | Twilight: 2000</title>
            <link>https://www.patreon.com/collection/2073644</link>
            <item>
              <title>Among the Living | Twilight: 2000 Episode 20</title>
              <link>https://www.patreon.com/glasscannon/posts/among-living-159573608</link>
              <itunes:duration>6960</itunes:duration>
              <description>&lt;p&gt;Notes &amp;amp; more&lt;/p&gt;</description>
              <enclosure url="https://www.patreon.com/api/rss/u/TOKEN/e/159573608.mp3?sig=a" type="audio/mpeg"/>
              <guid isPermaLink="false">159573608</guid>
            </item>
            <item>
              <title>The Sound of Rain | Twilight: 2000 Episode 8</title>
              <link>https://www.patreon.com/glasscannon/posts/sound-of-rain-154017505</link>
              <itunes:duration>1:25:10</itunes:duration>
              <enclosure url="https://www.patreon.com/api/rss/u/TOKEN/e/154017505.mp3?sig=b" type="audio/mpeg"/>
              <guid isPermaLink="false">https://wsba.supercast.tech/episodes/959513?key=abc</guid>
            </item>
          </channel>
        </rss>
    """.trimIndent()

    @Test
    fun itemsAreKeyedByPostIdWhateverTheirGuid() {
        val items = PatreonFeeds.parse(feed.byteInputStream())

        assertEquals(setOf("159573608", "154017505"), items.keys)
        assertEquals(6960, items["159573608"]?.durationSeconds)
        assertEquals(5110, items["154017505"]?.durationSeconds)
        assertEquals(
            "https://www.patreon.com/api/rss/u/TOKEN/e/154017505.mp3?sig=b",
            items["154017505"]?.url,
        )
    }

    @Test
    fun aPostIdComesOffTheEndOfItsPage() {
        assertEquals("154017528", PatreonFeeds.postId("https://www.patreon.com/glasscannon/posts/war-breaks-out-154017528"))
        assertEquals("154017528", PatreonFeeds.postId("https://www.patreon.com/posts/154017528"))
        assertNull(PatreonFeeds.postId("https://www.patreon.com/collection/2073644"))
    }

    @Test
    fun theTokenComesOutOfAnyLinkPatreonHandsOut() {
        val token = "testFeedToken_abc123XYZ"
        assertEquals(token, PatreonAccount.tokenFromFeedLink("https://www.patreon.com/rss/glasscannon?auth=$token&show=2073551"))
        assertEquals(token, PatreonAccount.tokenFromFeedLink("  https://www.patreon.com/rss/glasscannon?auth=$token\n"))
        assertEquals(token, PatreonAccount.tokenFromFeedLink("https://www.patreon.com/api/rss/u/$token/e/154017505.mp3?sig=b"))
        assertNull(PatreonAccount.tokenFromFeedLink("https://example.com/rss?auth=$token"))
        assertNull(PatreonAccount.tokenFromFeedLink("https://www.patreon.com/rss/glasscannon?auth=short"))
        assertNull(PatreonAccount.tokenFromFeedLink("not a link"))
    }
}
